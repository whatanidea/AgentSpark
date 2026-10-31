from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field, ConfigDict, ValidationError
from datetime import datetime, timezone
from typing import Literal, Annotated
from app.utils.models import (
    HumanReview, SessionId, SignalLevel, DemoScenario, ROIAssumptions, CloudProvider,
    EvidenceInput, EvidenceEntry, EvidenceConfirmation, ReadinessAssessment,
    WorkflowDiagnosis, InterviewDiagnosis, InterviewRole,
)
from app.utils.interview import (
    apply_answers, merge_diagnosis, interview_progress, interview_reply, MAX_INTERVIEW_ROUNDS,
)
from app.utils.readiness import build_readiness_report, readiness_catalog
from app.utils.pdf_report import build_blueprint_pdf, build_executive_brief_pdf
from app.utils.executive_brief import build_executive_brief
from app.utils.errors import InvalidDependencyResponse
from app.agents.cloud_catalog import pattern_for_cloud
from app.utils.runtime import demo_mode
from app.utils.model_catalog import available_models, model_definition, assessment_model, MODEL_IDS
from app.utils.llm import model_dependency

from app.database.cosmos_client import db_client
from app.database.tenant_directory import tenant_directory
from app.orchestration.langgraph_flow import run_orchestration
from app.agents.diagnostic_agent import diagnostic_agent
from app.rag.retrieval import retrieve_patterns, get_pattern
from app.security.guardrails import scan_input, redact_pii, redact_data
from app.security.auth import auth_settings, principal_context, require_reviewer
import os

router = APIRouter()


@router.get("/models")
def assessment_models():
    return available_models()


@router.get("/auth/config")
def auth_config():
    return {"mode": auth_settings.mode, "retention_hours": int(os.getenv("SESSION_RETENTION_HOURS", "24")),
            "archive_retention_days": db_client.archive.retention_days, "sign_in": auth_settings.sign_in()}


@router.get("/auth/me")
def auth_me():
    principal = principal_context.get()
    return {"identity": principal.owner_id,
            "can_review": auth_settings.mode == "local-demo" or auth_settings.reviewer_role in principal.roles}


@router.get("/sessions/{session_id}")
def restore_session(session_id: SessionId):
    state = db_client.get_workflow_state(session_id)
    workspace = None
    if state.organization_id and state.team_id:
        organization = tenant_directory.get(state.organization_id, "organization")
        team = tenant_directory.get(state.organization_id, f"team-{state.team_id}")
        workspace = {"organization_name": organization.name, "team_name": team.name}
    return {**state.model_dump(mode="json", exclude={"owner_id"}), "version": state._etag,
            "permissions": db_client.permissions(state),
            "workspace": workspace}


@router.delete("/sessions/{session_id}")
def delete_session(session_id: SessionId):
    db_client.delete_workflow_state(session_id)
    return {"status": "deleted"}


@router.get("/home")
def personal_home(
    status: Literal["all", "draft", "pending_review", "approved", "rejected"] = "all",
    cursor: Annotated[str, Query(max_length=512, pattern=r"^[A-Za-z0-9_.:+-]*$")] = "",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    return db_client.list_home(status, cursor, limit)


@router.get("/decisions/{session_id}/{analysis_id}")
def archived_decision(session_id: SessionId, analysis_id: SessionId):
    record = db_client.get_decision(session_id, analysis_id)
    allowed = (tenant_directory.permissions(record.organization_id, record.team_id)
               if record.organization_id and record.team_id else {"write", "delete"})
    can_delete = "delete" in allowed or ("write" in allowed and record.owner_id == principal_context.get().owner_id)
    return {"summary": {**record.home.model_dump(), "can_delete": can_delete}, "details": record.details}


@router.delete("/decisions/{session_id}/{analysis_id}")
def delete_archived_workflow(session_id: SessionId, analysis_id: SessionId):
    db_client.delete_archived_workflow(session_id, analysis_id)
    return {"status": "deleted"}


class RequestModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class IntakeRequest(RequestModel):
    session_id: SessionId
    business_domain: str = Field(min_length=1, max_length=200)
    team_size: Literal["1-50", "51-200", "201-1000", "1000+"]
    existing_systems: str = Field(max_length=4000)
    pain_points: str = Field(max_length=8000)
    compliance_requirements: SignalLevel
    demo_scenario: DemoScenario | None = None
    target_cloud: CloudProvider | None = None
    preferred_region: str = Field(default="", max_length=100, pattern=r"^[a-z0-9-]*$")
    data_residency_requirements: str = Field(default="", max_length=2000)
    deployment_constraints: str = Field(default="", max_length=2000)
    model_id: Literal["azure-openai", "foundry-claude-haiku", "demo"] | None = None


class ChatRequest(RequestModel):
    session_id: SessionId
    message: str = Field(min_length=1, max_length=8000)
    demo_scenario: DemoScenario | None = None


class AnalyzeRequest(RequestModel):
    roi_assumptions: ROIAssumptions | None = None


class ReviewRequest(RequestModel):

    analysis_id: SessionId
    decision: Literal["approve", "reject"]
    reviewer: str = Field(min_length=1, max_length=200)
    note: str = Field(min_length=1, max_length=2000)


class EvidenceRequest(RequestModel):
    revision: int = Field(ge=0, strict=True)
    entries: list[EvidenceInput] = Field(max_length=50)


class ConfirmationRequest(RequestModel):
    revision: int = Field(ge=0, strict=True)
    method: str = Field(min_length=1, max_length=1000)


class ReadinessRequest(RequestModel):
    revision: int = Field(ge=0, strict=True)
    evidence_revision: int = Field(ge=0, strict=True)
    assessment: ReadinessAssessment


class InterviewRequest(RequestModel):
    version: str = Field(min_length=1, max_length=1000)
    answers: dict[str, Annotated[str, Field(max_length=2000)]] = Field(max_length=64)
    role: InterviewRole | None = None


def interview_response(state):
    return {**interview_progress(state), "permissions": db_client.permissions(state)}


@router.get("/sessions/{session_id}/interview")
def get_interview(session_id: SessionId):
    return interview_response(db_client.get_workflow_state(session_id))


@router.put("/sessions/{session_id}/interview")
def save_interview(session_id: SessionId, req: InterviewRequest):
    state = db_client.get_workflow_state(session_id)
    db_client._authorize(state, "write")
    if req.version != state._etag:
        raise HTTPException(409, "Interview or assessment changed; reload before saving.")
    if any(not scan_input(text).safe for text in req.answers.values()):
        raise HTTPException(422, "Interview checklist contains instruction-override content. Please rephrase.")
    if state.interview_diagnosis is None and state.diagnosis is not None:
        state.interview_diagnosis = state.diagnosis.model_copy(deep=True)
    before = state.model_dump(mode="json")
    try:
        apply_answers(state, redact_data(req.answers))
    except (ValidationError, ValueError) as exc:
        raise HTTPException(422, "Invalid checklist answer. Check whole-number counts, signal choices, "
                            "region code and field length limits.") from exc
    content_changed = before != state.model_dump(mode="json")
    if req.role is not None:
        state.interview_role = req.role
    if before == state.model_dump(mode="json"):
        return interview_response(state)
    if content_changed:
        state.invalidate_analysis()
        state.invalidate_readiness_context()
    db_client.save_workflow_state(state)
    return interview_response(state)


def readiness_response(state):
    return {
        "revision": state.readiness_revision, "evidence_revision": state.evidence_revision,
        "assessment": state.readiness_assessment.model_dump(mode="json"),
        "catalog": readiness_catalog(state.enterprise_context.target_cloud),
        "report": state.readiness_report or build_readiness_report(state),
        "evidence_entries": [entry.model_dump(mode="json") for entry in state.evidence_register],
        "permissions": db_client.permissions(state),
        "review": {
            "analysis_id": state.analysis_id, "status": state.status,
            "human_review": state.human_review.model_dump(mode="json") if state.human_review else None,
        },
    }


@router.get("/sessions/{session_id}/implementation-readiness")
def get_implementation_readiness(session_id: SessionId):
    return readiness_response(db_client.get_workflow_state(session_id))


@router.put("/sessions/{session_id}/implementation-readiness")
def save_implementation_readiness(session_id: SessionId, req: ReadinessRequest):
    state = db_client.get_workflow_state(session_id)
    db_client._authorize(state, "write")
    if req.revision != state.readiness_revision or req.evidence_revision != state.evidence_revision:
        raise HTTPException(409, "Readiness or evidence changed; reload before saving.")
    identifiers = {entry.id for entry in state.evidence_register}
    for check in req.assessment.checks:
        if not set(check.evidence_ids).issubset(identifiers):
            raise HTTPException(422, "Readiness links must reference current evidence entries.")
    data = req.assessment.model_dump(mode="json")
    texts = [value for check in data["checks"] for key, value in check.items()
             if key in ("finding", "owner", "owner_confirmation_reference", "next_action", "completion_criteria")]
    texts.extend(data["pilot"].values())
    if any(not scan_input(text).safe for text in texts):
        raise HTTPException(422, "Readiness contains instruction-override content. Please rephrase.")
    try:
        assessment = ReadinessAssessment.model_validate(redact_data(data))
    except ValidationError as exc:
        raise HTTPException(422, "Readiness exceeds supported limits after privacy redaction; shorten the affected text.") from exc
    if assessment == state.readiness_assessment:
        return readiness_response(state)
    state.readiness_assessment = assessment
    state.readiness_revision += 1
    state.invalidate_analysis()
    db_client.save_workflow_state(state)
    return readiness_response(state)


def evidence_response(state):
    return {
        "revision": state.evidence_revision,
        "entries": [entry.model_dump(mode="json") for entry in state.evidence_register],
        "permissions": db_client.permissions(state),
    }


@router.get("/sessions/{session_id}/evidence")
def get_evidence(session_id: SessionId):
    return evidence_response(db_client.get_workflow_state(session_id))


@router.put("/sessions/{session_id}/evidence")
def save_evidence(session_id: SessionId, req: EvidenceRequest):
    state = db_client.get_workflow_state(session_id)
    db_client._authorize(state, "write")
    if req.revision != state.evidence_revision:
        raise HTTPException(409, "Evidence changed; reload the register before saving.")
    if len({entry.id for entry in req.entries}) != len(req.entries):
        raise HTTPException(422, "Evidence entry IDs must be unique.")
    previous = {entry.id: entry for entry in state.evidence_register}
    entries = []
    now = datetime.now(timezone.utc)
    actor = principal_context.get().owner_id
    for item in req.entries:
        data = item.model_dump()
        for field in ("statement", "source_reference", "reporting_period"):
            if not scan_input(data[field]).safe:
                raise HTTPException(422, "Evidence contains instruction-override content. Please rephrase.")
            data[field] = redact_pii(data[field])
        old = previous.get(item.id)
        if old and all(getattr(old, key) == value for key, value in data.items()):
            entries.append(old)
        else:
            entries.append(EvidenceEntry(**data, created_by=old.created_by if old else actor,
                                         created_at=old.created_at if old else now,
                                         updated_by=actor, updated_at=now))
    if entries == state.evidence_register:
        return evidence_response(state)
    state.evidence_register = entries
    state.evidence_revision += 1
    state.invalidate_analysis()
    db_client.save_workflow_state(state)
    return evidence_response(state)


@router.post("/sessions/{session_id}/evidence/{entry_id}/confirm")
def confirm_evidence(session_id: SessionId, entry_id: SessionId, req: ConfirmationRequest):
    state = db_client.get_workflow_state(session_id)
    db_client._authorize(state, "review")
    if not state.organization_id:
        require_reviewer()
    if req.revision != state.evidence_revision:
        raise HTTPException(409, "Evidence changed; reload the register before confirming.")
    entry = next((entry for entry in state.evidence_register if entry.id == entry_id), None)
    if entry is None:
        raise HTTPException(404, "Evidence entry not found.")
    if entry.kind != "supported_finding":
        raise HTTPException(409, "Only a source-referenced evidence finding can be confirmed.")
    if not scan_input(req.method).safe:
        raise HTTPException(422, "Confirmation contains instruction-override content. Please rephrase.")
    if entry.confirmation:
        raise HTTPException(409, "This finding is already confirmed; edit its content to request a new confirmation.")
    entry.confirmation = EvidenceConfirmation(confirmed_by=principal_context.get().owner_id,
        confirmed_at=datetime.now(timezone.utc), method=redact_pii(req.method))
    state.evidence_revision += 1
    state.invalidate_analysis()
    db_client.save_workflow_state(state, action="review")
    return evidence_response(state)


@router.post("/intake")
def save_intake(req: IntakeRequest):
    if req.demo_scenario is not None and not demo_mode():
        raise HTTPException(status_code=422, detail="Demo fixtures cannot be selected in live mode.")
    for text in (req.business_domain, req.existing_systems, req.pain_points,
                 req.data_residency_requirements, req.deployment_constraints):
        if not scan_input(text).safe:
            raise HTTPException(status_code=422, detail="Intake contains instruction-override content. Please rephrase.")
    state = db_client.get_workflow_state(req.session_id, create_if_missing=True)
    db_client._authorize(state, "write")
    if state._etag is None and not demo_mode() and req.model_id is None:
        raise HTTPException(422, "Select an assessment model before starting the interview.")
    if req.model_id is not None:
        if req.model_id not in MODEL_IDS:
            raise HTTPException(422, "Choose an approved assessment model.")
        selection = model_definition(req.model_id)
        if (state.model_locked or state.chat_history or state.interview_diagnosis or state.analysis_id or state.trace) and (
                state.inference_model is None or selection != state.inference_model):
            raise HTTPException(409, "The model is fixed after generation starts. Start a new assessment to change it.")
        state.inference_model = selection
    elif state.inference_model is None and demo_mode():
        state.inference_model = model_definition("demo")
    previous_context = state.enterprise_context.model_dump(), state.demo_scenario
    state.invalidate_analysis()
    state.demo_scenario = req.demo_scenario
    state.enterprise_context.business_domain = redact_pii(req.business_domain)
    state.enterprise_context.team_size = req.team_size
    state.enterprise_context.existing_systems = redact_pii(req.existing_systems)
    state.enterprise_context.pain_points = redact_pii(req.pain_points)
    state.enterprise_context.compliance_requirements = req.compliance_requirements
    if req.target_cloud is not None:
        if req.target_cloud != state.enterprise_context.target_cloud:
            state.enterprise_context.preferred_region = ""
        state.enterprise_context.target_cloud = req.target_cloud
    for field in ("preferred_region", "data_residency_requirements", "deployment_constraints"):
        if field in req.model_fields_set:
            setattr(state.enterprise_context, field, redact_pii(getattr(req, field)))
    if state._etag is not None and previous_context != (state.enterprise_context.model_dump(), state.demo_scenario):
        state.invalidate_readiness_context()
        state.interview_diagnosis = None
        for context_key, fact in (("existing_systems", "systems"), ("compliance_requirements", "compliance_sensitivity")):
            if previous_context[0][context_key] != getattr(state.enterprise_context, context_key):
                state.interview_answers.pop(fact, None)
                state.interview_unconfirmed = [
                    identifier for identifier in state.interview_unconfirmed if identifier != f"fact.{fact}"]
    db_client.save_workflow_state(state)
    return {"status": "success", "session_id": req.session_id,
            "enterprise_context": state.enterprise_context.model_dump(),
            "inference_model": state.inference_model.model_dump() if state.inference_model else None}


@router.post("/chat")
def chat_interaction(req: ChatRequest):
    if req.demo_scenario is not None and not demo_mode():
        raise HTTPException(status_code=422, detail="Demo fixtures cannot be selected in live mode.")
    state = db_client.get_workflow_state(req.session_id, create_if_missing=True)
    db_client._authorize(state, "write")
    if state._etag is None and not demo_mode():
        raise HTTPException(422, "Start with intake and select an assessment model before the interview.")

    # Security gate: screen every inbound message before it reaches the LLM.
    guard = scan_input(req.message)
    if guard.flags:
        state.guardrail_events = (state.guardrail_events + [{"result": guard.model_dump()}])[-100:]

    if not guard.safe:
        warning = ("🛡️ **Guardrail triggered.** Your message looks like a prompt-injection attempt, "
                   "so it was not passed to the AI agent. Please rephrase as a genuine description of "
                   "your workflow.")
        # IMPORTANT: do NOT persist the blocked message into chat_history — keeping
        # injection text out of the transcript prevents it from poisoning the later
        # diagnostic-extraction LLM call (which Azure's content filter would reject).
        db_client.save_workflow_state(state)  # persists only the guardrail_event recorded above
        return {"status": "blocked", "response": warning, "guardrail": guard.model_dump()}

    # Diagnostic Agent answers grounded in the intake context. PII is redacted before storage.
    if sum(item.get("role") == "user" for item in state.chat_history) >= MAX_INTERVIEW_ROUNDS:
        raise HTTPException(status_code=409, detail="The 10-round interview limit is reached. "
                            "Complete remaining answers in the editable Diagnostic checklist.")
    if not interview_progress(state)["can_chat"]:
        raise HTTPException(409, "Interview capture is complete. Review the checklist or run analysis.")
    scenario = req.demo_scenario or state.demo_scenario
    message = redact_pii(req.message)
    progress = interview_progress(state)
    explicit_unknown = message.strip().lower().rstrip(".") in ("unconfirmed", "unknown")
    with assessment_model(state.inference_model) as selection:
        if explicit_unknown:
            diagnosis = InterviewDiagnosis()
        else:
            diagnosis = diagnostic_agent.analyze_chat_history(
                state.chat_history + [{"role": "user", "content": message}],
                state.enterprise_context, scenario, include_readiness=True)
        state.inference_model = selection
        state.model_locked = True
    previous_diagnosis = state.interview_diagnosis or state.diagnosis
    state.invalidate_analysis()
    state.invalidate_readiness_context()
    state.interview_diagnosis = merge_diagnosis(previous_diagnosis,
        WorkflowDiagnosis.model_validate(redact_data(diagnosis.model_dump())))
    if isinstance(diagnosis, InterviewDiagnosis):
        try:
            if explicit_unknown:
                apply_answers(state, {field["id"]: "unconfirmed" for field in progress["fields"]
                                      if field["question"] in progress["questions"]}, captured=True)
            apply_answers(state, redact_data({key: answer.value for key, answer in diagnosis.answers.items()}), captured=True)
            for key, answer in diagnosis.answers.items():
                if key.startswith("runtime."):
                    source = state.runtime_requirement_sources.get(key.split(".", 1)[1])
                    if source and source.source == "interview" and source.quote == answer.value:
                        source.quote = redact_pii(answer.quote)
                        source.source = answer.source
        except ValueError as exc:
            raise InvalidDependencyResponse(model_dependency(state.inference_model)) from exc
    state.demo_scenario = scenario
    state.chat_history.append({"role": "user", "content": redact_pii(req.message)})
    response_text = redact_pii(interview_reply(state))
    if demo_mode():
        label = f"[Demo fixture: {scenario}] " if scenario else "Demo mode: "
        response_text = (label + "Uses the selected fictional fixture for suitability, not extraction from free text. "
                         "Enter readiness and deployment answers in the checklist.\n" + response_text)
    state.chat_history.append({"role": "assistant", "content": response_text})
    db_client.save_workflow_state(state)
    return {"status": "success", "response": response_text, "message": message, "guardrail": guard.model_dump(),
            "interview": interview_response(state)}


@router.post("/analyze/{session_id}")
def analyze_workflow(session_id: SessionId, req: AnalyzeRequest | None = None):
    db_client._authorize(db_client.get_workflow_state(session_id), "write")
    s = (run_orchestration(session_id, roi_assumptions=req.roi_assumptions)
         if req and req.roi_assumptions is not None else run_orchestration(session_id))
    return redact_data({
        "status": s.status,
        "score": s.suitability_score.model_dump() if s.suitability_score else None,
        "recommendation": s.architecture_recommendation,
        "governance": s.governance,
        "roi": s.roi,
        "patterns": s.retrieved_patterns,
        "trace": s.trace,
        "analysis_id": s.analysis_id,
        "diagnosis": s.diagnosis.model_dump() if s.diagnosis else None,
        "demo_scenario": s.demo_scenario,
        "enterprise_context": s.enterprise_context.model_dump(),
        "cloud_mapping": s.cloud_mapping or s.azure_mapping,
        "evidence_report": s.evidence_report,
        "readiness_report": s.readiness_report,
        "runtime_decision": s.runtime_decision.model_dump() if s.runtime_decision else None,
        "executive_brief": s.executive_brief.model_dump() if s.executive_brief else None,
        "inference_model": s.inference_model.model_dump() if s.inference_model else None,
    })


@router.get("/blueprint/{session_id}")
def get_blueprint(session_id: SessionId):
    state = db_client.get_workflow_state(session_id)
    if not state.blueprint and state.status != "rejected":
        raise HTTPException(status_code=404, detail="Blueprint not generated yet.")

    res = dict(state.blueprint or {})
    res["status"] = state.status
    res["analysis_id"] = state.analysis_id
    res["provisional"] = state.status == "awaiting_human_review"
    res["human_review"] = state.human_review.model_dump(mode="json") if state.human_review else None
    res["diagnosis"] = state.diagnosis.model_dump() if state.diagnosis else None
    res["demo_scenario"] = state.demo_scenario
    res["inference_model"] = state.inference_model.model_dump() if state.inference_model else None
    res["permissions"] = db_client.permissions(state)
    if state.status == "rejected":
        res["alternative"] = (
            (state.governance or {}).get("rejection_package") or {}
        ).get("alternative", "Use standard software or a deterministic approval workflow without agentic loops.")
    res["enterprise_context"] = state.enterprise_context.model_dump()
    res["cloud_mapping"] = state.cloud_mapping or state.azure_mapping
    res["evidence_report"] = state.evidence_report
    res["readiness_report"] = state.readiness_report
    res["runtime_decision"] = state.runtime_decision.model_dump() if state.runtime_decision else None
    res["executive_brief"] = state.executive_brief.model_dump() if state.executive_brief else None
    res["discovery_origin"] = state.discovery_origin.model_dump(mode="json") if state.discovery_origin else None
    if state.suitability_score:
        res["suitability_score"] = state.suitability_score.model_dump()
    if state.workflow_intelligence:
        res["workflow_intelligence"] = state.workflow_intelligence.model_dump()
    if state.architecture_recommendation:
        res["architecture_recommendation"] = state.architecture_recommendation
    if state.governance:
        res["governance"] = state.governance
    if state.roi:
        res["roi"] = state.roi
    if state.retrieved_patterns:
        res["retrieved_patterns"] = state.retrieved_patterns
    if state.token_usage:
        res["token_usage"] = state.token_usage.model_dump() if hasattr(state.token_usage, "model_dump") else state.token_usage
    return redact_data(res)


@router.get("/blueprint/{session_id}/pdf")
def download_blueprint_pdf(
    session_id: SessionId,
    analysis_id: SessionId,
    status: Literal["awaiting_human_review", "completed", "rejected"],
):
    snapshot = get_blueprint(session_id)
    if snapshot["analysis_id"] != analysis_id or snapshot["status"] != status:
        raise HTTPException(409, "Recommendation changed. Fetch and review the current version before exporting.")
    document = build_blueprint_pdf(snapshot)
    current = db_client.get_workflow_state(session_id)
    if current.analysis_id != analysis_id or current.status != status:
        raise HTTPException(409, "Recommendation changed during PDF generation. Fetch the current version before exporting.")
    return Response(document, media_type="application/pdf", headers={
        "Content-Disposition": 'attachment; filename="AgentSpark_Assessment.pdf"',
        "Pragma": "no-cache",
    })


@router.get("/sessions/{session_id}/executive-brief/pdf")
def download_executive_brief(session_id: SessionId, version: Annotated[str, Query(min_length=1, max_length=1000)]):
    state = db_client.get_workflow_state(session_id)
    if not state.executive_brief:
        raise HTTPException(404, "Run analysis to generate the executive decision brief.")
    if version != state._etag:
        raise HTTPException(409, "Assessment changed; reload before exporting the brief.")
    document = build_executive_brief_pdf(redact_data(state.executive_brief.model_dump(mode="json")))
    if db_client.get_workflow_state(session_id)._etag != version:
        raise HTTPException(409, "Assessment changed during export; reload before exporting.")
    return Response(document, media_type="application/pdf", headers={
        "Content-Disposition": 'attachment; filename="AgentSpark_Executive_Brief.pdf"', "Pragma": "no-cache"})


@router.get("/review/{session_id}")
def get_review(session_id: SessionId):
    state = db_client.get_workflow_state(session_id)
    if not state.analysis_id:
        raise HTTPException(status_code=404, detail="No current analysis to review.")
    return {
        "analysis_id": state.analysis_id,
        "status": state.status,
        "governance": state.governance,
        "human_review": state.human_review.model_dump(mode="json") if state.human_review else None,
        "evidence_report": state.evidence_report,
        "readiness_report": state.readiness_report,
        "runtime_decision": state.runtime_decision.model_dump() if state.runtime_decision else None,
        "executive_brief": state.executive_brief.model_dump() if state.executive_brief else None,
    }


@router.post("/review/{session_id}")
def submit_review(session_id: SessionId, req: ReviewRequest):
    state = db_client.get_workflow_state(session_id)
    db_client._authorize(state, "review")
    if state.organization_id:
        reviewer = principal_context.get().subject if auth_settings.mode != "local-demo" else None
    else:
        reviewer = require_reviewer()
    if not state.analysis_id:
        raise HTTPException(status_code=404, detail="No current analysis to review.")
    if state.analysis_id != req.analysis_id:
        raise HTTPException(status_code=409, detail="Analysis changed; fetch the current recommendation before reviewing.")
    if state.diagnosis is None or state.diagnosis.missing_facts:
        raise HTTPException(status_code=409, detail="Analysis has no complete fact provenance; rerun analysis before reviewing.")
    if (state.status != "awaiting_human_review"
            or not state.blueprint
            or (state.governance or {}).get("decision") != "HUMAN_REVIEW_REQUIRED"):
        raise HTTPException(status_code=409, detail="Only a pending human review can be decided.")
    review = req.model_dump()
    review["reviewer"] = reviewer or redact_pii(req.reviewer)
    review["note"] = redact_pii(req.note)
    state.human_review = HumanReview(**review, reviewed_at=datetime.now(timezone.utc))
    state.status = "completed" if req.decision == "approve" else "rejected"
    if req.decision == "reject":
        state.blueprint = None
    state.executive_brief = build_executive_brief(state)
    db_client.save_workflow_state(state, action="review")
    return {
        "status": state.status,
        "analysis_id": state.analysis_id,
        "human_review": state.human_review.model_dump(mode="json"),
    }


@router.post("/guardrail-check")
def guardrail_check(req: ChatRequest):
    """Live security demo: screen arbitrary text for injection/PII without storing it."""
    return scan_input(req.message).model_dump()


@router.get("/patterns")
def search_patterns(
    q: Annotated[str, Query(min_length=1, max_length=2000, pattern=r"\S")] = "agentic enterprise workflow",
    k: Annotated[int, Query(ge=1, le=50)] = 6,
    target_cloud: CloudProvider = "azure",
):
    """Expose the RAG pattern library so judges can probe retrieval directly."""
    q = redact_pii(q)
    return {"query": q, "retrieval_method": "keyword",
            "results": [pattern_for_cloud(p, target_cloud) for p in retrieve_patterns(q, top_k=k)]}


@router.get("/patterns/{pattern_id}")
def pattern_source(pattern_id: SessionId, target_cloud: CloudProvider = "azure"):
    document = get_pattern(pattern_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Pattern not found in the configured source.")
    return pattern_for_cloud(document, target_cloud)


@router.get("/portfolio")
def portfolio():
    """Rank a backlog of candidate workflows by agentification readiness."""
    from app.scoring.portfolio import score_backlog
    return {"portfolio": [e.model_dump() for e in score_backlog()]}
