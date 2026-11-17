"""Private conversation contracts, independent of assessment interview state."""
from datetime import datetime, timedelta, timezone
import hashlib
import json
from typing import Literal
from uuid import uuid4

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, PrivateAttr, model_validator

from app.utils.models import InferenceModel, SessionId

Kind = Literal["discovery", "intake"]


def now():
    return datetime.now(timezone.utc)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Message(Model):
    id: SessionId
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=6000)
    at: AwareDatetime = Field(default_factory=now)
    reply_to: SessionId | None = None
    interrupted: bool = False


class Suggestion(Model):
    kind: Literal["discovery", "intake", "none"] = "none"
    reason: str = Field(default="", max_length=320)
    source_ids: list[SessionId] = Field(default_factory=list, max_length=6)


class Capture(Model):
    field: str = Field(max_length=100)
    value: str = Field(min_length=1, max_length=2000)
    message_id: SessionId
    quote: str = Field(min_length=1, max_length=800)


class Captures(Model):
    fields: list[Capture] = Field(default_factory=list, max_length=12)


class Pending(Model):
    id: SessionId
    generation: SessionId = Field(default_factory=lambda: str(uuid4()))
    started_at: AwareDatetime = Field(default_factory=now)


class Source(Model):
    message_id: SessionId
    quote: str = Field(min_length=1, max_length=1000)


class Draft(Model):
    id: SessionId = Field(default_factory=lambda: str(uuid4()))
    kind: Kind
    fields: dict[str, str] = Field(max_length=12)
    captures: list[Capture] = Field(default_factory=list, max_length=12)
    sources: list[Source] = Field(min_length=1, max_length=12)
    expires_at: AwareDatetime = Field(default_factory=lambda: now() + timedelta(minutes=10))
    digest: str = ""


class Creation(Model):
    draft: Draft
    workflow_id: SessionId = Field(default_factory=lambda: str(uuid4()))
    confirmed_at: AwareDatetime = Field(default_factory=now)
    workflow_expires_at: AwareDatetime


class Link(Model):
    kind: Kind
    workflow_id: SessionId
    draft_id: SessionId
    digest: str
    created_at: AwareDatetime


class Conversation(Model):
    _etag: str = PrivateAttr(default="")
    id: SessionId = Field(default_factory=lambda: "chat-t" + now().strftime("%Y%m%d%H%M%S%f") + "-" + str(uuid4()))
    owner_id: str
    organization_id: str = ""
    team_id: str = ""
    title: str = Field(default="New conversation", min_length=1, max_length=100)
    model: InferenceModel
    created_at: AwareDatetime = Field(default_factory=now)
    updated_at: AwareDatetime = Field(default_factory=now)
    expires_at: AwareDatetime = Field(default_factory=lambda data: data["created_at"] + timedelta(days=30))
    messages: list[Message] = Field(default_factory=list, max_length=120)
    pending: Pending | None = None
    suggestion: Suggestion | None = None
    dismissed: list[Kind] = Field(default_factory=list, max_length=2)
    draft: Draft | None = None
    creation: Creation | None = None
    link: Link | None = None

    @model_validator(mode="after")
    def fixed_expiry(self):
        if self.expires_at > self.created_at + timedelta(days=30):
            raise ValueError("Conversation expiry cannot exceed 30 days from creation.")
        return self


DISCOVERY_FIELDS = {
    "title": 200, "objective": 2000, "business_units": 1000, "sponsor": 200,
    "engagement_owner": 200, "required_topics": 2000, "excluded_topics": 2000, "success_measures": 1000,
}
INTAKE_FIELDS = {
    "business_domain": 200, "team_size": 30, "existing_systems": 4000, "pain_points": 8000,
    "compliance_requirements": 10, "target_cloud": 10, "preferred_region": 100,
    "data_residency_requirements": 2000, "deployment_constraints": 2000,
}
