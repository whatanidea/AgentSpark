"""Focused process discovery contracts, authenticated contributions and frozen provenance."""
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import unittest
from unittest.mock import patch
from uuid import uuid4

import test_tenant_foundation as foundation
from app.api import discovery
from app.utils import discovery as logic
from app.utils.errors import ConcurrentUpdate, DependencyUnavailable
from app.security.guardrails import redact_pii


class DiscoveryProcessTests(unittest.TestCase):
    setUp = foundation.TenantFoundationTests.setUp
    identity = foundation.TenantFoundationTests.identity
    headers = foundation.TenantFoundationTests.headers
    call = foundation.TenantFoundationTests.call
    organization = foundation.TenantFoundationTests.organization
    member = foundation.TenantFoundationTests.member

    @classmethod
    def setUpClass(cls):
        foundation.TenantFoundationTests.setUpClass()
        cls.key = foundation.TenantFoundationTests.key

    def fixture(self, with_process=True):
        organization, team = self.organization()
        self.scope = {"organization": organization, "team": team}
        self.operator = self.member(organization, team, "operator", ["viewer"])
        self.reviewer = self.member(organization, team, "reviewer", ["viewer", "reviewer"])
        self.member(organization, team, "outsider", ["viewer"])
        self.process = {
            "id": str(uuid4()), "title": "Invoice checks", "process_owner": "Finance lead",
            "goal": "Reduce rework", "scope": "Receipt to reviewed invoice, no payments",
            "systems": "SAP", "volume": "100 per day, self-reported", "baseline_pain": "Duplicate manual checks",
            "steps": [{"id": str(uuid4()), "title": "Check invoice", "work": "Compare totals", "systems": "SAP"}],
        }
        self.record = self.call("POST", "/engagements", **self.scope, body={"engagement": {
            "title": "Process discovery", "objective": "Understand invoice work", "business_units": "Finance",
            "sponsor": "Sponsor", "engagement_owner": "Lead",
        }})
        if with_process:
            self.record = self.process_save(self.process)
        return self.record

    def request(self, method, suffix, body=None, subject="owner", status=200):
        return self.call(method, f"/engagements/{self.record['id']}{suffix}",
                         **self.scope, subject=subject, body=body, status=status)

    def process_save(self, process, status=200):
        return self.request("PUT", "/processes/" + process["id"],
                            {"version": self.record["version"], "process": process}, status=status)

    def task(self, subject="operator", role="business_operator", **overrides):
        value = {"version": self.record["version"], "process_id": self.process["id"],
                 "step_id": self.process["steps"][0]["id"], "assignee": self.identity(subject),
                 "role": role, "requested_information": "Describe this step and cite a baseline",
                 "due_on": "2026-11-10", **overrides}
        self.record = self.request("POST", "/tasks", value)
        return self.record["tasks"][-1]["id"]

    def contribute(self, task, submit=True, subject="operator", status=200, answers=None, evidence=None):
        role = next(item["role"] for item in self.record["tasks"] if item["id"] == task)
        body = {"version": self.record["version"], "submit": submit,
                "answers": answers if answers is not None else {key: "Fictional " + key for key in logic.STEP_QUESTIONS[role]},
                "evidence": evidence if evidence is not None else [{
                    "statement": "Measured 12 minutes per check", "source_reference": "Finance timed sample, October 2026",
                    "basis": "measured"}]}
        result = self.request("PUT", f"/tasks/{task}/contribution", body, subject=subject, status=status)
        if status == 200:
            self.record = result
        return result

    def generate(self):
        self.record = self.request("POST", "/synthesis", {"version": self.record["version"], "model_id": "demo"})
        return self.record

    def accept(self):
        self.generate()
        candidate = self.record["synthesis"]["content"]["opportunities"][0]["id"]
        self.record = self.request("POST", f"/candidates/{candidate}/accept", {"version": self.record["version"]})
        self.record["engagement"]["opportunities"][0]["status"] = "selected"
        self.record = self.request("PUT", "", {"version": self.record["version"], "engagement": self.record["engagement"]})
        return candidate

    def compare(self, candidate, preferred="deterministic_automation"):
        self.record = self.request("PUT", f"/opportunities/{candidate}/alternatives", {
            "version": self.record["version"], "alternatives": [
                {"kind": kind, "rationale": f"Human-written assessment of {kind}"} for kind in sorted(logic.ALTERNATIVE_KINDS)],
            "preferred_alternative": preferred,
        })

    def review(self, ids, status="reviewer_checked", expected=200, subject="reviewer"):
        result = self.request("POST", "/source-reviews", {"version": self.record["version"], "source_ids": ids,
                              "status": status, "rationale": "Explicit check of cited sample; not automatic"},
                              subject=subject, status=expected)
        if expected == 200:
            self.record = result
        return result

    def handoff(self, candidate, status=200):
        return self.request("POST", f"/opportunities/{candidate}/handoff",
                            {"version": self.record["version"], "model_id": "demo", "target_cloud": "azure", "reviewed": True},
                            status=status)

    def test_legacy_defaults_and_process_persistence_non_sliding_retention(self):
        self.fixture()
        expiry = self.record["expires_at"]
        self.assertEqual(len(self.record["sources"]), 1)
        loaded = self.request("GET", "")
        self.assertEqual(loaded["engagement"]["processes"], [self.process])
        self.assertEqual(loaded["sources"][0]["process_id"], self.process["id"])
        self.assertEqual(loaded["sources"][0]["basis"], "self_reported")
        self.task()
        self.assertEqual(self.record["expires_at"], expiry)
        self.assertAlmostEqual(self.database.mock_db[self.record["id"]]["ttl"], 30 * 86400, delta=5)

    def test_required_bounds_duplicate_steps_dates_and_foreign_references(self):
        self.fixture()
        for key in ("process_owner", "goal", "scope", "systems", "volume", "baseline_pain"):
            with self.subTest(key=key):
                self.process_save({**self.process, key: " "}, 422)
        for steps in ([], [self.process["steps"][0]] * 2, self.process["steps"] * 11):
            self.process_save({**self.process, "steps": steps}, 422)
        self.process_save({**self.process, "goal": "x" * 1001}, 422)
        self.process_save({**self.process, "id": "a" * 100,
                           "steps": [{**self.process["steps"][0], "id": "b" * 100}]}, 422)
        valid = {"version": self.record["version"], "process_id": self.process["id"],
                 "step_id": self.process["steps"][0]["id"], "assignee": self.operator, "role": "business_operator",
                 "requested_information": "Step baseline", "due_on": "2026-11-10"}
        for overrides in ({"process_id": str(uuid4())}, {"step_id": str(uuid4())}, {"due_on": "2026-02-30"},
                          {"requested_information": " "}, {"due_on": "2026-1-01"}, {"role": "admin"}):
            self.request("POST", "/tasks", {**valid, **overrides}, status=422)
        self.request("POST", "/tasks", {**valid, "assignee": self.identity("not-a-member")}, status=404)

    def test_two_authenticated_roles_drafts_excluded_and_no_cross_assignee_writes(self):
        self.fixture()
        operator_task = self.task()
        technical_task = self.task("reviewer", "technical_owner")
        self.contribute(operator_task, submit=False)
        self.assertFalse(any(source.get("task_id") for source in self.record["sources"]))
        self.contribute(operator_task, subject="outsider", status=403)
        self.contribute(operator_task, answers={"apis": "Wrong role"}, status=422)
        self.contribute(operator_task, answers={"manual_work": "Missing questions"}, status=422)
        self.contribute(operator_task)
        self.contribute(technical_task, subject="reviewer")
        self.assertEqual(self.record["tasks"][0]["status"], "submitted")
        self.assertEqual(self.record["tasks"][1]["role"], "technical_owner")
        self.generate()
        self.assertEqual({source["task_id"] for source in self.record["synthesis"]["sources"] if source["task_id"]},
                         {operator_task, technical_task})
        candidate = self.record["synthesis"]["content"]["opportunities"][0]
        self.assertTrue(candidate["source_ids"][0].startswith("task."))
        self.assertIn(candidate["source_ids"][0], {source["id"] for source in self.record["sources"] if source.get("task_id")})
        self.request("POST", "/tasks", {"version": self.record["version"]}, subject="operator", status=422)
        self.process_save(self.process)

    def test_active_membership_and_generation_required_no_reassignment_endpoint(self):
        self.fixture()
        task = self.task()
        organization, team = self.scope["organization"], self.scope["team"]
        from app.database.tenant_directory import tenant_directory
        member = tenant_directory.get(organization, f"member-{self.operator}")
        self.call("PUT", f"/organizations/{organization}/members/{self.operator}",
                  body={"role": "member", "active": False, "version": member.version})
        self.contribute(task, status=404)
        member = tenant_directory.get(organization, f"member-{self.operator}")
        self.call("PUT", f"/organizations/{organization}/members/{self.operator}",
                  body={"role": "member", "active": True, "version": member.version})
        grant = tenant_directory.get(organization, f"grant-{team}-{self.operator}")
        self.call("PUT", f"/organizations/{organization}/teams/{team}/members/{self.operator}",
                  body={"roles": ["viewer"], "version": grant.version})
        self.contribute(task, status=403)
        self.request("PUT", f"/tasks/{task}", {"version": self.record["version"], "assignee": self.reviewer}, status=405)

    def test_process_and_task_etags_reject_stale_writes_and_storage_conflicts(self):
        self.fixture()
        stale = self.record["version"]
        self.record = self.process_save({**self.process, "volume": "110 per day"})
        self.request("PUT", "/processes/" + self.process["id"], {"version": stale, "process": self.process}, status=409)
        task = self.task()
        stale = self.record["version"]
        self.contribute(task, submit=False)
        self.request("PUT", f"/tasks/{task}/contribution", {"version": stale, "answers": {}, "submit": False, "evidence": []},
                     subject="operator", status=409)
        with patch.object(self.database, "save_workflow_state", side_effect=ConcurrentUpdate()):
            self.contribute(task, status=409)
        self.assertEqual(self.request("GET", "")["tasks"][0]["status"], "draft")

    def test_reviews_require_independent_reviewer_and_current_unique_sources(self):
        self.fixture()
        task = self.task()
        self.contribute(task)
        ids = [source["id"] for source in self.record["sources"] if source.get("task_id") and source["basis"] == "self_reported"]
        self.review(ids, expected=403, subject="operator")
        self.review(ids, expected=403, subject="owner")
        self.review(["foreign"], expected=422)
        self.review(ids[:1] * 2, expected=422)
        self.review(ids[:1], status="disagreement", expected=422)
        self.generate()
        self.review(ids[:2], status="disagreement")
        self.assertEqual(self.record["tasks"][0]["status"], "clarification_needed")
        self.assertFalse(self.record["synthesis_current"])
        self.review(ids[:2], status="resolved")
        reviewed = [source for source in self.record["sources"] if source["id"] in ids[:2]]
        self.assertTrue(all(source["review_status"] == "resolved" for source in reviewed))
        self.assertTrue(all(source["basis"] == "self_reported" for source in reviewed))
        self.assertEqual(self.record["source_reviews"][-1]["reviewed_by"], self.reviewer)

    def test_reviewer_check_is_explicit_measurement_not_verification_and_changes_invalidate_review(self):
        self.fixture()
        task = self.task()
        self.contribute(task)
        evidence = next(source for source in self.record["sources"] if source["basis"] == "measured")
        self.assertEqual(evidence["review_status"], "not_reviewed")
        self.review([evidence["id"]])
        self.assertEqual(next(source for source in self.record["sources"] if source["id"] == evidence["id"])["review_status"], "reviewer_checked")
        self.contribute(task)
        self.assertEqual(self.record["tasks"][0]["status"], "submitted")
        self.generate()
        self.contribute(task, evidence=[{"statement": "Measured 14 minutes", "source_reference": "New sample", "basis": "measured"}])
        self.assertFalse(self.record["synthesis_current"])
        self.assertEqual(next(source for source in self.record["sources"] if source["id"] == evidence["id"])["review_status"], "stale_review")
        self.assertEqual(self.record["tasks"][0]["status"], "clarification_needed")
        self.contribute(task, evidence=[], status=422)

    def test_all_five_human_alternatives_required_and_process_provenance_survives_handoff(self):
        self.fixture()
        task = self.task()
        self.contribute(task)
        candidate = self.accept()
        self.assertEqual(self.record["engagement"]["opportunities"][0]["process_ids"], [self.process["id"]])
        self.handoff(candidate, 422)
        self.request("PUT", f"/opportunities/{candidate}/alternatives", {
            "version": self.record["version"], "alternatives": [{"kind": "ai_assistance", "rationale": "AI default"}] * 5,
            "preferred_alternative": "ai_assistance"}, status=422)
        self.compare(candidate)
        result = self.handoff(candidate)
        origin = result["engagement"]["handoffs"][0]["origin"]
        self.assertEqual(origin["processes"], [self.process])
        self.assertEqual(origin["preferred_alternative"], "deterministic_automation")
        self.assertEqual(len(origin["alternatives"]), 5)
        cited = [source for source in origin["sources"] if source.get("task_id")]
        self.assertTrue(cited)
        self.assertTrue(all(f"Process {self.process['title']} / step {self.process['steps'][0]['title']}" in source["label"]
                            for source in cited))
        from io import BytesIO
        from pypdf import PdfReader
        from app.utils.pdf_report import build_blueprint_pdf
        exported = build_blueprint_pdf({"status": "awaiting_human_review", "analysis_id": str(uuid4()),
                                        "discovery_origin": origin})
        text = " ".join(" ".join(page.extract_text().split()) for page in PdfReader(BytesIO(exported)).pages)
        for retained in (self.process["title"], self.process["steps"][0]["title"],
                         origin["alternatives"][0]["rationale"], "deterministic_automation",
                         cited[0]["label"]):
            self.assertIn(retained, text)
        child = self.call("GET", f"/sessions/{result['session_id']}", **self.scope)
        self.assertEqual(child["discovery_origin"], origin)
        self.assertIsNone(child["workflow_intelligence"])
        self.assertEqual(child["interview_answers"], {})
        self.assertTrue(all(item["confirmation"] is None for item in child["evidence_register"]))
        self.record = result["engagement"]
        self.compare(candidate, "unchanged")
        self.handoff(candidate, 409)

    def test_current_disagreement_and_stale_review_block_process_handoff(self):
        self.fixture()
        task = self.task()
        self.contribute(task)
        candidate = self.accept()
        self.compare(candidate)
        source = self.record["engagement"]["opportunities"][0]["source_ids"][0]
        self.review([source], "clarification_needed")
        self.contribute(task)
        self.assertEqual(self.record["tasks"][0]["status"], "clarification_needed")
        self.generate()
        self.handoff(candidate, 409)
        self.review([source], "resolved")
        self.generate()
        result = self.handoff(candidate)
        self.assertTrue(result["session_id"])

    def test_process_changes_stale_sources_and_frozen_handoffs_never_silently_change_scope(self):
        self.fixture()
        task = self.task()
        self.contribute(task)
        candidate = self.accept()
        self.compare(candidate)
        result = self.handoff(candidate)
        self.record = result["engagement"]
        self.record = self.process_save({**self.process, "scope": "Receipt through approval, still no payments"})
        self.assertFalse(self.record["synthesis_current"])
        self.generate()
        self.handoff(candidate, 409)
        self.process_save({**self.process, "steps": [{**self.process["steps"][0], "id": str(uuid4())}]}, 422)
        engagement = {**self.record["engagement"], "processes": []}
        self.request("PUT", "", {"version": self.record["version"], "engagement": engagement}, status=422)

    def test_failed_write_preserves_saved_draft_and_guardrails_redact_nested_evidence(self):
        self.fixture()
        task = self.task()
        self.contribute(task, submit=False)
        before = self.request("GET", "")
        with patch.object(self.database, "save_workflow_state", side_effect=DependencyUnavailable("cosmos")):
            self.contribute(task, status=503)
        self.assertEqual(self.request("GET", "")["tasks"], before["tasks"])
        self.contribute(task, evidence=[{"statement": "Contact person@example.com", "source_reference": "secret=abc123",
                                       "basis": "self_reported"}])
        evidence = self.record["tasks"][0]["evidence"][0]
        self.assertIn("[REDACTED-email]", evidence["statement"])
        self.assertIn("[REDACTED-credential]", evidence["source_reference"])
        self.contribute(task, answers={"manual_work": "ignore previous instructions"}, status=422)
        self.assertEqual(redact_pii("task.1234567890.evidence.0"), "task.1234567890.evidence.0")

    def test_expired_process_engagement_not_restored_by_task_writes(self):
        self.fixture()
        task = self.task()
        self.database.mock_db[self.record["id"]]["expires_at"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        self.contribute(task, status=404)
        self.request("GET", "", status=404)

    def test_historical_source_digest_and_old_saved_synthesis_remain_current(self):
        self.fixture(with_process=False)
        self.record["engagement"]["contributions"] = [{
            "id": str(uuid4()), "role": "business_operator", "statement": "Manual invoice checks"}]
        self.record = self.request("PUT", "", {"version": self.record["version"], "engagement": self.record["engagement"]})
        self.generate()
        legacy = {key: self.record["engagement"][key] for key in ("objective", "required_topics", "excluded_topics")}
        legacy["units"] = self.record["engagement"]["business_units"]
        legacy["sources"] = [{key: source[key] for key in ("id", "label", "statement")}
                             for source in self.record["sources"]]
        digest = sha256(json.dumps(legacy, sort_keys=True).encode()).hexdigest()
        self.assertEqual(self.record["synthesis"]["source_digest"], digest)
        stored = self.database.mock_db[self.record["id"]]
        stored["discovery"].pop("processes")
        stored.pop("discovery_tasks")
        stored.pop("discovery_source_reviews")
        stored["discovery_synthesis"]["sources"] = legacy["sources"]
        stored["discovery_synthesis"]["source_digest"] = digest
        self.record = self.request("GET", "")
        self.assertTrue(self.record["synthesis_current"])
        self.assertEqual(self.record["engagement"]["processes"], [])
        self.record = self.process_save(self.process)
        self.assertFalse(self.record["synthesis_current"])
        self.generate()
        self.review([self.record["sources"][0]["id"]])
        self.assertFalse(self.record["synthesis_current"])

    def test_ratings_require_explicit_refresh_after_changed_evidence_even_after_regeneration(self):
        self.fixture()
        task = self.task()
        self.contribute(task)
        candidate = self.accept()
        ratings = {"value": 4, "feasibility": 3, "evidence_confidence": 2,
                   "risk": 2, "effort": 3, "rationale": "Human current source evaluation"}
        self.record = self.request("PUT", f"/opportunities/{candidate}/ratings",
                                  {"version": self.record["version"], "ratings": ratings})
        self.assertNotIn("current rating assumptions", self.record["prioritization"]["items"][0]["missing"])
        evidence = next(source for source in self.record["sources"] if source["basis"] == "measured")
        self.review([evidence["id"]])
        self.contribute(task, evidence=[{"statement": "Measured 14 minutes", "source_reference": "New sample", "basis": "measured"}])
        self.assertEqual(self.record["tasks"][0]["status"], "clarification_needed")
        self.assertFalse(self.record["synthesis_current"])
        self.assertIn("current rating assumptions", self.record["prioritization"]["items"][0]["missing"])
        self.review([evidence["id"]])
        self.assertEqual(self.record["tasks"][0]["status"], "submitted")
        self.generate()
        self.assertIn("current rating assumptions", self.record["prioritization"]["items"][0]["missing"])
        self.record = self.request("PUT", f"/opportunities/{candidate}/ratings",
                                  {"version": self.record["version"], "ratings": ratings})
        self.assertNotIn("current rating assumptions", self.record["prioritization"]["items"][0]["missing"])
        self.contribute(task, evidence=[{"statement": "Measured 14 minutes", "source_reference": "New sample", "basis": "measured"}])
        self.assertEqual(self.record["tasks"][0]["status"], "submitted")

    def test_discovery_document_budget_counts_utf8_bytes_and_preserves_saved_state(self):
        self.fixture()
        self.task()
        from app.utils.models import DiscoveryBaseline, WorkflowState
        from fastapi import HTTPException
        state = WorkflowState.model_validate(self.database.mock_db[self.record["id"]])
        task = state.discovery_tasks[0]
        state.discovery_tasks = [task.model_copy(update={
            "id": str(uuid4()), "answers": {key: "界" * 1000 for key in logic.STEP_QUESTIONS[task.role]},
            "evidence": [DiscoveryBaseline(statement="界" * 1000, source_reference="界" * 500) for _ in range(5)],
        }) for _ in range(50)]
        with patch.object(self.database, "_authorize"):
            with self.assertRaises(HTTPException) as raised:
                self.database.save_workflow_state(state)
            self.assertEqual(raised.exception.status_code, 422)
            self.assertIn("1 MB", raised.exception.detail)
        self.assertEqual(len(self.request("GET", "")["tasks"]), 1)


if __name__ == "__main__":
    unittest.main()
