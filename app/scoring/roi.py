"""Illustrative labor-effort sensitivity analysis, not a financial forecast."""
from app.utils.models import WorkflowIntelligence, AgentSuitabilityScore, ROIAssumptions, ROIEstimate, ROIScenario

_AUTOMATABLE = {"High": 0.7, "Medium": 0.45, "Low": 0.2, "Not Suitable": 0.0}
_AGENT_COUNT = {"High": 4, "Medium": 2, "Low": 1, "Not Suitable": 0}


def estimate_roi(intel: WorkflowIntelligence, score: AgentSuitabilityScore,
                 assumptions: ROIAssumptions | None = None) -> ROIEstimate:
    inputs = assumptions or ROIAssumptions()
    minutes = intel.steps * inputs.minutes_per_step + intel.decision_points * inputs.minutes_per_decision
    automation = _AUTOMATABLE[score.classification] * (0.8 if score.requires_hitl else 1)
    agents = _AGENT_COUNT[score.classification]
    build_cost = agents * inputs.implementation_cost_per_agent
    scenarios = []
    for name, multiplier in (("conservative", 0.75), ("base", 1.0), ("optimistic", 1.15)):
        fraction = round(min(automation * multiplier, 1), 4)
        hours = intel.volume_per_day * inputs.working_days_per_year * minutes * fraction / 60
        gross_savings = round(hours * inputs.loaded_hourly_rate)
        savings_basis = gross_savings - (inputs.annual_operating_cost or 0)
        scenarios.append(ROIScenario(
            name=name, automation_multiplier=multiplier, automatable_fraction=fraction,
            hours_saved_per_year=round(hours), cost_saved_per_year=gross_savings,
            implementation_cost=build_cost,
            annual_net_savings=savings_basis if inputs.annual_operating_cost is not None else None,
            payback_months=round(build_cost / savings_basis * 12, 1) if build_cost > 0 and savings_basis > 0 else None,
            roi_multiple=round(savings_basis / build_cost, 1) if build_cost > 0 else None,
        ))
    base = scenarios[1]
    return ROIEstimate(
        **base.model_dump(exclude={"name", "automation_multiplier", "annual_net_savings"}),
        assumption_inputs=inputs, scenarios=scenarios,
        estimate_basis="Illustrative gross labor effort, not guaranteed cash savings. " +
                       ("Supplied operating costs are included in net savings, payback and multiple."
                        if inputs.annual_operating_cost is not None else
                        "Operating costs excluded; net savings are unknown."),
        assumptions=(
            f"{intel.volume_per_day}/day x {inputs.working_days_per_year} days; "
            f"{inputs.minutes_per_step} min/step + {inputs.minutes_per_decision} min/decision "
            f"= {minutes:g} min/item. Tier automation {_AUTOMATABLE[score.classification]:.0%}, "
            f"HITL multiplier {0.8 if score.requires_hitl else 1}; base {base.automatable_fraction:.1%}. "
            f"${inputs.loaded_hourly_rate:g}/hour; {agents} illustrative build units at "
            f"${inputs.implementation_cost_per_agent:,}/unit. "
            "Sensitivity varies automation only (0.75x / 1x / 1.15x), not statistical confidence. "
            + ("Operating costs excluded; net savings unknown." if inputs.annual_operating_cost is None
               else f"Annual operating cost ${inputs.annual_operating_cost:,} included in payback and ROI multiple.")
        ),
    )
