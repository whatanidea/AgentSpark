from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import hashlib
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
from uuid import uuid4

from azure.cosmos import exceptions
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
import jwt

from app.api import routes
from app.database.cosmos_client import DatabaseClient
from app.database.decision_archive import LocalDecisionArchive
from app.database.tenant_directory import DirectoryRecord, TenantDirectory, tenant_directory
from app.main import app
from app.orchestration import langgraph_flow
from app.security import auth
from app.utils.errors import ConcurrentUpdate, DependencyUnavailable, InvalidDependencyResponse


class TenantFoundationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def setUp(self):
        directory = TemporaryDirectory(prefix="agentspark-tenant-test-")
        self.addCleanup(directory.cleanup)
        self.path = str(Path(directory.name) / "decisions.sqlite3")
        environment = patch.dict(os.environ, {"DEMO_ARCHIVE_PATH": self.path, "AGENTSENSE_MODE": "demo"})
        environment.start()
        self.addCleanup(environment.stop)
        self.database = DatabaseClient()
        self.secure = auth.AuthSettings("oidc", "https://issuer.example", "agentsense", "https://issuer.example/keys")
        for item in (
            patch.object(auth, "auth_settings", self.secure),
            patch.object(routes, "auth_settings", self.secure),
            patch.object(auth, "key_client", return_value=SimpleNamespace(
                get_signing_key_from_jwt=lambda token: SimpleNamespace(key=self.key.public_key()))),
            patch.object(routes, "db_client", self.database),
            patch.object(langgraph_flow, "db_client", self.database),
            patch.object(tenant_directory, "archive", LocalDecisionArchive()),
            patch.object(tenant_directory, "use_mock", True),
        ):
            item.start()
            self.addCleanup(item.stop)
        self.client = TestClient(app)

    def identity(self, subject):
        return hashlib.sha256(f"{self.secure.issuer}\0{subject}".encode()).hexdigest()

    def headers(self, subject="owner", organization=None, team=None, reviewer=True):
        now = datetime.now(timezone.utc)
        token = jwt.encode({"sub": subject, "iss": self.secure.issuer, "aud": self.secure.audience,
                            "iat": now, "exp": now + timedelta(minutes=10),
                            "roles": ["AgentSense.Reviewer"] if reviewer else []}, self.key, algorithm="RS256")
        headers = {"Authorization": "Bearer " + token}
        if organization is not None:
            headers["X-Organization-ID"] = organization
        if team is not None:
            headers["X-Team-ID"] = team
        return headers

    def call(self, method, path, *, subject="owner", organization=None, team=None, body=None, status=200, reviewer=True):
        response = self.client.request(method, "/api/v1" + path,
                                       headers=self.headers(subject, organization, team, reviewer), json=body)
        self.assertEqual(response.status_code, status, response.text)
        return response.json()

    def organization(self):
        organization = self.call("POST", "/organizations", body={"name": "Fictional enterprise"}, status=201)["organization_id"]
        team = self.call("POST", f"/organizations/{organization}/teams", body={"name": "Finance"}, status=201)["team_id"]
        return organization, team

    def member(self, organization, team, subject, roles):
        identity = self.identity(subject)
        self.call("PUT", f"/organizations/{organization}/members/{identity}", body={"role": "member"})
        self.call("PUT", f"/organizations/{organization}/teams/{team}/members/{identity}", body={"roles": roles})
        return identity

    def draft(self, organization=None, team=None, subject="owner"):
        session = str(uuid4())
        self.call("POST", "/intake", organization=organization, team=team, subject=subject, body={
            "session_id": session, "business_domain": "Fictional team finance", "team_size": "1-50",
            "existing_systems": "Sample", "pain_points": "Sample only", "compliance_requirements": "High",
            "demo_scenario": "invoice"})
        return session

    def workflow(self, organization=None, team=None, subject="owner"):
        session = self.draft(organization, team, subject)
        analysis = self.call("POST", f"/analyze/{session}", organization=organization, team=team, subject=subject)
        return session, analysis["analysis_id"]

    def review_body(self, analysis):
        return {"analysis_id": analysis, "decision": "approve", "reviewer": "forged", "note": "Fictional controls checked."}

    def test_self_service_owner_and_directory_survive_real_process_restart(self):
        organization, _ = self.organization()
        organizations = self.call("GET", "/organizations")
        self.assertEqual(organizations["items"][0]["role"], "owner")
        self.assertEqual(self.call("GET", "/organizations", subject="outsider")["items"], [])
        result = subprocess.run([sys.executable, "-B", "-c",
            "from app.database.tenant_directory import TenantDirectory; "
            f"r=TenantDirectory().get({organization!r}, 'organization'); print(r.name)"],
            capture_output=True, text=True, env=dict(os.environ), timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Fictional enterprise", result.stdout)

    def test_cross_organization_and_cross_team_access_fail_closed_everywhere(self):
        organization, team = self.organization()
        self.member(organization, team, "contributor", ["contributor"])
        session, analysis = self.workflow(organization, team, "contributor")
        other_org, other_team = self.organization()
        second_team = self.call("POST", f"/organizations/{organization}/teams", body={"name": "Legal"}, status=201)["team_id"]
        self.member(organization, second_team, "legal", ["contributor"])
        for subject, selected_org, selected_team in (
            ("outsider", organization, team), ("legal", organization, team),
            ("contributor", other_org, other_team), ("contributor", None, None),
            ("contributor", organization, second_team),
        ):
            for method, path, body in (
                ("GET", f"/sessions/{session}", None), ("GET", f"/blueprint/{session}", None),
                ("GET", f"/review/{session}", None), ("POST", f"/analyze/{session}", {}),
                ("POST", "/chat", {"session_id": session, "message": "Edit"}),
                ("DELETE", f"/sessions/{session}", None),
                ("POST", f"/review/{session}", self.review_body(analysis)),
            ):
                with self.subTest(subject=subject, path=path, selected_team=selected_team):
                    self.call(method, path, subject=subject, organization=selected_org, team=selected_team,
                              body=body, status=404)
        self.assertEqual(self.call("GET", "/home", subject="contributor")["items"], [])
        self.assertEqual(self.call("GET", "/home", organization=other_org, team=other_team)["items"], [])

    def test_viewer_reads_but_cannot_mutate_or_trigger_model_work(self):
        organization, team = self.organization()
        self.member(organization, team, "viewer", ["viewer"])
        session, analysis = self.workflow(organization, team)
        snapshot = self.call("GET", f"/sessions/{session}", subject="viewer", organization=organization, team=team)
        self.assertEqual(snapshot["permissions"], {"read": True, "write": False, "review": False, "delete": False})
        self.call("GET", f"/blueprint/{session}", subject="viewer", organization=organization, team=team)
        self.call("GET", f"/review/{session}", subject="viewer", organization=organization, team=team)
        with patch.object(routes, "run_orchestration") as run, patch.object(routes.diagnostic_agent, "chat") as chat:
            for method, path, body in (
                ("POST", f"/analyze/{session}", {}), ("POST", "/chat", {"session_id": session, "message": "Edit"}),
                ("DELETE", f"/sessions/{session}", None),
                ("POST", f"/review/{session}", self.review_body(analysis)),
                ("POST", "/intake", {"session_id": session, "business_domain": "Changed", "team_size": "1-50",
                                    "existing_systems": "", "pain_points": "", "compliance_requirements": "Low"}),
            ):
                self.call(method, path, subject="viewer", organization=organization, team=team, body=body, status=403)
            run.assert_not_called()
            chat.assert_not_called()
        self.call("POST", f"/organizations/{organization}/teams", subject="viewer", body={"name": "Escalation"}, status=403)

    def test_independent_reviewer_can_decide_but_creator_cannot_self_review(self):
        organization, team = self.organization()
        self.member(organization, team, "creator", ["contributor", "reviewer"])
        self.member(organization, team, "reviewer", ["reviewer"])
        session, analysis = self.workflow(organization, team, "creator")
        body = self.review_body(analysis)
        self.call("POST", f"/review/{session}", organization=organization, team=team, subject="creator", body=body, status=403)
        pending = self.call("GET", "/home?status=pending_review", organization=organization, team=team,
                            subject="reviewer", reviewer=False)
        self.assertEqual([item["session_id"] for item in pending["items"]], [session])
        snapshot = self.call("GET", f"/sessions/{session}", organization=organization, team=team,
                             subject="reviewer", reviewer=False)
        self.assertEqual(snapshot["permissions"], {"read": True, "write": False, "review": True, "delete": False})
        blueprint = self.call("GET", f"/blueprint/{session}", organization=organization, team=team,
                              subject="reviewer", reviewer=False)
        self.assertTrue(blueprint["permissions"]["review"])
        reviewed = self.call("POST", f"/review/{session}", organization=organization, team=team,
                             subject="reviewer", body=body, reviewer=False)
        self.assertEqual(reviewed["human_review"]["reviewer"], "reviewer")
        self.assertEqual(reviewed["status"], "completed")
        self.call("POST", f"/review/{session}", organization=organization, team=team, subject="reviewer", body=body, status=409)
        archived = self.call("GET", "/home?status=approved", organization=organization, team=team, subject="reviewer")
        self.assertEqual(len(archived["items"]), 1)
        self.call("GET", f"/decisions/{session}/{analysis}", organization=organization, team=team, subject="reviewer")
        self.call("DELETE", f"/decisions/{session}/{analysis}", organization=organization, team=team, subject="reviewer", status=403)
        self.call("GET", f"/decisions/{session}/{analysis}", subject="creator", status=404)
        self.call("DELETE", f"/decisions/{session}/{analysis}", organization=organization, team=team)
        self.assertEqual(self.call("GET", "/home", organization=organization, team=team)["items"], [])

    def test_aws_team_assessment_supports_independent_review_and_retains_target(self):
        organization, team = self.organization()
        self.member(organization, team, "creator", ["contributor", "reviewer"])
        self.member(organization, team, "reviewer", ["reviewer"])
        session = str(uuid4())
        self.call("POST", "/intake", organization=organization, team=team, subject="creator", body={
            "session_id": session, "business_domain": "Fictional AWS invoice review", "team_size": "1-50",
            "existing_systems": "SAP", "pain_points": "Slow approvals", "compliance_requirements": "High",
            "demo_scenario": "invoice", "target_cloud": "aws", "preferred_region": "eu-west-1"})
        analysis = self.call("POST", f"/analyze/{session}", organization=organization, team=team,
                             subject="creator")["analysis_id"]
        body = self.review_body(analysis)
        self.call("POST", f"/review/{session}", organization=organization, team=team,
                  subject="creator", reviewer=False, body=body, status=403)
        pending = self.call("GET", "/home?status=pending_review", organization=organization, team=team,
                            subject="reviewer", reviewer=False)
        self.assertEqual(pending["items"][0]["session_id"], session)
        blueprint = self.call("GET", f"/blueprint/{session}", organization=organization, team=team,
                              subject="reviewer", reviewer=False)
        self.assertEqual(blueprint["target_cloud"], "aws")
        self.assertTrue(blueprint["permissions"]["review"])
        self.call("POST", f"/review/{session}", organization=organization, team=team,
                  subject="reviewer", reviewer=False, body=body)
        decision = self.call("GET", f"/decisions/{session}/{analysis}", organization=organization, team=team,
                             subject="reviewer", reviewer=False)
        self.assertEqual(decision["details"]["deployment_preferences"]["target_cloud"], "aws")
        self.assertEqual(decision["details"]["deployment_preferences"]["preferred_region"], "eu-west-1")

    def test_contributor_can_delete_own_drafts_but_not_other_team_workflows(self):
        organization, team = self.organization()
        identity = self.member(organization, team, "contributor", ["contributor", "reviewer", "viewer"])
        own = self.draft(organization, team, "contributor")
        other = self.draft(organization, team)
        page = self.call("GET", "/home?status=draft", organization=organization, team=team,
                         subject="contributor", reviewer=False)
        self.assertEqual({item["session_id"]: item["can_delete"] for item in page["items"]},
                         {own: True, other: False})
        self.assertNotIn("owner_id", str(page))
        for session, permitted in ((own, True), (other, False)):
            snapshot = self.call("GET", f"/sessions/{session}", organization=organization, team=team,
                                 subject="contributor", reviewer=False)
            self.assertEqual(snapshot["permissions"]["delete"], permitted)
        self.call("DELETE", f"/sessions/{other}", organization=organization, team=team,
                  subject="contributor", reviewer=False, status=403)
        self.call("DELETE", f"/sessions/{own}", organization=organization, team=team,
                  subject="contributor", reviewer=False)
        own = self.draft(organization, team, "contributor")
        grant = self.call("GET", f"/organizations/{organization}/teams/{team}/members")["items"][0]
        self.call("PUT", f"/organizations/{organization}/teams/{team}/members/{identity}",
                  body={"roles": ["viewer"], "version": grant["version"]})
        snapshot = self.call("GET", f"/sessions/{own}", organization=organization, team=team,
                             subject="contributor", reviewer=False)
        self.assertFalse(snapshot["permissions"]["delete"])
        self.call("DELETE", f"/sessions/{own}", organization=organization, team=team,
                  subject="contributor", reviewer=False, status=403)

    def test_contributor_can_delete_own_archived_workflow_and_history(self):
        organization, team = self.organization()
        self.member(organization, team, "creator", ["contributor"])
        self.member(organization, team, "reviewer", ["reviewer"])
        session, analysis = self.workflow(organization, team, "creator")
        self.call("POST", f"/review/{session}", organization=organization, team=team,
                  subject="reviewer", reviewer=False, body=self.review_body(analysis))
        self.database.mock_db.clear()
        for subject, allowed in (("creator", True), ("reviewer", False), ("owner", True)):
            page = self.call("GET", "/home?status=approved", organization=organization, team=team,
                             subject=subject, reviewer=False)
            self.assertEqual(page["items"][0]["can_delete"], allowed)
            detail = self.call("GET", f"/decisions/{session}/{analysis}", organization=organization, team=team,
                               subject=subject, reviewer=False)
            self.assertEqual(detail["summary"]["can_delete"], allowed)
            self.assertNotIn("owner_id", str(detail))
        self.call("DELETE", f"/decisions/{session}/{analysis}", organization=organization, team=team,
                  subject="creator", reviewer=False)
        self.assertEqual(self.call("GET", "/home", organization=organization, team=team)["items"], [])

    def test_team_review_grant_is_required_even_with_token_role_and_revokes_immediately(self):
        organization, team = self.organization()
        identity = self.member(organization, team, "reviewer", ["reviewer"])
        self.member(organization, team, "contributor", ["contributor"])
        session, analysis = self.workflow(organization, team, "contributor")
        self.call("POST", f"/review/{session}", organization=organization, team=team,
                  subject="contributor", body=self.review_body(analysis), status=403)
        grant = next(item for item in self.call("GET", f"/organizations/{organization}/teams/{team}/members")["items"]
                     if item["identity_id"] == identity)
        self.call("PUT", f"/organizations/{organization}/teams/{team}/members/{identity}",
                  body={"roles": ["viewer"], "version": grant["version"]})
        self.call("POST", f"/review/{session}", organization=organization, team=team,
                  subject="reviewer", body=self.review_body(analysis), status=403)
        snapshot = self.call("GET", f"/sessions/{session}", organization=organization, team=team,
                             subject="reviewer")
        self.assertFalse(snapshot["permissions"]["review"])

    def test_cosmos_home_projects_creator_for_per_workflow_delete_permissions(self):
        organization, team = self.organization()
        self.member(organization, team, "contributor", ["contributor"])
        own = self.draft(organization, team, "contributor")
        other = self.draft(organization, team)
        documents = [self.database.mock_db[session] for session in (own, other)]
        container = Mock()
        container.query_items.side_effect = [
            [{"home": document["home"], "owner_id": document["owner_id"]} for document in documents], []]
        with patch.object(self.database, "use_mock", False), patch.object(self.database, "container", container):
            page = self.call("GET", "/home?status=draft", organization=organization, team=team,
                             subject="contributor", reviewer=False)
        self.assertEqual({item["session_id"]: item["can_delete"] for item in page["items"]},
                         {own: True, other: False})
        query = container.query_items.call_args_list[0].kwargs["query"]
        self.assertIn("c.home, c.owner_id", query)
        self.assertIn("c.organization_id = @organization AND c.team_id = @team", query)
        self.assertNotIn("owner_id", str(page))

    def test_membership_revocation_and_rejoin_do_not_restore_old_team_grants(self):
        organization, team = self.organization()
        identity = self.member(organization, team, "viewer", ["viewer"])
        session, analysis = self.workflow(organization, team)
        records = self.call("GET", f"/organizations/{organization}/members")["items"]
        member = next(item for item in records if item["identity_id"] == identity)
        self.call("PUT", f"/organizations/{organization}/members/{identity}",
                  body={"role": "member", "active": False, "version": member["version"]})
        self.call("GET", f"/sessions/{session}", subject="viewer", organization=organization, team=team, status=404)
        self.call("GET", "/home", subject="viewer", organization=organization, team=team, status=404)
        records = self.call("GET", f"/organizations/{organization}/members")["items"]
        member = next(item for item in records if item["identity_id"] == identity)
        self.call("PUT", f"/organizations/{organization}/members/{identity}",
                  body={"role": "member", "version": member["version"]})
        self.call("GET", f"/sessions/{session}", subject="viewer", organization=organization, team=team, status=404)
        self.assertEqual(self.call("GET", f"/organizations/{organization}/teams", subject="viewer")["items"], [])

    def test_immutable_owner_admin_escalation_and_stale_versions(self):
        organization, team = self.organization()
        owner_id = self.identity("owner")
        self.call("PUT", f"/organizations/{organization}/members/{owner_id}", body={"active": False}, status=409)
        admin_id = self.identity("admin")
        self.call("PUT", f"/organizations/{organization}/members/{admin_id}", body={"role": "admin"})
        self.call("PUT", f"/organizations/{organization}/members/{self.identity('another-admin')}",
                  subject="admin", body={"role": "admin"}, status=403)
        viewer_id = self.member(organization, team, "viewer", ["viewer"])
        self.call("PUT", f"/organizations/{organization}/members/{viewer_id}", body={"role": "member"}, status=409)
        members = self.call("GET", f"/organizations/{organization}/members")["items"]
        viewer = next(item for item in members if item["identity_id"] == viewer_id)
        request = {"role": "member", "version": viewer["version"], "active": False}
        self.call("PUT", f"/organizations/{organization}/members/{viewer_id}", body=request)
        self.call("PUT", f"/organizations/{organization}/members/{viewer_id}", body=request, status=409)
        self.call("GET", f"/organizations/{organization}/members", subject="viewer", status=404)

    def test_invite_link_joins_org_and_team_once_without_storing_the_secret(self):
        organization, team = self.organization()
        created = self.call("POST", f"/organizations/{organization}/invites", status=201,
                            body={"team_id": team, "team_roles": ["contributor"], "expires_in_hours": 24})
        code = created["code"]
        self.assertTrue(code.startswith(organization + "."))
        self.assertEqual((created["status"], created["max_uses"], created["uses"]), ("active", 1, 0))
        self.call("POST", "/invites/redeem", subject="invitee", body={"code": code}, status=200)
        joined = self.call("GET", "/organizations", subject="invitee")["items"]
        self.assertEqual([(item["organization_id"], item["role"]) for item in joined], [(organization, "member")])
        teams = self.call("GET", f"/organizations/{organization}/teams", subject="invitee")["items"]
        self.assertEqual(teams[0]["permissions"], ["read", "write"])
        self.workflow(organization, team, subject="invitee")
        self.call("POST", "/invites/redeem", subject="second", body={"code": code}, status=404)
        self.call("GET", "/organizations", subject="second")
        listed = self.call("GET", f"/organizations/{organization}/invites")["items"]
        self.assertEqual([(item["status"], item["uses"]) for item in listed], [("used", 1)])
        self.assertNotIn("code", listed[0])
        secret = code.split(".", 1)[1]
        self.assertNotIn(secret.encode(), Path(tenant_directory.path).read_bytes())

    def test_invite_redemption_rejects_revoked_expired_forged_and_unauthenticated_codes(self):
        organization, _ = self.organization()
        revoked = self.call("POST", f"/organizations/{organization}/invites", body={}, status=201)
        self.call("DELETE", f"/organizations/{organization}/invites/{revoked['invite_id']}")
        self.call("POST", "/invites/redeem", subject="invitee", body={"code": revoked["code"]}, status=404)
        expired = self.call("POST", f"/organizations/{organization}/invites", body={}, status=201)
        record = tenant_directory.get(organization, f"invite-{expired['invite_id']}")
        tenant_directory.write([record.model_copy(update={"expires_at": "2000-01-01T00:00:00+00:00"})])
        self.call("POST", "/invites/redeem", subject="invitee", body={"code": expired["code"]}, status=404)
        valid = self.call("POST", f"/organizations/{organization}/invites", body={}, status=201)["code"]
        for code in (valid[:-1] + ("A" if valid[-1] != "A" else "B"), "not-a-code", f"other-org.{valid.split('.')[1]}"):
            self.call("POST", "/invites/redeem", subject="invitee", body={"code": code}, status=404)
        response = self.client.post("/api/v1/invites/redeem", json={"code": valid})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(self.call("GET", "/organizations", subject="invitee")["items"], [])

    def test_invite_privileges_never_escalate_or_downgrade(self):
        organization, team = self.organization()
        self.call("POST", f"/organizations/{organization}/invites", subject="stranger", body={}, status=404)
        self.call("PUT", f"/organizations/{organization}/members/{self.identity('admin')}", body={"role": "admin"})
        self.call("POST", f"/organizations/{organization}/invites", subject="admin", body={"role": "admin"}, status=403)
        admin_invite = self.call("POST", f"/organizations/{organization}/invites", body={"role": "admin"}, status=201)
        self.call("DELETE", f"/organizations/{organization}/invites/{admin_invite['invite_id']}", subject="admin",
                  status=403)
        self.member(organization, team, "plain", ["viewer"])
        self.call("POST", f"/organizations/{organization}/invites", subject="plain", body={}, status=403)
        self.call("POST", f"/organizations/{organization}/invites", body={"team_id": team}, status=422)
        self.call("POST", f"/organizations/{organization}/invites", status=404,
                  body={"team_id": str(uuid4()), "team_roles": ["viewer"]})

        member_invite = self.call("POST", f"/organizations/{organization}/invites", body={"max_uses": 5},
                                  status=201)
        result = self.call("POST", "/invites/redeem", subject="admin", body={"code": member_invite["code"]})
        self.assertEqual((result["status"], result["role"]), ("already_member", "admin"))
        self.call("POST", "/invites/redeem", body={"code": member_invite["code"]})
        self.assertEqual(self.call("GET", "/organizations")["items"][0]["role"], "owner")
        listed = {item["invite_id"]: item for item in self.call("GET", f"/organizations/{organization}/invites")["items"]}
        self.assertEqual(listed[member_invite["invite_id"]]["uses"], 0)

        promote = self.call("POST", f"/organizations/{organization}/invites", status=201,
                            body={"role": "admin", "team_id": team, "team_roles": ["reviewer"]})
        result = self.call("POST", "/invites/redeem", subject="plain", body={"code": promote["code"]})
        self.assertEqual((result["status"], result["role"], result["team_id"]), ("joined", "admin", team))
        grants = self.call("GET", f"/organizations/{organization}/teams/{team}/members")["items"]
        plain = next(item for item in grants if item["identity_id"] == self.identity("plain"))
        self.assertEqual((plain["roles"], plain["effective_active"]), (["reviewer", "viewer"], True))

    def test_concurrent_redemption_cannot_exceed_max_uses(self):
        organization, _ = self.organization()
        code = self.call("POST", f"/organizations/{organization}/invites", body={}, status=201)["code"]
        headers = [self.headers(f"racer-{index}") for index in range(6)]
        with ThreadPoolExecutor(6) as pool:
            statuses = list(pool.map(lambda header: self.client.post(
                "/api/v1/invites/redeem", headers=header, json={"code": code}).status_code, headers))
        self.assertEqual(statuses.count(200), 1, statuses)
        self.assertTrue(set(statuses) <= {200, 404, 409}, statuses)
        members = self.call("GET", f"/organizations/{organization}/members")["items"]
        self.assertEqual(len(members), 2)

    def test_personal_workflows_remain_owner_private_even_inside_an_organization(self):
        organization, team = self.organization()
        self.member(organization, team, "viewer", ["viewer"])
        session, _ = self.workflow(subject="viewer")
        self.call("GET", f"/sessions/{session}", status=404)
        self.call("GET", f"/sessions/{session}", subject="viewer", organization=organization, team=team, status=404)
        self.call("GET", f"/sessions/{session}", subject="viewer")
        self.assertEqual(self.call("GET", "/home", organization=organization, team=team)["items"], [])

    def test_workspace_headers_validation_and_request_context_isolation(self):
        organization, team = self.organization()
        session, _ = self.workflow(organization, team)
        headers = self.headers(organization=organization, team=team)
        for malformed in ({**headers, "X-Team-ID": ""}, self.headers(organization=organization),
                          {**headers, "X-Team-ID": "../bad"}):
            response = self.client.get("/api/v1/home", headers=malformed)
            self.assertEqual(response.status_code, 400)
        duplicate = list(headers.items()) + [("X-Team-ID", team)]
        self.assertEqual(self.client.get("/api/v1/home", headers=duplicate).status_code, 400)
        def request(team_scope):
            return self.client.get(f"/api/v1/sessions/{session}", headers=(
                headers if team_scope else self.headers())).status_code
        with ThreadPoolExecutor(max_workers=4) as pool:
            self.assertEqual(list(pool.map(request, [True, False] * 4)), [200, 404] * 4)

    def test_directory_pages_are_bounded_and_validate_inputs(self):
        for _ in range(3):
            self.organization()
        cursor, seen = "", set()
        while True:
            page = self.call("GET", f"/organizations?limit=1&cursor={cursor}")
            self.assertLessEqual(len(page["items"]), 1)
            seen.update(item["organization_id"] for item in page["items"])
            cursor = page["next_cursor"]
            if not cursor:
                break
        self.assertEqual(len(seen), 3)
        self.call("GET", "/organizations?limit=101", status=422)
        self.call("POST", "/organizations", body={"name": "  "}, status=422)
        self.call("POST", "/organizations", body={"name": "Test", "role": "owner"}, status=422)


class DirectoryCosmosContractTests(unittest.TestCase):
    def setUp(self):
        self.directory = TenantDirectory()
        self.directory.use_mock = False
        self.container = self.directory.container = Mock()

    def test_directory_write_is_conditional_same_partition_and_indexes_sort_key(self):
        record = DirectoryRecord(id="organization", organization_id="org-one", document_type="organization",
                                 name="One", version="previous")
        self.directory.write([record])
        call = self.container.execute_item_batch.call_args
        self.assertEqual(call.kwargs["partition_key"], "org-one")
        operation = call.args[0][0]
        self.assertEqual(operation[0], "replace")
        self.assertEqual(operation[2], {"if_match_etag": "previous"})
        self.assertEqual(operation[1][1]["directory_key"], "org-one:organization")
        self.assertNotIn("version", operation[1][1])

    def test_batch_conflict_is_explicit(self):
        self.container.execute_item_batch.side_effect = exceptions.CosmosBatchOperationError(
            error_index=0, operation_responses=[], status_code=412, headers={}, message="conflict")
        with self.assertRaises(ConcurrentUpdate):
            self.directory.write([DirectoryRecord(id="organization", organization_id="org-one", document_type="organization")])

    def test_membership_query_is_bounded_and_identity_filtered(self):
        self.container.query_items.return_value = []
        self.directory.page("org_member", identity="verified-id", limit=2)
        call = self.container.query_items.call_args.kwargs
        self.assertIn("TOP 3", call["query"])
        self.assertIn("c.identity_id=@identity", call["query"])
        self.assertIn({"name": "@identity", "value": "verified-id"}, call["parameters"])
        self.assertNotIn("OFFSET", call["query"])
        self.directory.page("team_member", organization="org-one", team="team-one")
        self.assertEqual(self.container.query_items.call_args.kwargs["partition_key"], "org-one")

    def test_corrupt_or_cross_tenant_records_fail_without_payload_leak(self):
        self.container.read_item.return_value = {
            "id": "organization", "organization_id": "other-org", "document_type": "organization", "_etag": "v1"}
        with self.assertLogs("app.database.tenant_directory", level="ERROR"), self.assertRaises(InvalidDependencyResponse):
            self.directory.get("org-one", "organization")
        self.container.read.return_value = {"partitionKey": {"paths": ["/wrong"]}}
        with self.assertLogs("app.database.tenant_directory", level="ERROR"), self.assertRaises(DependencyUnavailable):
            self.directory.check_ready()
