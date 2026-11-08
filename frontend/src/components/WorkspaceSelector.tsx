import { useEffect, useState } from "react";
import { api, teamWorkspace, type DirectoryPage, type Organization, type Team, type WorkspaceSelection } from "../api";
import { Button } from "./ui";

const empty = <T,>(): DirectoryPage<T> => ({ items: [], next_cursor: null });

export default function WorkspaceSelector({ selection, disabled, onSelect, onManageAccess }: {
  selection: WorkspaceSelection | null; disabled: boolean;
  onSelect: (value: WorkspaceSelection | null) => void;
  onManageAccess: () => void;
}) {
  const [organizations, setOrganizations] = useState(empty<Organization>);
  const [organization, setOrganization] = useState(selection?.organization_id || "");
  const [teams, setTeams] = useState(empty<Team>);
  const [organizationBusy, setOrganizationBusy] = useState(true);
  const [teamBusy, setTeamBusy] = useState(false);
  const [organizationError, setOrganizationError] = useState("");
  const [teamError, setTeamError] = useState("");
  const [organizationRevision, setOrganizationRevision] = useState(0);
  const [teamRevision, setTeamRevision] = useState(0);
  const selectedOrganization = organizations.items.find(item => item.organization_id === organization);
  const activeTeam = selection?.organization_id === organization ? selection.team_id : "";

  useEffect(() => {
    let cancelled = false;
    setOrganizationBusy(true); setOrganizationError("");
    void (async () => {
      try {
        const result = await api.organizations();
        const current = selection && !result.items.some(item => item.organization_id === selection.organization_id)
          ? await api.organization(selection.organization_id) : null;
        if (!cancelled) setOrganizations(current ? { ...result, items: [current, ...result.items] } : result);
      } catch (e) {
        if (!cancelled) setOrganizationError(e instanceof Error ? e.message : "Could not load your organizations.");
      } finally { if (!cancelled) setOrganizationBusy(false); }
    })();
    return () => { cancelled = true; };
  }, [selection, organizationRevision]);

  useEffect(() => {
    let cancelled = false;
    setTeams(empty()); setTeamError("");
    if (!organization) { setTeamBusy(false); return; }
    setTeamBusy(true);
    api.teams(organization).then(result => { if (!cancelled) setTeams(result); })
      .catch((e: Error) => { if (!cancelled) setTeamError(e.message); })
      .finally(() => { if (!cancelled) setTeamBusy(false); });
    return () => { cancelled = true; };
  }, [organization, teamRevision]);

  async function moreOrganizations() {
    if (!organizations.next_cursor) return;
    setOrganizationBusy(true); setOrganizationError("");
    try {
      const next = await api.organizations(organizations.next_cursor);
      setOrganizations({ ...next, items: [...organizations.items,
        ...next.items.filter(item => !organizations.items.some(current => current.organization_id === item.organization_id))] });
    } catch (e) {
      setOrganizationError(e instanceof Error ? e.message : "Could not load more organizations.");
    } finally { setOrganizationBusy(false); }
  }

  async function moreTeams() {
    if (!teams.next_cursor) return;
    setTeamBusy(true); setTeamError("");
    try {
      const next = await api.teams(organization, teams.next_cursor);
      setTeams({ ...next, items: [...teams.items,
        ...next.items.filter(item => !teams.items.some(current => current.team_id === item.team_id))] });
    } catch (e) {
      setTeamError(e instanceof Error ? e.message : "Could not load more teams.");
    } finally { setTeamBusy(false); }
  }

  return <section aria-label="Workspace filter" className="surface-card">
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h2 className="section-title">Choose your workspace</h2>
        <p className="text-xs text-zinc-500 mt-1.5">Filter workflows and discovery engagements by organization and team.</p>
      </div>
      <Button variant="ghost" disabled={disabled || organizationBusy || teamBusy} onClick={onManageAccess}>Manage access</Button>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm min-w-0">Workspace organization
        <select className="form-control block mt-2 w-full" value={organization}
          disabled={disabled || organizationBusy || teamBusy && !!teams.next_cursor} onChange={event => {
            const id = event.target.value;
            setOrganization(id);
            if (!id && selection) onSelect(null);
          }}>
          <option value="">Personal workspace</option>
          {selection && !organizations.items.some(item => item.organization_id === selection.organization_id)
            && <option value={selection.organization_id} disabled>{selection.organization_name} (current)</option>}
          {organizations.items.map(item => <option key={item.organization_id} value={item.organization_id}>{item.name}</option>)}
        </select>
      </label>
      <label className="block text-sm min-w-0">Workspace team
        <select className="form-control block mt-2 w-full" value={activeTeam}
          disabled={disabled || organizationBusy || teamBusy || !organization || !selectedOrganization}
          onChange={event => {
            const team = teams.items.find(item => item.team_id === event.target.value);
            if (team && selectedOrganization) {
              if (organization !== selection?.organization_id || team.team_id !== selection?.team_id)
                onSelect(teamWorkspace(selectedOrganization, team));
            }
            else setTeamError("This team is unavailable. Refresh your teams before switching.");
          }}>
          <option value="" disabled>{organization ? "Choose a team" : "Personal records only"}</option>
          {activeTeam && !teams.items.some(item => item.team_id === activeTeam)
            && <option value={activeTeam} disabled>{selection?.team_name} (current)</option>}
          {teams.items.map(item => <option key={item.team_id} value={item.team_id}
            disabled={!item.permissions.includes("read")}>{item.name}{!item.permissions.includes("write") ? " (read-only)" : ""}</option>)}
        </select>
      </label>
    </div>
    {(organizationBusy || teamBusy) && <p role="status" className="text-xs text-zinc-500 mt-3">
      {organizationBusy ? "Loading your organizations..." : "Loading accessible teams..."}</p>}
    {!organizationBusy && !organizationError && !organizations.items.length
      && <p className="text-xs text-zinc-500 mt-3">No organization memberships yet. Use personal workspace, or ask an administrator for an invitation.</p>}
    {!teamBusy && organization && !teamError && !teams.items.length
      && <p className="text-xs text-zinc-500 mt-3">No accessible teams in this organization. Ask an administrator to grant team access.</p>}
    {organization && organization !== selection?.organization_id
      && <p className="notice mt-3">Choose a team to switch. Your current workspace remains {selection ? `${selection.organization_name} / ${selection.team_name}` : "Personal workspace"}.</p>}
    <div className="flex flex-wrap gap-2 mt-3">
      {organizations.next_cursor && <Button variant="ghost" disabled={disabled || organizationBusy}
        onClick={() => void moreOrganizations()}>Load more organizations</Button>}
      {teams.next_cursor && <Button variant="ghost" disabled={disabled || teamBusy}
        onClick={() => void moreTeams()}>Load more teams</Button>}
      {organizationError && <><p role="alert" className="notice text-rose-800">{organizationError}</p>
        <Button variant="ghost" disabled={disabled || organizationBusy} onClick={() => setOrganizationRevision(value => value + 1)}>Retry organizations</Button></>}
      {teamError && <><p role="alert" className="notice text-rose-800">{teamError}</p>
        <Button variant="ghost" disabled={disabled || teamBusy} onClick={() => setTeamRevision(value => value + 1)}>Retry teams</Button></>}
    </div>
  </section>;
}
