from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from app.database.tenant_directory import DirectoryRecord, TeamRole, not_found, tenant_directory
from app.security.auth import principal_context
from app.security.guardrails import redact_pii
from app.utils.errors import ConcurrentUpdate
from app.utils.models import SessionId

router = APIRouter()
IdentityId = Annotated[str, Field(pattern=r"^(?:[a-f0-9]{64}|local-demo)$", max_length=64)]
Cursor = Annotated[str, Query(max_length=512, pattern=r"^[A-Za-z0-9_:-]*$")]
Limit = Annotated[int, Query(ge=1, le=100)]


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
