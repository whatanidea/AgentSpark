from datetime import datetime, timedelta, timezone
from io import BytesIO
import unittest
from unittest.mock import patch
from uuid import uuid4

from pydantic import ValidationError
from pypdf import PdfReader
import test_discovery_release as baseline

from app.api import discovery
from app.database.decision_archive import decision_record
from app.utils import discovery as logic
from app.utils.errors import ConcurrentUpdate, DependencyUnavailable, InvalidDependencyResponse
from app.utils.models import DiscoveryFinding, DiscoveryRatings, DiscoverySynthesisContent


class DiscoverySellingWorkflowTests(unittest.TestCase):
    setUp = baseline.DiscoveryReleaseTests.setUp
    call = baseline.DiscoveryReleaseTests.call
    engagement = baseline.DiscoveryReleaseTests.engagement

    def create(self, notes=True):
        value = self.engagement(assessment_ids=[])
        if notes:
            value["contributions"] = [{"id": str(uuid4()), "role": "business_operator",
                                      "statement": "Fictional duplicate invoice reviews take manual effort."}]
        return self.call("POST", "/engagements", {"engagement": value})

    def generate(self, record):
        return self.call("POST", f"/engagements/{record['id']}/synthesis",
                         {"version": record["version"], "model_id": "demo"})

    def candidate(self):
        record = self.generate(self.create())
        candidate = record["synthesis"]["content"]["opportunities"][0]["id"]
        record = self.call("POST", f"/engagements/{record['id']}/candidates/{candidate}/accept",
                           {"version": record["version"]})
        record["engagement"]["opportunities"][0]["status"] = "selected"
        return self.call("PUT", f"/engagements/{record['id']}", {"version": record["version"],
                                                               "engagement": record["engagement"]})

    def handoff(self, record, expected=200, **overrides):
        body = {"version": record["version"], "model_id": "demo", "target_cloud": "azure", "reviewed": True}
        body.update(overrides)
        return self.call("POST", f"/engagements/{record['id']}/opportunities/"
                         f"{record['engagement']['opportunities'][0]['id']}/handoff", body, expected)

    def test_creation_has_exact_non_sliding_30_day_expiry_and_cosmos_ttl(self):
        record = self.create()
        created = datetime.fromisoformat(record["retention"]["created_at"])
        expiry = datetime.fromisoformat(record["expires_at"])
        self.assertEqual(expiry - created, timedelta(days=30))
        record["engagement"]["status"] = "active"
        updated = self.call("PUT", f"/engagements/{record['id']}",
                            {"version": record["version"], "engagement": record["engagement"]})
        self.assertEqual(updated["expires_at"], record["expires_at"])
        self.assertEqual(self.call("GET", f"/engagements/{record['id']}")["expires_at"], record["expires_at"])
        self.assertAlmostEqual(self.database.mock_db[record["id"]]["ttl"], 30 * 86400, delta=3)

    def test_explicit_renewal_preserves_creation_and_rejects_stale_version(self):
        record = self.create()
        future = datetime.now(timezone.utc) + timedelta(days=2)
        with patch.object(discovery, "datetime") as clock:
            clock.now.return_value = future
            updated = self.call("POST", f"/engagements/{record['id']}/renew", {"version": record["version"]})
        self.assertEqual(datetime.fromisoformat(updated["expires_at"]), future + timedelta(days=30))
        self.assertEqual(updated["retention"]["created_at"], record["retention"]["created_at"])
        self.call("POST", f"/engagements/{record['id']}/renew", {"version": record["version"]}, 409)

    def test_legacy_expiry_only_changes_on_explicit_renewal(self):
        record = self.create()
        state = self.database.get_workflow_state(record["id"], expected_kind="discovery")
        state.discovery_created_at = None
        state.expires_at = datetime.now(timezone.utc) + timedelta(hours=3)
        self.database.save_workflow_state(state)
        loaded = self.call("GET", f"/engagements/{record['id']}")
        self.assertIsNone(loaded["retention"]["created_at"])
        saved = self.call("PUT", f"/engagements/{record['id']}",
                          {"version": loaded["version"], "engagement": loaded["engagement"]})
        self.assertEqual(saved["expires_at"], loaded["expires_at"])
        renewed = self.call("POST", f"/engagements/{record['id']}/renew", {"version": saved["version"]})
        self.assertIsNotNone(renewed["retention"]["created_at"])
        self.assertAlmostEqual((datetime.fromisoformat(renewed["expires_at"]) -
                               datetime.now(timezone.utc)).total_seconds(), 30 * 86400, delta=3)

    def test_expired_engagement_cannot_be_renewed(self):
        record = self.create()
        self.database.mock_db[record["id"]]["expires_at"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        self.call("POST", f"/engagements/{record['id']}/renew", {"version": record["version"]}, 404)

    def test_synthesis_requires_sources_and_never_infers_facts(self):
        record = self.create(False)
        self.call("POST", f"/engagements/{record['id']}/synthesis", {"version": record["version"], "model_id": "demo"}, 422)
        record = self.generate(self.create())
        snapshot = record["synthesis"]
        self.assertTrue(record["synthesis_current"])
        self.assertIn("deterministic demo", " ".join(snapshot["content"]["open_questions"]))
        self.assertEqual(snapshot["content"]["opportunities"][0]["source_ids"], [snapshot["sources"][0]["id"]])
        state = self.database.get_workflow_state(record["id"], expected_kind="discovery")
        self.assertIsNone(state.workflow_intelligence)
        self.assertFalse(state.interview_answers)

    def test_candidate_acceptance_is_idempotent_and_invalid_sources_are_rejected(self):
        record = self.candidate()
        candidate = record["engagement"]["opportunities"][0]["id"]
        same = self.call("POST", f"/engagements/{record['id']}/candidates/{candidate}/accept", {"version": record["version"]})
        self.assertEqual(len(same["engagement"]["opportunities"]), 1)
        for sources in (["invented"], [same["synthesis"]["sources"][0]["id"]] * 2):
            same["engagement"]["opportunities"][0]["source_ids"] = sources
            self.call("PUT", f"/engagements/{record['id']}",
                      {"version": same["version"], "engagement": same["engagement"]}, 422)

    def test_scope_and_source_changes_make_synthesis_stale_and_block_handoff(self):
        record = self.candidate()
        record["engagement"]["required_topics"] = "Validate invoice baseline"
        changed = self.call("PUT", f"/engagements/{record['id']}",
                            {"version": record["version"], "engagement": record["engagement"]})
        self.assertFalse(changed["synthesis_current"])
        self.handoff(changed, 409)
        candidate = changed["engagement"]["opportunities"][0]["id"]
        self.call("POST", f"/engagements/{record['id']}/candidates/{candidate}/accept", {"version": changed["version"]}, 409)
        restored = self.generate(changed)
        self.assertTrue(restored["synthesis_current"])

    def test_live_synthesis_retries_invalid_references_and_withholds_second_failure(self):
        state = self.database.get_workflow_state(self.create()["id"], expected_kind="discovery")
        bad = DiscoverySynthesisContent(themes=[DiscoveryFinding(title="Invalid", statement="Fictional",
                                                                 source_ids=["invented"])])
        with patch.object(logic, "demo_mode", return_value=False), patch.object(logic, "get_chat_llm"), \
                patch.object(logic, "structured_call", return_value=bad) as generate:
            with self.assertRaises(InvalidDependencyResponse):
                logic.synthesize(state)
            self.assertEqual(generate.call_count, 2)

    def test_conflicts_require_two_valid_sources_and_server_assigns_candidate_ids(self):
        record = self.create()
        state = self.database.get_workflow_state(record["id"], expected_kind="discovery")
        source = logic.discovery_sources(state)[0].id
        bad = DiscoverySynthesisContent(conflicts=[DiscoveryFinding(title="Disagreement", statement="Fictional",
                                                                    source_ids=[source])])
        good = DiscoverySynthesisContent(opportunities=[DiscoveryFinding(title="Candidate", statement="Fictional",
                                                                         source_ids=[source], id="model-chosen")])
        with patch.object(logic, "demo_mode", return_value=False), patch.object(logic, "get_chat_llm"), \
                patch.object(logic, "structured_call", side_effect=[bad, good]):
            result = logic.synthesize(state)
        self.assertNotEqual(result.opportunities[0].id, "model-chosen")

    def test_synthesis_outage_is_explicit_and_previous_snapshot_survives(self):
        record = self.generate(self.create())
        with patch.object(discovery, "synthesize", side_effect=DependencyUnavailable("openai")):
            self.call("POST", f"/engagements/{record['id']}/synthesis",
                      {"version": record["version"], "model_id": "demo"}, 503)
        loaded = self.call("GET", f"/engagements/{record['id']}")
        self.assertEqual(loaded["synthesis"], record["synthesis"])
        self.assertEqual(loaded["version"], record["version"])

    def test_synthesis_input_budget_accepts_48000_but_rejects_48001_characters(self):
        state = self.database.get_workflow_state(self.create()["id"], expected_kind="discovery")
        with patch.object(logic.json, "dumps", return_value="x" * 48000):
            self.assertTrue(logic.synthesize(state).opportunities)
        with patch.object(logic.json, "dumps", return_value="x" * 48001), \
                patch.object(logic, "get_chat_llm") as model:
            with self.assertRaisesRegex(ValueError, "input budget"):
                logic.synthesize(state)
            model.assert_not_called()

    def test_priority_formula_exact_weights_inversions_and_stable_ties(self):
        record = self.candidate()
        op = record["engagement"]["opportunities"][0]
        op["ratings"] = {"value": 5, "feasibility": 4, "evidence_confidence": 3,
                         "risk": 2, "effort": 1, "rationale": "Illustrative assessor assumptions, not measured savings."}
        second = {**op, "id": str(uuid4()), "title": "Second equal candidate"}
        record["engagement"]["opportunities"].append(second)
        saved = self.call("PUT", f"/engagements/{record['id']}",
                          {"version": record["version"], "engagement": record["engagement"]})
        rows = saved["prioritization"]["items"]
        self.assertEqual([item["score"] for item in rows], [80.0, 80.0])
        self.assertEqual([item["opportunity_id"] for item in rows], sorted([op["id"], second["id"]]))
        self.assertEqual(sum(saved["prioritization"]["weights"].values()), 100)
        for index, candidate in enumerate(saved["engagement"]["opportunities"]):
            candidate["ratings"] = {key: (5 if key in ("risk", "effort") else 1) if index == 0
                                     else (1 if key in ("risk", "effort") else 5) for key in logic.PRIORITY_WEIGHTS}
            candidate["ratings"]["rationale"] = "Illustrative scale boundary"
        extremes = self.call("PUT", f"/engagements/{record['id']}",
                             {"version": saved["version"], "engagement": saved["engagement"]})
        self.assertEqual([item["score"] for item in extremes["prioritization"]["items"]], [100.0, 0.0])

    def test_unknown_ratings_rationale_sources_and_stale_synthesis_withhold_scores(self):
        record = self.candidate()
        self.assertIsNone(record["prioritization"]["items"][0]["score"])
        op = record["engagement"]["opportunities"][0]
        op["ratings"] = {key: 5 for key in logic.PRIORITY_WEIGHTS}
        op["ratings"]["rationale"] = ""
        op["source_ids"] = []
        saved = self.call("PUT", f"/engagements/{record['id']}",
                          {"version": record["version"], "engagement": record["engagement"]})
        row = saved["prioritization"]["items"][0]
        self.assertIsNone(row["score"])
        self.assertIn("rating rationale", row["missing"])
        self.assertIn("source references for confidence above 1", row["missing"])

    def test_ratings_reject_bool_float_string_and_out_of_range(self):
        for invalid in (True, 1.5, "5", 0, 6):
            with self.subTest(invalid=invalid), self.assertRaises(ValidationError):
                DiscoveryRatings(value=invalid)

    def test_handoff_requires_review_selection_and_approved_model(self):
        record = self.candidate()
        self.handoff(record, 422, reviewed=False)
        self.handoff(record, 422, target_cloud="other")
        self.handoff(record, 422, model_id="unapproved")
        record["engagement"]["opportunities"][0]["status"] = "proposed"
        saved = self.call("PUT", f"/engagements/{record['id']}",
                          {"version": record["version"], "engagement": record["engagement"]})
        self.handoff(saved, 409)

    def test_handoff_freezes_provenance_without_confirming_facts_and_preserves_archive_and_pdf(self):
        record = self.candidate()
        result = self.handoff(record)
        child = self.database.get_workflow_state(result["session_id"])
        self.assertFalse(child.interview_answers)
        self.assertIsNone(child.workflow_intelligence)
        self.assertIsNone(child.interview_diagnosis)
        self.assertTrue(all(entry.confirmation is None and not entry.related_facts for entry in child.evidence_register))
        self.assertAlmostEqual((child.expires_at - datetime.now(timezone.utc)).total_seconds(), 24 * 3600, delta=3)
        self.assertLess(child.expires_at, datetime.fromisoformat(record["expires_at"]))
        snapshot = self.call("GET", f"/sessions/{child.session_id}")
        self.assertEqual(snapshot["discovery_origin"]["sources"], result["engagement"]["handoffs"][0]["origin"]["sources"])
        incomplete = self.call("POST", f"/analyze/{child.session_id}")
        self.assertEqual(incomplete["status"], "needs_clarification")
        self.assertIsNone(incomplete["score"])
        self.call("GET", f"/blueprint/{child.session_id}", expected=404)
        self.call("POST", "/intake", {"session_id": child.session_id, "business_domain": "Fictional Finance",
                  "team_size": "51-200", "existing_systems": "SAP", "pain_points": "Fictional invoice delays",
                  "compliance_requirements": "High", "target_cloud": "azure", "demo_scenario": "invoice"})
        self.call("POST", f"/analyze/{child.session_id}")
        blueprint = self.call("GET", f"/blueprint/{child.session_id}")
        self.assertEqual(blueprint["discovery_origin"], snapshot["discovery_origin"])
        pdf = self.client.get(f"/api/v1/blueprint/{child.session_id}/pdf",
                              params={"analysis_id": blueprint["analysis_id"], "status": blueprint["status"]})
        self.assertEqual(pdf.status_code, 200, pdf.text[:1000] if pdf.status_code != 200 else "")
        text = " ".join(page.extract_text() for page in PdfReader(BytesIO(pdf.content)).pages)
        self.assertIn("Discovery origin", text)
        self.call("POST", f"/review/{child.session_id}", {"analysis_id": blueprint["analysis_id"], "decision": "approve",
                  "reviewer": "Fictional reviewer", "note": "Fictional review for archive provenance testing."})
        child = self.database.get_workflow_state(child.session_id)
        archived = decision_record(child, datetime.now(timezone.utc), 30)
        self.assertEqual(archived.details["discovery_origin"], snapshot["discovery_origin"])

    def test_child_creation_failure_leaves_visible_pending_reservation_and_retry_reuses_id(self):
        record = self.candidate()
        original = self.database.save_workflow_state
        def fail_child(state, **kwargs):
            if state.record_kind == "assessment":
                raise DependencyUnavailable("cosmos")
            return original(state, **kwargs)
        with patch.object(self.database, "save_workflow_state", side_effect=fail_child):
            self.handoff(record, 503)
        pending = self.call("GET", f"/engagements/{record['id']}")
        self.assertEqual(pending["handoffs"][0]["status"], "pending")
        self.assertEqual(len(pending["engagement"]["assessment_ids"]), 1)
        result = self.handoff(pending)
        self.assertEqual(result["session_id"], pending["handoffs"][0]["session_id"])
        self.assertEqual(result["engagement"]["handoffs"][0]["status"], "completed")
        repeat = self.handoff(result["engagement"])
        self.assertEqual(repeat["session_id"], result["session_id"])
        self.assertEqual(len(repeat["engagement"]["engagement"]["assessment_ids"]), 1)

    def test_completion_conflict_keeps_child_and_retry_completes_same_reservation(self):
        record = self.candidate()
        original = self.database.save_workflow_state
        def fail_completion(state, **kwargs):
            if state.record_kind == "discovery" and any(item.status == "completed" for item in state.discovery_handoffs):
                raise ConcurrentUpdate()
            return original(state, **kwargs)
        with patch.object(self.database, "save_workflow_state", side_effect=fail_completion):
            self.handoff(record, 409)
        pending = self.call("GET", f"/engagements/{record['id']}")
        child = self.database.get_workflow_state(pending["handoffs"][0]["session_id"])
        version = child._etag
        result = self.handoff(pending)
        self.assertEqual(result["session_id"], child.session_id)
        self.assertEqual(self.database.get_workflow_state(child.session_id)._etag, version)

    def test_completed_deleted_and_expired_children_are_never_recreated(self):
        for expired in (False, True):
            with self.subTest(expired=expired):
                result = self.handoff(self.candidate())
                if expired:
                    self.database.mock_db[result["session_id"]]["expires_at"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
                    self.handoff(result["engagement"], 404)
                else:
                    self.call("DELETE", f"/sessions/{result['session_id']}")
                    self.handoff(result["engagement"], 404)

    def test_frozen_handoff_rejects_new_cloud_and_changed_source_snapshot(self):
        result = self.handoff(self.candidate())
        record = result["engagement"]
        self.handoff(record, 409, target_cloud="aws")
        record["engagement"]["contributions"][0]["statement"] = "Revised fictional baseline"
        saved = self.call("PUT", f"/engagements/{record['id']}",
                          {"version": record["version"], "engagement": record["engagement"]})
        regenerated = self.generate(saved)
        self.handoff(regenerated, 409)
