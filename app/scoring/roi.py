"""Optional capacity-first business value; unknown inputs never become financial facts."""
from app.utils.models import WorkflowIntelligence, AgentSuitabilityScore, ROIAssumptions, ROIEstimate


def estimate_roi(intel: WorkflowIntelligence, score: AgentSuitabilityScore,
                 assumptions: ROIAssumptions | None = None) -> ROIEstimate:
    inputs = assumptions or ROIAssumptions()
    result = ROIEstimate(assumption_inputs=inputs)
    if inputs.mode == "deferred":
        result.assumptions = "Business value deferred: validate during the pilot. Technical analysis does not require financial estimates."
        return result

    missing = []
    if inputs.working_days_per_year is None:
        missing.append("working_days_per_year")
    efforts = inputs.roles or [inputs]
    saved_minutes, priced_minutes = 0.0, 0.0
    priced = True
    for index, effort in enumerate(efforts):
        prefix = f"roles[{index}]." if inputs.roles else ""
        for field in ("manual_minutes_per_item", "effort_reduction_percent"):
            if getattr(effort, field) is None:
                missing.append(prefix + field)
        if effort.manual_minutes_per_item is None or effort.effort_reduction_percent is None:
            continue
        minutes = effort.manual_minutes_per_item * effort.effort_reduction_percent / 100
        saved_minutes += minutes
        if effort.loaded_hourly_rate is None:
            priced = False
        else:
            priced_minutes += minutes * effort.loaded_hourly_rate
    if not missing:
        annual_items = intel.volume_per_day * inputs.working_days_per_year
        hours = annual_items * saved_minutes / 60
        result.hours_saved_per_year = round(hours, 2)
        result.capacity_value_per_year = round(annual_items * priced_minutes / 60, 2) if priced else None
        result.fte_capacity = round(hours / inputs.productive_hours_per_fte, 2) if inputs.productive_hours_per_fte else None
    result.status = "incomplete" if missing else "estimated"
    result.missing_inputs = missing
    result.implementation_cost = inputs.implementation_cost
    result.annual_cash_savings = inputs.annual_cash_savings
    result.annual_avoided_hiring_value = inputs.annual_avoided_hiring_value
    result.service_improvements = inputs.service_improvements
    if inputs.annual_cash_savings is not None and inputs.annual_operating_cost is not None:
        result.annual_net_cash_benefit = round(inputs.annual_cash_savings - inputs.annual_operating_cost, 2)
        if inputs.implementation_cost is not None and inputs.implementation_cost > 0:
            result.roi_multiple = round(result.annual_net_cash_benefit / inputs.implementation_cost, 2)
            if result.annual_net_cash_benefit > 0:
                result.payback_months = round(inputs.implementation_cost / result.annual_net_cash_benefit * 12, 1)
    result.assumptions = (
        f"Reported volume {intel.volume_per_day}/day; operating days/year: "
        f"{inputs.working_days_per_year if inputs.working_days_per_year is not None else 'unknown'}. "
        "Hours = volume x operating days x human minutes/item x supplied effort reduction / 60, summed by role when provided. "
        "Role entries replace workflow-average effort and rate inputs. Reduction is user-supplied, never inferred from suitability. "
        "FTE-years represent distributed capacity, not removable positions. Capacity value is not realized cash savings. "
        "Cash payback uses only separately supplied cash savings minus known operating costs; avoided hiring is reported separately. "
        "Unknowns remain unknown; no illustrative build units, provider prices or sensitivity percentages are invented."
    )
    return result
