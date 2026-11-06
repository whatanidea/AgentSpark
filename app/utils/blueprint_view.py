import re
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ArchitectureStep(BaseModel):
    title: str = Field(min_length=1, max_length=70)
    kind: Literal["software", "ai", "human"]
    purpose: str = Field(min_length=1, max_length=180)
    receives: str = Field(min_length=1, max_length=140)
    produces: str = Field(min_length=1, max_length=140)
    control: str = Field(min_length=1, max_length=200)
    components: list[Literal["compute", "database", "ai", "search", "orchestration", "systems"]] = Field(max_length=3)


class ArchitectureChoice(BaseModel):
    component: Literal["compute", "database"]
    why: str = Field(min_length=1, max_length=240)
    alternative: str = Field(min_length=1, max_length=120)
    tradeoff: str = Field(min_length=1, max_length=240)


class DeliveryMilestone(BaseModel):
    title: str = Field(min_length=1, max_length=70)
    acceptance: str = Field(min_length=1, max_length=240)


class ArchitectureView(BaseModel):
    version: Literal["architecture-view-v1"] = "architecture-view-v1"
    outcome: str = Field(min_length=1, max_length=280)
    why: str = Field(min_length=1, max_length=400)
    flow: list[ArchitectureStep] = Field(min_length=4, max_length=7)
    choices: list[ArchitectureChoice] = Field(min_length=2, max_length=2)
    milestones: list[DeliveryMilestone] = Field(min_length=3, max_length=3)

    @model_validator(mode="after")
    def connected_handoffs(self):
        for previous, following in zip(self.flow, self.flow[1:]):
            if previous.produces.strip().casefold() != following.receives.strip().casefold():
                raise ValueError("Each step must receive the preceding step's named output.")
        if len({choice.component for choice in self.choices}) != 2:
            raise ValueError("Compute and database each require one distinct trade-off.")
        if any(len(set(step.components)) != len(step.components) for step in self.flow):
            raise ValueError("A step cannot repeat component references.")
        return self


def narrative_text(value: str) -> str:
    """Repair double-escaped paragraph/list breaks, not source evidence or code."""
    text = value.replace(r"\n\n", "\n\n")
    return re.sub(r"\\n(?=(?:#{1,6}\s|[-*]\s|\d+[.)]\s))", "\n", text)
