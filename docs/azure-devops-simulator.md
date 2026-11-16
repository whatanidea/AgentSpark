# Azure DevOps integration simulator

This is a local integration workflow, not a real Azure DevOps connector.
It is available only when AgentSpark runs in demo mode with local-demo
authentication outside production. Live/OIDC environments return HTTP 404 for
these endpoints and do not show the navigation entry. No credentials, account
URLs, network calls, real work items or new cloud services are involved.

## Try it

Follow the existing [local instructions](../README.md#run-locally). Open
`/workspace` and choose **Integrations**. Local demo uses a shared identity, not
private users.

1. Once, an administrator configures a fictional project and allowed work-item
   types in **Connection settings**. Manual imports and snapshot inspection also
   remain available there; discovery does not require that extra step.
2. Open **Start discovery**, or choose **Start discovery from connector** in
   Discovery. Select synthetic work items once and choose **Continue to brief**.
   One atomic action imports the selection and prepares a draft; it creates no
   engagement.
3. Edit the engagement title and business objective. Expand **Scope, ownership
   and success measures** to shape the remaining charter. Choose **Review before
   starting** to save those edits and review the complete brief and source labels.
   Technical evidence and provenance are collapsed but available.
4. Explicitly acknowledge the reviewed brief and choose **Start discovery**.
   AgentSpark opens the created engagement and focuses its overview/next action,
   without a separate receipt-opening click. The existing workflow supports
   stakeholder inputs, evidence review, source-linked synthesis and findings.
   No AI synthesis runs automatically.
5. Alternatively, open **Delivery handoff**, choose a completed assessment from
   the current workspace, and preview delivery work. If none exists, complete
   the normal fictional assessment journey first. Inspect the exact hierarchy
   and descriptions, acknowledge them, and explicitly confirm creating
   **local simulated work items**.
6. Open **History & details** for receipts and activity. Previews can be
   discarded without creation. Refreshing or restarting preserves connector
   data, but not process-local active discovery records.

Unsaved source selections, brief edits and configuration changes have navigation
guards. You can go back to sources, resume a saved brief or edit before confirming.
Revising a saved brief produces a new confirmation ID/digest and clears the
acknowledgement; it cannot change the frozen source evidence. Discovery does not
depend on loading the approved-assessment list used by delivery.

Importing alone does not change discovery engagements or assessments. Creating
discovery is a separate preview-and-confirm action. Its deterministic draft uses
the selected items as investigation material, not proof of process facts, savings
or AI suitability. Sponsor, owner, business units and measured baselines remain
explicitly unknown. Process steps, stakeholder answers and opportunities are not
invented. The workflow-opportunity discussion guide helps collect missing context
and compare AI and non-AI approaches; there is no automatic process mining.

Frozen sources are server-owned fields on the normal discovery record, separate
from its editable charter. Each preserves the complete imported snapshot,
including project, work-item ID/type/state, revision, fictional source timestamp,
source reference, importer, import time and content digest. Source labels remain
synthetic and unverified. Imported text passes the existing instruction-override
screening and privacy redaction before preview; it is never executable agent
instructions. Normal source review, synthesis freshness and findings export use
these sources. A human reviewer check does not turn synthetic data into real
operational evidence. Later imports, connection changes and simulator resets do
not rewrite the copied discovery evidence.

The handoff is an intentionally bounded validation skeleton: an Epic, a Feature, up to
three saved readiness-check Tasks and one outcome-review Task. It uses the
assessment's pilot scope, boundaries, success metrics and failure handling when
available. Unknowns remain explicit. It does not parse a generated roadmap or
invent estimates, owners or deadlines.

## Scope and permissions

- Personal connector state is keyed by the authenticated owner. Team state is
  keyed by organization **and** team, selected using the existing workspace
  mechanism.
- Every request rechecks current membership and team permissions. Headers select
  scope but do not grant access.
- Organization owners/administrators configure and reset a team's simulator.
  Contributors with write permission can import and prepare/confirm handoffs.
  Viewers can inspect but cannot mutate state.
- Only a preview's creator can edit its brief, confirm or discard it.
- Discovery creation requires current workspace write permission; read-only
  users cannot preview, confirm or resume creation. Opening a created engagement
  uses the normal discovery authorization checks in its original workspace.
- Assessments must belong to the exact selected workspace and remain accessible,
  unexpired and completed. Rejected, pending, discovery and unknown records are
  not eligible. A policy-completed assessment can be used without inventing a
  human approval; handoff confirmation is a separate action.
- A do-not-proceed executive recommendation blocks delivery handoff. Other
  recommendations are not silently reclassified as AI pilots.
- Decision archives alone do not authorize a handoff after the active assessment
  has expired. Assessment sessions retain their existing process-local demo
  behavior; a restart can leave an archived decision whose active session is no
  longer available.

## Consistency and duplicate prevention

Configuration, imports, preview preparation/revision, cancellation and reset require the
current connector version; stale writes return HTTP 409. Configuration changes
clear imports and pending previews, retaining existing receipts. Import refreshes
also invalidate both discovery and delivery previews.

A discovery preview expires after ten minutes and binds the exact draft,
creator, project/connection revision and selected imported snapshot digest.
Preparing from selected work items saves imports and the preview in one
transaction: a validation or activity-capacity failure leaves neither partially
saved. Brief revision accepts only the eight editable charter fields, rechecks
creator/expiry/source binding and issues a new preview ID/digest.
Confirmation accepts only its ID, digest and strict boolean `true`. Selected
snapshots are rechecked before a durable creation reservation is recorded.
Creation is serialized within the local demo process. The SQLite reservation
keeps a frozen draft, source evidence, fixed expiry and one engagement ID before
the process-local discovery save. A failed/interrupted save or lost response can
be retried without creating duplicates or overwriting subsequent human edits.
Pending reservations appear with a **Finish creating discovery** action. A
completed receipt never silently restores a deleted, expired or restart-lost
engagement. Selecting a fresh draft is an intentional new creation, not a retry.

A preview expires after ten minutes and binds the creator, fictional project,
connection revision, assessment version, analysis ID and exact proposed work
items. Confirmation accepts only its ID, SHA-256 digest and an explicit boolean
confirmation; clients cannot substitute item fields or recipients.

The current assessment is rechecked at confirmation. Source edits, rejection,
expiry, revoked access, destination changes and missing/expired previews prevent
creation. Confirmations are serialized in one local SQLite transaction.
Replaying the same confirmation returns the recorded receipt without duplicating
items, including concurrent or lost-response retries. A second preview for the
same assessment analysis and fictional project is rejected after confirmation.
These guarantees apply to this local simulator, not to an unimplemented remote
Azure DevOps transaction.

## Persistence, retention and limits

Local connector state uses a separate SQLite sidecar beside `DEMO_ARCHIVE_PATH`:
`<archive-stem>.integrations.sqlite3`. No Cosmos containers or infrastructure are
changed. Frozen import sources and their creation reference are optional fields
on the existing workflow model, populated by this local-only creation flow.
SQLite uses the same explicit dependency-error pattern as existing local stores.

Data has a fixed 30-day expiry from the first saved state or explicit reset.
Reads, imports, configuration edits and handoffs do not extend it. Expired
connector rows are purged on the next store operation. Reset clears that
workspace's configuration, snapshots, pending previews, receipts and activity;
it never deletes assessments, decision archives or discovery engagements.
Deleting a local receipt does not delete anything in a real external system:
there are no external writes in this feature.

Created discovery engagements have their own fixed 30-day expiry from confirmed
creation, independent of the connector's earlier expiry. Like existing discovery,
their demo storage is process-local: restarting the backend loses active discovery
records, even though connector receipts persist. This feature does not add
durable discovery storage or a real/cloud connector.

Limits are 20 delivery handoffs, 20 discovery creation reservations and 100 activity events per workspace/reset. Reaching a
limit produces an explicit conflict rather than silently discarding history.
Activity is a local, deletable history, not an immutable compliance audit log.
Source references use `dev.azure.example`, a reserved fictional domain; the UI
renders them as reference text rather than links to a real Azure DevOps account.

## API

All paths start with `/api/v1/integrations/azure-devops` and retain the existing
authentication, platform admission, workspace validation and no-store headers.

| Method | Suffix | Behavior |
|---|---|---|
| GET | (empty) | Current scope, permissions, fixtures, snapshots, preview, receipts, activity |
| PUT | `/connection` | Version-checked fictional project/type configuration |
| POST | `/imports` | Version-checked selected snapshot import/refresh |
| POST | `/discovery/prepare` | Atomically import selected `item_ids` and prepare a draft without creating an engagement |
| POST | `/discovery/preview` | Version-checked draft from selected imported `item_ids` |
| POST | `/discovery/brief` | Version-checked, creator-bound edit of charter fields; rebind confirmation without changing sources |
| POST | `/discovery/confirm` | Creator-bound, explicit, recoverable/idempotent engagement creation |
| POST | `/discovery/cancel` | Version-checked creator cancellation without engagement creation |
| POST | `/handoff/preview` | Version-checked preview from a completed assessment |
| POST | `/handoff/confirm` | Creator-bound, explicit, idempotent simulated creation |
| POST | `/handoff/cancel` | Version-checked creator cancellation |
| POST | `/reset` | Version-checked deletion of this scope's simulator state |

Validation:

```powershell
python -B -m unittest discover -s tests -p test_azure_devops_integration.py -v
python -B scripts\check.py
npm --prefix frontend run test:e2e -- azure-devops.spec.ts
```

## Before a real connector

Real-account integration requires a separately approved implementation: Entra
application/consent and Azure DevOps organization access, secured per-tenant
credentials, explicit project/field allowlists, source-visibility enforcement,
customer retention terms, supported project-process mappings, durable queued
jobs, pagination, rate limits, webhook verification/reconciliation, and recovery
from partial remote creation. No real account is connected by approving or
testing this simulator.

See Microsoft's [work-item creation API](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/create?view=azure-devops-rest-7.1)
and [authentication guidance](https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/authentication-guidance).
