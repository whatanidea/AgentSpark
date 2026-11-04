"""Deterministic activity checks and standalone, source-linked findings snapshots."""
from datetime import datetime, timezone

from app.utils.discovery import ROLE_QUESTIONS, discovery_sources, priority_report, source_digest
from app.utils.discovery_playbooks import OUTCOME_LABELS, PLAYBOOKS, documented
from app.utils.models import WorkflowState

LIMITATIONS = (
    "Discovery activity is not AI readiness, verified evidence, financial savings or implementation approval. "
    "Notes and playbook answers are facilitator-recorded, unverified statements. Measurements remain submitted "
    "claims; reviewer checks are human judgments. Draft participant and step answers are excluded. Stale synthesis "
    "findings are withheld. Provider discussion does not provision Anthropic, OpenAI, Gemini or other accounts. "
    "Any pilot, procurement, security review or adoption support requires separate scope and approval."
)


def engagement_overview(state: WorkflowState, today=None) -> dict:
    engagement = state.discovery
    if engagement is None:
        raise ValueError("Discovery payload is required.")
    today = today or datetime.now(timezone.utc).date()
    sources = discovery_sources(state)
    tasks = state.discovery_tasks
    pending = [task for task in tasks if task.status != "submitted"]
    overdue = [task for task in pending if task.due_on < today.isoformat()]
    roles = {item.role for item in state.discovery_participants if item.status == "submitted"}
    roles.update(task.role for task in tasks if task.status == "submitted")
    missing_roles = [role for role in ROLE_QUESTIONS if role not in roles]
    open_reviews = [source for source in sources if source.review_status in (
        "clarification_needed", "disagreement", "stale_review")]
    synthesis_current = state.discovery_synthesis is not None and state.discovery_synthesis.source_digest == source_digest(state)
    priorities = priority_report(state)
    playbook = PLAYBOOKS.get(engagement.playbook_id)
    questions = playbook["questions"] if playbook else []
    unanswered = [question for question in questions if not documented(engagement.playbook_answers.get(question["id"], ""))]
    checks = [
        {"id": "guide", "section": "overview", "label": "Discussion guide documented",
         "complete": bool(playbook) and not unanswered,
         "detail": f"{len(questions) - len(unanswered)} of {len(questions)} prompts documented; unknowns remain gaps."
                   if playbook else "Choose a playbook, or continue an existing custom engagement."},
        {"id": "people", "section": "people", "label": "Stakeholder perspectives submitted",
         "complete": not missing_roles,
         "detail": "Missing submitted perspectives: " + ", ".join(role.replace("_", " ") for role in missing_roles)
                   if missing_roles else "All three role perspectives have submitted inputs; this is not independent verification."},
        {"id": "requests", "section": "processes", "label": "Contribution requests addressed",
         "complete": not pending, "detail": f"{len(pending)} pending requests; {len(overdue)} overdue (UTC)."
                   if tasks else "No contribution requests assigned; this does not establish stakeholder coverage."},
        {"id": "evidence", "section": "evidence", "label": "Evidence gaps reviewed",
         "complete": bool(sources) and not open_reviews and all(source.review_status == "reviewer_checked" for source in sources),
         "detail": f"{sum(source.review_status != 'reviewer_checked' for source in sources)} sources without a current reviewer check; "
                   f"{len(open_reviews)} sources with disagreement, clarification or stale review."},
        {"id": "synthesis", "section": "opportunities", "label": "Source-linked synthesis current",
         "complete": synthesis_current,
         "detail": "Current hypothesis snapshot; not confirmed facts." if synthesis_current else
                   "No current synthesis. Collect inputs, then generate or refresh if useful; it is not required to export findings."},
        {"id": "comparison", "section": "opportunities", "label": "Candidate alternatives compared",
         "complete": bool(engagement.opportunities) and all(
             len(item.alternatives) == 5 and item.preferred_alternative for item in engagement.opportunities),
         "detail": "Compare unchanged, process improvement, conventional automation, AI assistance and hybrid. No AI default."},
        {"id": "conclusion", "section": "findings", "label": "Human discovery conclusion recorded",
         "complete": bool(engagement.discovery_outcome and documented(engagement.outcome_rationale)),
         "detail": OUTCOME_LABELS.get(engagement.discovery_outcome, "Record a conclusion and rationale, including a non-AI or do-not-proceed outcome.")},
    ]
    if engagement.playbook_id == "workflow_opportunity":
        checks.insert(1, {"id": "process", "section": "processes", "label": "Current process described",
                          "complete": bool(engagement.processes),
                          "detail": f"{len(engagement.processes)} saved process cards. Record owners, systems, ordered steps and baseline gaps."})
    instructions = {
        "guide": "Choose a discussion guide and record what is known; leave unknowns explicit.",
        "process": "Describe the current process, including its owner, systems, steps and baseline gaps.",
        "people": "Collect the missing role perspectives from stakeholders. Team assignments require an organization/team workspace.",
        "requests": "Follow up outstanding contribution requests with their assignees.",
        "evidence": "Ask a workspace reviewer to examine the source register and document checks or gaps.",
        "synthesis": "Review the saved inputs and generate or refresh source-linked hypotheses if useful; export does not require synthesis.",
        "comparison": "Compare candidate alternatives, including non-AI approaches, or record why no opportunity should proceed.",
        "conclusion": "Discuss the findings, choose a human conclusion and record its rationale and proposed next steps.",
    }
    actions = [{"section": check["section"], "message": instructions[check["id"]] + " " + check["detail"]}
               for check in checks if not check["complete"]]
    if overdue:
        actions.insert(0, {"section": "processes", "message": f"Follow up {len(overdue)} overdue contribution requests with their assignees."})
    if open_reviews:
        actions.insert(0, {"section": "evidence", "message": "Resolve disagreements, clarification requests and stale reviews before relying on affected sources."})
    if engagement.discovery_outcome and documented(engagement.outcome_rationale):
        followups = {
            "gather_more_evidence": "Agree who will collect the missing evidence, which sources are needed and when to revisit the findings.",
            "improve_process": "Agree a separately scoped process-improvement action and a baseline for reviewing its effect.",
            "conventional_automation": "Validate rules, integrations and ownership before separately scoping conventional automation.",
            "bounded_ai_pilot": "Define a separately reviewed pilot scope, evaluation baseline, data/access controls and human ownership before any implementation.",
            "do_not_proceed": "Discuss the recorded reasons for not proceeding and agree whether to close or revisit discovery.",
        }
        actions = [{"section": "findings", "message": followups[engagement.discovery_outcome] +
                    " Outstanding activity and evidence gaps remain visible; this conclusion is not execution approval."}]
    if not actions:
        actions = [{"section": "findings", "message": "Discuss the findings and agree the next separately scoped action; no execution is authorized."}]
    first = actions[0]["section"]
    stages = {"overview": "Frame the engagement", "processes": "Gather process inputs", "people": "Gather stakeholder inputs",
              "evidence": "Review evidence", "opportunities": "Compare opportunities", "findings": "Discuss findings"}
    return {"stage": stages[first], "checks": checks, "next_actions": actions,
            "documented_checks": sum(bool(check["complete"]) for check in checks), "total_checks": len(checks),
            "pending_requests": len(pending), "overdue_requests": len(overdue),
            "submitted_perspectives": len(roles), "source_count": len(sources),
            "review_issues": len(open_reviews), "unanswered_prompts": [question["label"] for question in unanswered],
            "unranked_opportunities": sum(item["score"] is None for item in priorities["items"]),
            "limitations": LIMITATIONS}


def discovery_findings(state: WorkflowState) -> dict:
    engagement = state.discovery
    if engagement is None:
        raise ValueError("Discovery payload is required.")
    overview = engagement_overview(state)
    current = state.discovery_synthesis is not None and state.discovery_synthesis.source_digest == source_digest(state)
    return {
        "report_version": "discovery-findings-v1", "engagement_id": state.session_id,
        "source_version": state._etag, "source_digest": source_digest(state),
        "generated_at": datetime.now(timezone.utc).isoformat(), "expires_at": state.expires_at.isoformat(),
        "scope": engagement.model_dump(mode="json", exclude={"contributions", "opportunities", "assessment_ids"}),
        "playbook": PLAYBOOKS.get(engagement.playbook_id), "overview": overview,
        "participation": [{"role": item.role, "status": item.status, "identity_id": item.identity_id}
                          for item in state.discovery_participants],
        "requests": [item.model_dump(mode="json", exclude={"answers", "evidence"}) for item in state.discovery_tasks],
        "synthesis_status": "current" if current else "stale_withheld" if state.discovery_synthesis else "not_generated",
        "synthesis": state.discovery_synthesis.model_dump(mode="json") if current else None,
        "sources": [source.model_dump(mode="json") for source in discovery_sources(state)],
        "source_reviews": [review.model_dump(mode="json") for review in state.discovery_source_reviews],
        "opportunities": [item.model_dump(mode="json") for item in engagement.opportunities],
        "prioritization": priority_report(state),
        "conclusion": {"outcome": OUTCOME_LABELS.get(engagement.discovery_outcome, "Not recorded"),
                       "rationale": engagement.outcome_rationale or "Not recorded"},
        "limitations": LIMITATIONS,
    }
