"""Bounded, human-reviewed document claims; not independent verification."""
import json
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class DocumentMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    filename: str = Field(min_length=1, max_length=120, pattern=r"^[^/\\\x00-\x1f\x7f]+$")
    format: Literal["pdf", "docx"]
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    source_count: int = Field(ge=1, le=200)


class DocumentField(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    field_id: str = Field(min_length=1, max_length=100)
    value: str = Field(min_length=1, max_length=2000)
    quote: str = Field(min_length=1, max_length=500)
    location: str = Field(min_length=1, max_length=80)
    edited: bool = False


class DocumentApproval(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metadata: DocumentMetadata
    fields: list[DocumentField] = Field(min_length=1, max_length=50)
    context_approved: Literal[True]
    version: str | None = Field(default=None, min_length=1, max_length=1000)
    confirm_overwrite: bool = False

    @model_validator(mode="after")
    def bounded_unique(self):
        if len({field.field_id for field in self.fields}) != len(self.fields):
            raise ValueError("Choose only one proposal for each field; resolve conflicting values before approval.")
        try:
            size = len(json.dumps(self.model_dump(), ensure_ascii=False).encode("utf-8"))
        except UnicodeError as exc:
            raise ValueError("Approved context must contain valid UTF-8 text.") from exc
        if size > 32000:
            raise ValueError("Approved source excerpts exceed 32,000 bytes. Select fewer fields or shorten your edits.")
        return self


class ApprovedDocumentField(DocumentField):
    source: DocumentMetadata
    reviewed_by: str = Field(max_length=500)
    reviewed_at: datetime


class ApprovedDocument(BaseModel):
    metadata: DocumentMetadata
    fields: list[ApprovedDocumentField] = Field(max_length=50)
    approved_by: str = Field(max_length=500)
    approved_at: datetime
    verification: Literal["human_reviewed_unverified"] = "human_reviewed_unverified"


class DocumentExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidates: list[DocumentField] = Field(max_length=50)
