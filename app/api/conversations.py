"""Private conversation API. Model output never performs a workflow write."""
import asyncio
from datetime import timedelta
import json
import logging
import os
from threading import BoundedSemaphore, RLock
from time import monotonic
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import Field, ValidationError

from app.database.conversations import can_create, conversation_store as store, scope
from app.database.cosmos_client import db_client
from app.security.guardrails import redact_pii, scan_input
from app.utils import conversation_generation as generation
from app.utils.conversations import (
    DISCOVERY_FIELDS, INTAKE_FIELDS, Conversation, Creation, Draft, Kind, Link, Message, Model,
    Pending, Source, digest, now,
)
from app.utils.errors import ConcurrentUpdate, DependencyUnavailable, InvalidDependencyResponse, WorkflowNotFound
from app.utils.model_catalog import model_definition
from app.utils.models import ConversationOrigin, DiscoveryEngagement, DiscoverySource, EnterpriseContext, SessionId, WorkflowState

router = APIRouter(prefix="/conversations", tags=["conversations"])
logger = logging.getLogger(__name__)
slots = BoundedSemaphore(4)
rate_lock = RLock()
recent = {}


class NewRequest(Model):
    model_id: Literal["azure-openai", "demo"]


class Version(Model):
    version: str = Field(min_length=1, max_length=1000)


class Rename(Version):
    title: str = Field(min_length=1, max_length=100)


class Turn(Version):
    id: SessionId
    message: str = Field(min_length=1, max_length=4000)


class Stop(Model):
    id: SessionId


class Preview(Version):
    kind: Kind


class Edited(Version):
    draft_id: SessionId
    fields: dict[str, str] = Field(max_length=12)


class Confirm(Version):
    draft_id: SessionId
    digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    reviewed: bool


def response(chat):
    return {**chat.model_dump(mode="json", exclude={"owner_id", "organization_id", "team_id", "creation"}),
            "version": chat._etag, "can_create": can_create(),
            "creation_pending": bool(chat.creation)}


def checked(identifier, version):
    chat = store.read(identifier)
    if chat._etag != version:
        raise ConcurrentUpdate()
    return chat


def unlocked(chat):
    if chat.pending or chat.creation:
        raise HTTPException(409, "Finish or stop the pending response/confirmed handoff before changing its context.")


def quota(chat):
    timestamp = monotonic()
    key = (chat.owner_id, chat.organization_id, chat.team_id)
    limits = [(key, 60 if chat.model.id == "demo" else 8)]
    if chat.organization_id:
        limits.append((("organization", chat.organization_id, ""), 120 if chat.model.id == "demo" else 32))
    with rate_lock:
        for existing in list(recent):
            recent[existing] = [item for item in recent[existing] if timestamp - item < 60]
            if not recent[existing]:
                del recent[existing]
        if any(len(recent.get(identifier, [])) >= limit for identifier, limit in limits):
            raise HTTPException(429, "Chat request limit reached. Wait a minute before retrying.", headers={"Retry-After": "60"})
        for identifier, _ in limits:
            recent.setdefault(identifier, []).append(timestamp)


def safe(value):
    if not scan_input(value).safe:
        raise HTTPException(422, "Chat context contains instruction-override content. Please rephrase.")
    return redact_pii(value)


@router.get("")
def listing(cursor: Annotated[str, Query(max_length=100, pattern=r"^[A-Za-z0-9_-]*$")] = "",
            limit: Annotated[int, Query(ge=1, le=50)] = 30):
    chats, cursor = store.listing(cursor, limit)
    return {"items": [{"id": chat.id, "title": chat.title, "created_at": chat.created_at,
                       "updated_at": chat.updated_at, "expires_at": chat.expires_at} for chat in chats], "cursor": cursor}


@router.post("")
def create(req: NewRequest):
    owner, organization, team = scope()
    model = model_definition(req.model_id)
    chat = Conversation(owner_id=owner, organization_id=organization, team_id=team, model=model)
    quota(chat)
    store.save(chat)
    return response(chat)


@router.get("/{identifier}")
def get(identifier: SessionId):
    return response(store.read(identifier))


@router.patch("/{identifier}")
def rename(identifier: SessionId, req: Rename):
    chat = checked(identifier, req.version)
    title = safe(req.title)
    if len(title) > 100:
        raise HTTPException(422, "The privacy-screened title exceeds 100 characters. Shorten it before retrying.")
    chat.title = title
    store.save(chat)
    return response(chat)


@router.delete("/{identifier}")
def delete(identifier: SessionId, version: Annotated[str, Query(min_length=1, max_length=1000)]):
    chat = checked(identifier, version)
    store.delete(chat)
    return {"status": "deleted"}


def prepare(identifier, req):
    chat = checked(identifier, req.version)
    text = safe(req.message)
    if len(text) > 4000:
        raise HTTPException(422, "The privacy-screened message exceeds 4000 characters. Shorten it before retrying.")
    if any(message.reply_to == req.id for message in chat.messages):
        if not any(message.id == req.id and message.role == "user" and message.content == text for message in chat.messages):
            raise HTTPException(409, "This request ID already belongs to a different message.")
        return chat, False
    unlocked(chat)
    matches = [message for message in chat.messages if message.id == req.id]
    if matches:
        if chat.messages[-1].id != req.id or matches[0].content != text or not matches[0].interrupted:
            raise HTTPException(409, "Only the last interrupted user message can be retried.")
        matches[0].interrupted = False
    else:
        if len(chat.messages) >= 119 or sum(message.role == "user" for message in chat.messages) >= 60:
            raise HTTPException(409, "Conversation turn limit reached. Start another conversation.")
        chat.messages.append(Message(id=req.id, role="user", content=text))
    quota(chat)
    chat.pending = Pending(id=req.id)
    chat.draft = None
    chat.suggestion = None
    if len(chat.messages) == 1 and chat.title == "New conversation":
        chat.title = text[:80]
    store.save(chat)
    return chat, True


def interrupt(identifier, generation_id):
    try:
        chat = store.read(identifier)
        if chat.pending and chat.pending.generation == generation_id:
            chat.messages[-1].interrupted = True
            chat.pending = None
            store.save(chat)
    except (WorkflowNotFound, ConcurrentUpdate):
        logger.info("Interrupted chat no longer exists or changed; no retry write performed.")
    except DependencyUnavailable:
        logger.error("Could not save chat interruption. Explicit Stop/recovery is required.")


@router.post("/{identifier}/stop")
def stop(identifier: SessionId, req: Stop):
    chat = store.read(identifier)
    if chat.pending:
        if chat.pending.id != req.id:
            raise HTTPException(409, "A different response is active. Reload this conversation.")
        chat.messages[-1].interrupted = True
        chat.pending = None
        store.save(chat)
    return response(chat)


def event(kind, **values):
    return json.dumps({"kind": kind, **values}, separators=(",", ":")) + "\n"


async def generate(chat):
    identifier, reservation = chat.id, chat.pending
    try:
        async with asyncio.timeout(75):
            accepted = await asyncio.to_thread(store.read, identifier)
            if not accepted.pending or accepted.pending.generation != reservation.generation:
                raise HTTPException(409, "Response stopped or superseded. Reload saved messages.")
            yield event("accepted", version=accepted._etag, title=accepted.title,
                        message=accepted.messages[-1].model_dump(mode="json"), pending=accepted.pending.model_dump(mode="json"))
            yield event("stage", label=f"Reading {len(generation.context(chat))} recent messages")
            yield event("stage", label="Curating your response")
            output, last_check = "", 0
            async for delta in generation.reply(chat):
                if monotonic() - last_check > 1:
                    current = await asyncio.to_thread(store.read, identifier)
                    if not current.pending or current.pending.generation != reservation.generation:
                        raise HTTPException(409, "Response stopped or superseded. Reload saved messages.")
                    last_check = monotonic()
                output += delta
                if len(output) > 6000:
                    raise DependencyUnavailable("openai", "The response exceeded safe limits. Retry a narrower question.")
                yield event("delta", text=delta)
            if not output.strip():
                raise DependencyUnavailable("openai", "The model returned an empty reply. Retry the message.")
            yield event("stage", label="Checking possible next steps")
            suggestion = await generation.suggest(chat)
            yield event("stage", label="Saving your private conversation")
            current = await asyncio.to_thread(store.read, identifier)
            if not current.pending or current.pending.generation != reservation.generation:
                raise HTTPException(409, "Response stopped or superseded. Reload saved messages.")
            current.messages.append(Message(id=str(uuid4()), role="assistant", content=output.strip(), reply_to=reservation.id))
            current.pending = None
            current.suggestion = suggestion
            await asyncio.to_thread(store.save, current)
            yield event("result", data=await asyncio.to_thread(response, current))
    except asyncio.CancelledError:
        await asyncio.shield(asyncio.to_thread(interrupt, identifier, reservation.generation))
        raise
    except (DependencyUnavailable, WorkflowNotFound, ConcurrentUpdate, HTTPException, TimeoutError) as exc:
        await asyncio.to_thread(interrupt, identifier, reservation.generation)
        status = exc.status_code if isinstance(exc, HTTPException) else 404 if isinstance(exc, WorkflowNotFound) else (
            409 if isinstance(exc, ConcurrentUpdate) else 502 if isinstance(exc, InvalidDependencyResponse) else 503)
        detail = exc.detail if isinstance(exc, HTTPException) else str(exc) if not isinstance(exc, TimeoutError) else (
            "Response time limit reached. Retry the interrupted message.")
        yield event("error", status=status, detail=detail)
    except Exception as exc:
        logger.error("Unexpected chat generation failure (%s); content withheld.", type(exc).__name__)
        await asyncio.to_thread(interrupt, identifier, reservation.generation)
        yield event("error", status=500, detail="The response could not finish. Reload and retry the interrupted message.")
    finally:
        slots.release()


@router.post("/{identifier}/messages")
async def send(identifier: SessionId, req: Turn):
    if not slots.acquire(blocking=False):
        raise HTTPException(429, "Chat is busy. Retry shortly.", headers={"Retry-After": "10"})
    try:
        chat, started = await asyncio.to_thread(prepare, identifier, req)
    except BaseException:
        slots.release()
        raise
    if not started:
        slots.release()

        async def completed():
            yield event("result", data=await asyncio.to_thread(response, chat))
        stream = completed()
    else:
        stream = generate(chat)
    return StreamingResponse(stream, media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


@router.post("/{identifier}/dismiss")
def dismiss(identifier: SessionId, req: Version):
    chat = checked(identifier, req.version)
    unlocked(chat)
    if chat.suggestion:
        if chat.suggestion.kind not in chat.dismissed:
            chat.dismissed.append(chat.suggestion.kind)
        chat.suggestion = None
    store.save(chat)
    return response(chat)


def require_launch(chat):
    unlocked(chat)
    if not can_create():
        raise HTTPException(403, "Your current workspace role cannot create shared workflows.")
    if chat.link:
        raise HTTPException(409, "This conversation already has a workflow. Open it or start a new conversation.")


def field_values(kind, fields):
    limits = DISCOVERY_FIELDS if kind == "discovery" else INTAKE_FIELDS
    if set(fields) != set(limits):
        raise HTTPException(422, "The preview must contain exactly the supported fields.")
    for name, value in fields.items():
        if len(value) > limits[name]:
            raise HTTPException(422, f"{name} exceeds the supported field length.")
    fields = {name: safe(value) for name, value in fields.items()}
    if kind == "discovery":
        if any(not fields[name] for name in ("title", "objective", "business_units", "sponsor", "engagement_owner")):
            raise HTTPException(422, "Complete the title, objective, business units, sponsor and engagement owner.")
        try:
            DiscoveryEngagement.model_validate(fields)
        except ValidationError as exc:
            raise HTTPException(422, "The Discovery preview contains unsupported values.") from exc
    else:
        from app.api.routes import IntakeRequest
        try:
            IntakeRequest(session_id="validation", **fields)
        except ValidationError as exc:
            raise HTTPException(422, "Complete business domain, team size, compliance and a valid target cloud/region.") from exc
        if fields["target_cloud"] not in ("azure", "aws"):
            raise HTTPException(422, "Choose Azure or AWS explicitly.")
    return fields


@router.post("/{identifier}/preview")
async def preview(identifier: SessionId, req: Preview):
    chat = await asyncio.to_thread(checked, identifier, req.version)
    await asyncio.to_thread(require_launch, chat)
    if not chat.messages:
        raise HTTPException(422, "Describe your process before preparing a context preview.")
    quota(chat)
    if not slots.acquire(blocking=False):
        raise HTTPException(429, "Chat is busy. Retry shortly.")
    try:
        async with asyncio.timeout(30):
            limits = DISCOVERY_FIELDS if req.kind == "discovery" else INTAKE_FIELDS
            captures = await generation.extract(chat, req.kind, limits)
        fields = dict.fromkeys(limits, "")
        for capture in captures.fields:
            fields[capture.field] = capture.value
        sources = list({(capture.message_id, capture.quote): Source(
            message_id=capture.message_id, quote=capture.quote) for capture in captures.fields}.values())
        if not sources:
            message = next(message for message in reversed(chat.messages) if message.role == "user")
            sources = [Source(message_id=message.id, quote=message.content[:1000])]
        draft = Draft(kind=req.kind, fields=fields, captures=captures.fields, sources=sources,
                      expires_at=min(now() + timedelta(minutes=10), chat.expires_at))
        draft.digest = digest(draft.model_dump(mode="json", exclude={"digest"}))
        chat.draft = draft
        await asyncio.to_thread(store.save, chat)
        return await asyncio.to_thread(response, chat)
    except TimeoutError as exc:
        raise DependencyUnavailable("openai", "Draft preparation timed out. Your chat is unchanged; retry.") from exc
    finally:
        slots.release()


@router.put("/{identifier}/preview")
def edit(identifier: SessionId, req: Edited):
    chat = checked(identifier, req.version)
    require_launch(chat)
    if not chat.draft or chat.draft.id != req.draft_id or chat.draft.expires_at <= now():
        raise HTTPException(409, "The preview expired or changed. Prepare it again.")
    chat.draft.fields = field_values(chat.draft.kind, req.fields)
    chat.draft.digest = digest(chat.draft.model_dump(mode="json", exclude={"digest"}))
    store.save(chat)
    return response(chat)


def workflow(chat, creation):
    draft = creation.draft
    fields = field_values(draft.kind, draft.fields)
    origin = ConversationOrigin(conversation_id=chat.id, draft_id=draft.id, digest=draft.digest,
                                reviewed_by=chat.owner_id, reviewed_at=creation.confirmed_at, fields=fields,
                                sources=[DiscoverySource(
                                    id=f"conversation.{source.message_id}.{digest(source.quote)[:12]}", label="Reviewed chat excerpt (unverified)",
                                    statement=source.quote, source_reference=f"Chat {chat.id}; user message {source.message_id}",
                                    basis="self_reported", review_status="not_reviewed") for source in draft.sources])
    state = WorkflowState(session_id=creation.workflow_id, record_kind="discovery" if draft.kind == "discovery" else "assessment",
                          owner_id=chat.owner_id, organization_id=chat.organization_id or None,
                          team_id=chat.team_id or None, inference_model=chat.model, conversation_origin=origin)
    state.expires_at = creation.workflow_expires_at
    db_client._authorize(state, "write")
    if draft.kind == "discovery":
        state.discovery = DiscoveryEngagement.model_validate(fields)
        state.discovery_created_at = creation.confirmed_at
        state.discovery_import_sources = origin.sources
    else:
        state.enterprise_context = EnterpriseContext.model_validate(fields)
    return state


@router.post("/{identifier}/confirm")
def confirm(identifier: SessionId, req: Confirm):
    chat = store.read(identifier)
    if chat.link:
        if chat.link.draft_id != req.draft_id or chat.link.digest != req.digest:
            raise HTTPException(409, "This conversation already has a different confirmed handoff.")
        state = db_client.get_workflow_state(chat.link.workflow_id,
                                            expected_kind="discovery" if chat.link.kind == "discovery" else "assessment")
        db_client._authorize(state, "read")
        return response(chat)
    if not req.reviewed:
        raise HTTPException(422, "Explicitly approve copying the reviewed context into a separately retained workflow.")
    if not can_create():
        raise HTTPException(403, "Your current workspace role cannot create shared workflows.")
    if chat.pending:
        raise HTTPException(409, "Stop or finish the response before confirming context.")
    if chat.creation:
        creation = chat.creation
        if creation.draft.id != req.draft_id or creation.draft.digest != req.digest:
            raise HTTPException(409, "Another preview was already confirmed. Finish its creation first.")
    else:
        if chat._etag != req.version:
            raise ConcurrentUpdate()
        if not chat.draft or chat.draft.id != req.draft_id or chat.draft.digest != req.digest or chat.draft.expires_at <= now():
            raise HTTPException(409, "The preview expired or changed. Review it again.")
        field_values(chat.draft.kind, chat.draft.fields)
        confirmed_at = now()
        retention = timedelta(days=30) if chat.draft.kind == "discovery" else timedelta(
            hours=int(os.getenv("SESSION_RETENTION_HOURS", "24")))
        creation = Creation(draft=chat.draft.model_copy(deep=True), confirmed_at=confirmed_at,
                            workflow_expires_at=confirmed_at + retention)
        chat.creation = creation
        store.save(chat)
    expected = "discovery" if creation.draft.kind == "discovery" else "assessment"
    try:
        state = db_client.get_workflow_state(creation.workflow_id, expected_kind=expected)
    except WorkflowNotFound:
        state = workflow(chat, creation)
        # Expired reservations must not resurrect an expired/deleted completed workflow.
        if state.expires_at <= now():
            raise HTTPException(409, "The confirmed workflow's retention has elapsed; it cannot be recreated.")
        store.create_workflow(state, chat, creation)
    if (not state.conversation_origin or state.conversation_origin.conversation_id != chat.id
            or state.conversation_origin.draft_id != creation.draft.id or state.conversation_origin.digest != creation.draft.digest):
        raise HTTPException(409, "The workflow does not match this confirmed preview.")
    chat.link = Link(kind=creation.draft.kind, workflow_id=state.session_id, draft_id=creation.draft.id,
                     digest=creation.draft.digest, created_at=creation.confirmed_at)
    chat.creation = None
    chat.draft = None
    chat.suggestion = None
    store.save(chat)
    return response(chat)
