"""
Evaluation harness for the Agentification Readiness scoring engine.

Codifies the invariants the scoring + governance logic must always hold — the
kind of guardrails that keep an agentic product honest as it evolves. Runs fully
offline (no Azure). Usage:  python -m evals.run_evals
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.utils.models import WorkflowIntelligence
from app.scoring.scoring_engine import scoring_engine
from app.scoring.portfolio import score_backlog

CASES = [
    # (name, intel, expected_classification_in, expected_hitl)
    ("High-value compliance workflow", WorkflowIntelligence(
        workflow_name="Invoice Approval", steps=8, departments=["Finance", "Legal"],
        decision_points=7, systems=["SAP", "Email", "DocuSign", "SQL"], exceptions_per_week=28,
        volume_per_day=500, compliance_sensitivity="High", data_availability="High",
        rule_stability="Evolving", human_judgment="Medium", unstructured_content="High",
        error_cost="High"), {"High", "Medium"}, True),
    ("Simple fixed-rule task should NOT be agentified", WorkflowIntelligence(
        workflow_name="Payroll Run", steps=3, departments=["HR"], decision_points=1,
        systems=["HRIS"], exceptions_per_week=1, volume_per_day=1,
        compliance_sensitivity="Low", data_availability="High", rule_stability="Stable",
        human_judgment="Low", unstructured_content="Low", error_cost="Low"),
     {"Low", "Not Suitable"}, False),
    ("Unstructured high-volume support", WorkflowIntelligence(
        workflow_name="Support Triage", steps=6, departments=["Support"], decision_points=5,
        systems=["Zendesk", "Salesforce", "KB"], exceptions_per_week=40, volume_per_day=800,
        compliance_sensitivity="Low", data_availability="High", rule_stability="Volatile",
        human_judgment="Medium", unstructured_content="High", error_cost="Low"),
     {"High", "Medium"}, False),
]


def main():
    failures = []

    print("=== Scoring invariant checks ===")
    for name, intel, expected_cls, expected_hitl in CASES:
        s = scoring_engine.evaluate(intel)

        # Invariant 1: contributions sum to the index (±1 for rounding).
        contrib_sum = round(sum(c.contribution for c in s.criteria))
        if abs(contrib_sum - s.agent_score) > 1:
            failures.append(f"[{name}] contributions {contrib_sum} != score {s.agent_score}")

        # Invariant 2: exactly 12 criteria, score bounded 0-100.
        if len(s.criteria) != 12:
            failures.append(f"[{name}] expected 12 criteria, got {len(s.criteria)}")
        if not (0 <= s.agent_score <= 100):
            failures.append(f"[{name}] score out of bounds: {s.agent_score}")

        # Invariant 3: classification + HITL expectations.
        if s.classification not in expected_cls:
            failures.append(f"[{name}] classification {s.classification} not in {expected_cls}")
        if s.requires_hitl != expected_hitl:
            failures.append(f"[{name}] requires_hitl={s.requires_hitl}, expected {expected_hitl}")

        # Invariant 4: high compliance must never be 'Autonomous'.
        if intel.compliance_sensitivity == "High" and s.autonomy_level == "Autonomous":
            failures.append(f"[{name}] high-compliance workflow marked Autonomous")

        print(f"  {name}: {s.agent_score}/100 {s.classification}, "
              f"autonomy={s.autonomy_level}, hitl={s.requires_hitl}")

    print("\n=== Portfolio monotonicity check ===")
    ranked = score_backlog()
    scores = [e.agent_score for e in ranked]
    if scores != sorted(scores, reverse=True):
        failures.append("portfolio not sorted by readiness descending")
    for e in ranked:
        print(f"  {e.agent_score:>3}/100  {e.classification:<13}  {e.workflow_name}")

    print()
    if failures:
        print(f"[FAIL] {len(failures)} invariant(s) violated:")
        for f in failures:
            print("   -", f)
        sys.exit(1)
    print(f"[PASS] All scoring & portfolio invariants hold ({len(CASES)} cases).")


if __name__ == "__main__":
    main()
