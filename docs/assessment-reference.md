# AgentSpark assessment reference

[Back to the README](../README.md) | [Operations runbook](operations.md)

Detailed assessment behavior, API contracts, compatibility, and limitations.
See the README for the short overview, architecture image, quick start, and
maintainer/upstream attribution.

## What it does (end to end)

A seven-stage pipeline orchestrated with **LangGraph**:

| # | Stage | Agent / Component | Output |
|---|-------|-------------------|--------|
| 1 | Diagnose | **Diagnostic Agent** | Workflow facts with supplied/inferred/missing evidence; incomplete inputs return follow-up questions and stop |
| 2 | Assess | **Scoring + adoption rules** | Descriptive 12-criterion profile and separate evidence-backed agentic opportunity, design candidate and human boundaries |
| 3 | Map | **Mapping Agent** | Recommended Azure or AWS service candidates for the selected assessment target |
| 4 | Recommend | **Recommendation Agent** | Adoption-constrained design with pattern IDs, source snapshots, completeness and self-critique |
| 5 | Estimate | **Business-value Engine** | Deferred by default; optional capacity, separate cash/hiring/service outcomes and per-input provenance |
| 6 | Govern | **Governance Agent** | Validated, ordered technical policies over risk, completeness and autonomy; financial value is advisory |
| 7 | Outcome | **Blueprint Agent** or rejection outcome | Approved/provisional blueprint, or a non-agentic alternative without generating a blueprint |

Every run emits an **agent trace** (per-step status + latency) for observability/audit.

### Business discovery engagements

The **Discovery engagements** workspace starts before technical intake. Record
the business objective, units, sponsor, owner, required/excluded topics, optional
ISO dates and planned/active/completed status. Add up to 20 manual contribution
notes, 20 candidate opportunities and 20 existing assessment links. These are
human-recorded hypotheses, not verified evidence.
Topics document scope; they do not change linked interview prompts.

`GET/POST /api/v1/engagements` lists/creates records. `GET/PUT/DELETE
/api/v1/engagements/{id}` reads, conditionally updates or deletes a record.
PUT requires the returned `version`; DELETE requires `?version=...`.
Stale writes/deletes return 409. Lists use bounded cursor pagination. Assessment
links must be readable in the same selected workspace. Deleted/expired links are
reported as unavailable, not silently removed; dependency outages remain errors.
Deleting an engagement does not delete linked assessments.

Engagements reuse owner/team authorization, input screening, redaction, Cosmos
conditional writes. New engagements retain data for a fixed 30 days; ordinary
reads/edits do not renew it. Explicit authorized `POST /engagements/{id}/renew`
starts another 30 days. Legacy expiry remains unchanged until renewal, and expired
records cannot be restored. Workspace readers can see contributions:
there are no anonymous interviews or engagement-only external invitations.
Engagements cannot enter assessment endpoints or appear as assessments in Home.

### Stakeholder discovery, synthesis and reviewed handoff

Use existing organization/team invitations, then assign up to 20 active members
with `PUT /engagements/{id}/participants/{identity}` and a business operator,
process owner or technical owner role. GET `eligible-participants` returns a
bounded paginated team roster (plus the caller on the first page); DELETE a
participant removes current answers, not historical snapshots. Role changes
clear answers; membership generation changes require fresh assignment. Assignment
does not send another email or grant new workspace access.

An assigned signed-in member uses `PUT /engagements/{id}/contribution` with their
own three-question `answers`, `submit` flag and current `version`. Drafts may be
partial; submission requires all assigned answers, including explicit unconfirmed
answers where appropriate. Assigned viewers can submit only their own answers;
they gain no general write permission. Statements remain workspace-visible and
unverified. Manual notes must not be portrayed as authenticated responses.

`POST /engagements/{id}/synthesis` requires `version` and an explicit approved
`model_id`. Only saved notes and submitted answers become source IDs. Generation
produces themes, opportunity hypotheses, disagreements and open questions, with
validated source citations. Disagreements need two distinct sources; absence of a
reported disagreement does not establish agreement. Demo mode illustrates linkage,
not semantic analysis. Objective/topic/source edits mark the saved snapshot stale.
Accept a current candidate with `POST /engagements/{id}/candidates/{candidate}/accept`;
acceptance creates an unverified proposed opportunity, not a supplied workflow fact.

Opportunity `ratings` are optional strict integers 1-5 with an explicit rationale.
`discovery-priority-v1` uses value 30%, feasibility 25%, evidence confidence 20%,
risk 15%, effort 10%. Each positive dimension contributes `(rating-1)/4 * weight`;
risk/effort contribute `(5-rating)/4 * weight`. Results are 0-100 with stable-ID
tie breaks. Missing ratings/rationale, confidence above 1 without source IDs, or
stale source-linked synthesis withhold scores. Confidence is an assessor judgment,
not evidence verification. Rankings are neither suitability scores nor savings.

Mark an opportunity selected and review its sources, then POST
`/engagements/{id}/opportunities/{opportunity}/handoff` with `version`, `reviewed:
true`, `target_cloud` and approved `model_id`. Frozen `discovery_origin` includes
sources, priority assumptions and reviewer/time. Evidence copies are unconfirmed
client statements, without diagnostic fact links. No interview answer, workflow
fact, readiness confirmation or execution approval is filled automatically.
Origin survives reassessment, blueprint Markdown/PDF and retained decision snapshots.
The new child uses normal assessment expiry, not 30-day engagement retention.

Handoff creation reserves a stable child before writing it; cross-partition
failures leave a visible pending state and explicit error. Reload and retry the
same target/model to resume without duplicates. A completed deleted/expired child
is never recreated. Changed frozen sources/title/problem or target/model require a
new opportunity. All mutations require a current ETag; 409 requires reload/review.

### Role-based diagnostic interviews

Select **Business operator**, **Process owner**, **Technical owner**, or the
legacy **Complete assessment (all roles)** path. Questions and checklist filters
follow field assignments; global missing requirements and deferred questions
remain visible. Roles describe interview contributions, not access permissions
or invitations to independently authenticated participants.

Changing only the role preserves analysis and advisory approval. Answer changes
invalidate both. The existing ten-round limit remains shared across the
assessment; the checklist remains available afterward. Exact `unknown` or
`unconfirmed` chat replies acknowledge the current grouped questions without a
model call. Checklist unconfirmed answers may withdraw previously supplied facts,
including intake values. They never substitute enum defaults, authorize readiness
or allow missing essential facts to be scored. Intake still requires an explicit
Azure/AWS target and, in live mode, an administrator-enabled assessment model.

### Executive decision brief

Analysis deterministically persists a versioned, source-linked summary alongside
the existing assessment. It recommends investigating further, conventional
automation, considering a bounded AI pilot, or not proceeding. Recorded rejection
takes precedence. A pilot recommendation requires complete suitability facts and
the strict `ready` readiness outcome, not `ready_with_conditions`, and a supported
reasoning need rather than an unresolved conditional agentic candidate. Advisory approval
does not authorize pilot execution or production.

Business value is deferred by default. Optional supplied estimates separate
released capacity from cash savings, avoided hiring and service outcomes; they are
not measured results or guaranteed benefits. Unknown facts, readiness gaps, pilot gaps and validation tasks
remain visible. No additional inference call is made.

Analysis, restored sessions, Blueprint, review and archived decision snapshots
share the same brief. Changes invalidate it; review refreshes its advisory status.
Historical records without a brief are labeled, not backfilled. Markdown includes
full sources; the one-page PDF uses bounded excerpts and points to the full
assessment. `GET /api/v1/sessions/{id}/executive-brief/pdf?version=...` checks the
session ETag before and after generation and rejects stale exports. The full
assessment PDF also includes the brief.

### Evidence-backed assessments (Phase 1)

Open **Evidence & assumptions** after saving intake to record client-stated facts,
evidence-supported findings, assumptions, and open questions. Each entry can include
a source reference, reporting period, and user-selected diagnostic input links.
References are text only: no uploads, URL fetching, source ingestion, or automatic
verification. Supported findings require a source; merely supplying it does not
verify the claim. Up to 50 entries are retained with server-recorded author/time.

Authorized reviewers can attest to a supported finding by describing their
confirmation method. Identity and UTC time are recorded server-side; team creators
cannot confirm their own workflow. Personal confirmation requires the reviewer
token role. Local demo is shared and its identity is not an independent reviewer.
This is a reviewer attestation, not an AgentSpark certification.

Analysis and Blueprint show the register, diagnostic findings with linked entry
IDs, calculated recommendation basis, and an outstanding validation checklist.
Entries inform generation but do not override diagnostic facts or scoring/ROI
formulas. Update Diagnostic separately when measured facts change; user links do
not establish agreement or resolve contradictions. Unresolved entries are visible
to reviewers but do not introduce new approval policy gates.

Saving a changed register or confirmation clears current analysis and approval.
Reanalysis is required before review. Entry edits remove their old confirmation;
unchanged entries preserve it. Approved/rejected decision snapshots and Markdown
blueprint exports preserve the exact report used for that analysis. Historical
decisions without a report are labeled as such and are not rewritten.
Evidence follows existing workspace access, session/archive retention, redaction,
and workflow/history deletion rules. Never include secrets or sensitive documents.

### Implementation readiness (Phase 2)

Open **Implementation readiness** after intake. The deterministic report assesses
six required areas: integration access, data/document quality, security/privacy,
human oversight, Azure/AWS prerequisites, and operations/support. Existing systems,
region, residency requirements and constraints are reused as context, never as
proof that access or compliance is validated. Cloud prompts identify appropriate
identity/model/network/monitoring services, but make no cloud API calls.

For each check record `unknown`, `needs_validation`, `blocked`, or `ready`, a finding,
up to ten Phase 1 evidence IDs, next action and completion evidence. Owners start
unassigned or proposed. `client_confirmed` requires a named owner and a confirmation
reference; this is a user-recorded client attestation, not authenticated acceptance
by that named person. No delivery dates are inferred.

A reported-ready check is downgraded to needs-validation if it lacks linked,
source-supported reviewer-confirmed evidence, client-confirmed ownership, or ready
prerequisite checks. All linked evidence must meet that standard. Deleting/editing
evidence cannot preserve an unsupported ready conclusion. Missing links remain
visible as validation needs until a contributor replaces them. Cloud readiness
depends on security/privacy; operations depends on integrations, data, oversight,
and cloud prerequisites.

Overall decision precedence:

1. **Blocked:** any explicit blocked check (P0 action).
2. **Not assessed:** any unknown area, including legacy assessments with no inputs.
3. **Ready:** all six effective checks are ready and all four pilot fields are supplied.
4. **Ready with conditions:** no unknown/blocked checks, but validation or pilot
   definition remains incomplete (P1 actions).

Pilot definition records scope, measurable success/acceptance thresholds, failure
handling/rollback tests, and authorization boundaries/prohibited actions. The report
includes prioritized actions with ownership/dependencies, linked evidence and
attestations, required completion evidence, pilot criteria, assessment time and
limitations. Supplied criteria are not independently evaluated or certified.

`GET`/`PUT /api/v1/sessions/{session_id}/implementation-readiness` reads/saves the
assessment. PUT requires both current `revision` and `evidence_revision`, plus
`assessment: {checks: [...], pilot: {...}}`. Check IDs are fixed and unique; unknown
fields and dangling new evidence links are rejected. Text is screened/redacted.
Workspace write access is required; reviewers/viewers may inspect but not edit.
ETags also prevent cross-feature concurrent overwrites.

Readiness changes invalidate current analysis and approval; exact no-ops do not.
Intake/interview context changes retain draft answers but reset ready checks to
needs-validation and client-confirmed owners to proposed. Revalidate and save for
the new context. Evidence changes invalidate the analysis and recompute effective
readiness without treating source links as automatic verification.

The standalone report is available before analysis and can be exported as Markdown.
Reanalysis snapshots readiness in Analysis, Blueprint, overall advisory review,
Markdown blueprint export, and retained decisions. A standalone export includes
the current recommendation review status when available. Historical snapshots are
not rewritten; older decisions without a report are labeled accordingly.

**Suitability and governance are unchanged.** A suitable architecture may still be
blocked for delivery, and a human architecture approval does not resolve readiness
blockers or authorize a pilot. No infrastructure, dependency or database migration
is required. Existing workflow retention, privacy, access and deletion rules apply.

### Architecture Runtime Decision

The Diagnostic interview/checklist captures `runtime.*` requirements within the
existing ten-round limit: deterministic/bounded/dynamic reasoning, duration,
external waits, recovery, side effects and safety, existing reasoning/workflow
standards, Temporal hosting, operational ownership, scale/latency and platform
constraints. Only relevant required questions enter the grouped interview;
optional constraints remain editable. Explicit unknowns are retained, not guessed.
Runtime enum extraction requires a quoted literal option label (spaces,
underscores or hyphens); otherwise use the checklist. Enum values use the exact
option token, not the full quote. Free text retains verbatim provenance.
Guided capture uses server-assigned reply source IDs, not generated quotations.
Runtime options and region syntax are checked independently against the cited
reply and the field catalog. Free text must be the actual user text, including
qualifications, not a paraphrase. One targeted repair checks unsupported fields;
remaining value problems explicitly need confirmation and never become confirmed
answers. Provider failures or unusable field/source references fail the whole
request without saving a subset. Legacy uncached analysis retains its original
bounded verbatim-evidence extraction.

During mapping, versioned deterministic rules recommend two independent layers:

- **Reasoning:** no agent framework, a bounded model/tool handler, or LangGraph.
- **Durable execution:** no separate engine, Temporal, Azure Durable Functions,
  or AWS Step Functions Standard Workflows.

`runtime-rules-v2` does not select LangGraph merely because the profile score is
high, or block it because volume/profile is low. Explicit dynamic reasoning and
a compatible adoption design are required. Unknown adaptivity remains unresolved.
Runtime choice
never increases prescribed autonomy or removes a human gate. Deterministic
long-running workflows may need a durable engine without an agent framework;
combined reasoning and durable runtimes are also supported.

Known compatible workflow standards are reused. With no existing standard,
the selected-cloud workflow candidate is preferred over introducing another
platform. An unknown standard produces an eligible shortlist, while an unlisted
or other-cloud standard remains unresolved pending review. Temporal requires
explicit hosting and ownership validation. No new Temporal or other framework
dependency is installed: these are customer architecture recommendations.

Each decision includes selected layers, reasons/trade-offs, eligible/ineligible
alternatives, requirements and provenance, validation tasks, human/side-effect
boundaries, and rules/catalog versions. `insufficient_information` means critical
reasoning, duration/recovery or side-effect requirements are unknown/unresolved.
`provisional` indicates design conflicts, platform/ownership/hosting constraints
or consequential actions still requiring validation. `recommended` is an advisory
fit to known requirements, not production readiness or a benchmark result. Scale,
limits and actual recovery behavior still require testing. No exactly-once
business-effect guarantee is made.

Requirements are saved using the existing optimistic-concurrency-protected
`PUT /api/v1/sessions/{session_id}/interview` API, with `runtime.<field>` answer
keys. The checklist accepts up to 64 fields so workflow/readiness/runtime answers
can be saved together. Invalid choices, oversized inputs and instruction overrides
are rejected; existing access, redaction and retention rules apply.

`runtime_decision` is the same structured snapshot in session restore, Analysis,
Blueprint, advisory review, PDF/Markdown exports and archived decisions. Changes
to interview requirements or other analysis inputs invalidate the current decision
and approval. Archived snapshots remain unchanged. Historical records without
the field display **Runtime selection not assessed**; reading them does not
silently generate a recommendation.

### Downloadable PDF assessment reports

After analysis, open **Blueprint & Review**, fetch the current blueprint and select
**Export PDF**. Markdown export remains available. The downloadable
`AgentSpark_Assessment.pdf` now leads with a plain-language decision story:

1. **The decision at a glance:** reported work volume, system/decision counts,
   candidate, advisory status and the next action.
2. **How the work would change:** a native vector responsibility flow, software
   versus proposed AI work, actual systems and human-control boundaries.
3. **What must be true before a pilot:** a readiness matrix, blockers, proposed
   owners and priority actions. Approval is not delivery readiness.
4. **What value do we know today:** optional capacity/cash/payback cards, unknowns
   shown explicitly, and separate salaried capacity, spending and hiring outcomes.
5. **Start small:** recorded pilot targets, failure/authorization boundaries,
   baseline comparison and proposed stop/expansion criteria.

The standard fictional sample has a five-page decision story. Long inputs and
populated financial/pilot sections may need more pages; text is never shrunk to
force that count. Rejected reports omit operating-model/value/pilot implementation
sections and explain the rejection and conventional alternative.

The report uses a consistent purple/navy visual system, larger decision-story
type, metric cards, status callouts, striped tables, running status/analysis ID,
page numbers and PDF outline bookmarks. A technical reference section retains the
full workflow/profile criteria, cloud candidates, governance/reviewer attestation,
business-value inputs and provenance, evidence register, diagnostics, readiness
actions, runtime decisions, grounded sources, architecture, roadmap and illustrative
scaffold. Profile drivers are also shown as vector bars, explicitly not an
opportunity or delivery-readiness verdict. A small glossary explains technical terms.

Long statements may be visibly excerpted in the decision story; the full recorded
text remains in the reference section. The proposed flow is not a verified process
map. Missing values are not zero, and no new facts, financial calculations or AI
calls are introduced by formatting. Rendering remains local/in-memory with escaped
text: PDF bookmarks are internal navigation, and user-provided links/media are not
activated or fetched.

Provisional reports prominently state **PROVISIONAL - NOT APPROVED** on every page.
Approved reports distinguish advisory/policy approval from human attestation.
Rejected reports include the rejection/alternative, not architecture or scaffold
content. Legacy missing snapshots and unknown operating costs are labeled rather
than filled with invented values. PDF export does not change or approve a workflow.

`GET /api/v1/blueprint/{session_id}/pdf` requires the current `analysis_id` and
`status` (`awaiting_human_review`, `completed`, or `rejected`) as query parameters.
Existing authentication, owner/workspace read access and expiry checks apply;
viewers can download what they can read, but cannot gain write/review permissions.
The UI refreshes before export; the server checks version/status before and after
generation, rejecting concurrent changes with 409. Invalidated/missing workflows
return 404. Errors remain JSON, never a success-shaped PDF download.

PDFs are generated in memory with ReportLab and returned as an attachment with
`application/pdf` and existing no-store/security headers. No PDFs are retained on
the server or in archives. Downloaded copies are outside server deletion/retention
control: handle them according to your organization's data policy.

Pagination, repeated page status/analysis headers, wrapped text and tables support
long reports. Embedded bundled fonts need no OS font installation. Unsupported
glyphs are shown explicitly as `[U+XXXX]` code points, not silently dropped.
Markdown headings/lists/pipe tables/code are supported; HTML and remote media are
inert text and never fetched. Mermaid is included as labeled source, not a rendered
diagram. The endpoint exports the current assessment, not historical Home records.

### Governance and human review

AgentSpark approves **advisory recommendations**, not execution or deployment of a
customer's business workflow.

- `AUTO_APPROVE` produces a blueprint with workflow status `completed`.
- `HUMAN_REVIEW_REQUIRED` produces a **provisional, not-approved** blueprint with
  status `awaiting_human_review`. Fetching or exporting it does not approve it.
- `REJECT` skips the Blueprint Agent, sets status `rejected`, and returns a
  non-agentic alternative with no architecture document or code scaffold.
- A human approval changes status to `completed`; a human rejection changes it to
  `rejected` and removes the blueprint. The original policy decision remains intact,
  alongside the separate reviewer decision, rationale, and UTC timestamp.

Review API:

1. `GET /api/v1/review/{session_id}` returns the current `analysis_id`, status,
   original governance result, and human review.
2. `POST /api/v1/review/{session_id}` accepts
   `{"analysis_id": "...", "decision": "approve", "reviewer": "...", "note": "..."}`.
   Decision must be `approve` or `reject`; reviewer and note must be nonblank.
3. Only a pending recommendation can be reviewed. Stale analysis IDs and already
   decided/non-reviewable recommendations return `409`; no current analysis returns
   `404`; malformed review requests return `422`.

Every complete reanalysis gets a new analysis ID and clears the previous review.
Clarification-only results clear all prior outputs, approval, and analysis ID.
Accepted chat or intake changes invalidate the current analysis and review; blocked
chat does not. Only the **current analysis's** review is retained, not a historical
ledger. Blueprint responses and Markdown exports identify provisional/rejected
outcomes. The Blueprint screen contains the review controls.

**Access boundary:** local demo remains shared and unauthenticated, with
self-reported reviewers; never expose it publicly. Live/production requires
validated OIDC bearer tokens and isolates every session read/write/delete to its
owner in the personal workspace. Team workspaces require active organization
membership and team permissions. Team review requires an explicit reviewer grant
and a reviewer other than the workflow creator;
personal review still requires its owner and the token role. The verified subject
replaces the submitted reviewer name. ETags and analysis IDs
provide concurrency protection, not authorization. Reviews remain advisory rather
than an execution authority or an immutable compliance ledger.

Policies are validated at startup from `governance_rules.yaml`. Unknown fields,
operators, values, decisions, and duplicate IDs fail startup with a logged error.
Each policy contains `conditions` with `field`, `operator` (`eq`, `lt`, `gt`), and
`value`; all conditions must match, and the first matching policy wins. There are no
Python expressions or `eval`. If no policy matches, `default_decision` is honored.

Business value is optional and deferred by default. Cost governance reports
`NOT_ASSESSED` for missing cash inputs or `REVIEW` for a negative supplied cash
balance, without rejecting the technical recommendation. Default technical policies
do not depend on financial estimates; security, suitability and required human
oversight remain enforced. Separate budget approval is still required. Custom
`first_year_net_savings` conditions compare cash savings minus operating and
implementation costs only when all are known; unknown values match no comparison.
The security dimension is a limited text policy check, not a security audit.

### Differentiators
- **🛡️ Security-hardened** — every inbound message is screened for **prompt-injection and PII**
  before it reaches the LLM; PII is redacted before storage. Try to break it in the *Security
  Guardrails* tab. (*Theme: Security in the Agentic Future.*)
- **💰 Quantified ROI** — readiness is translated into hours saved, dollars saved, payback, and an
  ROI multiple, with fully transparent assumptions.
- **🔭 Observable** — a live agent trace records each of the 7 stages with timing and a summary,
  making the "audit trail" a real artifact.
- **📊 Portfolio Planner** — scores a whole backlog so you know *what to build first*.
- **🧠 Honest by design** — data completeness is separate from confidence in correctness; the Recommendation Agent
  states its own biggest risk; low-value workflows are told to *not* use agents.

### Why it's credible, not just generated
- The **12-criteria score is transparent**: every criterion shows its weight, normalized
  strength, contribution to the 0–100 index, and a plain-English rationale. The contributions
  provably sum to the score (enforced by the eval harness).
- It is **honest**: high-compliance / high-error-cost workflows are never marked fully
  autonomous — they are routed through a mandatory human-in-the-loop gate. A fixed-rule
  payroll task is correctly flagged *Not suitable for agents → use standard software/RPA*.
- The **Recommendation Agent retrieves real patterns** (via Azure AI Search in live
  mode or the local library in demo mode) and cites their IDs, source records and content hashes.

---

## Architecture

```
React SPA  ──/api/v1──►  FastAPI  ──►  LangGraph Orchestrator
                                        │
   Diagnostic → Scoring(12) → Mapping → Recommendation(RAG) → ROI → Governance → Outcome
                                        │
        Azure OpenAI   Azure AI Search   Azure Cosmos DB   Azure Container Apps
```

- **Frontend:** React + TypeScript + Vite + TailwindCSS SPA (built to static, served by
  FastAPI on a single origin — no separate frontend server, no CORS)
  with a light workspace, charcoal typography, teal actions, responsive workflow
  navigation, and visible keyboard focus. Review, rejection, and clarification
  states remain distinct; approval is advisory, not execution authority.
- **API / Orchestration:** FastAPI + LangGraph state graph
- **Reasoning:** the configured Azure OpenAI deployment via LangChain, using **structured outputs / function
  calling** so every agent returns schema-validated Pydantic objects
- **Knowledge (RAG):** Azure AI Search over a curated agentic-pattern library
- **State / Memory:** Azure Cosmos DB (per-session `WorkflowState`)
- **Delivery:** tested Docker image archives via [GitHub Actions](../.github/workflows/ci.yml);
  hosting/deployment is separately approved (no automatic Azure deployment).

> **Demo mode:** `AGENTSENSE_MODE=demo` runs end-to-end on deterministic mock data,
> process-local storage, and the local pattern library. Local development defaults
> to demo even if Azure credentials are present. Live mode must be selected explicitly.
> Select a named fictional sample explicitly; arbitrary demo chat no longer becomes Invoice Approval.

## Privacy and access controls (Phase 4)

`AGENTSENSE_MODE=live` **or** `ENVIRONMENT=production` requires OIDC;
missing/invalid configuration or selecting `local-demo` fails startup.
Configure these values before upgrading a deployment:

| Setting | Contract |
|---|---|
| `AGENTSENSE_AUTH_MODE` | `oidc` for live/production; local development defaults to `local-demo` |
| `AUTH_ISSUER` | Exact trusted HTTPS issuer, including any tenant/version/trailing-slash convention |
| `AUTH_AUDIENCE` | Audience for access tokens issued specifically for this API |
| `AUTH_JWKS_URL` | Trusted issuer's HTTPS signing-key endpoint; keys are cached for five minutes |
| `AUTH_REVIEWER_ROLE` | Role claim required for personal workflow review; default `AgentSense.Reviewer` |
| `SESSION_RETENTION_HOURS` | Absolute lifetime for new sessions, integer 1–720; default 24 |

Bearer validation allows **RS256 only**, validates issuer/audience/signature and
expiry, requires `sub`, `iss`, `aud`, `iat`, `exp`, and checks `nbf` when present.
Identity headers are not trusted. Use an API-specific access-token audience:
do not configure a shared browser-client/ID-token audience. Owners are opaque
hashes of issuer and subject; knowing a session ID grants no access. Foreign,
expired, and missing sessions return indistinguishable 404 responses.
`GET /api/v1/auth/config`, `/health`, `/ready`, and static assets are public;
all other `/api/` requests require authentication in OIDC mode. Personal review
requires ownership and the configured token role; team review instead follows
the independent-review rules below.

### Assessment target cloud

Enterprise Intake requires a target cloud selection: **Azure** or **AWS**. This
selects the customer's proposed solution platform, not AgentSpark's hosting.
AgentSpark still runs on Azure and processes assessments using its configured
Azure dependencies. No AWS credentials, account connection or provisioning are
introduced by an AWS assessment.

Optional region, residency requirements and existing-cloud constraints accompany
the interview, mapping and blueprint. Service mappings use curated candidates;
AWS pattern implementations retain the original design provenance plus candidate
documentation references and their own content hash. Region availability, model
access, residency and pricing are not verified. Costs remain unpriced drivers
unless supplied assumptions are explicitly identified. Scaffolds are illustrative,
untested and not deployment-ready.

Changing deployment preferences and saving intake clears the current analysis,
blueprint and approval. Archived decisions retain the preferences reviewed at the
time. Legacy records and API callers without a cloud selection retain Azure
behavior; an omitted cloud does not reset an existing AWS selection.

### Organizations and team workspaces

Use **Organizations & teams** to create an organization, manage membership and
select a team workspace. New organizations have a founding owner.

**Inviting people (invite links).** An owner/administrator opens **Invite links**,
optionally picks a team and team roles, an expiry (1, 7 or 30 days) and a maximum
number of uses (default 1), then selects **Create invite link** and sends the link
(shown once) through any channel. The invitee opens the link, signs in, and selects
**Join organization** (or pastes the link/code into **Join with an invite link**).
Redemption grants the invited role/team roles, never downgrades existing access,
and does not consume a use when nothing changes. Only owners create administrator
invites; owner invites are impossible. Administrators can revoke unused links.
The secret travels in the URL fragment (never sent in HTTP requests) and only its
SHA-256 is stored; invalid, expired, revoked and exhausted codes return the same
generic 404. The invitee must still be able to sign in to the configured identity
provider (for Entra, a member or B2B guest of the tenant). Adding a member directly
by the opaque identity ID shown on that page remains available; email delivery and
identity-provider directory lookup are not implemented.

| Membership or team role | Team workflow permissions |
|---|---|
| Organization owner / administrator | Read, create/edit, and delete across the organization's teams |
| Contributor | Read and create/edit in the assigned team; delete their own workflows and decision history |
| Reviewer | Read and review in the assigned team |
| Viewer | Read only in the assigned team |

Team roles can be combined. Owners/administrators need an explicit team reviewer
grant to review; no team member, including the founding owner, can review a
workflow they created. Team reviewer grants are authoritative: no additional
`AUTH_REVIEWER_ROLE` token claim is needed for team review. Local demo uses one shared identity, so it cannot demonstrate
independent team approval; use separate verified identities for that acceptance test.

The owner manages administrators; administrators manage ordinary memberships and
team grants. The founding owner cannot be changed or revoked in this phase.
Membership/grant updates require the current record `version`; stale writes return
409. Revoking membership immediately blocks subsequent authorized requests.
Reactivating membership does not reactivate old team grants: explicitly regrant
team access. Organization deletion and ownership transfer are deferred.

`POST/GET /api/v1/organizations` creates/lists organizations.
`POST/GET /api/v1/organizations/{organization_id}/teams` creates/lists teams.
Organization and team membership administration uses the respective
`/members` listing endpoints and `PUT /members/{identity_id}`.
Invite links use `POST/GET /api/v1/organizations/{organization_id}/invites`,
`DELETE .../invites/{invite_id}` and `POST /api/v1/invites/redeem` with `{"code": ...}`.
Listings return bounded `items` and `next_cursor` pages.

Workflow requests select a team using **both** `X-Organization-ID` and `X-Team-ID`;
omit both for personal scope. These headers select scope, never grant authority:
the server checks membership and permissions on every protected operation.
Personal, other-team and other-organization reads cannot open a team workflow.
Switching workspaces clears the current workflow pointer without moving or
deleting its records. The UI disables unavailable mutation/review controls;
server authorization remains authoritative.

**Identity-provider integration is deliberately configuration-only:** no tenant,
app registration, hosting resource, or OAuth callback is provisioned. The initial
SPA integration accepts a user-supplied organization API access token in a password
field and keeps it **only in memory**; reload/expiry requires signing in again.
Deployers must select and configure their identity provider and approve retention
before release. The 24-hour default is not an approved organizational policy.
Use HTTPS and a trusted deployment proxy, restrict origins/network ingress,
configure perimeter request/rate limits and appropriate provider permissions, and
complete provider-specific integration testing before exposing a multi-user app.
Never paste credentials into intake/chat. Do not treat this integration as a
complete interactive SSO experience.

### Retention, deletion, and upgrade behavior

- New sessions receive an absolute UTC `expires_at`. Reads, chat, reanalysis, and
  reviews do not extend it; changing the configured lifetime affects new sessions only.
- Cosmos writes carry a per-document TTL for the remaining lifetime. Configure the
  existing `workflows` container with partition key `/session_id` and TTL enabled
  (`defaultTtl=-1`, or a positive container default). `/ready` reports Cosmos
  unavailable when TTL is disabled. Application expiry is enforced independently;
  Cosmos physical deletion is asynchronous. No infrastructure is changed automatically.
- `DELETE /api/v1/sessions/{session_id}` deletes the owning user's archived
  decisions, then conditionally deletes the current document with its ETag.
  Concurrent deletion/update returns 409; retry a failed deletion to finish it.
  Deletion does **not** erase external logs, provider telemetry, exports or backups;
  those require separate organizational retention controls.
- Legacy documents without an owner remain anonymous and cannot be claimed by an
  authenticated user. Undated legacy documents are expired, not given a sliding
  lifetime. Review/migrate or purge legacy data administratively before release.
- Active demo sessions are process-local and shared; they disappear on restart.
  Expired demo documents become inaccessible but may remain in process memory
  until restart. Archived decisions persist separately as described below.

### Personal Home and decision archive

Home lists the selected personal or team workspace's workflows with draft, pending review, approved,
and rejected filters. **Choose your workspace** on Home lets you select an
organization you belong to, then an accessible team, without opening administration.
Selecting an organization alone does not switch scope: choose a team to apply it.
Select **Personal workspace** to return to your own records. Organization and team
lists support paging and explicit retry when directory loading fails.

The selected workspace applies to both **Workflow library** and **Discovery
engagements**, and the active library stays selected when switching from Home.
New enterprise intakes and discoveries use that workspace; viewer teams remain
read-only. This changes scope, not membership, and never moves existing records
or combines data across organizations. **Manage access** opens the existing
organization/team administration page for invitations and permissions.

Open an active workflow to continue it, or open a finalized
decision to see a read-only snapshot with its reviewer, comments, and decision
time. Automated policy outcomes are explicitly distinguished from human reviews.
Quick Start topics use icons, not letter monograms.

Final approved/rejected analyses are archived for **30 days**, independently of
the active session's lifetime. Set `DECISION_ARCHIVE_RETENTION_DAYS` (1–3650)
before startup; changes affect new decisions only. Reanalysis creates a new
decision version when finalized; it does not replace the prior archived review
or extend that review's expiry. Snapshots contain workflow facts, scores,
recommendations, estimates, policy/source metadata and review comments—not the
full interview transcript or code scaffold. They are deletable snapshots,
**not immutable compliance audit logs**.

- **Local demo:** SQLite at `~/.agentspark/decisions.sqlite3`, or the absolute
  `DEMO_ARCHIVE_PATH` configured by the operator. The directory must be writable;
  `/ready` reports archive failure explicitly. Expired rows are pruned on access.
  This is shared fictional demo data, not private multi-user storage.
- **Live:** session and archive documents share the existing Cosmos
  `/session_id` partition. Final decision and snapshot are committed in one
  ETag-protected transactional batch. Per-document TTL and application checks
  enforce expiry. Home uses owner- or team-filtered, projected, bounded keyset queries;
  keep `home.sort_key` range-indexed for these queries.
- **Deletion:** deleting a workflow removes all its retained decision versions
  and comments. Archived workflows remain deletable after active-session expiry
  through `DELETE /api/v1/decisions/{session_id}/{analysis_id}`. This endpoint
  deletes the entire workflow/history, not just the selected version.
- **Upgrade:** existing finalized sessions without snapshots can still appear as
  short-lived legacy records until session expiry. They are not retroactively
  converted into durable decisions.

Organization/team membership uses a separate Cosmos `directory` container with
partition key `/organization_id`, automatic expiry disabled, and range indexing
on `directory_key`. Local demo persists its directory in a sibling
`decisions.tenants.sqlite3` file (derived from `DEMO_ARCHIVE_PATH`).
Existing personal records are not reassigned to organizations.
Before a multi-organization rollout, validate the indexing,
cross-partition query costs, tenant isolation, membership/RBAC and load profile
against real Cosmos infrastructure.

### Bounded diagnostic interview and readiness capture

Diagnostic now covers workflow suitability, deployment preferences, all six
implementation-readiness areas and four pilot fields in one guided flow.
Questions are selected deterministically from missing saved fields: up to three
related questions per round, skipping already captured answers. There are **at
most 10 successful user/assistant rounds per workflow**, enforced by the API
and preserved on restore. Blocked inputs and failed requests do not consume a
round. Long legacy histories are retained, but cannot add rounds beyond the cap.
Capture can finish early when every field is supplied.

After round 10, automatic questions stop. The Diagnostic page opens a grouped
editable checklist showing only unanswered fields by default; users can reveal
and correct captured answers. Counts accept whole nonnegative numbers, signal
fields use explicit choices, and comma-separated systems/departments accept
`none` for an explicitly empty list. No additional conversational rounds are
required to finish. Missing essential facts still withhold scoring, ROI and
blueprints; optional deployment/readiness gaps remain explicitly unresolved.

Live turns capture only the new reply, not the entire workflow again. The server
provides the exact ordered question IDs, existing document/checklist/interview
answers, and permitted fields. Assistant questions provide mapping context, never
evidence. Numbered replies are bound to that batch; simple text, literal options,
zero counts, number words through 1000 and explicit unknowns need no model call.
Free prose uses a small answer-list schema with server-assigned source IDs.
Retrieved text must support every value; unsupported ranges, estimates, options
and paraphrases remain unresolved. Region codes must appear in the supporting
reply. Normalization can remove field-label prefixes but retains the source text.
Known answers are never erased by omission. Changing a known answer requires an
explicit correction naming the field; corrections receive new interview
provenance and revalidate the assessment. Analysis reuses saved guided facts.

One targeted repair preserves independently validated answers in memory while
checking rejected fields. Persistently unsupported values are returned as
`needs_confirmation`, alongside captured/unconfirmed/not-answered outcomes.
Provider, schema, coverage and invalid-source failures remain explicit errors:
no subset or chat round is saved. The reply acknowledges captured values and
explains missing or unverifiable fields before listing the next questions.

Captured readiness text fills empty findings as **Needs validation**, without
creating evidence entries, confirmed owners, reviewer attestations or Ready
statuses. Existing findings are not overwritten by incidental chat; an explicit
named correction replaces the finding as an unverified draft.
Users must review findings and add actual evidence/ownership in the readiness
and evidence pages. Captured deployment constraints populate the structured
Enterprise Context; the selected cloud remains authoritative and unchanged.
Chat and changed checklist saves invalidate current analysis/approval and
revalidate existing readiness commitments. Archived decisions remain intact.
Intake changes clear cached extraction and supersede checklist systems/compliance
when those intake fields change; they never reset the round budget.

`GET /api/v1/sessions/{session_id}/interview` returns progress, catalog, current
answers, ordered `question_ids` and an opaque `version`. New chat clients submit
both `version` and the displayed `question_ids`; stale or changed batches return
409 before inference. Legacy self-contained prose remains supported, but
unversioned numbered replies require reload rather than guessing their mapping.
`PUT` accepts the version and a partial
`answers` map keyed by the catalog IDs. Stale edits return 409 without replacing
answers; invalid keys/types/limits return 422. Authentication, owner/workspace
permissions, privacy redaction, expiry and conditional persistence apply.
After the cap, `POST /chat` returns 409 directing users to the checklist.
The multiline reply box supports Shift+Enter for a newline. Failed requests
retain the draft and consume no round. After a reload changes the assessment
version, a retained draft must be reviewed and edited before resubmission, so an
old numbered reply cannot silently move onto new questions.

Demo chat still uses explicitly selected fictional fixtures, not extraction of
arbitrary messages. In demo mode use the checklist for readiness/deployment
drafts; explicitly entered checklist facts can override fixture facts and are
labeled as checklist inputs, not model-extracted facts.

### Privacy scope

Intake and diagnostic messages are screened, and recognized email/phone/card/SSN
and credential patterns are redacted **before model calls**, storage, and API
echoes. Nested recommendation content is sanitized on save/read; blocked prompts
are not saved in the interview or event preview. Events retain only scanner
findings (last 100); new interviews are capped at 10 successful rounds (20 stored
messages). Longer legacy transcripts are retained but cannot add rounds. API validation
errors omit input values, operational API/dependency errors withhold raw exception
content, and API responses set `Cache-Control: no-store`.

This is **best-effort pattern redaction, not anonymization or a DLP guarantee**:
names, novel secret formats and other confidential business information can remain.
Do not submit real customer/regulated data without an approved data-handling
assessment. Configure platform access logs, tracing, backups, model-provider data
policies and retention separately; no end-to-end privacy certification is claimed.

## Guided workflow and restoration (Phase 5)

The SPA guides intake → interview → analysis → blueprint/review, mounting only the
active step. Navigation, reset, sign-out and deletion are locked during requests;
restored state comes from the server rather than fabricated progress. The sidebar
shows actual workflow status/expiry and dependency readiness refreshed every 30
seconds, distinguishing fictional demo data from live/degraded operation.

Only an opaque session pointer, opaque owner identity, selected organization/team
IDs for that workflow, and active step are stored
in **tab-scoped sessionStorage**—not transcripts, intake, recommendations or access
tokens. Reload restores the matching owner's server session after authentication;
a different identity or missing/expired session discards the pointer. Browser
storage is convenience state, never an authorization boundary. New workflow drops
the pointer without deleting the old server document; Delete workflow asks for
confirmation and waits for server deletion. Blueprint export rechecks the current
analysis ID/status and blocks a stale export until the refreshed version is reviewed.

Workflow controls have labels, keyboard focus indicators, status/error regions,
disabled/loading states and a skip link. Reload restoration covers saved content,
not unsent text or a browser/process crash during an in-flight operation. A 409
requires refreshing/reloading the authoritative session rather than silently
retrying a stale change. Exported Markdown remains a local sensitive artifact.

## Trustworthy recommendations (Phase 3)

### Clarification before scoring

`POST /api/v1/analyze/{session_id}` returns `status: "needs_clarification"` when any
essential fact is missing or inferred. Score, recommendation, ROI, governance,
blueprint and analysis ID are withheld. `diagnosis` contains `intelligence`,
per-field `evidence`, `missing_facts`, `data_completeness`, and up to three focused
`follow_up_questions`. Answer in Diagnostic and rerun; no downstream stages run
until the essential fields are supplied.

The 14 essential facts are workflow name, summary, steps, departments, decision
points, systems, weekly exceptions, daily volume, compliance sensitivity, data
availability, rule stability, human judgment, unstructured content, and error cost.
Explicit zero counts and explicitly empty systems/departments are valid; omitted
defaults are not. Supplied live extraction requires a verbatim quote in user interview
input or intake context; explicit checklist facts carry separate checklist provenance.
Assistant statements and demo sources cannot ground live
extraction. Unverifiable supplied quotations fail explicitly (`502`).
**Supplied means reported, not independently verified**: quote matching does not
prove the model interpreted the statement correctly. Review the evidence and
validate actual workload baselines before relying on a recommendation.

Demo requests explicitly select `demo_scenario: "invoice" | "support" | "claims" |
"payroll"` on intake or chat. The UI's sample actions set this in demo mode.
Fixtures are labeled fictional and **do not adapt to interview text or edits to
intake**. Explicit checklist answers can override individual facts, with their own
provenance. Clear the selection for an unselected demo session, or restart in live
mode to analyze your own input. Live requests cannot select fixtures (`422`);
live sample buttons only populate intake templates.

### Grounded and consistent designs

New assessments persist `suitability_score.adoption` (`adoption-rules-v1`).
The scalar profile is descriptive, not an architecture selector, financial
estimate, or delivery-readiness verdict. Its numeric weights/bands remain
compatible; the old `ROI Potential` criterion is now explicitly labeled
`Workload Footprint (not ROI)`. Historical scores without adoption metadata are
not retroactively reinterpreted; rerun analysis for a modern assessment.

The engine separates:

- **Opportunity:** `supported` by stated dynamic-reasoning requirements,
  `potential` when cross-system judgement/content analysis needs validation,
  or `not_indicated` by currently supplied evidence. None is measured capability.
- **Permissions:** start agentic candidates supervised, with read-only tools,
  draft outputs, explicit tool/time budgets, audit and human approval around
  consequential actions. High compliance or error impact narrows authority; it
  does not automatically erase an opportunity.
- **Delivery readiness:** the existing separate readiness report, integration
  access, security/privacy, operational ownership, recovery and pilot criteria.
  Opportunity and advisory approval never fill readiness checks.

Stated dynamic reasoning selects a supervised `tool_agent` for a single-system
workflow or `hybrid_agentic` investigation for multiple systems. Unknown
adaptivity with reported cross-system judgement or content-analysis needs produces
a **conditional** candidate, not an invented dynamic fact or a selected reasoning
framework. Explicit deterministic investigation retains `standard_software`;
bounded AI remains a `rag_copilot` candidate without an iterative graph.
`supervisor_worker` requires dynamic reasoning plus at least two distinct
user-supplied specialist responsibilities in optional
`runtime.specialist_roles` (semicolon/newline separated). This is an attested
decomposition hypothesis, not proof that multi-agent coordination is superior.
Many systems, high volume and a high profile alone never select multiple agents.

Each assessment includes the fixed-query/software baseline, cited input
provenance, deterministic/proposed-agent responsibilities, unresolved questions,
bounded pilot, success measures, stop conditions and expansion prerequisites.
Process owners must agree measurable thresholds before a pilot; the engine does
not invent achieved improvements or approvals. These fields survive restoration,
review, retained decisions, executive brief and Markdown/PDF exports.

The Azure SRE regression (25 items/day, structured inputs, stable policies,
high compliance/error impact, four systems, profile 45/100) now gets a
conditional supervised investigation-agent candidate, not automatic RPA-only
advice. Confirm whether investigation chooses follow-up queries from evidence.
If dynamic, consider one supervised investigator with deterministic collection
and authorization in application code. If truly fixed, retain the simpler
baseline. A deterministic collection quote alone does not establish deterministic
investigation: shared document validation requests whole-scope evidence; reanalysis
reopens saved partial document-sourced reasoning and preserves its quote/location.
Explicit human checklist choices and edited document choices remain authoritative.
This conservative scope guard is not a general semantic-verification guarantee.

Tool/hybrid candidates reuse existing grounded patterns `p01`, `p06`, `p04`;
specialists use `p02` plus the human gate. AWS adaptations preserve original
source fingerprints and provide AWS-only curated candidates. No new search
records, cloud credentials, runtime installation or deployment is introduced.
The default not-suitable rejection only applies when opportunity is also
`not_indicated`; security and required human-review policies remain enforced.
Legacy direct callers lacking adoption metadata retain their original
score-to-family compatibility behavior.

Generation must match those structured constraints and cite the required retrieved
pattern IDs; invented, duplicate, missing or incompatible citations and conflicting
design assertions fail explicitly rather than falling back to a plausible answer.
Free-form model explanations remain advisory and need human review.

Retrieval is **keyword search plus exact-ID lookups for required design patterns**,
not vector or hybrid search. Both lookups use the configured live index in live
mode; missing required records and outages never fall back to local patterns.
Sources expose IDs, `source_ref`, `source_url`, and `content_sha256` fingerprints.
`GET /api/v1/patterns/{pattern_id}` resolves the current source; saved results retain
the cited snapshot and hash even if that source later changes.

`strategy.data_completeness` replaces the misleading strategy confidence value.
For compatibility, governance rule input `confidence`, assessment key `Confidence`,
and `overall_confidence` retain their old names but mean **data completeness only**,
never model accuracy or statistical certainty. The UI labels that distinction.

### Optional capacity-first business value

The analysis request optionally accepts `{"roi_assumptions": {...}}`. New assessments
default to `mode: "deferred"` with no numeric defaults. Technical suitability,
architecture, readiness and blueprint generation require no financial estimates.
The UI offers "Estimate business value now (optional)" and "validate during the
pilot"; enabling estimation still allows every input to remain unknown.
Validated inputs persist with the assessment and are reused unless overridden.
Turning estimation off submits a clean deferred request, so even an unfinished or
invalid financial draft cannot block technical analysis. Those optional draft
inputs are not saved by the deferred run. Enabled inputs receive browser and
server bounds validation; invalid values are reported rather than silently used.

With `mode: "estimate"`, optional inputs are:

| Input | Meaning / valid range |
|---|---|
| `working_days_per_year` | Workflow operating days, integer 1-366; use 365 for year-round operation when appropriate |
| `manual_minutes_per_item` | Total active human effort per case, 0-1,440; exclude waiting and avoid counting decisions twice |
| `effort_reduction_percent` | User-supplied expected net reduction including remaining review/exceptions, 0-100 |
| `loaded_hourly_rate` | Approved aggregate labor rate for capacity valuation only, greater than 0 through 10,000 USD/hour |
| `productive_hours_per_fte` | Organization-approved productive hours/employee-year, greater than 0 through 8,784 |
| `implementation_cost` | Total implementation budget, not cost per agent, 0-1 billion USD |
| `annual_operating_cost` | Annual model/infrastructure/support/review cost, 0-1 billion USD |
| `annual_cash_savings` | Separately supplied spending reduction, 0-1 billion USD |
| `annual_avoided_hiring_value` | Separate avoided-hiring benefit, 0-1 billion USD; never added to cash payback |
| `service_improvements` | Proposed or observed operational measures, at most 2,000 characters |

`roles` optionally holds up to 20 named roles with human minutes/item, reduction
percentage and hourly rate. Role entries replace workflow-average effort and rate,
rather than adding to them. Missing effort in any role leaves total capacity unknown;
missing any role's rate leaves total monetary capacity value unknown. No partial
total is represented as a complete estimate.

Capacity hours/year = reported daily volume x operating days x human minutes/item
x supplied reduction percentage / 100 / 60, summed by role when applicable.
FTE-years = capacity hours / supplied productive hours. **This is distributed
capacity, not a claim that positions can be removed.** Capacity value uses the
corresponding role rates, never an assumed payroll reduction. Cash net benefit
uses only supplied cash savings minus known operating cost; first-year cash
balance also subtracts total implementation cost. Payback requires a known positive
net cash benefit and positive implementation cost. Unknown costs are not zero.

Every supplied input has `evidence` with `basis` (`assumed`, `measured`, or
`finance_approved`) and an optional `reference` (500 characters maximum). Missing
basis labels default to `assumed`; these are stakeholder attestations, not
independently verified approvals. Role inputs have their own evidence. Business-value
text is screened for instruction overrides and PII-redacted before persistence.

Version-2 results expose `status` (`deferred`, `incomplete`, `estimated`), missing
capacity inputs, capacity hours/value, FTE-years, cash savings, avoided hiring,
cash balance/payback and service improvements separately. Unknown results are null.
No suitability-based automation percentages, agent build counts or fabricated
sensitivity scenarios are generated. Reports, executive briefs, Markdown/PDF exports
and archived decisions preserve these distinctions and input provenance.

### Workflow-specific blueprints and migration

Blueprint generation receives workflow/intake, evidence, score, mapping, grounded
references, policy result and optional business-value inputs. The diagram represents the
customer workflow rather than AgentSpark's internal agents. Generated code is
labeled **illustrative, untested, not deployment-ready**, including in Markdown
exports; demo endpoints deliberately return `501` until integrations, authorization,
audit and approval enforcement are implemented. Azure costs are unpriced cost
drivers, not a fabricated monthly quote.

Existing stored results remain readable. Legacy illustrative estimates are marked
for reanalysis, not relabeled as validated business cases; old per-step/per-agent
inputs remain parseable but do not silently opt into the new estimator. A new approval of an old
analysis without complete provenance is refused (`409`); rerun analysis first.
Reanalysis/input invalidation and ETag concurrency behavior remain in effect.

## Runtime reliability (Phase 2)

### Explicit modes and migration

Set `AGENTSENSE_MODE=demo` or `live` before starting the process. Local development
defaults to `demo`; when `ENVIRONMENT=production`, the mode must be explicitly set
or startup fails. Invalid mode values also fail startup. Settings and clients are
process-scoped: restart after configuration changes.

**Migration:** credentials no longer automatically activate live mode. Existing
Azure deployments must set `AGENTSENSE_MODE=live`. Live mode never falls back to
mock agents, an in-memory database, or local pattern retrieval when a service fails
or the live index is empty. Structured generation retries malformed output once as
a real JSON completion; transport/authentication failures do not take that retry.
Invalid final output is an error, not a placeholder blueprint or mapping.

Before live use, provision the Cosmos database (default `agentsense_db`), its
TTL-enabled `workflows` container with partition key `/session_id`, and the
non-expiring `directory` container with partition key `/organization_id`.
The application no longer
creates databases/containers during startup or readiness checks. Provision and seed
the Azure AI Search index separately. Demo ingestion reports that no live write
occurred; partial live ingestion is an error.

### Persistence and API error contracts

All session writes use optimistic concurrency. Existing Cosmos documents are
replaced with their ETag and `IfNotModified`; new documents use create, never
upsert. Demo storage performs the same compare-and-swap under a process-local lock.
Updates to chat, intake, analysis and reviews cannot silently overwrite a newer
session version. Do not automatically retry stale decisions: fetch the current
state, reconcile changes, then resubmit. Demo storage is not shared across workers.

| Response | Meaning |
|---|---|
| `404`, `session_not_found` | No persisted session; only intake/chat may create one |
| `409`, `session_conflict` | Another request changed the session before this write |
| `422` | Invalid request field/category/identifier or out-of-range value |
| `413` | Request body exceeds 65,536 bytes, including streamed/chunked bodies |
| `502`, `invalid_dependency_response` | An upstream result or stored document was invalid |
| `503`, `dependency_unavailable` | Required configuration is missing or a live dependency failed |
| `500`, `internal_error` | Unexpected failure; internal details are logged, not returned |

Existing review-specific `404`/`409` responses still apply. Failed persistence never
returns a successful update, and failed analysis does not save partial results.
Synchronous SDK calls and graph execution run in FastAPI's worker thread pool, not
on the async event loop. Analysis still uses a synchronous HTTP response; there is
no background-job infrastructure or automatic retry of graph runs.

Session IDs are 1-100 ASCII letters/digits/underscores/hyphens, starting with a
letter/digit; UUIDs remain supported. Intake domain is 1-200 characters, systems
up to 4,000, pain points up to 8,000; chat is 1-8,000 nonblank characters. Team size
and compliance are fixed categories. Pattern search accepts a nonblank query up
to 2,000 characters and `k` from 1 to 50. Workflow signals enforce nonnegative
integer counts (steps/decisions <=1,000; weekly exceptions <=1,000,000; daily
volume <=10,000,000), bounded labels/lists, and valid categorical values.

### Liveness versus readiness

- `GET /health` is dependency-free liveness. It reports the selected `mode`; its
  compatibility `live` flag means **mode selected**, not Azure connectivity.
- `GET /ready` returns `200` with `ready: true`, or `503` with `ready: false` and
  per-dependency status for OpenAI, Search, Cosmos, and the tenant directory.
  Demo Azure dependencies are marked `demo`; the local archive and directory are
  checked for writable storage. This is not a claim that Azure was tested.
- Live readiness performs a one-token OpenAI inference on the configured deployment,
  verifies the Search index has documents, and reads Cosmos container metadata.
  **The OpenAI probe consumes tokens and can be rate-limited.** Poll conservatively;
  use `/health` for high-frequency liveness checks. Readiness is a point-in-time
  check, not a guarantee that the next write will succeed.
- Network calls have bounded SDK timeouts; retries are disabled where configured.
  The frontend displays live dependency failures or an unreachable backend rather
  than relabeling them as demo mode.

---

## Setup

```bash
# 1. Configure (optional locally — defaults to demo)
cp .env.example .env  # keep demo, or select live and fill in your Azure settings

# 2. Backend deps (Python 3.12)
python -m pip install --only-binary=:all: --require-hashes -r requirements.lock

# 3. Build the frontend (one-time; outputs frontend/dist that FastAPI serves)
npm --prefix frontend ci
npm --prefix frontend run build

# 4. Run
uvicorn app.main:app --host 127.0.0.1 --port 8000
#    → open http://localhost:8000

# or, build + run a loopback-only local demo with Docker Compose v2.24+
docker compose up --build
```

**Frontend dev mode** (hot reload, proxies the API to :8000):
```bash
npm --prefix frontend run dev      # in addition to uvicorn on :8000
```

**Seed the RAG pattern library into Azure AI Search** (once, after provisioning a
`patterns-index`):

```bash
python -m app.rag.ingestion
```

### Tests
```bash
python test_e2e_scenario.py    # full pipeline via FastAPI (offline, deterministic)
python -m evals.run_evals      # scoring & governance invariants
python -m unittest discover -s tests -v  # policy, graph routing, and persisted review regressions
```

## Repeatable delivery and operations (Phase 6)

Python dependencies now have a universal, SHA256-verified transitive lock; Node 24
build/browser dependencies use `npm ci`. [scripts/check.py](../scripts/check.py) runs
the same offline backend, E2E, scoring, dependency, TypeScript and SPA-build gates
locally and in CI. Automated Chromium tests cover clarification, privacy,
review/restoration, actual Markdown downloads, no-agent outcomes and deletion.

The [delivery workflow](../.github/workflows/ci.yml) adds pinned Actions, read-only
repository permissions, concurrency/time limits, a high-severity npm advisory gate,
and a container job that must follow successful quality checks. The production
image is non-root and fail-closed unless configured. CI verifies a read-only demo
container serves its built assets and preserves workflow policy boundaries.
Successful runs retain a tested image archive, metadata, dependency locks and
checksums for three days; **nothing is deployed automatically**.

See the [operations runbook](operations.md) for clean setup, browser checks,
lock regeneration, container use, required branch checks, release retention,
production approval, monitoring and rollback. Live identity/Azure integration and
organizational release controls remain operator-owned prerequisites.

### Dependencies
FastAPI · Uvicorn · LangGraph · LangChain (+ `langchain-openai`) · Pydantic ·
`azure-cosmos` · `azure-search-documents` · `azure-identity` · httpx. Full list in
[`requirements.txt`](../requirements.txt); verified installation uses
[`requirements.lock`](../requirements.lock).

---

## AI Tools Used (disclosure)

Here is how AI was used in building and running AgentSpark:

**In the product (runtime):**
- **Azure OpenAI (configured deployment)**: powers the Diagnostic, Mapping, Recommendation, and Blueprint
  agents via LangChain structured-output (function-calling) bindings.
- **Azure OpenAI Embeddings (`text-embedding-3-small`)**: an embeddings helper is
  available; it is not wired into the current keyword ingestion/retrieval path.
- **Azure AI Search**: keyword retrieval over the curated agentic-pattern knowledge base (RAG).
- **LangGraph**: deterministic multi-agent orchestration.

**During development (tooling):**
- **GitHub Copilot** and generative-AI coding assistants assist with implementation,
  scaffolding, and refactoring. AI-assisted output still requires human review and
  validation; it is not independent evidence that a design is correct.

AI techniques implemented: **structured output / function calling**, **RAG**, **multi-agent
orchestration**, **agentic memory** (Cosmos-persisted state), a **rule-based governance gate**,
**input guardrails** (prompt-injection + PII), **self-critique + fact completeness**, and **agent-trace
observability**.

---

## Repository layout
```
app/
  agents/        diagnostic · mapping · recommendation · blueprint · governance · typed policies
  orchestration/ langgraph_flow.py        (7-stage state graph + agent trace)
  scoring/       scoring_engine.py (12 criteria) · roi.py · portfolio.py
  rag/           pattern_library.py (50 patterns) · retrieval.py · ingestion.py · embeddings.py
  security/      auth.py · guardrails.py   (OIDC access + prompt/PII screening)
  database/      cosmos_client.py          (Cosmos + in-memory mock)
  api/           routes.py                 (FastAPI endpoints)
  utils/         models.py · llm.py · env.py
frontend/        React + TS + Vite + Tailwind SPA
  src/components/ Intake · Diagnose · Analyze · Blueprint · Portfolio · Security
evals/           run_evals.py              (scoring invariants)
test_e2e_scenario.py
```

For current maintenance and the forked base project's attribution, see the
[README](../README.md). Dependency details are in
[`requirements.txt`](../requirements.txt).
