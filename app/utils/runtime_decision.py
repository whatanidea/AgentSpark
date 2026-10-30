"""Versioned assessment rules, not a workflow engine or deployment validator."""
from app.utils.models import (
    AgentSuitabilityScore, EnterpriseContext, FactEvidence, RuntimeDecision,
    RuntimeLayerDecision, RuntimeOption, RuntimeRequirements,
)

RULES_VERSION = "runtime-rules-v1"
CATALOG_VERSION = "runtime-catalog-v1"
CATALOG = {
    "none": ("No separate workflow engine", "Application code must own error handling and any required persistence."),
    "bounded_handler": ("Bounded model/tool handler", "Keep tool permissions and the number of model/tool calls bounded."),
    "langgraph": ("LangGraph", "Checkpointing does not itself guarantee safe external side effects or business-process recovery."),
    "temporal": ("Temporal", "Validate hosting, durable history, worker operations, activity idempotency and recovery."),
    "azure_durable_functions": ("Azure Durable Functions", "Validate deterministic orchestration, activity retries and Azure operational constraints."),
    "aws_step_functions": ("AWS Step Functions Standard Workflows", "Validate service limits, callback integration, execution history and AWS operational constraints."),
}
LIMITATIONS = (
    "Advisory architecture candidates, not a deployed or benchmarked system. Requirements are user-supplied, "
    "not independently verified. Availability, residency, integrations, prices, capacity and recovery behavior "
    "require validation. No runtime guarantees exactly-once business effects."
)
RUNTIME_FIELDS = {
    "reasoning": ("Reasoning behavior", "Are the steps deterministic, a bounded AI task, or dynamic iterative tool use?",
                  ["unknown", "deterministic", "bounded", "dynamic"]),
    "duration": ("Process duration", "Is execution request-bound or long-running across hours or days?",
                 ["unknown", "request_bound", "long_running"]),
    "external_waits": ("External waits", "Does the process wait for human approvals, callbacks, schedules or external events?",
                       ["unknown", "no", "yes"]),
    "recovery": ("Recovery requirement", "Can failed work restart, or must progress survive interruptions?",
                 ["unknown", "restartable", "durable"]),
    "side_effects": ("Business side effects", "Is the proposed system read-only, or does it perform consequential business actions?",
                     ["unknown", "read_only", "consequential"]),
    "side_effect_safety": ("Side-effect safety", "Are idempotency, duplicate-action handling, reconciliation and compensation defined?",
                          ["unknown", "defined", "unresolved"]),
    "existing_reasoning": ("Existing reasoning standard", "Is there an approved bounded handler or LangGraph standard, or none?",
                           ["unknown", "none", "bounded_handler", "langgraph"]),
    "existing_runtime": ("Existing workflow standard", "Which durable runtime is already approved? Select other for an unlisted platform.",
                         ["unknown", "none", "temporal", "azure_durable_functions", "aws_step_functions", "other"]),
    "runtime_hosting": ("Runtime hosting approach", "Would Temporal use a managed service or be self-hosted? This requires validation.",
                        ["unknown", "managed_service", "self_hosted"]),
    "operational_owner": ("Runtime operational owner", "Which team would operate and support the proposed runtime?",
                          []),
    "scale_constraints": ("Runtime scale and latency", "State proposed volume, concurrency and latency targets; leave unresolved if unknown.",
                          []),
    "platform_constraints": ("Runtime platform constraints", "State existing platform, residency, network or team-skill constraints that need review.",
                            []),
}


def runtime_fields(requirements: RuntimeRequirements) -> list[dict]:
    fields = []
    for key, (label, question, options) in RUNTIME_FIELDS.items():
        relevant = not (
            (key == "side_effect_safety" and requirements.side_effects != "consequential")
            or (key == "runtime_hosting" and requirements.existing_runtime != "temporal")
            or (key == "existing_reasoning" and requirements.reasoning == "deterministic"))
        fields.append({"id": f"runtime.{key}", "label": label, "question": question,
                       "group": "Architecture runtime requirements", "kind": "select" if options else "text",
                       "options": options, "max_length": 200 if key == "operational_owner" else 1000,
                       "required": relevant and key not in ("scale_constraints", "platform_constraints")})
    return fields


def _option(identifier: str, eligible: bool, reason: str, *, reasoning=False) -> RuntimeOption:
    label, tradeoff = CATALOG[identifier]
    if reasoning and identifier == "none":
        label = "No agent framework (application code)"
    return RuntimeOption(id=identifier, label=label, eligible=eligible, reason=reason, tradeoffs=[tradeoff])


def _layer(selected: str | None, reasons: list[str], options: list[RuntimeOption], *, reasoning=False):
    label = ("No agent framework (application code)" if reasoning and selected == "none"
             else CATALOG[selected][0] if selected else "Unresolved")
    return RuntimeLayerDecision(selected=selected, label=label,
                                rationale=reasons + ([CATALOG[selected][1]] if selected else []),
                                alternatives=[option for option in options if option.id != selected])


def recommend_runtime(requirements: RuntimeRequirements, sources: dict[str, FactEvidence],
                      score: AgentSuitabilityScore, context: EnterpriseContext) -> RuntimeDecision:
    r = requirements
    tasks: list[str] = []
    missing = []
    reasoning_reasons = []
    allowed_dynamic = score.classification == "High"
    reasoning = {"deterministic": "none", "bounded": "bounded_handler",
                 "dynamic": "langgraph" if allowed_dynamic else "bounded_handler"}.get(r.reasoning)
    if score.classification == "Not Suitable":
        reasoning = "none"
        reasoning_reasons.append("The prescribed standard-software design does not justify agent coordination.")
        if r.reasoning not in ("deterministic", "unknown"):
            tasks.append("Resolve AI reasoning requirements that conflict with the prescribed standard-software design.")
    elif r.reasoning == "unknown":
        missing.append("Clarify deterministic steps versus bounded AI versus dynamic reasoning.")
    elif r.reasoning == "dynamic" and not allowed_dynamic:
        tasks.append("Dynamic reasoning conflicts with the prescribed lower-autonomy design; validate a bounded alternative.")
    if reasoning is not None:
        reasoning_reasons.append({
            "none": "Predictable steps do not need an agent framework.",
            "bounded_handler": "A bounded model/tool handler is the least complex fit within the prescribed design.",
            "langgraph": "Explicit iterative reasoning and tool coordination justify a reasoning graph, within prescribed autonomy.",
        }[reasoning])
    if r.existing_reasoning == "unknown" and r.reasoning != "deterministic":
        tasks.append("Confirm the approved enterprise reasoning standard and team skills.")
    elif r.existing_reasoning not in ("none", reasoning):
        tasks.append("The existing reasoning standard does not match the simplest eligible design; review the deviation.")
    elif r.existing_reasoning != "none":
        reasoning_reasons.append("The existing approved reasoning standard matches the eligible design.")

    durable_needed = r.duration == "long_running" or r.external_waits == "yes" or r.recovery == "durable"
    durable_unknown = any(value == "unknown" for value in (r.duration, r.external_waits, r.recovery))
    cloud_runtime = "azure_durable_functions" if context.target_cloud == "azure" else "aws_step_functions"
    other_cloud = "aws_step_functions" if context.target_cloud == "azure" else "azure_durable_functions"
    durable = None
    durable_reasons = []
    if durable_needed:
        if r.existing_runtime in ("temporal", cloud_runtime):
            durable = r.existing_runtime
            durable_reasons.append("Reuse the existing approved workflow standard; it can address the stated durability requirements.")
        elif r.existing_runtime in (other_cloud, "other"):
            tasks.append("Existing workflow standard is outside the selected-cloud catalog; resolve platform constraints before choosing.")
        elif r.existing_runtime == "unknown":
            tasks.append("Confirm the existing durable workflow standard before selecting from the eligible shortlist.")
        else:
            durable = cloud_runtime
            durable_reasons.append("No existing standard was supplied; prefer the selected-cloud workflow candidate to introducing another platform.")
        durable_reasons.append("Long-running work, external waits or durable recovery require a separate execution responsibility.")
        if durable_unknown:
            tasks.append("Clarify remaining duration, external-wait and recovery requirements before implementation.")
        if r.operational_owner.lower() in ("", "unknown", "unconfirmed", "none", "unassigned"):
            tasks.append("Assign an operational owner and validate runtime support, retry and recovery procedures.")
        if durable == "temporal" and r.runtime_hosting == "unknown":
            tasks.append("Choose and validate Temporal managed-service or self-hosted operations and residency.")
    elif durable_unknown:
        missing.append("Clarify process duration, external waits and restart/recovery behavior.")
    else:
        durable = "none"
        durable_reasons.append("Request-bound work without external waits or durable recovery does not require a separate workflow engine.")
        if r.existing_runtime not in ("none", "unknown"):
            tasks.append("A separate workflow engine is not required; review whether the existing standard should still be reused.")

    if r.side_effects == "unknown":
        missing.append("Clarify whether the proposed system has consequential side effects.")
    elif r.side_effects == "consequential":
        tasks.append("Test authorization, idempotency, duplicate actions, reconciliation and compensation before consequential actions.")
        if r.side_effect_safety != "defined":
            missing.append("Define side-effect safety requirements before recommending consequential execution.")
    if not r.scale_constraints:
        tasks.append("Validate workload volume, concurrency, latency and candidate service limits.")
    else:
        tasks.append("Validate the supplied scale and latency targets against the candidate runtimes; no benchmark was performed.")
    if r.platform_constraints or context.deployment_constraints or context.data_residency_requirements:
        tasks.append("Review supplied platform, deployment and residency constraints against each candidate; text constraints are not automatically verified.")
    reasoning_options = [
        _option("none", r.reasoning == "deterministic" or score.classification == "Not Suitable",
                "Application code suffices for deterministic processing; it cannot substitute for required dynamic reasoning.",
                reasoning=True),
        _option("bounded_handler", r.reasoning == "bounded" or (r.reasoning == "dynamic" and not allowed_dynamic),
                "Suitable for a bounded AI task without an agent coordination graph."),
        _option("langgraph", r.reasoning == "dynamic" and allowed_dynamic,
                "Requires explicit dynamic reasoning and a compatible prescribed design; it is not the business workflow engine."),
    ]
    durable_options = [
        _option("none", not durable_needed and not durable_unknown,
                "Only sufficient when separate durable execution is not required."),
        _option("temporal", durable_needed,
                "Cross-cloud candidate; hosting, ownership and residency must be assessed, not assumed."),
        _option("azure_durable_functions", durable_needed and context.target_cloud == "azure",
                "Azure candidate; not eligible as the hosting runtime for an AWS target."),
        _option("aws_step_functions", durable_needed and context.target_cloud == "aws",
                "AWS candidate; not eligible as the hosting runtime for an Azure target."),
    ]
    # A validated deterministic/simple case can be recommended without claiming scale validation.
    blocking_tasks = [task for task in tasks if not task.startswith(("Validate workload", "Validate the supplied scale"))]
    status = ("insufficient_information" if missing or reasoning is None else
              "provisional" if blocking_tasks or durable is None else "recommended")
    return RuntimeDecision(
        status=status, rules_version=RULES_VERSION, catalog_version=CATALOG_VERSION,
        target_cloud=context.target_cloud, requirements=r.model_copy(deep=True),
        provenance={key: value.model_copy(deep=True) for key, value in sources.items()},
        reasoning=_layer(reasoning, reasoning_reasons, reasoning_options, reasoning=True),
        durable_execution=_layer(durable, durable_reasons, durable_options),
        validation_tasks=missing + tasks,
        boundaries=[
            f"Preserve prescribed design: {score.recommended_pattern}; autonomy: {score.autonomy_level}.",
            "Human approval before consequential actions is mandatory." if score.requires_hitl
            else "Preserve bounded authorization and exception review; runtime selection grants no new authority.",
            "Keep business side effects outside unconstrained reasoning loops; runtime retries do not prove exactly-once effects.",
        ], limitations=LIMITATIONS,
    )


def orchestration_label(decision: RuntimeDecision) -> str:
    return (f"Reasoning: {decision.reasoning.label}; durable execution: {decision.durable_execution.label} "
            f"({decision.status.replace('_', ' ')})")
