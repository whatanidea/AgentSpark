import { useEffect, useState } from "react";
import { api, type DirectoryMember, type DirectoryPage, type Organization, type Team, type TeamRole, type WorkspaceSelection } from "../api";
import { Button, Card, Pill } from "./ui";

const empty = <T,>(): DirectoryPage<T> => ({ items: [], next_cursor: null });

export default function Workspaces({ identity, demo, onSelect, onBusyChange }: {
  identity: string; demo: boolean; onSelect: (value: WorkspaceSelection | null) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [organizations, setOrganizations] = useState(empty<Organization>);
  const [organization, setOrganization] = useState("");
  const [teams, setTeams] = useState(empty<Team>);
  const [members, setMembers] = useState(empty<DirectoryMember>);
  const [grants, setGrants] = useState(empty<DirectoryMember>);
  const [grantTeam, setGrantTeam] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [memberId, setMemberId] = useState("");
  const [memberRole, setMemberRole] = useState<"admin" | "member">("member");
  const [memberActive, setMemberActive] = useState(true);
  const [grantId, setGrantId] = useState("");
  const [grantRoles, setGrantRoles] = useState<TeamRole[]>(["viewer"]);
  const [grantActive, setGrantActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selected = organizations.items.find(item => item.organization_id === organization);
  const admin = selected?.role === "owner" || selected?.role === "admin";

  async function run(action: () => Promise<void>) {
    setBusy(true); onBusyChange(true); setError(""); setMessage("");
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : "Workspace operation failed. Refresh before retrying."); }
    finally { setBusy(false); onBusyChange(false); }
  }

  async function scope(id: string, entries = organizations.items) {
    setOrganization(id); setTeams(empty()); setMembers(empty()); setGrants(empty()); setGrantTeam("");
    setMemberId(""); setGrantId(""); setMemberRole("member"); setMemberActive(true);
    setGrantRoles(["viewer"]); setGrantActive(true);
    const role = entries.find(item => item.organization_id === id)?.role;
    const [nextTeams, nextMembers] = await Promise.all([
      api.teams(id), role === "owner" || role === "admin" ? api.members(id) : Promise.resolve(empty<DirectoryMember>()),
    ]);
    setTeams(nextTeams); setMembers(nextMembers);
  }

  useEffect(() => {
    void run(async () => {
      const result = await api.organizations();
      setOrganizations(result);
      if (result.items[0]) await scope(result.items[0].organization_id, result.items);
    });
    return () => onBusyChange(false);
  }, [onBusyChange]);

  async function refresh() {
    const result = await api.organizations();
    setOrganizations(result);
    const id = result.items.some(item => item.organization_id === organization) ? organization : result.items[0]?.organization_id;
    if (id) await scope(id, result.items);
    else { setOrganization(""); setTeams(empty()); setMembers(empty()); setGrants(empty()); }
  }

  return <div className="space-y-6">
    <header className="page-header">
      <div className="eyebrow mb-2">Workspace administration</div>
      <h1>Organizations & teams</h1>
      <p className="mt-2">Manage membership and select a personal or team workspace.</p>
    </header>
    {demo && <p className="notice notice-warning">Shared local demo: everyone uses the same identity. These controls do not create private users. Independent reviewer testing requires separate verified identities.</p>}
    <Card title="Your identity">
      <label className="block text-sm">Signed-in identity ID
        <input readOnly className="form-control block mt-2 font-mono text-xs" value={identity} />
      </label>
      <p className="text-xs text-slate-500 mt-2">Share this ID with an organization administrator to request membership. Email invitations are not implemented.</p>
      <div className="flex flex-wrap gap-3 mt-4">
        <Button variant="ghost" disabled={busy} onClick={() => onSelect(null)}>Use personal workspace</Button>
        <Button variant="ghost" disabled={busy} onClick={() => void run(refresh)}>Refresh organizations</Button>
      </div>
    </Card>
    {error && <p role="alert" className="notice border-rose-200 text-rose-800 bg-rose-50">{error}</p>}
    {message && <p role="status" className="notice">{message}</p>}
    <Card title="Create organization" description="You become its founding owner. Owner transfer and organization deletion are deferred.">
      <form className="flex items-end gap-3 flex-wrap" onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          const created = await api.createOrganization(organizationName.trim());
          const items = [...organizations.items, created];
          setOrganizations({ ...organizations, items }); setOrganizationName("");
          await scope(created.organization_id, items);
        });
      }}>
        <label className="block text-sm flex-1 min-w-48">Organization name
          <input className="form-control block mt-2" required maxLength={100} value={organizationName}
            disabled={busy} onChange={event => setOrganizationName(event.target.value)} />
        </label>
        <Button disabled={busy || !organizationName.trim()} type="submit">Create organization</Button>
      </form>
    </Card>
    <Card title="Your organizations">
      {!organizations.items.length && <p className="text-sm text-slate-500">No organizations yet. Create one or ask an administrator to add your identity.</p>}
      {organizations.items.length > 0 && <label className="block text-sm">Organization
        <select className="form-control block mt-2" disabled={busy} value={organization}
          onChange={event => void run(() => scope(event.target.value))}>
          {organizations.items.map(item => <option key={item.organization_id} value={item.organization_id}>{item.name} ({item.role})</option>)}
        </select>
      </label>}
      {organizations.next_cursor && <Button variant="ghost" disabled={busy} className="mt-3" onClick={() => void run(async () => {
        const next = await api.organizations(organizations.next_cursor!);
        setOrganizations({ ...next, items: [...organizations.items, ...next.items] });
      })}>Load more organizations</Button>}
    </Card>
    {selected && <>
      <Card title="Teams" description="Team access is checked by the server on every workflow request.">
        <div className="space-y-3">
          {teams.items.map(team => <div key={team.team_id} className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 rounded-xl p-4">
            <div><p className="font-semibold text-sm">{team.name}</p><p className="text-xs text-slate-500 mt-1">{team.permissions.join(" / ")}</p></div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="ghost" disabled={busy} onClick={() => onSelect({
                organization_id: organization, team_id: team.team_id, organization_name: selected.name, team_name: team.name,
                permissions: { read: team.permissions.includes("read"), write: team.permissions.includes("write"),
                  review: team.permissions.includes("review"), delete: team.permissions.includes("delete") },
              })}>Use {team.name}</Button>
              {admin && <Button variant="ghost" disabled={busy} onClick={() => void run(async () => {
                setGrantTeam(team.team_id); setGrantId(""); setGrantRoles(["viewer"]); setGrantActive(true);
                setGrants(await api.teamMembers(organization, team.team_id));
              })}>Manage {team.name} roles</Button>}
            </div>
          </div>)}
          {!teams.items.length && <p className="text-sm text-slate-500">No accessible teams. Administrators can create one or grant you team access.</p>}
        </div>
        {teams.next_cursor && <Button variant="ghost" disabled={busy} className="mt-3" onClick={() => void run(async () => {
          const next = await api.teams(organization, teams.next_cursor!);
          setTeams({ ...next, items: [...teams.items, ...next.items] });
        })}>Load more teams</Button>}
        {admin && <form className="flex gap-3 items-end flex-wrap mt-5" onSubmit={event => {
          event.preventDefault(); void run(async () => {
            await api.createTeam(organization, teamName.trim()); setTeamName("");
            setTeams(await api.teams(organization));
          });
        }}>
          <label className="block text-sm flex-1 min-w-48">Team name
            <input className="form-control block mt-2" required maxLength={100} disabled={busy} value={teamName}
              onChange={event => setTeamName(event.target.value)} />
          </label><Button type="submit" disabled={busy || !teamName.trim()}>Create team</Button>
        </form>}
      </Card>
      {admin && <Card title="Organization members" description="Owners manage administrators. Administrators manage ordinary membership. The founding owner cannot be removed.">
        <div className="space-y-2">
          {members.items.map(member => <div key={member.identity_id} className="border border-slate-200 rounded-lg p-3 flex flex-wrap gap-3 items-center justify-between">
            <div className="min-w-0"><p className="font-mono text-xs break-all">{member.identity_id}</p>
              <p className="text-xs text-slate-500 mt-1">{member.role} / {member.active ? "active" : "revoked"}</p></div>
            {member.role !== "owner" && <Button variant="ghost" disabled={busy} onClick={() => {
              setMemberId(member.identity_id); setMemberRole(member.role === "admin" ? "admin" : "member"); setMemberActive(member.active);
            }}>Edit member {member.identity_id.slice(0, 8)}</Button>}
          </div>)}
        </div>
        {members.next_cursor && <Button variant="ghost" disabled={busy} className="mt-3" onClick={() => void run(async () => {
          const next = await api.members(organization, members.next_cursor!);
          setMembers({ ...next, items: [...members.items, ...next.items] });
        })}>Load more members</Button>}
        <form className="space-y-3 mt-5" onSubmit={event => {
          event.preventDefault(); void run(async () => {
            const current = members.items.find(item => item.identity_id === memberId.trim());
            await api.setMember(organization, memberId.trim(), memberRole, memberActive, current?.version);
            setMembers(await api.members(organization)); setMemberId("");
            setMessage("Organization membership saved. Revoked and re-added members need new team grants.");
          });
        }}>
          <label className="block text-sm">Member identity ID
            <input className="form-control block mt-2 font-mono text-xs" required maxLength={64} value={memberId}
              disabled={busy} onChange={event => setMemberId(event.target.value)} />
          </label>
          <label className="block text-sm">Organization role
            <select className="form-control block mt-2" value={memberRole} disabled={busy || selected.role !== "owner"}
              onChange={event => setMemberRole(event.target.value === "admin" ? "admin" : "member")}>
              <option value="member">Member</option><option value="admin">Administrator</option>
            </select>
          </label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={memberActive} disabled={busy}
            onChange={event => setMemberActive(event.target.checked)} />Membership active</label>
          <Button type="submit" disabled={busy || !memberId.trim()}>Save membership</Button>
        </form>
      </Card>}
      {admin && grantTeam && <Card title={`Team roles: ${teams.items.find(team => team.team_id === grantTeam)?.name || grantTeam}`}
        description="Contributors edit; reviewers decide; viewers read. Owners/admins can edit and delete, but need an explicit reviewer grant to review someone else's workflow.">
        <div className="space-y-2">{grants.items.map(grant => <div key={grant.identity_id} className="border border-slate-200 rounded-lg p-3">
          <p className="font-mono text-xs break-all">{grant.identity_id}</p>
          <div className="flex items-center gap-2 flex-wrap mt-2"><Pill tone={grant.effective_active ? "green" : "slate"}>{grant.effective_active ? "Active" : "Inactive / stale"}</Pill>
            <span className="text-xs">{grant.roles.join(", ")}</span>
            <Button variant="ghost" disabled={busy} onClick={() => { setGrantId(grant.identity_id); setGrantRoles(grant.roles); setGrantActive(grant.active); }}>Edit team grant {grant.identity_id.slice(0, 8)}</Button>
          </div>
        </div>)}</div>
        {grants.next_cursor && <Button variant="ghost" disabled={busy} className="mt-3" onClick={() => void run(async () => {
          const next = await api.teamMembers(organization, grantTeam, grants.next_cursor!);
          setGrants({ ...next, items: [...grants.items, ...next.items] });
        })}>Load more team grants</Button>}
        <form className="space-y-3 mt-5" onSubmit={event => {
          event.preventDefault(); void run(async () => {
            const current = grants.items.find(item => item.identity_id === grantId.trim());
            await api.setTeamMember(organization, grantTeam, grantId.trim(), grantRoles, grantActive, current?.version);
            setGrants(await api.teamMembers(organization, grantTeam)); setTeams(await api.teams(organization)); setGrantId("");
            setMessage("Team roles saved. Team workflow creators cannot approve or reject their own workflows.");
          });
        }}>
          <label className="block text-sm">Team member identity ID
            <input className="form-control block mt-2 font-mono text-xs" required maxLength={64} disabled={busy}
              value={grantId} onChange={event => setGrantId(event.target.value)} />
          </label>
          <fieldset disabled={busy} className="flex flex-wrap gap-4"><legend className="text-sm mb-2">Team roles</legend>
            {(["contributor", "reviewer", "viewer"] as const).map(role => <label key={role} className="flex gap-2 text-sm">
              <input type="checkbox" checked={grantRoles.includes(role)} onChange={event => setGrantRoles(
                event.target.checked ? [...grantRoles, role] : grantRoles.filter(value => value !== role))} />{role}
            </label>)}
          </fieldset>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={grantActive} disabled={busy}
            onChange={event => setGrantActive(event.target.checked)} />Team grant active</label>
          <Button type="submit" disabled={busy || !grantId.trim() || !grantRoles.length}>Save team roles</Button>
        </form>
      </Card>}
    </>}
  </div>;
}
