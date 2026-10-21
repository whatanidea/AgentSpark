# AgentSpark - The Agent for All your Agentic Needs.

> **The agent that tells you where agents belong.**

AgentSpark is an AI-powered enterprise transformation advisor. Before an organization
spends a single sprint "agentifying" a workflow, AgentSpark answers four questions:

1. **IF** AI agents should be used at all
2. **WHERE** they add the most value across a backlog
3. **WHICH** architecture pattern fits
4. **HOW** to implement it — with an Azure mapping, a governance gate, and starter code

It is a **meta-agent**: a multi-agent system whose job is to design *other* agentic systems
responsibly — including telling you when the honest answer is "don't use an agent here."

Existing `AGENTSENSE_*` configuration keys, the `AgentSense.Reviewer` role, and
repository/package identifiers remain unchanged for compatibility.

---

## What it does (end to end)

A seven-stage pipeline orchestrated with **LangGraph**:

| # | Stage | Agent / Component | Output |
|---|-------|-------------------|--------|
| 1 | Diagnose | **Diagnostic Agent** | Workflow facts with supplied/inferred/missing evidence; incomplete inputs return follow-up questions and stop |
| 2 | Score | **Scoring Engine** | Agentification Readiness Index — 12 weighted, explained criteria |
| 3 | Map | **Mapping Agent** | Recommended Microsoft Azure service stack |
| 4 | Recommend | **Recommendation Agent** | Readiness-constrained design with pattern IDs, source snapshots, completeness and self-critique |
| 5 | Estimate | **ROI Engine** | Explicit assumptions and conservative/base/optimistic labor-effort scenarios |
| 6 | Govern | **Governance Agent** | Validated, ordered policies over risk, completeness, autonomy, and actual first-year ROI |
| 7 | Outcome | **Blueprint Agent** or rejection outcome | Approved/provisional blueprint, or a non-agentic alternative without generating a blueprint |

Every run emits an **agent trace** (per-step status + latency) for observability/audit.

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
membership and team permissions. Team review requires an explicit reviewer grant,
the configured token role, and a reviewer other than the workflow creator;
personal review still requires its owner and the token role. The verified subject
replaces the submitted reviewer name. ETags and analysis IDs
provide concurrency protection, not authorization. Reviews remain advisory rather
than an execution authority or an immutable compliance ledger.

Policies are validated at startup from `governance_rules.yaml`. Unknown fields,
operators, values, decisions, and duplicate IDs fail startup with a logged error.
Each policy contains `conditions` with `field`, `operator` (`eq`, `lt`, `gt`), and
`value`; all conditions must match, and the first matching policy wins. There are no
Python expressions or `eval`. If no policy matches, `default_decision` is honored.

Cost governance compares **annual gross labor savings** with the **one-time build
cost** over a first-year horizon, subtracting annual operating costs when supplied.
A negative base-case first-year balance rejects the recommendation. When operating
costs are unknown, the balance, payback and multiple are explicitly **before**
operating costs, not a claim of net cash savings.
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
        Azure OpenAI (GPT-4o)   Azure AI Search   Azure Cosmos DB   Azure App Service
```

- **Frontend:** React + TypeScript + Vite + TailwindCSS SPA (built to static, served by
  FastAPI on a single origin — no separate frontend server, no CORS)
  with a light workspace, charcoal typography, teal actions, responsive workflow
  navigation, and visible keyboard focus. Review, rejection, and clarification
  states remain distinct; approval is advisory, not execution authority.
- **API / Orchestration:** FastAPI + LangGraph state graph
- **Reasoning:** Azure OpenAI (GPT-4o) via LangChain, using **structured outputs / function
  calling** so every agent returns schema-validated Pydantic objects
- **Knowledge (RAG):** Azure AI Search over a curated agentic-pattern library
- **State / Memory:** Azure Cosmos DB (per-session `WorkflowState`)
- **Delivery:** tested Docker image archives via [GitHub Actions](.github/workflows/ci.yml);
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
| `AUTH_REVIEWER_ROLE` | Role claim required to review; default `AgentSense.Reviewer` |
| `SESSION_RETENTION_HOURS` | Absolute lifetime for new sessions, integer 1–720; default 24 |

Bearer validation allows **RS256 only**, validates issuer/audience/signature and
expiry, requires `sub`, `iss`, `aud`, `iat`, `exp`, and checks `nbf` when present.
Identity headers are not trusted. Use an API-specific access-token audience:
do not configure a shared browser-client/ID-token audience. Owners are opaque
hashes of issuer and subject; knowing a session ID grants no access. Foreign,
expired, and missing sessions return indistinguishable 404 responses.
`GET /api/v1/auth/config`, `/health`, `/ready`, and static assets are public;
all other `/api/` requests require authentication in OIDC mode. Personal review
requires ownership and the configured token role; team review additionally follows
the independent-review rules below.

### Organizations and team workspaces

Use **Organizations & teams** to create an organization, manage membership and
select a team workspace. New organizations have a founding owner. Share the opaque
identity ID shown on that page with an administrator to request membership;
email invitations and identity-provider directory lookup are not implemented.

| Membership or team role | Team workflow permissions |
|---|---|
| Organization owner / administrator | Read, create/edit, and delete across the organization's teams |
| Contributor | Read and create/edit in the assigned team |
| Reviewer | Read and review in the assigned team |
| Viewer | Read only in the assigned team |

Team roles can be combined. Owners/administrators need an explicit team reviewer
grant to review; no team member, including the founding owner, can review a
workflow they created. OIDC review also requires `AUTH_REVIEWER_ROLE` in the
verified token. Local demo uses one shared identity, so it cannot demonstrate
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
and rejected filters. Open an active workflow to continue it, or open a finalized
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

### Privacy scope

Intake and diagnostic messages are screened, and recognized email/phone/card/SSN
and credential patterns are redacted **before model calls**, storage, and API
echoes. Nested recommendation content is sanitized on save/read; blocked prompts
are not saved in the interview or event preview. Events retain only scanner
findings (last 100); interviews are capped at 100 stored messages. API validation
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
defaults are not. Supplied live facts require a verbatim quote in user interview
input or intake context. Assistant statements and demo sources cannot ground live
extraction. Unverifiable supplied quotations fail explicitly (`502`).
**Supplied means reported, not independently verified**: quote matching does not
prove the model interpreted the statement correctly. Review the evidence and
validate actual workload baselines before relying on a recommendation.

Demo requests explicitly select `demo_scenario: "invoice" | "support" | "claims" |
"payroll"` on intake or chat. The UI's sample actions set this in demo mode.
Fixtures are labeled fictional and **do not adapt to interview text or edits to
intake**. Clear the selection for an unselected demo session, or restart in live
mode to analyze your own input. Live requests cannot select fixtures (`422`);
live sample buttons only populate intake templates.

### Grounded and consistent designs

The readiness score prescribes the design and autonomy: High uses supervisor/worker,
Medium uses a grounded copilot, Low uses deterministic RPA plus AI exception triage,
and Not Suitable uses standard software. Required human gates are preserved.
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

### Estimates, not guaranteed savings

The analysis request optionally accepts `{"roi_assumptions": {...}}`; validated
inputs are persisted and reused by later requests without overrides. The Workflow
Analysis screen exposes the same inputs. USD defaults:

| Input | Default | Valid range |
|---|---:|---|
| `working_days_per_year` | 250 | integer 1-366 |
| `loaded_hourly_rate` | 45 | 1-1,000 |
| `minutes_per_step` | 1.5 | 0-60 |
| `minutes_per_decision` | 2 | 0-240 |
| `implementation_cost_per_agent` | 12,000 | integer 1-1,000,000 |
| `annual_operating_cost` | null (unknown) | null or integer 0-1,000,000,000 |

Manual minutes/item = steps x minutes/step + decisions x additional minutes/decision.
Gross saved hours = daily volume x working days x minutes/item x automation / 60;
gross labor savings = saved hours x loaded hourly rate. Tier automation heuristics
are High 0.70, Medium 0.45, Low 0.20, Not Suitable 0; required HITL multiplies by 0.8.
Illustrative build units are 4/2/1/0 respectively, multiplied by the input build
cost. These are **cost heuristics, not promises about actual agent counts**; the
legacy API input name `implementation_cost_per_agent` is retained.

Conservative/base/optimistic scenarios vary automation by 0.75x/1x/1.15x (capped at
100%); all other inputs stay fixed. These are what-if sensitivity cases, not
confidence intervals. The base case drives governance; a positive base case does
not imply the conservative case passes policy. Known operating cost is subtracted
for net annual savings, payback, multiple, and the first-year balance. Unknown
operating cost stays null, with unknown net savings. Zero savings means no payback
(`null`), not zero months; a no-agent estimate has no artificial $1 build cost.

Labor effort is not necessarily cash released or headcount reduced. No staffing
capacity cap, measured task times, integration quote, Azure price lookup, or
probabilistic forecast is implied. Validate assumptions and budgets with owners.

### Workflow-specific blueprints and migration

Blueprint generation receives workflow/intake, evidence, score, mapping, grounded
references, policy result and ROI assumptions/scenarios. The diagram represents the
customer workflow rather than AgentSpark's internal agents. Generated code is
labeled **illustrative, untested, not deployment-ready**, including in Markdown
exports; demo endpoints deliberately return `501` until integrations, authorization,
audit and approval enforcement are implemented. Azure costs are unpriced cost
drivers, not a fabricated monthly quote.

Existing stored results remain readable. Legacy estimates without scenarios are
marked for reanalysis, not relabeled as audited estimates. A new approval of an old
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
uvicorn app.main:app --host 0.0.0.0 --port 8000
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
build/browser dependencies use `npm ci`. [scripts/check.py](scripts/check.py) runs
the same offline backend, E2E, scoring, dependency, TypeScript and SPA-build gates
locally and in CI. Automated Chromium tests cover clarification, privacy,
review/restoration, actual Markdown downloads, no-agent outcomes and deletion.

The [delivery workflow](.github/workflows/ci.yml) adds pinned Actions, read-only
repository permissions, concurrency/time limits, a high-severity npm advisory gate,
and a container job that must follow successful quality checks. The production
image is non-root and fail-closed unless configured. CI verifies a read-only demo
container serves its built assets and preserves workflow policy boundaries.
Successful runs retain a tested image archive, metadata, dependency locks and
checksums for three days; **nothing is deployed automatically**.

See the [operations runbook](docs/operations.md) for clean setup, browser checks,
lock regeneration, container use, required branch checks, release retention,
production approval, monitoring and rollback. Live identity/Azure integration and
organizational release controls remain operator-owned prerequisites.

### Dependencies
FastAPI · Uvicorn · LangGraph · LangChain (+ `langchain-openai`) · Pydantic ·
`azure-cosmos` · `azure-search-documents` · `azure-identity` · httpx. Full list in
[`requirements.txt`](requirements.txt); verified installation uses
[`requirements.lock`](requirements.lock).

---

## AI Tools Used (disclosure)

Here is how AI was used in building and running AgentSpark:

**In the product (runtime):**
- **Azure OpenAI — GPT-4o**: powers the Diagnostic, Mapping, Recommendation, and Blueprint
  agents via LangChain structured-output (function-calling) bindings.
- **Azure OpenAI Embeddings (`text-embedding-3-small`)**: an embeddings helper is
  available; it is not wired into the current keyword ingestion/retrieval path.
- **Azure AI Search**: keyword retrieval over the curated agentic-pattern knowledge base (RAG).
- **LangGraph**: deterministic multi-agent orchestration.

**During development (tooling):**
- **GitHub Copilot** and generative-AI coding assistants were used for boilerplate, scaffolding,
  and refactoring. All architecture decisions, the 12-criteria scoring model, the governance/HITL
  logic, the pattern library, and the agent prompts were designed and reviewed by the author.

AI techniques implemented: **structured output / function calling**, **RAG**, **multi-agent
orchestration**, **agentic memory** (Cosmos-persisted state), a **rule-based governance gate**,
**input guardrails** (prompt-injection + PII), **self-critique + fact completeness**, and **agent-trace
observability**.

---

## Author

**Shriram K Vasudevan** — AI Architect · Senior Manager, Accenture · Microsoft MVP/Learn Ambassador · Docker Captain · 54+ books, 35+ patents

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

_All work is original. Open-source libraries are credited via `requirements.txt`._
