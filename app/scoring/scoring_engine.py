"""
Agentification Readiness Index — a transparent, weighted 12-criteria model.

Each criterion turns a workflow signal into a normalised 0-1 strength, multiplied
by a weight (weights sum to 100), so the contributions sum directly to a 0-100
index. Every criterion carries a human-readable rationale, so the score is
explainable and auditable rather than a black box.

Two criteria are intentionally *inverse*: high compliance sensitivity and high
error cost REDUCE readiness for autonomy (they push toward human-in-the-loop),
which is the honest, enterprise-correct behaviour.
"""
from app.utils.models import WorkflowIntelligence, AgentSuitabilityScore, CriterionScore


def _lvl(value: str, mapping: dict, default: float = 0.6) -> float:
    return mapping.get((value or "").strip().lower(), default)


class ScoringEngine:
    # name, weight, description-of-direction
    WEIGHTS = {
        "Decision Density": 12,
        "Process Complexity": 8,
        "Cross-System Coordination": 10,
        "Exception Frequency": 8,
        "Data Availability & Maturity": 10,
        "Volume / Throughput": 8,
        "Rule Stability": 8,
        "Human Judgement": 8,
        "Unstructured Content": 10,
        "ROI Potential": 8,
        "Compliance Sensitivity (inverse)": 5,
        "Error Cost (inverse)": 5,
    }

    def evaluate(self, intel: WorkflowIntelligence) -> AgentSuitabilityScore:
        hi_med_lo = {"high": 1.0, "medium": 0.6, "low": 0.2}
        inverse = {"high": 0.3, "medium": 0.6, "low": 1.0}
        stability = {"volatile": 1.0, "evolving": 0.6, "stable": 0.3}

        roi_raw = min(1.0, (min(intel.volume_per_day / 500, 1) * 0.5) + (min(intel.steps / 12, 1) * 0.5))

        signals = {
            "Decision Density": (
                min(intel.decision_points / 8, 1.0),
                f"{intel.decision_points} decision points — more judgement calls favour reasoning agents."),
            "Process Complexity": (
                min(intel.steps / 12, 1.0),
                f"{intel.steps} steps across {len(intel.departments)} department(s)."),
            "Cross-System Coordination": (
                min(len(intel.systems) / 4, 1.0),
                f"{len(intel.systems)} systems — agents excel at stitching across tools."),
            "Exception Frequency": (
                min(intel.exceptions_per_week / 30, 1.0),
                f"{intel.exceptions_per_week} exceptions/week — adaptive handling adds value."),
            "Data Availability & Maturity": (
                _lvl(intel.data_availability, hi_med_lo),
                f"Data availability is {intel.data_availability} — agents need accessible data."),
            "Volume / Throughput": (
                min(intel.volume_per_day / 500, 1.0),
                f"{intel.volume_per_day}/day — volume multiplies the payoff of automation."),
            "Rule Stability": (
                _lvl(intel.rule_stability, stability, 0.6),
                f"Rules are {intel.rule_stability} — volatile rules favour agents over fixed RPA."),
            "Human Judgement": (
                _lvl(intel.human_judgment, hi_med_lo),
                f"Human judgement is {intel.human_judgment} — reasoning models help here."),
            "Unstructured Content": (
                _lvl(intel.unstructured_content, hi_med_lo),
                f"Unstructured content is {intel.unstructured_content} — LLMs shine on free text/docs."),
            "ROI Potential": (
                roi_raw,
                "ROI estimated from volume × process complexity."),
            "Compliance Sensitivity (inverse)": (
                _lvl(intel.compliance_sensitivity, inverse),
                f"Compliance is {intel.compliance_sensitivity} — higher sensitivity tempers full autonomy."),
            "Error Cost (inverse)": (
                _lvl(intel.error_cost, inverse),
                f"Error cost is {intel.error_cost} — higher cost tempers full autonomy."),
        }

        criteria = []
        total = 0.0
        for name, weight in self.WEIGHTS.items():
            raw, rationale = signals[name]
            contribution = round(raw * weight, 1)
            total += contribution
            criteria.append(CriterionScore(
                name=name, raw=round(raw, 2), weight=weight,
                contribution=contribution, rationale=rationale,
            ))

        score = int(round(max(0, min(100, total))))

        requires_hitl = (intel.compliance_sensitivity.lower() == "high"
                         or intel.error_cost.lower() == "high")

        if score >= 75:
            classification = "High"
        elif score >= 50:
            classification = "Medium"
        elif score >= 30:
            classification = "Low"
        else:
            classification = "Not Suitable"

        if classification == "Not Suitable":
            pattern = "Standard Software / No Agent"
            autonomy = "Manual"
        elif classification == "High":
            if requires_hitl:
                pattern = "Human-in-the-Loop Multi-Agent System"
                autonomy = "Supervised"
            else:
                pattern = "Autonomous Supervisor/Worker Multi-Agent System"
                autonomy = "Autonomous"
        elif classification == "Medium":
            pattern = "RAG-Grounded Copilot"
            autonomy = "Supervised" if requires_hitl else "Assisted"
        else:  # Low
            pattern = "RPA + AI Exception Triage"
            autonomy = "Assisted"

        top = sorted(criteria, key=lambda c: c.contribution, reverse=True)[:3]
        explanation = (
            f"Readiness {score}/100 ({classification}). Strongest drivers: "
            + ", ".join(f"{c.name} (+{c.contribution})" for c in top)
            + (". Human-in-the-loop gate required due to compliance/error cost."
               if requires_hitl else ". Eligible for higher autonomy.")
        )

        return AgentSuitabilityScore(
            agent_score=score,
            classification=classification,
            recommended_pattern=pattern,
            autonomy_level=autonomy,
            requires_hitl=requires_hitl,
            explanation=explanation,
            criteria=criteria,
        )


scoring_engine = ScoringEngine()
