import json
import unittest
from unittest.mock import patch

from app.api import routes
from app.utils.errors import DependencyUnavailable
from app.utils.answer_values import exact_count
from app.utils.interview import apply_answers, interview_progress
from app.utils.interview_capture import ReplyAnswer, ReplyAnswers
from app.utils.models import EnterpriseContext, WorkflowState
import test_guided_interview as guided


FACTS = {
    "workflow_name": "Fictional Azure SRE evidence workflow",
    "summary": "Gather Azure logs and SAP status to enrich PagerDuty incidents.",
    "steps": "8", "departments": "SRE, SAP Operations", "decision_points": "2",
    "systems": "Azure Monitor, SAP, PagerDuty", "exceptions_per_week": "5", "volume_per_day": "20",
    "compliance_sensitivity": "High", "data_availability": "Medium", "rule_stability": "Stable",
    "human_judgment": "High", "unstructured_content": "High", "error_cost": "High",
}


class InterviewTurnTests(unittest.TestCase):
    def setUp(self):
        self.fixture = guided.GuidedInterviewTests("test_initial_progress_skips_intake_and_groups_no_more_than_three")
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.database = self.fixture.database
        self.client = self.fixture.client
        self.session = self.fixture.session
        self.path = self.fixture.path
        live_agent = patch.object(routes.diagnostic_agent, "use_mock", False)
        live_agent.start()
        self.addCleanup(live_agent.stop)
        generate = patch("app.utils.interview_capture.structured_call")
        self.generate = generate.start()
        self.addCleanup(generate.stop)

    def prepare(self, gaps):
        state = self.database.get_workflow_state(self.session)
        state.enterprise_context = EnterpriseContext(target_cloud="azure", existing_systems=FACTS["systems"])
        apply_answers(state, {f"fact.{key}": value for key, value in FACTS.items() if key not in gaps})
        self.database.save_workflow_state(state)
        return self.client.get(self.path).json()

    def send(self, message, progress=None):
        progress = progress or self.client.get(self.path).json()
        return self.client.post("/api/v1/chat", json={"session_id": self.session, "message": message,
            "version": progress["version"], "question_ids": progress["question_ids"]})

    @staticmethod
    def answers(asked, *additional):
        return ReplyAnswers(answers=[ReplyAnswer(field_id=key, status="not_answered") for key in asked] + list(additional))

    def test_numbered_document_gaps_capture_summary_two_decisions_and_rating_without_model(self):
        progress = self.prepare({"summary", "decision_points", "compliance_sensitivity"})
        response = self.send("1. " + FACTS["summary"] + "\n2. Two\n3. High", progress)
        self.assertEqual(response.status_code, 200, response.text)
        value = response.json()
        self.generate.assert_not_called()
        for key in ("summary", "decision_points", "compliance_sensitivity"):
            self.assertEqual(value["interview"]["answers"]["fact." + key], FACTS[key])
        self.assertFalse(set(progress["questions"]) & set(value["interview"]["questions"]))
        saved = self.database.get_workflow_state(self.session)
        self.assertEqual(saved.interview_diagnosis.evidence["decision_points"].quote, "Two")
        self.assertEqual(saved.interview_diagnosis.evidence["decision_points"].source, "interview")
        self.assertIn("Captured:", value["response"])
        self.assertEqual(self.client.get(self.path).json()["answers"], value["interview"]["answers"])

    def test_numbered_ratings_use_displayed_order_not_guessed_fact_order(self):
        self.prepare({"compliance_sensitivity", "data_availability", "rule_stability"})
        response = self.send("1) high\n2) medium\n3) stable")
        self.assertEqual(response.status_code, 200, response.text)
        self.generate.assert_not_called()
        self.assertEqual(response.json()["interview"]["missing_facts"], [])

    def test_inline_numbered_answers_preserve_mapping_without_a_model_call(self):
        self.prepare({"compliance_sensitivity", "data_availability", "rule_stability"})
        response = self.send("1. High, 2. Medium; 3. Stable")
        self.assertEqual(response.status_code, 200, response.text)
        self.generate.assert_not_called()
        self.assertEqual(response.json()["interview"]["missing_facts"], [])

    def test_numeric_normalization_is_bounded_and_handles_leading_zeroes(self):
        self.assertEqual(exact_count("0" * 5000), "0")
        self.prepare({"steps"})
        response = self.send("1. 0002")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["interview"]["answers"]["fact.steps"], "2")
        self.generate.assert_not_called()

    def test_zero_empty_list_and_number_words_preserve_other_answers(self):
        self.prepare({"steps", "departments", "decision_points"})
        response = self.send("1. Zero\n2. none\n3. Two hundred")
        self.assertEqual(response.status_code, 200, response.text)
        answers = response.json()["interview"]["answers"]
        self.assertEqual([answers["fact." + key] for key in ("steps", "departments", "decision_points")],
                         ["0", "none", "200"])
        self.assertEqual(answers["fact.workflow_name"], FACTS["workflow_name"])

    def test_partial_numbered_unknown_does_not_invent_or_consume_other_answers(self):
        progress = self.prepare({"compliance_sensitivity", "data_availability", "rule_stability"})
        response = self.send("2. Unknown", progress)
        self.assertEqual(response.status_code, 200, response.text)
        self.generate.assert_not_called()
        after = response.json()["interview"]
        self.assertIn("fact.data_availability", after["unconfirmed_fields"])
        self.assertIn(progress["questions"][0], after["questions"])
        self.assertIn(progress["questions"][2], after["questions"])
        self.assertNotIn(progress["questions"][1], after["questions"])

    def test_scoped_free_text_receives_bound_questions_and_existing_values(self):
        progress = self.prepare({"summary", "decision_points", "compliance_sensitivity"})
        self.generate.return_value = ReplyAnswers(answers=[
            ReplyAnswer(field_id=key, status="answered", value=value,
                        source_ids=["u1" if key == "fact.summary" else "u2"])
            for key, value in (("fact.summary", "Gather logs."), ("fact.decision_points", "2"),
                               ("fact.compliance_sensitivity", "High"))])
        response = self.send("Workflow summary: Gather logs. Human decision points: 2; compliance sensitivity: High.",
                             progress)
        self.assertEqual(response.status_code, 200, response.text)
        payload = json.loads(self.generate.call_args_list[0].args[2])
        self.assertEqual(payload["asked_ids"], progress["question_ids"])
        self.assertEqual(payload["known_answers"]["fact.steps"], "8")
        self.assertNotIn("intelligence", self.generate.call_args_list[0].args[3].model_fields)
        self.assertEqual(response.json()["interview"]["answers"]["fact.steps"], "8")
        self.assertEqual(response.json()["interview"]["missing_facts"], [])

    def test_one_invalid_value_leaves_explicit_confirmation_and_preserves_valid_capture(self):
        progress = self.prepare({"summary", "decision_points", "compliance_sensitivity"})
        self.generate.side_effect = [
            ReplyAnswers(answers=[
                ReplyAnswer(field_id="fact.summary", status="answered", value="Gather logs.", source_ids=["u1"]),
                ReplyAnswer(field_id="fact.decision_points", status="answered", value="2", source_ids=["u1"]),
                ReplyAnswer(field_id="fact.compliance_sensitivity", status="not_answered")]),
            ReplyAnswers(answers=[ReplyAnswer(field_id="fact.decision_points", status="answered",
                                             value="2", source_ids=["u1"]),
                                  ReplyAnswer(field_id="fact.compliance_sensitivity", status="not_answered")]),
        ]
        response = self.send("Gather logs.", progress)
        self.assertEqual(response.status_code, 200, response.text)
        value = response.json()
        self.assertEqual(value["interview"]["answers"]["fact.summary"], "Gather logs.")
        self.assertNotIn("fact.decision_points", value["interview"]["answers"])
        self.assertIn({"field_id": "fact.decision_points", "label": "Decision points",
                       "status": "needs_confirmation", "value": None}, value["capture"])
        self.assertIn("Could not verify: Decision points", value["response"])
        self.assertEqual(self.generate.call_count, 2)

    def test_invalid_source_reference_is_terminal_and_saves_no_subset(self):
        progress = self.prepare({"summary", "decision_points", "compliance_sensitivity"})
        result = ReplyAnswers(answers=[
            ReplyAnswer(field_id="fact.summary", status="answered", value="Gather logs.", source_ids=["u999"]),
            ReplyAnswer(field_id="fact.decision_points", status="not_answered"),
            ReplyAnswer(field_id="fact.compliance_sensitivity", status="not_answered")])
        self.generate.return_value = result
        before = self.database.get_workflow_state(self.session).model_dump_json()
        response = self.send("Gather logs.", progress)
        self.assertEqual(response.status_code, 502, response.text)
        self.assertEqual(before, self.database.get_workflow_state(self.session).model_dump_json())
        self.assertEqual(self.generate.call_count, 2)

    def test_provider_failure_during_repair_saves_no_valid_subset_or_round(self):
        progress = self.prepare({"summary", "decision_points", "compliance_sensitivity"})
        self.generate.side_effect = [
            ReplyAnswers(answers=[
                ReplyAnswer(field_id="fact.summary", status="answered", source_ids=["u1"]),
                ReplyAnswer(field_id="fact.decision_points", status="answered", value="9", source_ids=["u1"]),
                ReplyAnswer(field_id="fact.compliance_sensitivity", status="not_answered")]),
            DependencyUnavailable("openai")]
        before = self.database.get_workflow_state(self.session).model_dump_json()
        response = self.send("Gather logs.", progress)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(before, self.database.get_workflow_state(self.session).model_dump_json())

    def test_stale_batch_or_reordered_question_ids_are_rejected_before_model_work(self):
        progress = self.prepare({"summary", "decision_points", "compliance_sensitivity"})
        state = self.database.get_workflow_state(self.session)
        state.interview_role = "process_owner"
        self.database.save_workflow_state(state)
        self.assertEqual(self.send("1. Gather logs.", progress).status_code, 409)
        current = self.client.get(self.path).json()
        current["question_ids"] = list(reversed(current["question_ids"]))
        # One-question batches cannot be reordered; add a forged question instead.
        current["question_ids"] = ["fact.workflow_name"]
        self.assertEqual(self.send("1. Changed", current).status_code, 409)
        self.generate.assert_not_called()

    def test_unversioned_numbered_reply_is_not_mapped_to_a_new_batch(self):
        self.prepare({"summary"})
        response = self.client.post("/api/v1/chat", json={"session_id": self.session, "message": "1. Gather logs."})
        self.assertEqual(response.status_code, 409)
        self.generate.assert_not_called()

    def test_explicit_correction_updates_existing_fact_with_new_provenance(self):
        progress = self.prepare(set())
        self.generate.return_value = self.answers(progress["question_ids"], ReplyAnswer(
            field_id="fact.steps", status="answered", value="10", source_ids=["u1"], correction=True))
        response = self.send("Correction: Steps: 10.", progress)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["interview"]["answers"]["fact.steps"], "10")
        state = self.database.get_workflow_state(self.session)
        self.assertNotIn("steps", state.interview_answers)
        self.assertEqual(state.interview_diagnosis.evidence["steps"].quote, "Correction: Steps: 10.")

    def test_range_is_never_guessed_as_an_exact_count(self):
        progress = self.prepare({"steps"})
        self.generate.return_value = ReplyAnswers(answers=[ReplyAnswer(
            field_id="fact.steps", status="answered", value="2", source_ids=["u1"])])
        response = self.send("1. Between two and four", progress)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertNotIn("fact.steps", response.json()["interview"]["answers"])
        self.assertEqual(response.json()["capture"][0]["status"], "needs_confirmation")

    def test_free_text_cannot_drop_proposed_or_unconfirmed_qualifications(self):
        progress = self.prepare(set())
        text = "Private endpoints and managed identity are proposed; approval is unconfirmed."
        self.generate.return_value = ReplyAnswers(answers=[
            ReplyAnswer(field_id="context.preferred_region", status="not_answered"),
            ReplyAnswer(field_id="context.data_residency_requirements", status="not_answered"),
            ReplyAnswer(field_id="context.deployment_constraints", status="answered",
                        value="Private endpoints and managed identity", source_ids=["u1"])])
        response = self.send(text, progress)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["interview"]["answers"]["context.deployment_constraints"], text)
