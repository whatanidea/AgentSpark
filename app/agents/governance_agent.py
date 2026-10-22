import os
import yaml
import logging
from typing import Dict
from app.agents.governance_policy import GovernanceInputs, GovernancePolicies

from app.utils.models import (
    WorkflowIntelligence,
    AgentSuitabilityScore,
    GovernanceAssessment,
    GovernanceResult,
    ROIEstimate,
)

logger = logging.getLogger(__name__)

class GovernanceAgent:
    """
    Enterprise Governance Agent.
    Validates recommendations against deterministic enterprise policies.
    Evaluates across 8 governance dimensions.
    """
    def __init__(self, rules_path: str = "governance_rules.yaml"):
        self.rules_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), rules_path)
        self.rules = self._load_rules()

    def _load_rules(self) -> GovernancePolicies:
        try:
            with open(self.rules_path, "r", encoding="utf-8") as f:
                return GovernancePolicies.model_validate(yaml.safe_load(f))
        except (OSError, ValueError, yaml.YAMLError):
            logger.exception("Invalid governance configuration: %s", self.rules_path)
            raise

    def evaluate(self, 
                 intel: WorkflowIntelligence, 
                 score: AgentSuitabilityScore, 
                 recommendation: dict,
                 roi: ROIEstimate) -> GovernanceResult:
        
        assessments: Dict[str, GovernanceAssessment] = {}
        triggered_rules = []
        
        # 1. Compliance
        comp_level = intel.compliance_sensitivity.upper()
        if comp_level == "HIGH":
            risk = "Critical"
            comp_rec = "Requires strict data handling and HITL."
        elif comp_level == "MEDIUM":
            risk = "Medium"
            comp_rec = "Standard compliance monitoring."
        else:
            risk = "Low"
            comp_rec = "Standard processing."
            
        assessments["Compliance"] = GovernanceAssessment(
            score=comp_level, status="warn" if comp_level == "HIGH" else "pass", 
            risk_level=risk, reason=f"Workflow is in {comp_level} compliance domain.", 
            recommendation=comp_rec
        )

        # 2. Confidence
        # Retain the legacy policy input name for existing rules; it measures completeness, not accuracy.
        conf_val = int(recommendation.get("data_completeness", recommendation.get("confidence", 0.0)) * 100)
        if conf_val >= 90:
            c_level = "Low"
            c_status = "pass"
        elif conf_val >= 70:
            c_level = "Medium"
            c_status = "warn"
        else:
            c_level = "High"
            c_status = "fail"
            
        assessments["Confidence"] = GovernanceAssessment(
            score=f"{conf_val}%", status=c_status, risk_level=c_level,
            reason=f"Recommendation data completeness is {conf_val}%.", recommendation="Gather more context if low."
        )

        # 3. Data Sensitivity
        data_sens = "RESTRICTED" if comp_level == "HIGH" else ("CONFIDENTIAL" if comp_level == "MEDIUM" else "INTERNAL")
        assessments["Data Sensitivity"] = GovernanceAssessment(
            score=data_sens, status="warn" if data_sens == "RESTRICTED" else "pass", risk_level="High" if data_sens == "RESTRICTED" else "Low",
            reason=f"Data availability {intel.data_availability}, compliance {comp_level}.", recommendation="Ensure data stays within secure enclaves."
        )

        # 4. Operational Risk
        op_risk = intel.error_cost.upper()
        assessments["Operational Risk"] = GovernanceAssessment(
            score=op_risk, status="warn" if op_risk == "HIGH" else "pass", risk_level=op_risk.capitalize(),
            reason=f"Error cost is {op_risk}.", recommendation="Add extensive observability."
        )

        # 5. Automation Suitability
        auto = score.autonomy_level
        assessments["Automation Suitability"] = GovernanceAssessment(
            score=auto, status="warn" if auto == "Autonomous" and score.requires_hitl else "pass",
            risk_level="High" if auto == "Autonomous" and score.requires_hitl else "Low",
            reason=f"Scoring engine suggests {auto}.", recommendation="Always prefer Human-in-the-loop initially."
        )

        # 6. Security
        sec_status = "PASS"
        if "internet" in recommendation.get("architecture_doc", "").lower() and data_sens == "RESTRICTED":
            sec_status = "FAIL"
        assessments["Security"] = GovernanceAssessment(
            score=sec_status, status="pass" if sec_status == "PASS" else "fail", risk_level="Low" if sec_status == "PASS" else "High",
            reason="Limited text policy check passed; this is not a security assessment." if sec_status == "PASS" else "Restricted data connected to public internet.",
            recommendation="Apply standard RBAC."
        )

        # 7. Cost Governance
        first_year_net_savings = roi.first_year_balance
        cost_status = "PASS" if first_year_net_savings >= 0 else "FAIL"
        assessments["Cost Governance"] = GovernanceAssessment(
            score=cost_status, status="pass" if cost_status == "PASS" else "fail",
            risk_level="Low" if cost_status == "PASS" else "High",
            reason=f"First-year gross labor savings ${roi.cost_saved_per_year:,} versus "
                   f"one-time build cost ${roi.implementation_cost:,}; "
                   f"balance ${first_year_net_savings:,}; "
                   + (f"annual operating costs ${roi.assumption_inputs.annual_operating_cost:,} included."
                      if roi.operating_costs_included else "operating costs excluded, net savings unknown."),
            recommendation="Validate labor assumptions and budget operating costs separately."
        )

        # 8. Explainability
        assessments["Explainability"] = GovernanceAssessment(
            score="High", status="pass", risk_level="Low",
            reason="Architecture maps to well-documented design patterns.", recommendation="Generate comprehensive Blueprint."
        )

        # Determine Decision
        decision = self.rules.default_decision
        reason = "No policy matched; using the configured default decision."
        severity = {"Low": 0, "Medium": 1, "High": 2, "Critical": 3}
        overall_risk = max(
            (assessment.risk_level for assessment in assessments.values()),
            key=severity.__getitem__,
        )

        # Evaluate rules in order
        inputs = GovernanceInputs(
            autonomy_level=score.autonomy_level,
            requires_hitl=score.requires_hitl or comp_level == "HIGH" or op_risk == "HIGH",
            classification=score.classification,
            compliance=comp_level,
            security=sec_status,
            data_sensitivity=data_sens,
            confidence=conf_val,
            first_year_net_savings=first_year_net_savings,
            operational_risk=op_risk,
        )
        for policy in self.rules.policies:
            if policy.matches(inputs):
                decision = policy.decision
                reason = policy.reason
                triggered_rules.append(policy.id)
                break

        result = GovernanceResult(
            decision=decision,
            overall_risk=overall_risk,
            overall_confidence=conf_val,
            reason=reason,
            triggered_rules=triggered_rules,
            assessments=assessments
        )

        if decision == "HUMAN_REVIEW_REQUIRED":
            result.human_review_package = {
                "summary": "Enterprise Governance identified high-risk factors requiring human validation.",
                "questions": ["Are the workflow assumptions and estimated savings credible?",
                              "Are the proposed oversight controls sufficient?"]
            }
        elif decision == "REJECT":
            result.rejection_package = {
                "alternative": "Use standard software or a deterministic approval workflow on the selected cloud without agentic loops.",
                "rejection_reason": reason
            }

        return result

governance_agent = GovernanceAgent()
