import logging
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

os.environ["AGENTSENSE_MODE"] = "demo"
for key in ("AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT", "AZURE_SEARCH_KEY",
            "AZURE_SEARCH_ENDPOINT", "COSMOS_DB_KEY", "COSMOS_DB_ENDPOINT"):
    os.environ[key] = "your_placeholder"

import yaml
from pydantic import ValidationError

from app.agents.governance_agent import GovernanceAgent
from app.agents.governance_policy import GovernancePolicies
from app.database.cosmos_client import DatabaseClient
from app.scoring.portfolio import score_backlog
from app.scoring.roi import estimate_roi
from app.scoring.scoring_engine import scoring_engine
from app.utils.models import WorkflowIntelligence, ROIEstimate, WorkflowState
from app.utils.errors import DependencyUnavailable
from azure.core.exceptions import ServiceRequestError


class GovernanceTests(unittest.TestCase):
    def setUp(self):
        self.agent = GovernanceAgent()
        self.intel = WorkflowIntelligence(
            workflow_name="Support triage", summary="Route customer tickets",
            steps=6, decision_points=5, systems=["CRM", "KB", "Email"],
            exceptions_per_week=40, volume_per_day=800,
            compliance_sensitivity="Low", error_cost="Low",
            data_availability="High", rule_stability="Volatile",
            unstructured_content="High",
        )
        self.score = scoring_engine.evaluate(self.intel)
        self.recommendation = {"confidence": 1.0}
        self.roi = estimate_roi(self.intel, self.score)

    def evaluate(self):
        return self.agent.evaluate(self.intel, self.score, self.recommendation, self.roi)

    def test_safe_workflow_auto_approves(self):
        result = self.evaluate()
        self.assertEqual(result.decision, "AUTO_APPROVE")
        self.assertEqual(result.overall_risk, "Low")
        self.assertEqual(result.assessments["Confidence"].risk_level, "Low")

    def test_critical_risk_is_not_downgraded_by_later_assessments(self):
        self.intel.compliance_sensitivity = "High"
        self.intel.error_cost = "High"
        self.score = scoring_engine.evaluate(self.intel)
        result = self.evaluate()
        self.assertEqual(result.overall_risk, "Critical")
        self.assertEqual(result.decision, "HUMAN_REVIEW_REQUIRED")
        self.assertEqual(result.triggered_rules, ["HITL_HIGH_COMPLIANCE"])

    def test_autonomous_high_compliance_is_rejected_even_with_inconsistent_hitl_flag(self):
        self.intel.compliance_sensitivity = "High"
        self.assertEqual(self.score.autonomy_level, "Autonomous")
        self.assertFalse(self.score.requires_hitl)
        self.assertEqual(self.evaluate().triggered_rules, ["REJECT_HIGH_RISK_AUTONOMY"])

    def test_high_error_cost_requires_review(self):
        self.intel.error_cost = "High"
        self.score = scoring_engine.evaluate(self.intel)
        result = self.evaluate()
        self.assertEqual(result.decision, "HUMAN_REVIEW_REQUIRED")
        self.assertEqual(result.triggered_rules, ["HITL_REQUIRED"])

    def test_not_suitable_is_rejected(self):
        self.score = self.score.model_copy(update={"classification": "Not Suitable", "autonomy_level": "Manual"})
        self.assertEqual(self.evaluate().triggered_rules, ["REJECT_NOT_SUITABLE"])

    def test_cost_governance_uses_actual_first_year_savings(self):
        self.roi = ROIEstimate(cost_saved_per_year=1000, implementation_cost=1001)
        result = self.evaluate()
        self.assertEqual(result.triggered_rules, ["REJECT_POOR_ROI"])
        self.assertEqual(result.assessments["Cost Governance"].status, "fail")
        self.assertIn("$1,000", result.assessments["Cost Governance"].reason)
        self.roi = ROIEstimate(cost_saved_per_year=1002, implementation_cost=1001)
        self.assertEqual(self.evaluate().decision, "AUTO_APPROVE")

    def test_break_even_does_not_trigger_negative_roi_rule(self):
        self.roi = ROIEstimate(cost_saved_per_year=1000, implementation_cost=1000)
        result = self.evaluate()
        self.assertEqual(result.decision, "HUMAN_REVIEW_REQUIRED")
        self.assertEqual(result.triggered_rules, [])
        self.assertEqual(result.assessments["Cost Governance"].status, "pass")

    def test_policy_order_rejects_before_requesting_review(self):
        self.intel.compliance_sensitivity = "High"
        self.score = scoring_engine.evaluate(self.intel)
        self.roi = ROIEstimate(cost_saved_per_year=1, implementation_cost=1000)
        self.assertEqual(self.evaluate().triggered_rules, ["REJECT_POOR_ROI"])

    def test_low_confidence_means_high_risk_not_low_risk(self):
        self.recommendation["confidence"] = 0.69
        result = self.evaluate()
        self.assertEqual(result.triggered_rules, ["HITL_LOW_CONFIDENCE"])
        self.assertEqual(result.assessments["Confidence"].risk_level, "High")
        self.assertEqual(result.overall_risk, "High")

    def test_confidence_boundaries(self):
        for confidence, expected in [(0.69, "HITL_LOW_CONFIDENCE"), (0.70, None),
                                     (0.90, None), (0.91, "AUTO_APPROVE_SAFE")]:
            with self.subTest(confidence=confidence):
                self.recommendation["confidence"] = confidence
                result = self.evaluate()
                self.assertEqual(result.triggered_rules, [expected] if expected else [])

    def test_missing_confidence_requires_review(self):
        self.recommendation = {}
        self.assertEqual(self.evaluate().decision, "HUMAN_REVIEW_REQUIRED")

    def test_default_decision_is_honored_without_hidden_fallback(self):
        for decision in ("REJECT", "HUMAN_REVIEW_REQUIRED", "AUTO_APPROVE"):
            with self.subTest(decision=decision):
                self.agent.rules = GovernancePolicies.model_validate({
                    "policies": [], "default_decision": decision,
                })
                result = self.evaluate()
                self.assertEqual(result.decision, decision)
                self.assertEqual(result.triggered_rules, [])

    def test_security_policy_precedes_compliance_review(self):
        self.intel.compliance_sensitivity = "High"
        self.score = scoring_engine.evaluate(self.intel)
        self.recommendation["architecture_doc"] = "Restricted data connected to the internet"
        self.assertEqual(self.evaluate().triggered_rules, ["REJECT_UNSAFE"])

    def test_portfolio_passes_real_roi_to_governance(self):
        self.intel.volume_per_day = 1
        row = score_backlog([self.intel])[0]
        self.assertEqual(row.governance_decision, "REJECT")

    def test_legacy_autonomy_vocabulary_is_not_accepted(self):
        payload = self.score.model_dump()
        payload["autonomy_level"] = "Fully Autonomous"
        with self.assertRaises(ValidationError):
            type(self.score).model_validate(payload)


class PolicyConfigurationTests(unittest.TestCase):
    def test_invalid_policy_configuration_fails_at_load(self):
        invalid_configs = [
            {},
            {"policies": [], "default_decision": "MAYBE"},
            {"policies": [], "default_decision": "REJECT", "thresholds": {}},
        ]
        invalid_conditions = [
            [{"field": "unknown", "operator": "eq", "value": True}],
            [{"field": "confidence", "operator": "gte", "value": 70}],
            [{"field": "confidence", "operator": "lt", "value": "70"}],
            [{"field": "confidence", "operator": "lt", "value": True}],
            [{"field": "confidence", "operator": "gt", "value": 101}],
            [{"field": "compliance", "operator": "eq", "value": "HGIH"}],
            [{"field": "compliance", "operator": "gt", "value": "HIGH"}],
            [{"field": "requires_hitl", "operator": "eq", "value": "true"}],
            [{"field": "requires_hitl", "operator": "lt", "value": True}],
            "__import__('os').system('unexpected')",
            [],
        ]
        for conditions in invalid_conditions:
            invalid_configs.append({
                "policies": [{"id": "test", "conditions": conditions,
                              "decision": "REJECT", "reason": "test"}],
                "default_decision": "HUMAN_REVIEW_REQUIRED",
            })
        policy = {"id": "duplicate", "conditions": [
            {"field": "confidence", "operator": "lt", "value": 70}],
            "decision": "REJECT", "reason": "test"}
        invalid_configs.append({"policies": [policy, policy], "default_decision": "REJECT"})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "rules.yaml"
            for config in invalid_configs:
                with self.subTest(config=config):
                    path.write_text(yaml.safe_dump(config), encoding="utf-8")
                    with self.assertLogs("app.agents.governance_agent", level=logging.ERROR):
                        with self.assertRaises(ValueError):
                            GovernanceAgent(str(path))

    def test_missing_rules_fail_instead_of_falling_back(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertLogs("app.agents.governance_agent", level=logging.ERROR):
                with self.assertRaises(FileNotFoundError):
                    GovernanceAgent(str(Path(directory) / "missing.yaml"))

    def test_failed_database_save_propagates(self):
        database = DatabaseClient()
        database.use_mock = False
        database.container = Mock()
        database.container.create_item.side_effect = ServiceRequestError("storage unavailable")
        with self.assertLogs("app.database.cosmos_client", level=logging.ERROR):
            with self.assertRaises(DependencyUnavailable):
                database.save_workflow_state(WorkflowState(session_id="save-failure"))


if __name__ == "__main__":
    unittest.main()
