from operator import eq, gt, lt
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr, model_validator

from app.utils.models import AutonomyLevel, GovernanceDecision


PolicyField = Literal[
    "autonomy_level", "requires_hitl", "classification", "compliance", "security",
    "data_sensitivity", "confidence", "first_year_net_savings", "operational_risk",
]

_VALUES = {
    "autonomy_level": {"Autonomous", "Supervised", "Assisted", "Manual"},
    "classification": {"High", "Medium", "Low", "Not Suitable"},
    "compliance": {"HIGH", "MEDIUM", "LOW"},
    "security": {"PASS", "FAIL"},
    "data_sensitivity": {"RESTRICTED", "CONFIDENTIAL", "INTERNAL"},
    "operational_risk": {"HIGH", "MEDIUM", "LOW"},
}
_OPERATORS = {"eq": eq, "lt": lt, "gt": gt}


class GovernanceInputs(BaseModel):
    autonomy_level: AutonomyLevel
    requires_hitl: bool
    classification: Literal["High", "Medium", "Low", "Not Suitable"]
    compliance: Literal["HIGH", "MEDIUM", "LOW"]
    security: Literal["PASS", "FAIL"]
    data_sensitivity: Literal["RESTRICTED", "CONFIDENTIAL", "INTERNAL"]
    confidence: int = Field(ge=0, le=100)
    first_year_net_savings: int
    operational_risk: Literal["HIGH", "MEDIUM", "LOW"]


class PolicyCondition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field: PolicyField
    operator: Literal["eq", "lt", "gt"]
    value: StrictStr | StrictInt | StrictBool

    @model_validator(mode="after")
    def validate_comparison(self):
        if self.field in ("confidence", "first_year_net_savings"):
            if type(self.value) is not int:
                raise ValueError(f"{self.field} requires an integer value")
            if self.field == "confidence" and not 0 <= self.value <= 100:
                raise ValueError("confidence thresholds must be between 0 and 100")
        elif self.field == "requires_hitl":
            if type(self.value) is not bool or self.operator != "eq":
                raise ValueError("requires_hitl requires an eq comparison with a boolean")
        elif self.operator != "eq" or self.value not in _VALUES[self.field]:
            raise ValueError(f"Invalid comparison for {self.field}")
        return self

    def matches(self, inputs: GovernanceInputs) -> bool:
        return _OPERATORS[self.operator](getattr(inputs, self.field), self.value)


class GovernancePolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    conditions: list[PolicyCondition] = Field(min_length=1)
    decision: GovernanceDecision
    reason: str = Field(min_length=1)

    def matches(self, inputs: GovernanceInputs) -> bool:
        return all(condition.matches(inputs) for condition in self.conditions)


class GovernancePolicies(BaseModel):
    model_config = ConfigDict(extra="forbid")

    policies: list[GovernancePolicy]
    default_decision: GovernanceDecision

    @model_validator(mode="after")
    def unique_ids(self):
        ids = [policy.id for policy in self.policies]
        if len(ids) != len(set(ids)):
            raise ValueError("Governance policy IDs must be unique")
        return self
