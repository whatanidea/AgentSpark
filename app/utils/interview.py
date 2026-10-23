"""Bounded interview planning and explicit, unverified readiness draft capture."""
import re
import logging

from app.utils.models import (
    ESSENTIAL_FACTS, FactEvidence, ReadinessCheckInput, WorkflowDiagnosis,
    WorkflowIntelligence, WorkflowState,
)
from app.utils.readiness import readiness_catalog
from app.utils.runtime import demo_mode
from app.agents.demo_scenarios import demo_diagnosis

MAX_INTERVIEW_ROUNDS = 10
logger = logging.getLogger(__name__)
_COUNTS = {"steps", "decision_points", "exceptions_per_week", "volume_per_day"}
_LISTS = {"departments", "systems"}
_SIGNALS = {"compliance_sensitivity", "data_availability", "human_judgment", "unstructured_content", "error_cost"}
_CONTEXT = {
    "preferred_region": "Which region is proposed for the selected cloud? Use its region code, or leave it unresolved.",
    "data_residency_requirements": "Where may claim/workflow data, logs and backups reside? State unconfirmed if unknown.",
    "deployment_constraints": "What hosting, network, identity, encryption or model-provider constraints must be validated?",
}
_PILOT = {
    "scope": "What is the bounded pilot scope and test data (for example, synthetic data only)?",
    "success_metrics": "What measurable outcomes must the pilot meet?",
    "failure_handling": "How should the pilot handle errors, uncertainty and escalation?",
    "authorization_boundaries": "Which decisions and business actions must remain human-authorized?",
}


def interview_fields(state: WorkflowState) -> list[dict]:
    fields = []
    for key, question in ESSENTIAL_FACTS.items():
        options = ["Low", "Medium", "High"] if key in _SIGNALS else (
            ["Stable", "Evolving", "Volatile"] if key == "rule_stability" else [])
        fields.append({"id": f"fact.{key}", "label": key.replace("_", " ").capitalize(),
                       "question": question, "group": "Workflow suitability",
                       "kind": "select" if options else "number" if key in _COUNTS else "text",
                       "options": options, "max_length": 2000})
    for key, question in _CONTEXT.items():
        fields.append({"id": f"context.{key}", "label": key.replace("_", " ").capitalize(),
                       "question": question, "group": "Deployment preferences", "kind": "text",
                       "options": [], "max_length": 100 if key == "preferred_region" else 2000})
    for spec in readiness_catalog(state.enterprise_context.target_cloud):
        fields.append({"id": f"readiness.{spec['id']}", "label": spec["title"],
                       "question": spec["question"] + " State what is known or unconfirmed; no credentials or personal data.",
                       "group": "Draft implementation readiness", "kind": "text",
                       "options": [], "max_length": 1000})
    for key, question in _PILOT.items():
        fields.append({"id": f"pilot.{key}", "label": "Pilot " + key.replace("_", " "),
                       "question": question, "group": "Pilot definition", "kind": "text",
                       "options": [], "max_length": 1000})
    return fields


def _fact_value(key: str, text: str):
    if key in _COUNTS:
        if not re.fullmatch(r"[0-9]+", text):
            raise ValueError(f"{key} must be a whole nonnegative number.")
        return int(text)
    if key in _LISTS:
        return [] if text.lower() in ("none", "[]") else [item.strip() for item in text.split(",") if item.strip()]
    return text


def merge_diagnosis(previous: WorkflowDiagnosis | None, current: WorkflowDiagnosis) -> WorkflowDiagnosis:
    result = current.model_copy(deep=True)
    if previous is None or previous.intelligence is None:
        return result
    values = result.intelligence.model_dump() if result.intelligence else {"workflow_name": "Workflow not yet supplied"}
    for key in ESSENTIAL_FACTS:
        old = previous.evidence.get(key, FactEvidence())
        if old.status == "supplied" and result.evidence.get(key, FactEvidence()).status == "missing":
            values[key] = getattr(previous.intelligence, key)
            result.evidence[key] = old.model_copy(deep=True)
    result.intelligence = WorkflowIntelligence.model_validate(values)
    return result


def effective_diagnosis(state: WorkflowState) -> WorkflowDiagnosis:
    diagnosis = (state.interview_diagnosis or state.diagnosis or
                 (demo_diagnosis(state.demo_scenario) if demo_mode() and state.demo_scenario else WorkflowDiagnosis())
                 ).model_copy(deep=True)
    values = diagnosis.intelligence.model_dump() if diagnosis.intelligence else {"workflow_name": "Workflow not yet supplied"}
    intake = state.enterprise_context
    for key, text in (("compliance_sensitivity", intake.compliance_requirements), ("systems", intake.existing_systems)):
        if text and diagnosis.evidence.get(key, FactEvidence()).status != "supplied":
            if key == "compliance_sensitivity" and text not in ("Low", "Medium", "High"):
                continue
            parsed = _fact_value(key, text)
            if key == "systems" and (len(parsed) > 100 or any(len(item) > 200 for item in parsed)):
                logger.info("Intake systems need bounded named entries; interview clarification is required.")
                continue
            values[key] = parsed
            diagnosis.evidence[key] = FactEvidence(status="supplied", source="intake", quote=text)
    for key, text in state.interview_answers.items():
        values[key] = _fact_value(key, text)
        diagnosis.evidence[key] = FactEvidence(status="supplied", source="checklist", quote=text)
    diagnosis.intelligence = WorkflowIntelligence.model_validate(values)
    if state.interview_answers:
        diagnosis.demo_scenario_required = False
    return diagnosis


def interview_progress(state: WorkflowState) -> dict:
    diagnosis = effective_diagnosis(state)
    answers = {}
    for key in ESSENTIAL_FACTS:
        if key not in diagnosis.missing_facts:
            value = getattr(diagnosis.intelligence, key)
            answers[f"fact.{key}"] = (", ".join(value) if value else "none") if isinstance(value, list) else str(value)
    answers.update({f"context.{key}": getattr(state.enterprise_context, key) for key in _CONTEXT})
    answers.update({f"readiness.{check.id}": check.finding for check in state.readiness_assessment.checks})
    answers.update({f"pilot.{key}": getattr(state.readiness_assessment.pilot, key) for key in _PILOT})
    fields = interview_fields(state)
    missing = [field["id"] for field in fields if not answers.get(field["id"], "").strip()]
    rounds = sum(message.get("role") == "user" for message in state.chat_history)
    exhausted = rounds >= MAX_INTERVIEW_ROUNDS
    pending = [field for field in fields if field["id"] in missing]
    questions = [field["question"] for field in pending if field["group"] == pending[0]["group"]][:3] \
        if pending and not exhausted else []
    return {
        "version": state._etag, "rounds_used": min(rounds, MAX_INTERVIEW_ROUNDS),
        "max_rounds": MAX_INTERVIEW_ROUNDS, "limit_reached": exhausted,
        "can_chat": not exhausted and bool(missing), "questions": questions,
        "missing_fields": missing, "missing_facts": diagnosis.missing_facts,
        "fields": fields, "answers": answers, "permissions": {},
    }


def interview_reply(state: WorkflowState) -> str:
    progress = interview_progress(state)
    if progress["limit_reached"]:
        return ("The 10-round interview limit is reached. Automatic questions have stopped. "
                "Review the editable checklist; unanswered items remain unknown. "
                "A score still requires all essential workflow facts.")
    if not progress["questions"]:
        return ("Interview capture is complete. Review your answers and unverified readiness drafts, "
                "then run analysis. This does not verify evidence or authorize a pilot.")
    return "Please answer these together; say unconfirmed where appropriate:\n" + "\n".join(
        f"{index}. {question}" for index, question in enumerate(progress["questions"], 1))


def apply_answers(state: WorkflowState, answers: dict[str, str], *, captured=False) -> None:
    catalog = {field["id"]: field for field in interview_fields(state)}
    if not set(answers).issubset(catalog):
        raise ValueError("Unknown interview checklist field.")
    current = interview_progress(state)["answers"]
    for identifier, raw in answers.items():
        text = raw.strip()
        spec = catalog[identifier]
        if len(text) > spec["max_length"]:
            raise ValueError(f"{spec['label']} exceeds its supported length.")
        group, key = identifier.split(".", 1)
        if captured and (not text or group == "fact"):
            continue
        if text == current.get(identifier, ""):
            continue
        if group == "fact":
            if text:
                state.interview_answers[key] = text
            else:
                state.interview_answers.pop(key, None)
                if state.interview_diagnosis:
                    state.interview_diagnosis.evidence[key] = FactEvidence()
        elif group == "context":
            if key == "preferred_region" and not re.fullmatch(r"[a-z0-9-]{0,100}", text):
                raise ValueError("Preferred region must be a region code for the selected cloud.")
            if not captured or not getattr(state.enterprise_context, key):
                setattr(state.enterprise_context, key, text)
        elif group == "pilot":
            if not captured or not getattr(state.readiness_assessment.pilot, key):
                setattr(state.readiness_assessment.pilot, key, text)
        else:
            check = next((item for item in state.readiness_assessment.checks if item.id == key), None)
            if check is None:
                check = ReadinessCheckInput(id=key)
                state.readiness_assessment.checks.append(check)
            if (not captured or not check.finding) and text != check.finding:
                check.finding = text
                check.status = "needs_validation" if text else "unknown"
                check.evidence_ids = []
                check.owner_status = "proposed" if check.owner else "unassigned"
                check.owner_confirmation_reference = ""
    effective_diagnosis(state)  # Validate numeric, enum, list and text limits through the shared model.
