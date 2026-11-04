"""Versioned discussion guides, not readiness scoring or provider integrations."""

PLAYBOOKS = {
    "ai_native_readiness": {
        "id": "ai_native_readiness", "title": "AI-native readiness",
        "description": "Understand organizational tools, controls, skills and ownership before proposing adoption.",
        "questions": [
            {"id": "goals", "label": "Which business outcomes should AI adoption support?", "role": "process_owner"},
            {"id": "tools", "label": "Which AI tools, subscriptions and developer workloads are already used?", "role": "technical_owner"},
            {"id": "data", "label": "What data may be used, and which privacy, residency and access rules need validation?", "role": "technical_owner"},
            {"id": "controls", "label": "Who owns tool approval, human review and incident handling?", "role": "process_owner"},
            {"id": "skills", "label": "What training, confidence and day-to-day adoption barriers do people report?", "role": "business_operator"},
            {"id": "baseline", "label": "Which adoption or work-quality baselines exist, and where are their sources?", "role": "process_owner"},
        ],
    },
    "workflow_opportunity": {
        "id": "workflow_opportunity", "title": "Workflow opportunity discovery",
        "description": "Understand the work and compare process change, conventional automation and AI without an AI default.",
        "questions": [
            {"id": "outcome", "label": "What triggers the work, and what outcome should it produce?", "role": "process_owner"},
            {"id": "friction", "label": "Where do manual effort, delays, exceptions and rework occur?", "role": "business_operator"},
            {"id": "baseline", "label": "What volume, handling-time and exception baselines exist, with source references?", "role": "process_owner"},
            {"id": "systems", "label": "Which systems, data and integrations support or constrain this work?", "role": "technical_owner"},
            {"id": "authority", "label": "Which rules and consequential decisions must remain human-controlled?", "role": "process_owner"},
            {"id": "alternatives", "label": "Could the problem be addressed without AI, and what still needs investigation?", "role": "business_operator"},
        ],
    },
}

OUTCOME_LABELS = {
    "gather_more_evidence": "Gather more evidence",
    "improve_process": "Improve the process first",
    "conventional_automation": "Explore conventional automation",
    "bounded_ai_pilot": "Investigate a bounded AI pilot",
    "do_not_proceed": "Do not proceed",
}


def documented(value: str) -> bool:
    text = value.strip().casefold()
    return bool(text) and not any(text.startswith(word) for word in ("unconfirmed", "unknown", "tbd", "not known"))
