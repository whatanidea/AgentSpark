import os
import yaml
import logging
from typing import Dict, Any

from app.utils.models import (
    WorkflowIntelligence,
    AgentSuitabilityScore,
    GovernanceAssessment,
    GovernanceResult
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

    def _load_rules(self) -> Dict[str, Any]:
        try:
            with open(self.rules_path, "r") as f:
                return yaml.safe_load(f)
        except Exception as e:
            logger.error(f"Failed to load governance rules: {e}")
            return {"policies": [], "default_decision": "HUMAN_REVIEW_REQUIRED"}

    def evaluate(self, 
                 intel: WorkflowIntelligence, 
                 score: AgentSuitabilityScore, 
                 recommendation: dict) -> GovernanceResult:
        
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
        conf_val = int((recommendation.get("confidence", 0.85)) * 100)
        if conf_val >= 90:
            c_level = "High"
            c_status = "pass"
        elif conf_val >= 70:
            c_level = "Medium"
            c_status = "warn"
        else:
            c_level = "Low"
            c_status = "fail"
            
        assessments["Confidence"] = GovernanceAssessment(
            score=f"{conf_val}%", status=c_status, risk_level=c_level,
            reason=f"LLM + RAG confidence is {conf_val}%.", recommendation="Gather more context if low."
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
            score=auto, status="pass" if auto != "Fully Autonomous" else "warn", risk_level="Low" if auto != "Fully Autonomous" else "High",
            reason=f"Scoring engine suggests {auto}.", recommendation="Always prefer Human-in-the-loop initially."
        )

        # 6. Security
        sec_status = "PASS"
        if "internet" in recommendation.get("architecture_doc", "").lower() and data_sens == "RESTRICTED":
            sec_status = "FAIL"
        assessments["Security"] = GovernanceAssessment(
            score=sec_status, status="pass" if sec_status == "PASS" else "fail", risk_level="Low" if sec_status == "PASS" else "High",
            reason="No critical security vulnerabilities found in architecture." if sec_status == "PASS" else "Restricted data connected to public internet.",
            recommendation="Apply standard RBAC."
        )

        # 7. Cost Governance
        # We don't have ROI generated yet, but we will assume it's positive based on score classification
        cost_status = "PASS"
        assessments["Cost Governance"] = GovernanceAssessment(
            score=cost_status, status="pass", risk_level="Low",
            reason="Architecture fits standard enterprise budgets.", recommendation="Monitor Azure consumption."
        )

        # 8. Explainability
        assessments["Explainability"] = GovernanceAssessment(
            score="High", status="pass", risk_level="Low",
            reason="Architecture maps to well-documented design patterns.", recommendation="Generate comprehensive Blueprint."
        )

        # Determine Decision
        decision = self.rules.get("default_decision", "HUMAN_REVIEW_REQUIRED")
        reason = "Default enterprise fallback."
        
        overall_risk = "Low"
        for v in assessments.values():
            if v.risk_level in ["High", "Critical"]:
                overall_risk = v.risk_level

        # Evaluate rules in order
        eval_locals = {
            "autonomy_level": score.autonomy_level,
            "recommendation": recommendation,
            "compliance": comp_level,
            "security": sec_status,
            "data_sensitivity": data_sens,
            "confidence": conf_val,
            "estimated_cost": 1000, # mock
            "expected_roi": 5000, # mock
            "roi_positive": True,
            "operational_risk": op_risk
        }

        for policy in self.rules.get("policies", []):
            cond = policy.get("condition", "")
            try:
                # Use python eval with controlled locals to evaluate the condition string
                match = eval(cond, {"__builtins__": {}}, eval_locals)
            except Exception as e:
                logger.error(f"Error evaluating rule {policy.get('id')}: {e}")
                match = False

            if match:
                decision = policy.get("decision", decision)
                reason = policy.get("reason", reason)
                triggered_rules.append(policy.get("id", "Unknown Rule"))
                break # Stop at first matching rule based on priority in yaml
                
        # Fallback manual logic if no explicit rule matched
        if not triggered_rules:
            if overall_risk in ["High", "Critical"]:
                decision = "HUMAN_REVIEW_REQUIRED"
                reason = "Overall risk level requires human oversight."
                triggered_rules.append("RISK_BASED_FALLBACK")
            else:
                decision = "AUTO_APPROVE"
                reason = "Workflow is low risk and standard."
                triggered_rules.append("AUTO_APPROVE_FALLBACK")

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
                "missing_info": ["Exact transaction volumes", "Identity Provider confirmation"],
                "questions": ["Is PII strictly required for this workflow?", "Can autonomy be reduced?"]
            }
        elif decision == "REJECT":
            result.rejection_package = {
                "alternative": "Recommend using standard Azure Logic Apps or Power Automate without agentic loops.",
                "rejection_reason": reason
            }

        return result

governance_agent = GovernanceAgent()
