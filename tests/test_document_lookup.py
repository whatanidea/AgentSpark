from datetime import datetime, timedelta, timezone
import json
import unittest
from unittest.mock import Mock, patch

import test_document_intake as fixtures
from app.database.decision_archive import decision_record
from app.utils import document_lookup, documents
from app.utils.document_models import DocumentAnswer, DocumentAnswerCandidate, DocumentAnswers, DocumentField, SourceExcerpt
from app.utils.errors import DependencyUnavailable, WorkflowNotFound
from app.utils.interview import effective_diagnosis


class DocumentLookupTests(unittest.TestCase):
    setUp = fixtures.DocumentIntakeTests.setUp
    preview = fixtures.DocumentIntakeTests.preview

    def retain(self, lines=None, excluded=None):
        preview = self.preview(lines or ["Workflow name: Fictional SRE", "Summary: Gather evidence for responders."]).json()
        fields = [field for field in preview["candidates"] if field["field_id"] == "fact.workflow_name"]
        return self.client.post("/api/v1/intake", json={
            "session_id": self.session, "business_domain": "", "team_size": "", "existing_systems": "",
            "pain_points": "", "compliance_requirements": "", "target_cloud": "azure", "model_id": "demo",
            "document": {"metadata": preview["metadata"], "fields": fields, "context_approved": True,
                         "version": preview["version"], "source": preview["source"],
                         "excluded_fields": excluded or []}})

    def lookup(self, fields, version=None, stream=False):
        state = self.database.get_workflow_state(self.session)
        return self.client.post(f"/api/v1/sessions/{self.session}/interview/document-lookup",
            json={"version": version or state._etag, "field_ids": fields},
            headers={"Accept": "application/x-ndjson"} if stream else {})

    @staticmethod
    def answers_for(payload, answers):
        data = json.loads(payload)
        converted = {identifier: DocumentAnswerCandidate(value=field.value, count_basis=field.count_basis,
            source_ids=[next(unit["id"] for unit in data["sources"] if quote.quote in unit["text"])
                        for quote in [field, *field.supporting_quotes]])
                     for identifier, field in answers.items()}
        return DocumentAnswers(answers=[DocumentAnswer(field_id=field["id"],
            status="found" if field["id"] in answers else "not_found",
            candidates=[converted[field["id"]]] if field["id"] in answers else [])
            for field in data["questions"]])

    def test_approval_automatically_captures_narrative_summary_and_two_decisions(self):
        lines = ["Workflow name: Fictional SRE",
                 "An incident triggers Azure and SAP evidence collection and a note in the same PagerDuty incident.",
                 "This is the first formal decision point: is the correlation defensible?",
                 "The second formal decision point is whether specialist escalation is required.",
                 "The compliance classification has not been completed."]
        summary = DocumentField(field_id="fact.summary", value=lines[1], quote=lines[1], location="Paragraph 2")
        decisions = DocumentField(field_id="fact.decision_points", value="2", quote=lines[2], location="Paragraph 3",
            count_basis="decision_ordinals", supporting_quotes=[SourceExcerpt(quote=lines[3], location="Paragraph 4")])
        def generate(_llm, _prompt, payload, _schema):
            return self.answers_for(payload, {field.field_id: field for field in (summary, decisions)})
        with patch.object(document_lookup, "demo_mode", return_value=False), \
                patch.object(document_lookup, "get_chat_llm", return_value=Mock()), \
                patch.object(document_lookup, "structured_call", side_effect=generate) as call:
            response = self.retain(lines)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertGreater(call.call_count, 1)
        self.assertTrue(all(len(json.loads(invocation.args[2])["questions"]) <= 8 for invocation in call.call_args_list))
        progress = response.json()["interview"]
        self.assertEqual(progress["answers"]["fact.decision_points"], "2")
        self.assertEqual(progress["answers"]["fact.summary"], lines[1])
        self.assertIn("compliance_sensitivity", progress["missing_facts"])
        self.assertFalse(any("from input to outcome" in question for question in progress["questions"]))
        state = self.database.get_workflow_state(self.session)
        evidence = effective_diagnosis(state).evidence["decision_points"]
        self.assertEqual(evidence.source, "document")
        self.assertIn(lines[3], evidence.quote)
        self.assertIn("Paragraph 4", evidence.reference)
        self.assertIsNone(state.analysis_id)
        self.assertTrue(all(check.status != "ready" for check in state.readiness_assessment.checks))
        captured = next(field for field in state.document_intake.fields if field.field_id == "fact.decision_points")
        self.assertEqual((captured.capture, captured.reviewed_by), ("document_lookup", "document_lookup"))

    def test_retained_source_is_private_redacted_expires_with_assessment_and_not_archived(self):
        response = self.retain(["Workflow name: Fictional SRE", "Contact fictional@example.com", "Private appendix."])
        self.assertEqual(response.status_code, 200, response.text)
        state = self.database.get_workflow_state(self.session)
        self.assertIn("Private appendix.", state.document_source.units[-1].text)
        self.assertNotIn("fictional@example.com", state.document_source.model_dump_json())
        restored = self.client.get(f"/api/v1/sessions/{self.session}")
        self.assertNotIn("document_source", restored.json())
        progress = self.client.get(f"/api/v1/sessions/{self.session}/interview").json()
        self.assertTrue(progress["document"]["available"])
        self.assertEqual(progress["document"]["expires_at"], state.expires_at.isoformat())
        state.analysis_id = self.session
        state.status = "completed"
        self.assertNotIn("Private appendix.", decision_record(state, datetime.now(timezone.utc), 30).model_dump_json())
        state.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        self.database.mock_db[self.session]["expires_at"] = state.expires_at.isoformat()
        self.assertEqual(self.lookup_expired().status_code, 404)

    def lookup_expired(self):
        return self.client.post(f"/api/v1/sessions/{self.session}/interview/document-lookup",
                                json={"version": "expired", "field_ids": ["fact.summary"]})

    def test_omitted_answer_is_not_resurrected_automatically_but_button_can_fetch_it(self):
        response = self.retain(excluded=["fact.summary"])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("summary", response.json()["interview"]["missing_facts"])
        result = self.lookup(["fact.summary"], stream=True)
        events = [json.loads(line) for line in result.text.splitlines()]
        self.assertEqual(events[-1]["kind"], "result", events[-1])
        self.assertEqual(events[-1]["data"]["answers"]["fact.summary"], "Gather evidence for responders.")
        self.assertEqual(events[-1]["data"]["rounds_used"], 0)
        self.assertIn("fact.summary", events[-1]["data"]["document"]["checks"])

    def test_missing_answer_remains_unanswered_and_repeated_automatic_scan_does_not_call_model(self):
        self.assertEqual(self.retain().status_code, 200)
        result = self.lookup(["fact.compliance_sensitivity"])
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["document"]["checks"]["fact.compliance_sensitivity"], "not_found")
        self.assertIn("compliance_sensitivity", result.json()["missing_facts"])
        with patch.object(document_lookup, "_lookup") as generate:
            self.lookup([])
        generate.assert_not_called()

    def test_newly_required_runtime_question_is_checked_before_it_is_asked(self):
        response = self.retain(["Workflow name: Fictional SRE", "runtime.side_effects: consequential",
                                "runtime.side_effect_safety: defined"])
        self.assertEqual(response.status_code, 200, response.text)
        progress = response.json()["interview"]
        self.assertEqual(progress["answers"]["runtime.side_effect_safety"], "defined")
        self.assertNotIn("runtime.side_effect_safety", progress["missing_fields"])
        self.assertEqual(progress["document"]["checks"]["runtime.side_effect_safety"], "found")

    def test_source_only_approval_enables_lookup_when_initial_preview_has_no_proposals(self):
        response = self.retain(["A narrative with no labelled answers in deterministic demo mode."])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["interview"]["document"]["available"])
        self.assertTrue(response.json()["interview"]["missing_facts"])

    def test_lookup_is_versioned_write_scoped_and_never_overwrites_an_answer(self):
        self.assertEqual(self.retain().status_code, 200)
        self.assertEqual(self.lookup(["fact.steps"], version="stale").status_code, 409)
        self.assertEqual(self.lookup(["fact.workflow_name"]).status_code, 409)
        self.assertEqual(self.lookup(["fact.secret"]).status_code, 422)
        with patch.object(self.database, "_authorize", side_effect=fixtures.HTTPException(403, "Read only")), \
                patch.object(document_lookup, "_lookup") as generation:
            result = self.client.post(f"/api/v1/sessions/{self.session}/interview/document-lookup",
                                     json={"version": "denied", "field_ids": ["fact.steps"]})
        self.assertEqual(result.status_code, 403)
        generation.assert_not_called()
        with patch.object(fixtures.routes, "db_client", fixtures.DatabaseClient()):
            self.assertEqual(self.lookup_expired().status_code, 404)

    def test_conflicting_answers_are_shown_without_automatic_selection(self):
        response = self.retain(["Workflow name: Fictional SRE", "Steps: 7", "Steps: 9"])
        self.assertEqual(response.status_code, 200, response.text)
        progress = response.json()["interview"]
        self.assertIn("steps", progress["missing_facts"])
        self.assertEqual(progress["document"]["checks"]["fact.steps"], "conflict")
        self.assertEqual({field["value"] for field in progress["document"]["conflicts"]}, {"7", "9"})

    def test_bad_lookup_correction_is_terminal_without_partially_saved_changes(self):
        self.assertEqual(self.retain().status_code, 200)
        before = self.database.get_workflow_state(self.session).model_dump()
        invalid = DocumentAnswer(field_id="fact.steps", status="found", candidates=[
            DocumentAnswerCandidate(value="7", source_ids=["s999"])])
        with patch.object(document_lookup, "demo_mode", return_value=False), \
                patch.object(document_lookup, "get_chat_llm", return_value=Mock()), \
                patch.object(document_lookup, "structured_call", return_value=DocumentAnswers(answers=[invalid])) as call, \
                self.assertLogs("app.utils.document_lookup", level="WARNING") as logs:
            response = self.lookup(["fact.steps"], stream=True)
        self.assertEqual(call.call_count, 2)
        events = [json.loads(line) for line in response.text.splitlines()]
        self.assertEqual((events[-1]["kind"], events[-1]["status"]), ("error", 502))
        self.assertNotIn("Invented private", response.text + "".join(logs.output))
        self.assertEqual(before, self.database.get_workflow_state(self.session).model_dump())

    def test_provider_failure_never_becomes_not_found_or_saves_a_version(self):
        self.assertEqual(self.retain().status_code, 200)
        before = self.database.get_workflow_state(self.session)._etag
        with patch.object(document_lookup, "demo_mode", return_value=False), \
                patch.object(document_lookup, "get_chat_llm", return_value=Mock()), \
                patch.object(document_lookup, "structured_call", side_effect=DependencyUnavailable("openai")):
            response = self.lookup(["fact.steps"])
        self.assertEqual(response.status_code, 503)
        self.assertEqual(before, self.database.get_workflow_state(self.session)._etag)

    def test_related_but_unverifiable_value_requests_confirmation_without_applying_it(self):
        self.assertEqual(self.retain().status_code, 200)
        candidate = DocumentAnswerCandidate(value="7", source_ids=["s1"])
        answer = DocumentAnswer(field_id="fact.steps", status="found", candidates=[candidate])
        with patch.object(document_lookup, "demo_mode", return_value=False), \
                patch.object(document_lookup, "get_chat_llm", return_value=Mock()), \
                patch.object(document_lookup, "structured_call", return_value=DocumentAnswers(answers=[answer])):
            response = self.lookup(["fact.steps"])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("steps", response.json()["missing_facts"])
        self.assertEqual(response.json()["document"]["checks"]["fact.steps"], "needs_confirmation")
        self.assertNotIn("fact.steps", response.json()["answers"])

    def test_option_evidence_uses_whole_words_and_normalized_runtime_spelling(self):
        self.assertFalse(documents._explicit_option("Low", "Describe the workflow."))
        self.assertFalse(documents._explicit_option("no", "This is not confirmed."))
        self.assertTrue(documents._explicit_option("High", "Sensitivity: High."))
        self.assertTrue(documents._explicit_option("read_only", "Use a read-only identity."))

    def test_count_derivations_reject_unmatched_words_and_fabricated_supporting_quotes(self):
        for value, quote, valid in (("25", "twenty-five incidents", True), ("0", "zero decisions", True),
                                    ("2", "two hundred incidents", False), ("25", "fifty incidents", False)):
            candidate = DocumentField(field_id="fact.volume_per_day", value=value, quote=quote,
                                      location="Paragraph 1", count_basis="number_words")
            self.assertEqual(documents._supported_count(candidate), valid)
        candidate = DocumentField(field_id="fact.decision_points", value="2",
            quote="The first formal decision point.", location="Paragraph 1", count_basis="decision_ordinals",
            supporting_quotes=[SourceExcerpt(quote="The second formal decision point.", location="Paragraph 1")])
        valid, issues = documents._checked_candidates(
            fixtures.WorkflowState(session_id=self.session), [candidate],
            [{"location": "Paragraph 1", "text": "The first formal decision point."}])
        self.assertFalse(valid)
        self.assertTrue(issues)

    def test_source_can_be_deleted_with_assessment_and_legacy_upload_requests_reupload(self):
        self.assertEqual(self.retain().status_code, 200)
        state = self.database.get_workflow_state(self.session)
        state.document_source = None
        self.database.save_workflow_state(state)
        response = self.lookup(["fact.steps"])
        self.assertEqual(response.status_code, 409)
        self.assertIn("Re-upload", response.text)
        self.assertEqual(self.client.delete(f"/api/v1/sessions/{self.session}").status_code, 200)
        with self.assertRaises(WorkflowNotFound):
            self.database.get_workflow_state(self.session)
