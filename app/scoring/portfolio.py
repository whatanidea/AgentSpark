"""
Portfolio scoring — rank a backlog of workflows by agentification readiness.

This turns AgentSense from a single-workflow advisor into a transformation
portfolio planner: feed it several candidate workflows and it ranks where agents
deliver the most value first. Every score here is COMPUTED by the same 12-criteria
engine used in the main flow — none are hard-coded.
"""
from typing import List

from app.utils.models import WorkflowIntelligence, PortfolioEntry
from app.scoring.scoring_engine import scoring_engine
from app.agents.governance_agent import governance_agent

# A representative enterprise backlog. Real signals → real, comparable scores.
SAMPLE_BACKLOG: List[WorkflowIntelligence] = [
    WorkflowIntelligence(
        workflow_name="Invoice Approval", summary="Multi-dept AP approvals",
        steps=8, departments=["Finance", "Legal"], decision_points=7,
        systems=["SAP", "Email", "DocuSign", "SQL"], exceptions_per_week=28, volume_per_day=500,
        compliance_sensitivity="High", data_availability="High", rule_stability="Evolving",
        human_judgment="Medium", unstructured_content="High", error_cost="High"),
    WorkflowIntelligence(
        workflow_name="Customer Support Triage", summary="Ticket routing & drafting",
        steps=6, departments=["Support"], decision_points=5,
        systems=["Zendesk", "Salesforce", "KB"], exceptions_per_week=40, volume_per_day=800,
        compliance_sensitivity="Low", data_availability="High", rule_stability="Volatile",
        human_judgment="Medium", unstructured_content="High", error_cost="Low"),
    WorkflowIntelligence(
        workflow_name="Vendor Onboarding", summary="KYC + contract setup",
        steps=10, departments=["Procurement", "Legal", "Finance"], decision_points=6,
        systems=["SAP", "DocuSign", "Email"], exceptions_per_week=12, volume_per_day=40,
        compliance_sensitivity="Medium", data_availability="Medium", rule_stability="Evolving",
        human_judgment="High", unstructured_content="High", error_cost="Medium"),
    WorkflowIntelligence(
        workflow_name="Monthly Financial Reporting", summary="Aggregate & narrate results",
        steps=7, departments=["Finance"], decision_points=3,
        systems=["SQL", "Excel", "BI"], exceptions_per_week=4, volume_per_day=2,
        compliance_sensitivity="Medium", data_availability="High", rule_stability="Stable",
        human_judgment="Medium", unstructured_content="Medium", error_cost="Medium"),
    WorkflowIntelligence(
        workflow_name="Payroll Run", summary="Fixed-rule payroll calculation",
        steps=5, departments=["HR"], decision_points=1,
        systems=["HRIS", "Bank"], exceptions_per_week=2, volume_per_day=1,
        compliance_sensitivity="High", data_availability="High", rule_stability="Stable",
        human_judgment="Low", unstructured_content="Low", error_cost="High"),
]


def score_backlog(workflows: List[WorkflowIntelligence] | None = None) -> List[PortfolioEntry]:
    workflows = workflows or SAMPLE_BACKLOG
    entries = []
    for wf in workflows:
        s = scoring_engine.evaluate(wf)
        
        # Mock recommendation for portfolio planning governance checks
        mock_recommendation = {"confidence": 0.85, "architecture_doc": "Standard Architecture"}
        g = governance_agent.evaluate(wf, s, mock_recommendation)
        
        entries.append(PortfolioEntry(
            workflow_name=wf.workflow_name,
            agent_score=s.agent_score,
            classification=s.classification,
            recommended_pattern=s.recommended_pattern,
            governance_decision=g.decision,
            governance_risk=g.overall_risk
        ))
    entries.sort(key=lambda e: e.agent_score, reverse=True)
    return entries
