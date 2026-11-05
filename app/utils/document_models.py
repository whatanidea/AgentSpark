"""Bounded, human-reviewed document claims; not independent verification."""
import json
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class DocumentMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    filename: str = Field(min_length=1, max_length=120, pattern=r"^[^/\\\x00-\x1f\x7f]+$")
    format: Literal["pdf", "docx"]
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    source_count: int = Field(ge=1, le=200)


class SourceExcerpt(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    quote: str = Field(min_length=1, max_length=500)
    location: str = Field(min_length=1, max_length=80)


class DocumentField(SourceExcerpt):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    field_id: str = Field(min_length=1, max_length=100)
    value: str = Field(min_length=1, max_length=2000)
    quote: str = Field(min_length=1, max_length=500)
    location: str = Field(min_length=1, max_length=80)
    edited: bool = False
    count_basis: Literal["literal", "number_words", "decision_ordinals"] = "literal"
    supporting_quotes: list[SourceExcerpt] = Field(default_factory=list, max_length=2)


class SourceUnit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    location: str = Field(min_length=1, max_length=80)
    text: str = Field(min_length=1, max_length=40000)


class DocumentSource(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metadata: DocumentMetadata
    units: list[SourceUnit] = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def bounded_text(self):
        if sum(len(unit.text) for unit in self.units) > 40000:
            raise ValueError("Document source exceeds 40,000 characters.")
        if len({unit.location for unit in self.units}) != len(self.units):
            raise ValueError("Document source locations must be unique.")
        if len(self.model_dump_json(include={"metadata", "units"}).encode("utf-8")) > 200000:
            raise ValueError("Document source exceeds its 200,000-byte budget.")
        return self


class RetainedDocumentSource(DocumentSource):
    excluded_fields: list[str] = Field(default_factory=list, max_length=64)
    checks: dict[str, Literal["found", "not_found", "conflict", "needs_confirmation"]] = Field(default_factory=dict, max_length=64)
    conflicts: list[DocumentField] = Field(default_factory=list, max_length=50)


class DocumentAnswerCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    value: str = Field(min_length=1, max_length=2000)
    source_ids: list[Annotated[str, Field(pattern=r"^s[0-9]{1,4}$")]] = Field(min_length=1, max_length=3)
    count_basis: Literal["literal", "number_words", "decision_ordinals"] = "literal"


class DocumentAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    field_id: str = Field(min_length=1, max_length=100)
    status: Literal["found", "not_found", "conflict", "needs_confirmation"]
    candidates: list[DocumentAnswerCandidate] = Field(default_factory=list, max_length=4)

    @model_validator(mode="after")
    def consistent_answer(self):
        expected = 0 if self.status in ("not_found", "needs_confirmation") else 1 if self.status == "found" else 2
        if (self.status != "conflict" and len(self.candidates) != expected) or (
                self.status == "conflict" and len({field.value for field in self.candidates}) < expected):
            raise ValueError("Document answer status and candidates disagree.")
        return self


class DocumentAnswers(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answers: list[DocumentAnswer] = Field(max_length=64)


class DocumentApproval(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metadata: DocumentMetadata
    fields: list[DocumentField] = Field(max_length=50)
    context_approved: Literal[True]
    version: str | None = Field(default=None, min_length=1, max_length=1000)
    confirm_overwrite: bool = False
    source: DocumentSource | None = None
    excluded_fields: list[str] = Field(default_factory=list, max_length=64)

    @model_validator(mode="after")
    def bounded_unique(self):
        if not self.fields and self.source is None:
            raise ValueError("Approve at least one proposal or retain document text for question-level lookup.")
        if len({field.field_id for field in self.fields}) != len(self.fields):
            raise ValueError("Choose only one proposal for each field; resolve conflicting values before approval.")
        try:
            size = len(json.dumps(self.model_dump(exclude={"source"}), ensure_ascii=False).encode("utf-8"))
        except UnicodeError as exc:
            raise ValueError("Approved context must contain valid UTF-8 text.") from exc
        if size > 32000:
            raise ValueError("Approved source excerpts exceed 32,000 bytes. Select fewer fields or shorten your edits.")
        if self.source and self.source.metadata != self.metadata:
            raise ValueError("Retained source must match the approved document.")
        return self


class ApprovedDocumentField(DocumentField):
    source: DocumentMetadata
    reviewed_by: str = Field(max_length=500)
    reviewed_at: datetime
    capture: Literal["human_reviewed", "document_lookup"] = "human_reviewed"


class ApprovedDocument(BaseModel):
    metadata: DocumentMetadata
    fields: list[ApprovedDocumentField] = Field(max_length=50)
    approved_by: str = Field(max_length=500)
    approved_at: datetime
    verification: Literal["human_reviewed_unverified"] = "human_reviewed_unverified"


class DocumentExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidates: list[DocumentField] = Field(max_length=50)
