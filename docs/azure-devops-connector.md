# Read-only Azure DevOps connector

The hosted Microsoft-sign-in workspace can read real Azure DevOps projects and
work items, then turn selected sources into a user-reviewed discovery engagement.
The [local simulator](azure-devops-simulator.md) remains separate and local-only.
There is no hosted delivery handoff or external work-item creation, update or deletion.

## First use

1. Sign in to AgentSpark using **Microsoft sign-in**. Manual app-token sign-in
   does not establish a Microsoft account for source authorization.
2. Open **Integrations**, or **Start discovery from connector** in Discovery.
3. Choose **Connect Microsoft account** and review Microsoft's delegated consent.
   The signed-in account needs access to the Azure DevOps organization and project.
   Tenant policy may require administrator approval; the connector does not bypass it.
4. A workspace administrator enters an organization slug or
   `https://dev.azure.com/organization`, selects **Find projects**, chooses a
   project and saves the source connection. Projects are paginated.
5. Select **Read work items**, optionally load additional pages and choose up to
   20 items. **Continue to brief** saves selected snapshots, not an engagement.
6. Review and edit the brief. Unknown owners, baselines and benefits remain
   explicitly unknown; source ticket text does not establish process facts.
7. Review the final brief and sources, acknowledge it and select **Start discovery**.
   AgentSpark rechecks source access and content revisions before reserving creation,
   then opens the saved discovery at its next action.

Connection settings and history are separate from these three discovery steps.
Unsaved selections, connection settings and brief edits are guarded. Failed saves
retain edits. A changed or expired preview requires a fresh review; changed source
content requires a fresh import. Reviews expire after ten minutes.

## Identity and permissions

The SPA requests the Azure DevOps resource's delegated `.default` scope only on
the explicit Connect action. Subsequent source operations acquire tokens silently;
an expired authorization requiring interaction produces an actionable reconnect
error instead of opening a surprise popup.

The existing app registration must include **only** the Azure DevOps delegated
read permissions `vso.project` and `vso.work`, in addition to its existing app
sign-in permission. This implementation does not require `user_impersonation`,
PATs, client secrets, write permissions or application permissions. Check actual
resource scopes and tenant consent policy before configuring another environment;
do not substitute broader permissions silently.

App authentication stays in `Authorization`; the per-request source credential
is sent separately as `X-Azure-DevOps-Token`. Source credentials are held only in
MSAL memory and the outbound request. They are not stored in browser persistent
storage, connector documents, evidence, receipts or logs.

Workspace membership and permissions are checked on every app operation:

- Readers can inspect shared connector state and read sources with their own
  delegated access.
- Writers can prepare an import. Only its creator can edit or confirm that preview.
- Owners and administrators manage the workspace's source connection and clear
  connector data.

One connection and one active preview are shared per workspace. Personal state
is isolated by the authenticated owner; team state is isolated by organization
and team. A shared frozen snapshot remains visible to workspace readers even
when their own Azure DevOps access differs: review the copy-to-workspace notice
and choose the correct workspace before importing.

## Imported information and limits

Reads use fixed `dev.azure.com` endpoints, no redirects and bounded timeouts and
responses. The allowlist contains project lookup, WIQL **read queries** (which
use HTTP POST) and work-item GET operations. Browsing returns up to 50 items per
page, using descending work-item IDs rather than assuming a stable mutable offset.

Snapshots contain item ID, project/organization, title, description, item type,
state, revision, changed timestamp, source URL and a content digest. Descriptions
are converted from HTML to plain text, excluding script/style content. Imports
also record the importing app identity and time. Custom fields, comments,
attachments, identities and complete history are not imported.

Source strings pass the existing instruction-override and privacy-screening
pipeline. Unsupported, incomplete, oversized, moved or inaccessible records
produce explicit errors; the connector does not silently truncate source evidence
or substitute synthetic data. Imported claims remain unverified. No savings,
process map, AI suitability or opportunity is invented from the tickets.

Connector state uses the existing Cosmos workflows container with separate
workspace-scoped document IDs and a connector record discriminator, excluded
from ordinary assessment/discovery listings. Conditional ETag writes reject
stale updates. The serialized connector document is capped at 1 MB, with at most
20 creation receipts and 100 activity entries. At capacity, an administrator must
explicitly clear connector data; old entries are not silently dropped.

Connector state has a fixed 30-day expiry, not a sliding renewal on every read.
Saved discovery engagements have their own 30-day expiry from confirmed creation.
**Disconnect and clear connector data** removes connection/previews/receipts/
activity from connector state, but does not delete saved discovery engagements.
Normal discovery record deletion is separate. Clearing replaces the active
document; Cosmos backup retention follows the environment's existing policy.

## Confirmation and recovery

Creation is bound to the creator, frozen source content, reviewed brief digest,
connection revision and expiry. A durable reservation precedes the workflow save.
If the final response or receipt write fails, use **Finish creating discovery**.
The original frozen reservation is completed without duplicating discovery or
overwriting later human edits. Its source-access check already occurred before
reservation; recovery does not rebuild or refresh that confirmed snapshot.

Completed receipt retries do not restore an engagement deleted afterwards.
Pending creations block source changes and clearing until recovery completes.
Dependency failures are reported explicitly and do not sign users out merely
because a source token was denied.

## Verification boundary

Automated API and browser tests mock the external source transport and Microsoft
token acquisition. They verify authorization, read-only request shapes, source
safety, expiry/concurrency/recovery and the user-driven interface. They do **not**
prove access to an actual Azure DevOps organization. Live-source acceptance needs
an explicitly selected organization/project and a consenting user with access;
no organization is inferred from machine credentials or other connected tools.
