"""Guided activity, backward-compatible playbooks and standalone findings contracts."""
from datetime import date
from hashlib import sha256
from io import BytesIO
import json
import unittest
from urllib.parse import urlencode

from pypdf import PdfReader
import test_discovery_processes as processes
from app.utils.discovery import source_digest
from app.utils.discovery_engagement import engagement_overview
from app.utils.discovery_playbooks import PLAYBOOKS


class GuidedDiscoveryTests(unittest.TestCase):
    setUp = processes.DiscoveryProcessTests.setUp
    identity = processes.DiscoveryProcessTests.identity
    headers = processes.DiscoveryProcessTests.headers
    call = processes.DiscoveryProcessTests.call
    organization = processes.DiscoveryProcessTests.organization
    member = processes.DiscoveryProcessTests.member
    fixture = processes.DiscoveryProcessTests.fixture
    request = processes.DiscoveryProcessTests.request
    process_save = processes.DiscoveryProcessTests.process_save
    task = processes.DiscoveryProcessTests.task
    contribute = processes.DiscoveryProcessTests.contribute
    review = processes.DiscoveryProcessTests.review
    generate = processes.DiscoveryProcessTests.generate

    @classmethod
    def setUpClass(cls):
        processes.DiscoveryProcessTests.setUpClass()
        cls.key = processes.DiscoveryProcessTests.key

    def save(self, **changes):
        self.record = self.request("PUT", "", {"version": self.record["version"],
                                              "engagement": {**self.record["engagement"], **changes}})
        return self.record

    def findings(self):
        return self.request("GET", "/findings?" + urlencode({"version": self.record["version"]}))

    def test_legacy_digest_is_unchanged_and_guides_are_additive(self):
        self.fixture(False)
        engagement = self.record["engagement"]
        self.assertIsNone(engagement["playbook_id"])
        self.assertEqual(engagement["playbook_answers"], {})
        state = self.database._decode(self.database.mock_db[self.record["id"]])
        old_shape = {"objective": engagement["objective"], "units": engagement["business_units"],
                     "required_topics": engagement["required_topics"], "excluded_topics": engagement["excluded_topics"],
                     "sources": []}
        self.assertEqual(source_digest(state), sha256(json.dumps(old_shape, sort_keys=True).encode()).hexdigest())
        self.assertEqual(self.findings()["synthesis_status"], "not_generated")
        guides = self.call("GET", "/discovery-playbooks", **self.scope)
        self.assertEqual({guide["id"] for guide in guides}, set(PLAYBOOKS))
        self.assertTrue(all(len(guide["questions"]) == 6 for guide in guides))

    def test_playbook_persistence_bounds_redaction_and_unknowns(self):
        self.fixture(False)
        expiry = self.record["expires_at"]
        self.save(playbook_id="ai_native_readiness", playbook_answers={
            "goals": "Improve quality", "data": "Unconfirmed: residency policy not yet supplied",
            "tools": "Owner contact person@example.com",
        })
        self.assertEqual(self.record["expires_at"], expiry)
        self.assertEqual(len(self.record["sources"]), 3)
        self.assertIn(PLAYBOOKS["ai_native_readiness"]["questions"][2]["label"], self.record["overview"]["unanswered_prompts"])
        self.assertNotIn("person@example.com", json.dumps(self.record))
        for overrides in ({"playbook_id": "invented"}, {"playbook_answers": {"forged": "value"}},
                          {"playbook_id": None}, {"playbook_answers": {"goals": "x" * 1001}}):
            self.request("PUT", "", {"version": self.record["version"],
                                    "engagement": {**self.record["engagement"], **overrides}}, status=422)
        self.assertFalse(any(check["complete"] for check in self.record["overview"]["checks"]
                             if check["id"] in ("guide", "people", "evidence")))

    def test_overdue_uses_utc_date_and_clarification_is_not_a_submitted_perspective(self):
        self.fixture()
        task = self.task(due_on="2026-11-10")
        state = self.database._decode(self.database.mock_db[self.record["id"]])
        on_due_day = engagement_overview(state, date(2026, 11, 10))
        self.assertEqual(on_due_day["pending_requests"], 1)
        self.assertEqual(on_due_day["overdue_requests"], 0)
        later = engagement_overview(state, date(2026, 11, 11))
        self.assertEqual(later["overdue_requests"], 1)
        self.assertEqual(later["next_actions"][0]["section"], "processes")
        state.discovery_tasks[0].status = "clarification_needed"
        self.assertEqual(engagement_overview(state)["submitted_perspectives"], 0)
        self.contribute(task)
        state = self.database._decode(self.database.mock_db[self.record["id"]])
        self.assertEqual(engagement_overview(state, date(2026, 11, 11))["overdue_requests"], 0)

    def test_report_excludes_drafts_preserves_reviewer_state_and_works_without_assessment(self):
        self.fixture()
        task = self.task()
        self.contribute(task, submit=False, answers={"manual_work": "PRIVATE_UNSUBMITTED_DRAFT"},
                        evidence=[{"statement": "DRAFT_BASELINE", "source_reference": "DRAFT_REF", "basis": "measured"}])
        report = self.findings()
        self.assertNotIn("PRIVATE_UNSUBMITTED_DRAFT", json.dumps(report))
        self.assertNotIn("DRAFT_BASELINE", json.dumps(report))
        self.contribute(task)
        ids = [source["id"] for source in self.record["sources"] if source.get("task_id") == task]
        self.review(ids, "clarification_needed")
        self.assertGreater(self.record["overview"]["review_issues"], 0)
        self.assertEqual(self.record["overview"]["next_actions"][0]["section"], "evidence")
        self.review(ids)
        report = self.findings()
        evidence = next(source for source in report["sources"] if ".evidence." in source["id"])
        self.assertEqual(evidence["review_status"], "reviewer_checked")
        self.assertEqual(evidence["basis"], "measured")
        self.assertIn("timed sample", evidence["source_reference"])
        self.assertEqual(report["source_reviews"][-1]["reviewed_by"], self.identity("reviewer"))
        self.assertEqual(self.record["assessments"], [])

    def test_current_findings_become_withheld_after_playbook_source_changes(self):
        self.fixture(False)
        self.save(playbook_id="workflow_opportunity", playbook_answers={"friction": "Manual rework"})
        self.generate()
        self.assertEqual(self.findings()["synthesis_status"], "current")
        self.save(playbook_answers={"friction": "Updated manual rework"})
        report = self.findings()
        self.assertEqual(report["synthesis_status"], "stale_withheld")
        self.assertIsNone(report["synthesis"])
        self.assertFalse(self.record["synthesis_current"])
        self.assertTrue(any(check["id"] == "process" and not check["complete"]
                            for check in report["overview"]["checks"]))

    def test_reader_export_is_version_scoped_and_never_mutates_or_authorizes(self):
        self.fixture(False)
        self.save(discovery_outcome="do_not_proceed",
                  outcome_rationale="No sufficiently evidenced benefit. <img src='https://invalid.example/x'/>")
        self.assertEqual(self.record["overview"]["stage"], "Discuss findings")
        self.assertIn("not proceeding", self.record["overview"]["next_actions"][0]["message"])
        self.assertEqual(len(self.record["overview"]["next_actions"]), 1)
        version, expiry = self.record["version"], self.record["expires_at"]
        query = urlencode({"version": version})
        path = f"/api/v1/engagements/{self.record['id']}/findings/pdf?{query}"
        result = self.client.get(path, headers=self.headers("operator", **self.scope))
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.headers["content-type"], "application/pdf")
        self.assertEqual(result.headers["cache-control"], "no-store")
        json_response = self.client.get(path.replace("/findings/pdf?", "/findings?"),
                                        headers=self.headers("operator", **self.scope))
        self.assertEqual(json_response.status_code, 200)
        self.assertEqual(json_response.headers["cache-control"], "no-store")
        text = "\n".join(page.extract_text() for page in PdfReader(BytesIO(result.content)).pages)
        for expected in ("Discovery Findings", "Do not proceed", "No sufficiently evidenced benefit",
                         "not AI readiness", "source_version", "No candidates recorded"):
            self.assertIn(expected.replace("source_version", "Source version"), text)
        self.assertIn("<img", text)
        current = self.request("GET", "")
        self.assertEqual((current["version"], current["expires_at"]), (version, expiry))
        self.assertEqual(current["assessments"], [])
        denied = self.client.get(path, headers=self.headers("unrelated", **self.scope))
        self.assertEqual(denied.status_code, 404)
        self.save(status="active")
        stale = self.client.get(path, headers=self.headers("operator", **self.scope))
        self.assertEqual(stale.status_code, 409)
        self.request("GET", "/findings?" + query, status=409)

    def test_playbook_sources_invalidate_reviews_and_rating_assumptions(self):
        self.fixture(False)
        self.save(playbook_id="ai_native_readiness", playbook_answers={"goals": "Reduce rework"})
        source_id = self.record["sources"][0]["id"]
        self.review([source_id])
        self.save(playbook_answers={"goals": "Improve work quality"})
        self.assertEqual(self.record["sources"][0]["review_status"], "stale_review")
        self.assertEqual(self.record["overview"]["next_actions"][0]["section"], "evidence")
