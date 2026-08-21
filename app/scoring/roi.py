"""
ROI engine — converts a workflow profile + readiness score into hard numbers.

Turns "agents are valuable here" into hours saved, dollars saved, implementation
cost, payback period, and an ROI multiple — the language enterprise buyers and
judges actually evaluate. All assumptions are explicit and tunable; nothing is
hard-coded magic.
"""
from app.utils.models import WorkflowIntelligence, AgentSuitabilityScore, ROIEstimate

# Tunable assumptions (documented for transparency).
WORKING_DAYS = 250
LOADED_HOURLY_RATE = 45          # USD, fully-loaded knowledge-worker cost
BASE_MINUTES_PER_STEP = 1.5      # manual handling minutes per workflow step
MINUTES_PER_DECISION = 2.0       # extra minutes per human decision point
IMPL_COST_PER_AGENT = 12000      # rough build+integrate cost per specialist agent

# How much of the manual effort agents can realistically absorb, by readiness tier.
_AUTOMATABLE = {"High": 0.7, "Medium": 0.45, "Low": 0.2, "Not Suitable": 0.0}
# Agents typically involved by tier (drives implementation cost).
_AGENT_COUNT = {"High": 4, "Medium": 2, "Low": 1, "Not Suitable": 0}


def estimate_roi(intel: WorkflowIntelligence, score: AgentSuitabilityScore) -> ROIEstimate:
    minutes_per_item = (intel.steps * BASE_MINUTES_PER_STEP) + (intel.decision_points * MINUTES_PER_DECISION)
    minutes_per_item = max(minutes_per_item, 1.0)

    automatable = _AUTOMATABLE.get(score.classification, 0.2)
    # A required human gate trims realizable automation (review overhead).
    if score.requires_hitl:
        automatable *= 0.8

    items_per_year = max(intel.volume_per_day, 0) * WORKING_DAYS
    hours_saved = (items_per_year * minutes_per_item * automatable) / 60.0
    cost_saved = hours_saved * LOADED_HOURLY_RATE

    n_agents = _AGENT_COUNT.get(score.classification, 1)
    impl_cost = max(n_agents * IMPL_COST_PER_AGENT, 1)

    payback_months = round((impl_cost / cost_saved) * 12, 1) if cost_saved > 0 else 0.0
    roi_multiple = round(cost_saved / impl_cost, 1) if impl_cost > 0 else 0.0

    assumptions = (
        f"{intel.volume_per_day}/day × {WORKING_DAYS} days, ~{minutes_per_item:.1f} min/item manual, "
        f"{int(automatable*100)}% automatable at ${LOADED_HOURLY_RATE}/hr; "
        f"{n_agents}-agent build at ${IMPL_COST_PER_AGENT:,}/agent."
    )

    return ROIEstimate(
        automatable_fraction=round(automatable, 2),
        hours_saved_per_year=int(hours_saved),
        cost_saved_per_year=int(cost_saved),
        implementation_cost=int(impl_cost),
        payback_months=payback_months,
        roi_multiple=roi_multiple,
        assumptions=assumptions,
    )
