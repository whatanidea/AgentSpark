import os
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from pypdf import PdfReader

from app.agents.governance_agent import governance_agent
from app.agents.mapping_agent import mapping_agent
from app.agents.recommendation_agent import recommendation_agent
from app.api import routes
from app.database.cosmos_client import DatabaseClient
from app.main import app
from app.orchestration import langgraph_flow
from app.rag.retrieval import retrieve_patterns
from app.scoring.adoption import assess_adoption, effective_reasoning, reasoning_scope_supported
from app.scoring.roi import estimate_roi
from app.scoring.scoring_engine import scoring_engine
from app.security import auth
from app.utils.document_models import DocumentField
from app.utils.documents import validate_fields
from app.utils.errors import InvalidDependencyResponse
from app.utils.executive_brief import build_executive_brief
from app.utils.models import (
    ESSENTIAL_FACTS, AgentSuitabilityScore, EnterpriseContext, FactEvidence, RuntimeRequirements,
    WorkflowDiagnosis, WorkflowIntelligence, WorkflowState,
)
from app.utils.runtime_decision import recommend_runtime


PARTIAL = ("Straightforward collection, identifier matching, event validation and duplicate detection "
           "should remain ordinary deterministic software.")


def sre(**changes):
    return WorkflowIntelligence(**{
        "workflow_name": "Azure SRE Incident Enrichment",
        "summary": "Correlate incident evidence and draft an incident-enrichment recommendation.",
        "steps": 7, "decision_points": 2, "departments": ["SRE"],
        "systems": ["Azure Monitor", "Azure Log Analytics", "SAP", "PagerDuty"],
        "volume_per_day": 25, "exceptions_per_week": 10, "compliance_sensitivity": "High",
        "data_availability": "High", "rule_stability": "Stable", "human_judgment": "Medium",
        "unstructured_content": "Low", "error_cost": "High", **changes,
    })


def assess(intel=None, **requirements):
    intel = intel or sre()
    return assess_adoption(intel, scoring_engine.evaluate(intel), RuntimeRequirements(**requirements))


class AdoptionRulesTests(unittest.TestCase):
    def test_sre_low_profile_has_a_conditional_supervised_candidate(self):
        result = assess()
        self.assertEqual(result.agent_score, 45)
        self.assertEqual(result.classification, "Low")
        self.assertEqual(result.adoption.opportunity, "potential")
        self.assertEqual(result.adoption.design_family, "hybrid_agentic")
        self.assertEqual(result.autonomy_level, "Supervised")
        self.assertTrue(result.requires_hitl)
        self.assertTrue(any("fixed queries" in question for question in result.adoption.questions))
        runtime = recommend_runtime(RuntimeRequirements(), {}, result, EnterpriseContext())
        self.assertIsNone(runtime.reasoning.selected)
        self.assertEqual(runtime.status, "insufficient_information")

    def test_explicit_dynamic_reasoning_selects_one_supervised_investigator(self):
        result = assess(reasoning="dynamic")
        self.assertEqual(result.adoption.opportunity, "supported")
        self.assertEqual(result.adoption.design_family, "hybrid_agentic")
        runtime = recommend_runtime(RuntimeRequirements(reasoning="dynamic"), {}, result, EnterpriseContext())
        self.assertEqual(runtime.reasoning.selected, "langgraph")
        self.assertEqual(result.autonomy_level, "Supervised")

    def test_no_profile_threshold_blocks_an_explicit_dynamic_candidate(self):
        intel = sre()
        for band, points in (("High", 80), ("Medium", 55), ("Low", 35), ("Not Suitable", 5)):
            with self.subTest(band=band):
                profile = AgentSuitabilityScore(agent_score=points, classification=band,
                    recommended_pattern="Legacy", autonomy_level="Manual", requires_hitl=False)
                result = assess_adoption(intel, profile, RuntimeRequirements(reasoning="dynamic"))
                self.assertEqual(result.adoption.opportunity, "supported")
                self.assertEqual(result.adoption.design_family, "hybrid_agentic")
                self.assertEqual(recommend_runtime(RuntimeRequirements(reasoning="dynamic"), {}, result,
                                                  EnterpriseContext()).reasoning.selected, "langgraph")
                governance = governance_agent.evaluate(intel, result, {"data_completeness": 1},
                                                       estimate_roi(intel, result))
                self.assertEqual(governance.decision, "HUMAN_REVIEW_REQUIRED")
                self.assertNotIn("REJECT_NOT_SUITABLE", governance.triggered_rules)

    def test_high_volume_and_high_profile_do_not_invent_specialists(self):
        result = assess(sre(volume_per_day=10000, steps=20, decision_points=12,
            exceptions_per_week=100, rule_stability="Volatile", unstructured_content="High",
            human_judgment="High"), reasoning="dynamic")
        self.assertEqual(result.classification, "High")
        self.assertEqual(result.adoption.design_family, "hybrid_agentic")
        self.assertTrue(result.requires_hitl)

    def test_specialists_require_distinct_explicit_responsibilities_and_dynamic_reasoning(self):
        roles = "Infrastructure evidence investigation; Application dependency investigation"
        self.assertEqual(assess(reasoning="dynamic", specialist_roles=roles).adoption.design_family, "supervisor_worker")
        for reasoning in ("unknown", "bounded", "deterministic"):
            self.assertNotEqual(assess(reasoning=reasoning, specialist_roles=roles).adoption.design_family, "supervisor_worker")
        self.assertNotEqual(assess(reasoning="dynamic", specialist_roles="Investigation; investigation").adoption.design_family,
                            "supervisor_worker")

    def test_single_system_dynamic_work_uses_a_single_tool_agent(self):
        result = assess(sre(systems=["PagerDuty"]), reasoning="dynamic")
        self.assertEqual(result.adoption.design_family, "tool_agent")

    def test_explicit_fixed_investigation_keeps_software_even_at_high_profile(self):
        result = assess(sre(volume_per_day=10000, steps=20, decision_points=12,
            exceptions_per_week=100, rule_stability="Volatile", unstructured_content="High",
            human_judgment="High"), reasoning="deterministic")
        self.assertEqual(result.classification, "High")
        self.assertEqual(result.adoption.design_family, "standard_software")
        self.assertEqual(result.adoption.opportunity, "not_indicated")
        mapping = mapping_agent.map_services(sre(), result)
        self.assertEqual(mapping["ai"], "Not required")

    def test_bounded_ai_does_not_invent_an_iterative_loop(self):
        result = assess(reasoning="bounded")
        self.assertEqual(result.adoption.design_family, "rag_copilot")
        self.assertEqual(result.adoption.opportunity, "potential")
        runtime = recommend_runtime(RuntimeRequirements(reasoning="bounded"), {}, result, EnterpriseContext())
        self.assertEqual(runtime.reasoning.selected, "bounded_handler")

    def test_unknown_low_judgement_structured_work_stays_conventional(self):
        result = assess(sre(human_judgment="Low", unstructured_content="Low"))
        self.assertEqual(result.adoption.design_family, "standard_software")
        self.assertEqual(result.adoption.opportunity, "not_indicated")

    def test_volume_risk_and_data_availability_do_not_select_opportunity_or_autonomy(self):
        for volume in (1, 25, 100000):
            for risk in ("Low", "High"):
                result = assess(sre(volume_per_day=volume, error_cost=risk, compliance_sensitivity=risk,
                                    data_availability="Low"), reasoning="dynamic")
                self.assertEqual(result.adoption.opportunity, "supported")
                self.assertEqual(result.autonomy_level, "Supervised")
                self.assertTrue(result.requires_hitl)
                self.assertIn("readiness", " ".join(result.adoption.expansion_conditions))

    def test_pilot_has_baseline_measures_human_boundaries_stop_and_expansion_conditions(self):
        plan = assess().adoption
        self.assertIn("baseline", plan.current_approach)
        self.assertTrue(plan.success_criteria)
        self.assertTrue(plan.stop_conditions)
        self.assertTrue(plan.expansion_conditions)
        self.assertTrue(any("read-only" in boundary for boundary in plan.human_boundaries))
        self.assertTrue(any("thresholds" in criterion for criterion in plan.success_criteria))
        self.assertIn("not permission", plan.readiness_basis)

    def test_new_patterns_are_grounded_for_both_clouds_and_preserve_sources(self):
        result = assess(reasoning="dynamic")
        for cloud in ("azure", "aws"):
            rec = recommendation_agent.generate_recommendation(result, {}, sre(), target_cloud=cloud)
            self.assertEqual(rec["pattern_ids"], ["p01", "p06", "p04"])
            self.assertEqual(rec["design_family"], "hybrid_agentic")
            for pattern in rec["pattern_references"]:
                self.assertTrue(pattern["source_ref"])
                self.assertTrue(pattern["content_sha256"])
                if cloud == "aws":
                    self.assertEqual(pattern["implementation_status"], "curated_candidates")
                    self.assertTrue(pattern["original_source_ref"])
                    self.assertTrue(pattern["original_content_sha256"])
                    self.assertFalse(any("Azure" in value for value in pattern["cloud_services"]))

    def test_missing_tool_pattern_fails_instead_of_falling_back(self):
        result = assess(reasoning="dynamic")
        patterns = retrieve_patterns("investigation", required_ids=("p01", "p04"))
        with self.assertRaises(InvalidDependencyResponse):
            recommendation_agent.generate_recommendation(result, {}, sre(),
                patterns=[pattern for pattern in patterns if pattern["id"] != "p06"])

    def test_legacy_score_snapshots_still_parse_without_an_adoption_plan(self):
        profile = scoring_engine.evaluate(sre())
        self.assertIsNone(AgentSuitabilityScore.model_validate(profile.model_dump(exclude={"adoption"})).adoption)

    def test_profile_does_not_claim_to_estimate_roi(self):
        criteria = scoring_engine.evaluate(sre()).criteria
        self.assertNotIn("ROI Potential", [criterion.name for criterion in criteria])
        self.assertIn("Workload Footprint (not ROI)", [criterion.name for criterion in criteria])

    def test_partial_deterministic_quotes_do_not_establish_global_reasoning(self):
        for quote in (PARTIAL, "Collection is deterministic.", "Only identifier matching is deterministic.",
                      "The investigation is not deterministic.",
                      "The entire workflow includes collection; identifier matching is deterministic."):
            with self.subTest(quote=quote):
                self.assertFalse(reasoning_scope_supported("deterministic", quote))
                candidate = DocumentField(field_id="runtime.reasoning", value="deterministic",
                                          quote=quote, location="Page 1")
                with self.assertRaisesRegex(ValueError, "whole reasoning scope"):
                    validate_fields(WorkflowState(session_id="scope"), [candidate])

    def test_global_deterministic_statement_and_explicit_human_edit_are_preserved(self):
        for quote in ("The entire workflow is deterministic, including collection.",
                      "Reasoning: deterministic. Collection uses fixed validation."):
            candidate = DocumentField(field_id="runtime.reasoning", value="deterministic",
                                      quote=quote, location="Page 1")
            validate_fields(WorkflowState(session_id="scope"), [candidate])
        candidate = DocumentField(field_id="runtime.reasoning", value="deterministic",
                                  quote=PARTIAL, location="Page 1", edited=True)
        validate_fields(WorkflowState(session_id="scope"), [candidate])
        value, warning = effective_reasoning(RuntimeRequirements(reasoning="deterministic"), {
            "reasoning": FactEvidence(status="supplied", source="checklist", quote="deterministic")})
        self.assertEqual(value, "deterministic")
        self.assertIsNone(warning)

    def test_adoption_is_a_snapshot_and_keeps_source_locations(self):
        r = RuntimeRequirements(reasoning="dynamic")
        sources = {"reasoning": FactEvidence(status="supplied", source="document",
            quote="Investigation uses dynamic tool selection.", reference="SRE.pdf / Page 3")}
        intel = sre()
        result = assess_adoption(intel, scoring_engine.evaluate(intel), r, sources)
        r.reasoning = "deterministic"
        sources["reasoning"].quote = "changed"
        entry = next(item for item in result.adoption.evidence if item.field_id == "runtime.reasoning")
        self.assertEqual(entry.value, "dynamic")
        self.assertIn("dynamic", entry.quote)
        self.assertEqual(entry.reference, "SRE.pdf / Page 3")


class AdoptionFlowTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        env = patch.dict(os.environ, {"AGENTSENSE_MODE": "demo", "AGENTSENSE_AUTH_MODE": "local-demo",
                                     "DEMO_ARCHIVE_PATH": str(Path(temporary.name) / "decisions.sqlite3")})
        env.start()
        self.addCleanup(env.stop)
        self.database = DatabaseClient()
        for item in (patch.object(routes, "db_client", self.database),
                     patch.object(langgraph_flow, "db_client", self.database),
                     patch.object(auth, "auth_settings", auth.AuthSettings("local-demo")),
                     patch.object(routes, "auth_settings", auth.AuthSettings("local-demo"))):
            item.start()
            self.addCleanup(item.stop)
        self.client = TestClient(app)
        self.session = str(uuid4())
        response = self.client.post("/api/v1/intake", json={
            "session_id": self.session, "business_domain": "Fictional SRE",
            "team_size": "201-1000", "existing_systems": "Azure Monitor, SAP, PagerDuty",
            "pain_points": "Fictional incident enrichment", "compliance_requirements": "High",
            "target_cloud": "azure"})
        self.assertEqual(response.status_code, 200, response.text)
        state = self.database.get_workflow_state(self.session)
        intel = sre()
        state.interview_diagnosis = WorkflowDiagnosis(intelligence=intel, evidence={
            key: FactEvidence(status="supplied", source="checklist", quote=str(getattr(intel, key)))
            for key in ESSENTIAL_FACTS})
        self.database.save_workflow_state(state)

    def analyze(self):
        response = self.client.post(f"/api/v1/analyze/{self.session}")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_sre_adoption_is_consistent_across_analysis_restore_blueprint_pdf_review_and_archive(self):
        state = self.database.get_workflow_state(self.session)
        state.runtime_requirements.reasoning = "dynamic"
        self.database.save_workflow_state(state)
        result = self.analyze()
        plan = result["score"]["adoption"]
        self.assertEqual(result["status"], "awaiting_human_review")
        self.assertEqual(plan["design_family"], "hybrid_agentic")
        self.assertEqual(result["recommendation"]["strategy"]["design_family"], "hybrid_agentic")
        self.assertEqual(result["roi"]["status"], "deferred")
        self.assertEqual(result["runtime_decision"]["reasoning"]["selected"], "langgraph")
        self.assertNotEqual(result["cloud_mapping"]["ai"], "Not required")
        restored = self.client.get(f"/api/v1/sessions/{self.session}").json()
        self.assertEqual(restored["suitability_score"]["adoption"], plan)
        blueprint = self.client.get(f"/api/v1/blueprint/{self.session}").json()
        self.assertEqual(blueprint["suitability_score"]["adoption"], plan)
        review = self.client.get(f"/api/v1/review/{self.session}").json()
        self.assertEqual(review["suitability_score"]["adoption"], plan)
        pdf = self.client.get(f"/api/v1/blueprint/{self.session}/pdf", params={
            "analysis_id": blueprint["analysis_id"], "status": blueprint["status"]})
        self.assertEqual(pdf.status_code, 200)
        text = "\n".join(page.extract_text() for page in PdfReader(BytesIO(pdf.content)).pages)
        self.assertIn("Agentic adoption assessment", text)
        self.assertIn("Hybrid Workflow with Supervised Investigation Agent", text)
        self.assertIn("Stop conditions", text)
        approval = self.client.post(f"/api/v1/review/{self.session}", json={
            "analysis_id": result["analysis_id"], "decision": "approve", "reviewer": "Fictional reviewer",
            "note": "Advisory design review only; pilot still requires authorization."})
        self.assertEqual(approval.status_code, 200, approval.text)
        archived = self.client.get(f"/api/v1/decisions/{self.session}/{result['analysis_id']}")
        self.assertEqual(archived.status_code, 200, archived.text)
        self.assertEqual(archived.json()["details"]["suitability_score"]["adoption"], plan)

    def test_saved_partial_document_scope_is_reopened_without_overwriting_other_requirements(self):
        state = self.database.get_workflow_state(self.session)
        state.runtime_requirements.reasoning = "deterministic"
        state.runtime_requirements.recovery = "durable"
        state.runtime_requirement_sources["reasoning"] = FactEvidence(
            status="supplied", source="document", quote=PARTIAL, reference="SRE.pdf / Page 32")
        self.database.save_workflow_state(state)
        result = self.analyze()
        self.assertEqual(result["score"]["adoption"]["opportunity"], "potential")
        self.assertIsNone(result["runtime_decision"]["reasoning"]["selected"])
        self.assertIn("not the whole investigation", " ".join(result["score"]["adoption"]["rationale"]))
        restored = self.database.get_workflow_state(self.session)
        self.assertEqual(restored.runtime_requirements.reasoning, "unknown")
        self.assertEqual(restored.runtime_requirements.recovery, "durable")
        self.assertEqual(restored.runtime_requirement_sources["reasoning"].quote, PARTIAL)
        self.assertEqual(restored.runtime_requirement_sources["reasoning"].status, "inferred")
        progress = self.client.get(f"/api/v1/sessions/{self.session}/interview").json()
        self.assertNotEqual(progress["answers"].get("runtime.reasoning"), "deterministic")
        self.assertIn("runtime.reasoning", progress["missing_fields"])
        self.assertEqual(restored.interview_diagnosis.intelligence.model_dump(), sre().model_dump())
        from app.utils.interview import apply_answers
        apply_answers(restored, {"runtime.reasoning": "dynamic"}, captured=True)
        self.assertEqual(restored.runtime_requirements.reasoning, "dynamic")
        self.assertEqual(restored.runtime_requirement_sources["reasoning"].status, "supplied")

    def test_low_risk_agentic_candidate_still_requires_explicit_human_review(self):
        state = self.database.get_workflow_state(self.session)
        state.interview_diagnosis.intelligence.compliance_sensitivity = "Low"
        state.interview_diagnosis.intelligence.error_cost = "Low"
        state.runtime_requirements.reasoning = "dynamic"
        self.database.save_workflow_state(state)
        result = self.analyze()
        self.assertEqual(result["status"], "awaiting_human_review")
        self.assertEqual(result["governance"]["triggered_rules"], ["HITL_REQUIRED"])
        self.assertIsNone(self.database.get_workflow_state(self.session).human_review)

    def test_unknown_adaptivity_cannot_be_authorized_by_marking_readiness_ready(self):
        self.analyze()
        state = self.database.get_workflow_state(self.session)
        state.readiness_report = {"decision": "ready", "checks": [], "missing_pilot_fields": []}
        self.assertEqual(build_executive_brief(state).decision, "investigate_further")
