from datetime import datetime, timedelta, timezone
import hashlib
import re
import secrets
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.database.tenant_directory import DirectoryRecord, TeamRole, not_found, tenant_directory
from app.security.auth import principal_context
from app.security.guardrails import redact_pii
from app.utils.errors import ConcurrentUpdate
from app.utils.models import SessionId

router = APIRouter()
IdentityId = Annotated[str, Field(pattern=r"^(?:[a-f0-9]{64}|local-demo)$", max_length=64)]
InviteId = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
Cursor = Annotated[str, Query(max_length=512, pattern=r"^[A-Za-z0-9_:-]*$")]
Limit = Annotated[int, Query(ge=1, le=100)]
# Invite codes are "<organization_id>.<secret>"; only sha256(secret) is stored.
INVITE_CODE = re.compile(r"([A-Za-z0-9][A-Za-z0-9_-]{0,99})\.([A-Za-z0-9_-]{43})")
ROLE_RANK = {"member": 0, "admin": 1, "owner": 2}


class NameRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(min_length=1, max_length=100)


class MemberRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["admin", "member"] = "member"
    active: bool = True
    version: str | None = Field(default=None, min_length=1, max_length=256)


class TeamMemberRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    roles: list[TeamRole] = Field(min_length=1, max_length=3)
    active: bool = True
    version: str | None = Field(default=None, min_length=1, max_length=256)


class InviteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["admin", "member"] = "member"
    team_id: SessionId | None = None
    team_roles: list[TeamRole] = Field(default_factory=list, max_length=3)
    expires_in_hours: int = Field(default=168, ge=1, le=720)
    max_uses: int = Field(default=1, ge=1, le=100)

    @model_validator(mode="after")
    def team_scope(self):
        if bool(self.team_id) != bool(self.team_roles):
            raise ValueError("team_id and team_roles must be supplied together.")
        return self


class RedeemRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    code: str = Field(min_length=1, max_length=200)


def expected_version(current, version):
    if (current.version if current else None) != version:
        raise ConcurrentUpdate()


@router.post("/organizations", status_code=201)
def create_organization(req: NameRequest):
    organization = str(uuid4())
    record = DirectoryRecord(id="organization", organization_id=organization,
                             document_type="organization", name=redact_pii(req.name))
    member = DirectoryRecord(id=f"member-{principal_context.get().owner_id}", organization_id=organization,
                             document_type="org_member", identity_id=principal_context.get().owner_id,
                             role="owner", generation=str(uuid4()))
    tenant_directory.write([record, member])
    return {"organization_id": organization, "name": record.name, "role": "owner"}


@router.get("/organizations")
def organizations(cursor: Cursor = "", limit: Limit = 50):
    records, next_cursor = tenant_directory.page("org_member", identity=principal_context.get().owner_id,
                                               cursor=cursor, limit=limit)
    items = []
    for member in records:
        if member.active:
            organization = tenant_directory.get(member.organization_id, "organization")
            if organization and organization.active:
                items.append({"organization_id": organization.organization_id, "name": organization.name,
                              "role": member.role})
    return {"items": items, "next_cursor": next_cursor}


@router.get("/organizations/{organization_id}/teams")
def teams(organization_id: SessionId, cursor: Cursor = "", limit: Limit = 50):
    tenant_directory.membership(organization_id)
    records, next_cursor = tenant_directory.page("team", organization=organization_id, cursor=cursor, limit=limit)
    items = []
    for record in records:
        try:
            permissions = tenant_directory.permissions(organization_id, record.team_id)
        except HTTPException as exc:
            if exc.status_code == 404:
                continue
            raise
        items.append({"team_id": record.team_id, "name": record.name, "permissions": sorted(permissions)})
    return {"items": items, "next_cursor": next_cursor}


@router.post("/organizations/{organization_id}/teams", status_code=201)
def create_team(organization_id: SessionId, req: NameRequest):
    tenant_directory.require_admin(organization_id)
    team = str(uuid4())
    record = DirectoryRecord(id=f"team-{team}", organization_id=organization_id, team_id=team,
                             document_type="team", name=redact_pii(req.name))
    tenant_directory.write([record])
    return {"team_id": team, "name": record.name}


@router.get("/organizations/{organization_id}/members")
def members(organization_id: SessionId, cursor: Cursor = "", limit: Limit = 50):
    tenant_directory.require_admin(organization_id)
    records, next_cursor = tenant_directory.page("org_member", organization=organization_id, cursor=cursor, limit=limit)
    return {"items": [record.model_dump() for record in records], "next_cursor": next_cursor}


@router.put("/organizations/{organization_id}/members/{identity_id}")
def set_member(organization_id: SessionId, identity_id: IdentityId, req: MemberRequest):
    actor = tenant_directory.require_admin(organization_id)
    current = tenant_directory.get(organization_id, f"member-{identity_id}")
    if current and current.role == "owner":
        raise HTTPException(409, "The founding owner cannot be removed or changed in this phase.")
    if actor.role != "owner" and (req.role == "admin" or (current and current.role == "admin")):
        raise HTTPException(403, "Only the founding owner can manage administrators.")
    expected_version(current, req.version)
    record = DirectoryRecord(
        id=f"member-{identity_id}", organization_id=organization_id, document_type="org_member",
        identity_id=identity_id, role=req.role, active=req.active, version=req.version or "",
        generation=current.generation if current and current.active else str(uuid4()))
    tenant_directory.write([record])
    return {"status": "updated"}


@router.get("/organizations/{organization_id}/teams/{team_id}/members")
def team_members(organization_id: SessionId, team_id: SessionId, cursor: Cursor = "", limit: Limit = 50):
    tenant_directory.require_admin(organization_id)
    if not tenant_directory.get(organization_id, f"team-{team_id}"):
        not_found()
    records, next_cursor = tenant_directory.page("team_member", organization=organization_id, team=team_id,
                                               cursor=cursor, limit=limit)
    items = []
    for record in records:
        member = tenant_directory.get(organization_id, f"member-{record.identity_id}")
        items.append({**record.model_dump(), "effective_active": bool(
            record.active and member and member.active and record.generation == member.generation)})
    return {"items": items, "next_cursor": next_cursor}


@router.put("/organizations/{organization_id}/teams/{team_id}/members/{identity_id}")
def set_team_member(organization_id: SessionId, team_id: SessionId, identity_id: IdentityId, req: TeamMemberRequest):
    tenant_directory.require_admin(organization_id)
    member = tenant_directory.get(organization_id, f"member-{identity_id}")
    if not member or not member.active or not tenant_directory.get(organization_id, f"team-{team_id}"):
        not_found()
    current = tenant_directory.get(organization_id, f"grant-{team_id}-{identity_id}")
    expected_version(current, req.version)
    record = DirectoryRecord(
        id=f"grant-{team_id}-{identity_id}", organization_id=organization_id, team_id=team_id,
        document_type="team_member", identity_id=identity_id, roles=sorted(set(req.roles)),
        active=req.active, generation=member.generation, version=req.version or "")
    tenant_directory.write([record])
    return {"status": "updated"}

def invite_status(record: DirectoryRecord, now: datetime) -> str:
    if not record.active:
        return "revoked"
    if record.uses >= record.max_uses:
        return "used"
    if datetime.fromisoformat(record.expires_at) <= now:
        return "expired"
    return "active"


def invite_view(record: DirectoryRecord) -> dict:
    return {"invite_id": record.invite_id, "role": record.role, "team_id": record.team_id or None,
            "team_roles": record.roles, "expires_at": record.expires_at, "max_uses": record.max_uses,
            "uses": record.uses, "created_by": record.identity_id,
            "status": invite_status(record, datetime.now(timezone.utc))}


def invalid_invite():
    raise HTTPException(404, "This invite link is invalid, expired, revoked, or already used.")


@router.post("/organizations/{organization_id}/invites", status_code=201)
def create_invite(organization_id: SessionId, req: InviteRequest):
    actor = tenant_directory.require_admin(organization_id)
    if actor.role != "owner" and req.role == "admin":
        raise HTTPException(403, "Only the founding owner can invite administrators.")
    if req.team_id:
        team = tenant_directory.get(organization_id, f"team-{req.team_id}")
        if not team or not team.active:
            not_found()
    secret = secrets.token_urlsafe(32)
    invite_id = hashlib.sha256(secret.encode()).hexdigest()
    expires = datetime.now(timezone.utc) + timedelta(hours=req.expires_in_hours)
    record = DirectoryRecord(
        id=f"invite-{invite_id}", organization_id=organization_id, document_type="invite", invite_id=invite_id,
        identity_id=actor.identity_id, role=req.role, team_id=req.team_id or "", roles=sorted(set(req.team_roles)),
        expires_at=expires.isoformat(timespec="seconds"), max_uses=req.max_uses)
    tenant_directory.write([record])
    # The code is returned exactly once and cannot be recovered from the stored hash.
    return {**invite_view(record), "code": f"{organization_id}.{secret}"}


@router.get("/organizations/{organization_id}/invites")
def invites(organization_id: SessionId, cursor: Cursor = "", limit: Limit = 50):
    tenant_directory.require_admin(organization_id)
    records, next_cursor = tenant_directory.page("invite", organization=organization_id, cursor=cursor, limit=limit)
    return {"items": [invite_view(record) for record in records], "next_cursor": next_cursor}


@router.delete("/organizations/{organization_id}/invites/{invite_id}")
def revoke_invite(organization_id: SessionId, invite_id: InviteId):
    actor = tenant_directory.require_admin(organization_id)
    current = tenant_directory.get(organization_id, f"invite-{invite_id}")
    if not current:
        not_found()
    if actor.role != "owner" and current.role == "admin":
        raise HTTPException(403, "Only the founding owner can revoke administrator invites.")
    if current.active:
        tenant_directory.write([current.model_copy(update={"active": False})])
    return {"status": "revoked"}


@router.post("/invites/redeem")
def redeem_invite(req: RedeemRequest):
    match = INVITE_CODE.fullmatch(req.code)
    if not match:
        invalid_invite()
    organization_id, secret = match.groups()
    invite = tenant_directory.get(organization_id, f"invite-{hashlib.sha256(secret.encode()).hexdigest()}")
    organization = tenant_directory.get(organization_id, "organization") if invite else None
    if not invite or invite_status(invite, datetime.now(timezone.utc)) != "active" \
            or not organization or not organization.active:
        invalid_invite()

    identity = principal_context.get().owner_id
    current = tenant_directory.get(organization_id, f"member-{identity}")
    changes: list[DirectoryRecord] = []
    if current and current.active:
        member = current
        if ROLE_RANK[invite.role] > ROLE_RANK[current.role]:
            member = current.model_copy(update={"role": invite.role})
            changes.append(member)
    else:
        # New or previously revoked members get a fresh generation, so stale team grants stay inactive.
        member = DirectoryRecord(
            id=f"member-{identity}", organization_id=organization_id, document_type="org_member",
            identity_id=identity, role=invite.role, generation=str(uuid4()),
            version=current.version if current else "")
        changes.append(member)

    team_id = None
    if invite.team_id:
        team = tenant_directory.get(organization_id, f"team-{invite.team_id}")
        if team and team.active:
            team_id = invite.team_id
            grant = tenant_directory.get(organization_id, f"grant-{team_id}-{identity}")
            effective = bool(grant and grant.active and grant.generation == member.generation)
            existing = set(grant.roles) if effective else set()
            roles = existing | set(invite.roles)
            if roles != existing:
                changes.append(DirectoryRecord(
                    id=f"grant-{team_id}-{identity}", organization_id=organization_id, team_id=team_id,
                    document_type="team_member", identity_id=identity, roles=sorted(roles),
                    generation=member.generation, version=grant.version if grant else ""))

    result = {"organization_id": organization_id, "name": organization.name, "role": member.role, "team_id": team_id}
    if not changes:
        return {**result, "status": "already_member"}
    # Consuming the invite uses its version, so concurrent redemptions cannot exceed max_uses.
    tenant_directory.write([invite.model_copy(update={"uses": invite.uses + 1}), *changes])
    return {**result, "status": "joined"}
