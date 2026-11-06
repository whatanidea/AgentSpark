from dataclasses import replace
import os
from unittest.mock import patch
from uuid import uuid4

from app.database.tenant_directory import DirectoryRecord, tenant_directory
from app.security import auth
from app.utils.errors import DependencyUnavailable, InvalidDependencyResponse
from test_tenant_foundation import TenantFixture


class PlatformAdmissionTests(TenantFixture):
    def invite(self, organization, **body):
        return self.call("POST", f"/organizations/{organization}/invites", body=body, status=201)

    def test_billable_readiness_is_protected_but_infrastructure_health_stays_public(self):
        with patch("app.main.readiness", return_value=(True, {"openai": "ready"})) as probe:
            self.assertEqual(self.client.get("/health").status_code, 200)
            self.assertEqual(self.client.get("/ready").status_code, 401)
            response = self.client.get("/ready", headers=self.headers(subject="uninvited"))
            self.assertEqual(response.status_code, 403)
            self.assertEqual(response.json()["code"], "invitation_required")
            self.assertEqual(response.headers["cache-control"], "no-store")
            probe.assert_not_called()
            self.assertEqual(self.client.get("/ready", headers=self.headers()).status_code, 200)
            probe.assert_called_once()

    def test_signing_in_does_not_admit_a_user_even_with_reviewer_role(self):
        me = self.call("GET", "/auth/me", subject="uninvited")
        self.assertFalse(me["platform_access"])
        self.assertFalse(me["can_review"])
        for method, path, body in (
            ("GET", "/home", None), ("GET", "/organizations", None),
            ("GET", "/models", None), ("GET", "/patterns", None),
            ("POST", "/organizations", {"name": "Cannot self-admit"}),
            ("POST", "/intake", {}),
            ("POST", "/intake/document-preview", {}),
            ("POST", "/chat", {}), ("POST", f"/analyze/{uuid4()}", {}),
            ("POST", "/engagements", {}),
            ("GET", f"/sessions/{uuid4()}", None),
            ("POST", f"/sessions/{uuid4()}/interview/document-lookup", {}),
        ):
            with self.subTest(path=path):
                result = self.call(method, path, subject="uninvited", body=body, status=403)
                self.assertEqual(result["code"], "invitation_required")
        self.assertEqual(self.database.mock_db, {})
        self.assertEqual(tenant_directory.page("org_member", identity=self.identity("uninvited"))[0], [])

    def test_valid_invite_admits_atomically_and_reuses_the_existing_identity(self):
        organization, team = self.organization()
        invite = self.invite(organization, team_id=team, team_roles=["viewer"])
        self.assertFalse(self.call("GET", "/auth/me", subject="guest")["platform_access"])
        self.assertEqual(self.client.post("/api/v1/invites/preview", json={"code": invite["code"]}).status_code, 200)
        joined = self.call("POST", "/invites/redeem", subject="guest", body={"code": invite["code"]})
        self.assertEqual(joined["status"], "joined")
        self.assertTrue(self.call("GET", "/auth/me", subject="guest")["platform_access"])
        self.call("GET", "/home", subject="guest")
        member = tenant_directory.get(organization, f"member-{self.identity('guest')}")
        self.assertTrue(member.platform_admitted)
        self.assertEqual(self.call("GET", "/auth/me", subject="guest")["identity"], member.identity_id)
        scoped = {"subject": "guest", "organization": organization, "team": team}
        self.call("GET", "/home", **scoped)
        self.call("POST", "/intake", **scoped, body={
            "session_id": str(uuid4()), "business_domain": "Fictional viewer", "team_size": "1-50",
            "existing_systems": "Sample", "pain_points": "Sample", "compliance_requirements": "Low",
        }, status=403)
        self.call("POST", "/invites/redeem", subject="another", body={"code": invite["code"]}, status=404)
        self.assertFalse(self.call("GET", "/auth/me", subject="another")["platform_access"])

    def test_admission_is_removed_immediately_when_last_approved_membership_is_revoked(self):
        organization, team = self.organization()
        identity = self.member(organization, team, "guest", ["viewer"])
        self.assertTrue(self.call("GET", "/auth/me", subject="guest")["platform_access"])
        member = tenant_directory.get(organization, f"member-{identity}")
        self.call("PUT", f"/organizations/{organization}/members/{identity}",
                  body={"role": "member", "active": False, "version": member.version})
        self.call("GET", "/home", subject="guest", status=403)
        self.assertFalse(self.call("GET", "/auth/me", subject="guest")["platform_access"])
        invite = self.invite(organization)
        self.call("POST", "/invites/redeem", subject="guest", body={"code": invite["code"]})
        self.assertTrue(self.call("GET", "/auth/me", subject="guest")["platform_access"])
        self.call("GET", "/home", subject="guest", organization=organization, team=team, status=404)

    def test_other_active_approved_membership_keeps_platform_access_but_not_revoked_team_access(self):
        first, first_team = self.organization()
        second, second_team = self.organization()
        identity = self.member(first, first_team, "guest", ["viewer"])
        self.member(second, second_team, "guest", ["viewer"])
        member = tenant_directory.get(first, f"member-{identity}")
        tenant_directory.write([member.model_copy(update={"active": False})])
        self.assertTrue(self.call("GET", "/auth/me", subject="guest")["platform_access"])
        self.call("GET", "/home", subject="guest", organization=first, team=first_team, status=404)
        self.call("GET", "/home", subject="guest", organization=second, team=second_team)

    def test_legacy_self_created_membership_does_not_bypass_invitation_admission(self):
        organization, _ = self.organization()
        identity = self.identity("legacy")
        legacy = DirectoryRecord(id=f"member-{identity}", organization_id=organization,
                                 document_type="org_member", identity_id=identity, role="owner",
                                 generation=str(uuid4()))
        tenant_directory.write([legacy])
        self.assertFalse(self.call("GET", "/auth/me", subject="legacy")["platform_access"])
        self.call("POST", "/organizations", subject="legacy", body={"name": "Not approved"}, status=403)
        invite = self.invite(organization)
        self.call("POST", "/invites/redeem", subject="legacy", body={"code": invite["code"]})
        self.assertTrue(self.call("GET", "/auth/me", subject="legacy")["platform_access"])

    def test_bootstrap_is_explicit_and_never_grants_cross_workspace_authority(self):
        self.assertTrue(self.call("GET", "/auth/me")["platform_access"])
        self.call("GET", f"/organizations/{uuid4()}", status=404)
        with patch.object(auth, "auth_settings", replace(self.secure, platform_admin_ids=())):
            self.assertFalse(self.call("GET", "/auth/me")["platform_access"])
            self.call("POST", "/organizations", body={"name": "No bootstrap configured"}, status=403)

    def test_invalid_or_expired_invite_and_disabled_org_cannot_grant_platform_admission(self):
        organization, _ = self.organization()
        invite = self.invite(organization)
        self.call("POST", "/invites/redeem", subject="guest", body={"code": "invalid"}, status=404)
        self.assertFalse(self.call("GET", "/auth/me", subject="guest")["platform_access"])
        record = tenant_directory.get(organization, f"invite-{invite['invite_id']}")
        tenant_directory.write([record.model_copy(update={"expires_at": "2000-01-01T00:00:00+00:00"})])
        self.call("POST", "/invites/redeem", subject="guest", body={"code": invite["code"]}, status=404)
        self.assertFalse(self.call("GET", "/auth/me", subject="guest")["platform_access"])
        member = DirectoryRecord(id=f"member-{self.identity('guest')}", organization_id=organization,
                                 document_type="org_member", identity_id=self.identity("guest"), role="member",
                                 generation=str(uuid4()), platform_admitted=True)
        tenant_directory.write([member])
        org = tenant_directory.get(organization, "organization")
        tenant_directory.write([org.model_copy(update={"active": False})])
        self.assertFalse(self.call("GET", "/auth/me", subject="guest")["platform_access"])

    def test_directory_failure_is_explicit_and_never_admits_or_runs_the_request(self):
        for failure, status in ((DependencyUnavailable("tenant_directory"), 503),
                                (InvalidDependencyResponse("tenant_directory"), 502)):
            with self.subTest(status=status), patch.object(tenant_directory, "page", side_effect=failure):
                response = self.client.post("/api/v1/intake", headers=self.headers("guest"), json={})
                self.assertEqual(response.status_code, status)
                self.assertEqual(response.json()["dependency"], "tenant_directory")
                self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(self.database.mock_db, {})

    def test_admission_checks_memberships_beyond_the_first_page(self):
        organization, _ = self.organization()
        self.call("PUT", f"/organizations/{organization}/members/{self.identity('guest')}", body={"role": "member"})
        admitted = tenant_directory.get(organization, f"member-{self.identity('guest')}")
        with patch.object(tenant_directory, "page", side_effect=[([], "next-page"), ([admitted], None)]) as pages:
            self.assertTrue(self.call("GET", "/auth/me", subject="guest")["platform_access"])
        self.assertEqual(pages.call_args_list[1].kwargs["cursor"], "next-page")

    def test_bootstrap_settings_reject_email_addresses_or_unverified_subject_strings(self):
        for value in ("owner@example.com", "owner", "A" * 64):
            with self.subTest(value=value), patch.dict(os.environ, {"PLATFORM_ADMIN_IDENTITIES": value}):
                with self.assertRaisesRegex(ValueError, "PLATFORM_ADMIN_IDENTITIES"):
                    auth.load_auth_settings()
