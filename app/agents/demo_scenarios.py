"""Explicit fictional fixtures, never inferred from the user's interview."""
import json

from app.utils.models import ESSENTIAL_FACTS, FactEvidence, WorkflowDiagnosis, WorkflowIntelligence, DemoScenario


DEMO_SCENARIOS: dict[DemoScenario, WorkflowIntelligence] = {
    "invoice": WorkflowIntelligence(
        workflow_name="Invoice Approval", summary="Finance and Legal review and approve supplier invoices.",
        steps=8, departments=["Finance", "Legal"], decision_points=6, systems=["SAP", "Email", "DocuSign"],
        exceptions_per_week=25, volume_per_day=500, compliance_sensitivity="High",
        data_availability="High", rule_stability="Evolving", human_judgment="Medium",
        unstructured_content="High", error_cost="High",
    ),
    "support": WorkflowIntelligence(
        workflow_name="Customer Support Triage", summary="Route support tickets and draft grounded replies.",
        steps=5, departments=["Support"], decision_points=3, systems=["Zendesk", "Salesforce", "KB"],
        exceptions_per_week=8, volume_per_day=150, compliance_sensitivity="Low",
        data_availability="High", rule_stability="Volatile", human_judgment="Medium",
        unstructured_content="High", error_cost="Low",
    ),
    "claims": WorkflowIntelligence(
        workflow_name="Healthcare Claims Verification", summary="Verify claims against clinical records before billing approval.",
        steps=10, departments=["Billing", "Compliance"], decision_points=7, systems=["Epic EHR", "SQL", "Salesforce"],
        exceptions_per_week=35, volume_per_day=300, compliance_sensitivity="High",
        data_availability="High", rule_stability="Evolving", human_judgment="High",
        unstructured_content="High", error_cost="High",
    ),
    "payroll": WorkflowIntelligence(
        workflow_name="Payroll Calculation", summary="Apply fixed payroll rules to structured timesheets.",
        steps=3, departments=["Payroll"], decision_points=0, systems=["Payroll"],
        exceptions_per_week=0, volume_per_day=20, compliance_sensitivity="High",
        data_availability="High", rule_stability="Stable", human_judgment="Low",
        unstructured_content="Low", error_cost="High",
    ),
}


def demo_diagnosis(scenario: DemoScenario) -> WorkflowDiagnosis:
    intelligence = DEMO_SCENARIOS[scenario].model_copy(deep=True)
    values = intelligence.model_dump()
    return WorkflowDiagnosis(
        intelligence=intelligence,
        evidence={key: FactEvidence(status="supplied", source="demo_fixture",
                                   quote=json.dumps({key: values[key]}, ensure_ascii=True))
                  for key in ESSENTIAL_FACTS},
    )
