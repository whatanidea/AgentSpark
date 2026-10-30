# Delivery and operations runbook

## Assessment inference models

New live assessments require an approved model ID at intake, before interviewing.
`GET /api/v1/models` is authenticated and returns identities/availability, never
keys or endpoint URLs. The approved IDs are `azure-openai` and
`foundry-claude-haiku`; `demo` is only available in deterministic demo mode.
Inference selection is independent of the customer's Azure/AWS blueprint target.

Claude rollout is deferred: keep `FOUNDRY_CLAUDE_ENABLED=false` and do not purchase
or deploy the paid Marketplace model. The live selector keeps Claude visible but
disabled with a "Coming soon" label and a mouse-hover/keyboard-focus tooltip.
Azure OpenAI remains selectable when configured; there is no Claude inference or
automatic fallback while disabled. Existing Azure credit eligibility and balances
are governed by the subscription's terms, not by this selector.

The existing Azure OpenAI settings remain the legacy default. To enable Claude,
deploy the Azure-hosted model, store its key in Key Vault, and configure
`FOUNDRY_CLAUDE_ENABLED=true`, `AZURE_ANTHROPIC_ENDPOINT` (HTTPS Foundry account root,
without `/anthropic`), `AZURE_ANTHROPIC_API_KEY`, and
`AZURE_ANTHROPIC_DEPLOYMENT`. Record its exact identity with
`AZURE_ANTHROPIC_MODEL_NAME` and `AZURE_ANTHROPIC_MODEL_VERSION`.
Restart after connection/key changes. `.env.example` lists these settings.

`infra/claude.bicep` is an **optional standalone resource-group deployment**; the
existing application stack does not automatically deploy or purchase Claude.
It targets consumption-based, Azure-hosted Haiku 5.5 version 2 with no automatic
version upgrade. Its capacity parameter is a rate limit, **not a spending cap**.
Verify Marketplace eligibility, current prices, supported geography, and terms
before deploying. Use real deploying-entity onboarding details; the organization
name is a secure parameter and must not be committed.

Once generation starts the assessment's connection identity is pinned. Changes to
that connection fail explicitly rather than switching models. Start a new
assessment to compare models. Key rotation alone does not change provenance;
restart to refresh cached clients. Historical reports without a recorded identity
say so. Deterministic scoring/ROI formulas and embeddings do not follow the chat
selector; model extraction and narrative outputs can differ.

`python -B scripts/check.py` and the browser suite remain deterministic and make
no billable model calls. The opt-in `scripts/check_live_claude.py` uses real Claude
for interview, analysis, AWS blueprint, PDF and archive checks, with **local
isolated auth/storage/pattern fixtures**, not production infrastructure. Supply
`--subscription`, `--resource-group`, `--account`, and optionally `--deployment`.
It captures the account key in memory, rejects budgets above USD 2, reserves
conservative byte/output-token bounds **before** each request, disables SDK
retries, limits request count/context size, and deletes its synthetic workflow.
Run only after checking current rates: its conservative USD 1/5 per million
input/output assumptions must remain above the deployed model's actual prices.
This runner is not an Azure subscription-wide spending cap.

## Repository identity and compatibility

The repository is now [whatanidea/AgentSpark](https://github.com/whatanidea/AgentSpark).
GitHub renamed the existing repository in place: commits, branches, issues, and
pull requests are retained. Existing clones can update their origin without
recloning or rewriting history:

```powershell
git remote set-url origin https://github.com/whatanidea/AgentSpark.git
```

The Compose service is now `agentspark`; use `docker compose up --build agentspark`
for service-specific commands. The container UID/GID, legacy internal account,
archive path, and `decision_archive` volume are unchanged. Keep the same Compose
project name when moving/renaming a checkout (`docker compose -p <existing-project>
up --build`), so Docker reuses the existing named archive volume. Do not use
`down --volumes` as a rebranding step.

Runtime environment keys (`AGENTSENSE_*`), reviewer role value
(`AgentSense.Reviewer`), Cosmos database default (`agentsense_db`), and browser
session/event identifiers remain compatible. Public package/image/release names
use AgentSpark. Older retained release archives keep their original filenames;
use the matching release metadata and checksum manifest rather than renaming them.
No Entra registration or Azure resource is changed merely by merging this PR.

### Fork connection and attribution

The upstream fork connection and Git history are intentionally preserved.
[GitHub's detachment documentation](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/detaching-a-fork)
warns that self-service detachment loses PRs, issues, and other repository metadata.
Deleting/recreating the repository has similar losses and is not a safe alternative.
To request detachment while retaining that metadata, contact
[GitHub Support](https://support.github.com/request/fork) and obtain explicit
confirmation of what they can preserve before authorizing any action.
No metadata-preserving detachment is assumed or claimed here.
Original author credits and provenance references remain; rebranding does not
remove attribution.

## What Phase 6 does (and does not do)

The [delivery workflow](../.github/workflows/ci.yml) validates pull requests, `main`
and `feat/**` pushes, and manual runs. It does **not** deploy, provision Azure,
publish an image to a registry, create a GitHub release, or approve a production
change. No Azure or OIDC credentials are supplied to CI.

Configure branch protection for `main` after this workflow is merged: require
`Tests, types and browser` and `Container smoke and release artifact`, require
review, and disallow bypasses as appropriate. Adding YAML alone does not configure
repository protections. Manual workflow runs are available after the workflow
exists on the default branch. Duplicate push/PR runs for a branch cancel older
in-progress runs; use the final PR run, not a cancelled predecessor.

## Phase 1 evidence register acceptance

1. As a contributor, save intake and open **Evidence & assumptions**. Add a
   client-stated fact, source-referenced finding with a reporting period, assumption,
   and open question. Link applicable diagnostic inputs.
2. Reload and confirm entries persist. Run analysis; inspect the linked findings,
   calculated recommendation basis, and outstanding validation checklist.
3. As another team reviewer, open the register and confirm the referenced finding
   with a method describing what was inspected. The team grant suffices without
   a token reviewer role; creator self-confirmation and viewer mutations are denied.
4. Confirmation invalidates the current analysis. Ask a contributor to rerun,
   then have the reviewer approve. Verify the evidence report in Blueprint,
   Markdown export, and the Home decision snapshot.
5. Edit the finding. Its confirmation and current analysis/approval must clear;
   the previous archived evidence report must remain unchanged.
6. Try saving from a stale tab: expect HTTP 409 and an explicit reload action,
   not an overwrite. Archived decisions remain read-only.

API: `GET`/`PUT /api/v1/sessions/{session_id}/evidence`; PUT requires the current
`revision` and an `entries` array (maximum 50, unique canonical UUID IDs). Client
payloads cannot set author, timestamps, or confirmation. Confirmation uses
`POST /api/v1/sessions/{session_id}/evidence/{entry_id}/confirm` with `revision`
and `method`. Existing ETags protect concurrent Cosmos/local writes in addition
to register revisions. Source references are plain text and are never fetched.
No infrastructure, index, dependency, or database migration is needed.

Model-assisted wording is tested through mocked generation contracts; offline
tests do not establish live model quality or independently validate evidence.

## Phase 2 implementation readiness acceptance

1. In a fictional workflow, open **Implementation readiness**. Confirm six areas,
   the selected Azure/AWS cloud prompts, inherited systems/region/constraints, and
   **Not assessed** until all required areas have findings.
2. Record a missing sandbox integration as blocked, with a proposed owner, next
   action and completion evidence. Supply the four pilot-definition fields.
   Save/reload; verify a P0 action and **Blocked** report.
3. Link a source-supported finding from Phase 1 and report a check ready before
   reviewer confirmation. Expect effective needs-validation, not ready. Have an
   independent team reviewer attest to the finding and record a client-confirmed
   owner/reference. Inspect dependencies; do not imply that the named client has
   authenticated or that AgentSpark tested the integration.
4. Check decision precedence and all-ready criteria. Leave a pilot field blank:
   **Ready with conditions** and a pilot-definition action must remain. Cloud/model
   availability, quotas, networking and residency require external validation.
5. Run analysis, inspect readiness in Analysis/Blueprint, and have another reviewer
   decide the advisory recommendation. Inspect standalone and blueprint Markdown
   exports and the Home archive snapshot for the same inputs and reviewer context.
6. Edit readiness after analysis; current analysis/approval must clear and the old
   archive must stay unchanged. Edit/remove linked evidence; unsupported ready
   checks must require validation. Change cloud or interview context; ready checks
   become needs-validation and confirmed owners become proposed.
7. Verify viewers/reviewers cannot edit readiness, creator self-review remains
   denied, revoked grants take immediate effect, and cross-workspace reads fail.
   Two stale tabs must produce HTTP 409 with an explicit reload, not an overwrite.

The report is advisory and does not change suitability scoring, governance rules
or authorize deployment. No live cloud validation, uploads, new infrastructure,
dependency changes or migration is included. Automated browser tests run in shared
local-demo identity; signed-role backend tests cover real authorization boundaries.

## PDF report acceptance

1. Analyze a fictional Azure or AWS workflow. In **Blueprint & Review**, verify
   **Export PDF** and the existing Markdown button are available.
2. Download the provisional PDF; open it in a PDF reader. Verify repeated
   provisional/not-approved status, analysis ID, target cloud/region, readable
   pagination, suitability, ROI assumptions/scenarios, evidence and readiness.
3. Have an authorized independent reviewer decide the recommendation, fetch it
   again, and export. Verify the reviewer identity/note/time and current decision.
   Rejected reports must not include an implementation architecture or scaffold.
4. Change inputs or reanalyze from another tab before exporting. Expect explicit
   refresh/error handling, not an obsolete approval or JSON saved as a PDF.
5. Verify owner/workspace read permissions, expiry, revocation and no-store headers
   apply to the PDF endpoint. Downloading never grants review or write access.
6. Check a long report and unsupported text characters. Tables/text should wrap
   across pages, unsupported glyphs remain explicit Unicode code points, and
   source URLs/HTML cannot trigger remote fetches. Mermaid is source text only.

Runtime installation uses the updated hash-locked requirements, including
ReportLab; the container needs no browser binary, OS fonts or writable report
directory. PDF parsing tests use `pypdf` from `requirements-tools.txt` outside the
runtime image. No infrastructure or database migration is required. No generated
PDF is stored by the application; downloaded copies require client-side handling.

## Supported toolchain and repeatable checks

- Python 3.12 and Node 24; see [.python-version](../.python-version) and
  [.node-version](../.node-version). Patch releases track those supported lines.
- Runtime direct pins: [requirements.txt](../requirements.txt). Universal
  transitive resolution and distribution SHA256 hashes:
  [requirements.lock](../requirements.lock). It covers Windows and Linux markers.
- Browser/build dependencies: [frontend/package-lock.json](../frontend/package-lock.json).
  Use `npm ci`, not an unconstrained install, for verification.

From the repository root, with the chosen Python virtual environment active:

```powershell
python -m pip install --only-binary=:all: --require-hashes -r requirements.lock
python -m pip install -r requirements-tools.txt
npm --prefix frontend ci
python scripts\check_lock.py
python scripts\check.py
npm --prefix frontend audit --audit-level=high
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:e2e
```

The check runner uses the active interpreter, strips inherited cloud/auth settings,
and selects local fictional-demo mode for its child processes. It runs unit
regressions, FastAPI E2E, scoring evaluations, `pip check`, TypeScript (including
the browser suite), and the production SPA build. `--only backend` or
`--only frontend` selects smaller checks. The browser suite owns its server on
loopback port 8767, refuses to reuse another process, deletes its own fictional
sessions, and stops its server afterward. Do not run it against a real service.
Traces/screenshots are disabled; all fixtures are fictional.

### Dependency updates

Edit direct pins deliberately, then use the pinned lock generator:

```powershell
python -m pip install -r requirements-tools.txt
python scripts\lock.py
python scripts\check_lock.py
```

The generator preserves already locked compatible versions. To intentionally
refresh transitive versions, update the direct constraints or remove the **specific
tracked lock file** in a reviewed dependency-update change, then regenerate and
test from a clean environment. Never hand-edit versions or distribution hashes.
Some organization mirrors advertise MD5 as well as SHA256: the generator removes
unsupported MD5 values and refuses packages without SHA256; it never disables
TLS or permits unhashed runtime installation. Configure `UV_DEFAULT_INDEX` and
pip's index normally when an approved mirror is required; no mirror URL or
credentials are embedded in the lock.

Frontend updates must update the package lock, run the advisory check and rebuild.
High/critical npm advisories fail CI; that check is time-dependent and may fail
even without code changes. Investigate and update deliberately, not with
`--force`, skipped checks, or an unreviewed major upgrade. Python hash verification
and `pip check` are integrity/compatibility gates, **not a vulnerability audit**.
Review Python/container advisories and base-image updates as part of release
approval; CI does not claim an exhaustive security scan.

## Container behavior

The multi-stage [Dockerfile](../Dockerfile) builds and type-checks the SPA, installs
hash-locked binary Python distributions without a compiler, and copies only the
runtime application, policies, and compiled frontend. It runs as UID/GID 10001,
defaults to `ENVIRONMENT=production`, and refuses an unconfigured startup.
Git metadata, `.env*`, tests, host dependencies and host build outputs are not
runtime inputs. No source bind mount can hide the compiled assets.

For a **local-only, unauthenticated fictional demo**, Docker Compose v2.24+:

```powershell
docker compose up --build --detach
python scripts\smoke.py --url http://127.0.0.1:8000 --expect-mode demo --demo-workflow
docker compose down
```

Compose reads `.env` if present, otherwise uses local demo defaults, binds only to
loopback, drops capabilities, prevents privilege escalation and uses a read-only
filesystem with temporary scratch space. A configured `.env` can select live or
production mode; it must then include the OIDC/Azure prerequisites. Do not expose
the shared local demo publicly or scale it to multiple workers. Process-local
sessions disappear on restart, but the `decision_archive` named volume preserves
SQLite decision snapshots at `/home/agentsense/.agentspark/decisions.sqlite3`.
Normal `docker compose down` preserves that volume; removing it destroys the demo
archive. The archive mount is writable while the root filesystem remains
read-only. Compose is a local launcher, not a production orchestrator.

### Decision archive operations

`DECISION_ARCHIVE_RETENTION_DAYS` defaults to 30 (allowed range 1–3650).
Set it before startup; it affects only newly finalized decisions. Active-session
retention remains controlled independently by `SESSION_RETENTION_HOURS`.
Local non-container previews use `~/.agentspark/decisions.sqlite3` unless
`DEMO_ARCHIVE_PATH` is configured. Protect the directory with appropriate OS
permissions; demo identity/data remain shared, not tenant-isolated. `/ready`
checks that the demo archive is writable and reports failures without falling
back to transient storage.

Live archives use the existing TTL-enabled `/session_id` Cosmos container.
Retain range indexing for `home.sort_key`; Home performs bounded owner-filtered
cross-partition keyset queries. Final session updates and decision creation use a
same-partition transaction and ETag preconditions. Legacy session summaries are
listed in a separate bounded fallback phase and are not backfilled into archives.
Review costs, indexing and representative load with real Cosmos before release.
Contract tests do not substitute for cloud integration testing.

Workflow deletion cascades to every retained snapshot/comment. Cosmos deletion
uses batches of at most 99 archive documents before conditionally deleting the
active session. A failure can leave a partial deletion; the API reports failure,
and operators/users must retry rather than assume success. Application expiry is
immediate; Cosmos TTL cleanup is asynchronous and local SQLite expiry is pruned
on access. SQLite secure deletion is enabled, but filesystem snapshots, backups,
logs, telemetry and user exports require separate retention controls.

These are minimized, deletable decision snapshots, not an immutable audit log.
They omit complete transcripts and code scaffolds. Current live access is personal
and owner-isolated in personal scope; selected team workspaces use active
organization membership and server-checked team permissions.

### Azure and AWS assessment targets

The target-cloud feature changes advisory assessments only. AgentSpark's Azure
hosting, Cosmos persistence, Search source and OpenAI configuration are unchanged.
Do not request customer AWS credentials or treat a blueprint approval as deployment
authorization. New browser intakes require Azure or AWS explicitly; historical
records default to Azure, and historical decision snapshots are not rewritten.

`cloud_mapping` is the provider-neutral mapping. New Azure analyses also populate
`azure_mapping` for compatibility; AWS analyses leave that legacy field empty.
The existing pattern index does not need reseeding: AWS assessments use neutral
design descriptions from the configured source with curated AWS implementation
metadata, distinct hashes and provider-qualified source links. Missing required
design sources still fail explicitly rather than falling back in live mode.

Before rollout run the backend suite, frontend typecheck/build and Playwright.
Acceptance-test both targets, preference-change invalidation, old Azure records
and separate creator/reviewer identities on an AWS team workflow. Region/model
availability and residency need separate customer validation; offline fixtures
and mocked model tests do not establish live generation quality.

### Organization directory and team access

Before upgrading a live deployment, provision a `directory` container in the
configured Cosmos database with partition key `/organization_id`. Disable
automatic expiry (`defaultTtl` absent or `-1`), and retain range indexing on
`directory_key` for bounded keyset listings. The application does not create or
migrate containers. `/ready` reports `tenant_directory` unavailable if the
container cannot be read, has the wrong partition key, or expires directory records.
Organization creation writes the organization and founding-owner membership in
one same-partition transaction. Membership/grant changes use ETag preconditions;
409 requires fetching the current version before resubmitting.

Workflows and decisions remain in the `/session_id` container; new team records
carry organization/team IDs. Existing personal records remain personal and are
not backfilled or transferred. Home uses scoped cross-partition queries; review
their indexing, RU costs, latency, and organization size/load limits against real
Cosmos infrastructure before rollout. Offline contracts are not cloud validation.

Local demo stores the directory next to its archive, deriving
`decisions.tenants.sqlite3` from `decisions.sqlite3` (or the configured archive
stem). The Compose archive volume preserves both files. Protect and back up both;
session restart still loses process-local active workflows. Directory membership
does not expire with session or decision retention. There is no organization
deletion/ownership-transfer API in this phase; plan directory retention and
administrative cleanup separately. Demo remains one shared unauthenticated identity.

Acceptance-test separate verified identities for owner, administrator,
contributor, reviewer, viewer and outsider. Verify personal/organization/team
isolation on reads, writes, model-triggering operations, Home, archives and
deletion. Owners/admins read/edit/delete across their organization's teams;
contributors read/edit and delete their own workflows/history, reviewers read/review, and viewers only read.
Team review requires an explicit team reviewer grant and an identity other than
the creator, without an additional token role. Personal review still requires
the configured token role. Select the team workspace to see its pending reviews;
personal Home never lists team records. Revocation must deny subsequent
requests; rejoining must not restore grants from the previous membership.
Invite people with single-purpose invite links (Organizations & teams > Invite
links): pick role/team roles, expiry and maximum uses, send the link out of band,
and revoke unused links when no longer needed. Links carry a 256-bit secret in the
URL fragment; only its SHA-256 is stored, redemption requires an authenticated
identity, is atomic against `max_uses`, never downgrades access, and only owners
can issue administrator invites. For Entra staging, first add the person to the
tenant (B2B guest invitation), then send the invite link; they open it, choose
**Sign in with Microsoft** (a pop-up, so the invite stays on the page), and select
**Join organization**. Adding members by opaque
identity ID remains available; email delivery and SSO provisioning are not supplied. Do not interpret workspace headers or disabled UI
buttons as authorization.

Browser/backend gates use isolated temporary archives and remove their own files.
The CI container smoke uses a disposable writable tmpfs archive mount for UID/GID
10001; it does not persist fictional CI decisions. Local Docker validation is
unavailable on hosts without Docker; require the hosted container gate before merge.

The image health check uses dependency-free `/health`. `/ready` probes live
dependencies, including a billable one-token OpenAI call: run it conservatively,
not as a high-frequency liveness check. The smoke command requires an expected
runtime mode, validates the built SPA and hashed assets, and requires HTTPS for
non-loopback origins. Without `--demo-workflow` it performs no workflow writes.
That flag is refused against live/OIDC services and creates/deletes only its own
fictional case.

## Azure staging environment

### Runtime-decision release verification

Architecture runtime selection is application-only: no new services, credentials,
runtime packages, schema migration or feature-specific environment variables.
Older assessments remain readable with runtime selection marked not assessed.
After release, complete runtime requirements in the Diagnostic checklist and
rerun analysis. Verify separate reasoning/durable layers, alternatives and versions
in Analysis, Blueprint, PDF/Markdown and a newly archived decision. Verify a simple
deterministic case selects neither agent framework nor durable engine; a fictional
dynamic, long-running case with an approved Temporal standard can select LangGraph
plus Temporal. Unknown requirements must remain unresolved, not default to LangGraph.
These checks do not deploy either customer runtime or validate their availability.

`azure.yaml` and `infra/` define a low-cost staging stack in a single
resource group (`rg-<env>`). It contains:

- Container Apps (consumption, scales to zero, probes on `/health` only)
- ACR Basic, with images built remotely so Docker isn't needed locally
- Cosmos DB free tier: `workflows` (`/session_id`, `defaultTtl=-1`) and
  `directory` (`/organization_id`, no TTL)
- AI Search Free, Azure OpenAI `gpt-5-mini` (Global Standard). Because it's a
  reasoning model, the app is configured with `AZURE_OPENAI_REASONING_EFFORT=low`
  (which omits `temperature`), `AZURE_OPENAI_TIMEOUT_SECONDS=120` (blueprint generation can exceed 60 seconds) and API version
  `2025-04-01-preview`. Leave the effort unset for non-reasoning deployments.
- Key Vault (RBAC) and Log Analytics (1 GB/day cap)

The app's user-assigned identity pulls images and resolves Cosmos, Search query
and OpenAI keys through Key Vault references; ACR admin is disabled.

```powershell
azd env new agentspark-stg --subscription <subscription-id> --location westus3
./infra/scripts/create-entra-app.ps1        # sets AUTH_AUDIENCE (Entra API + reviewer role)
azd provision --preview                     # review the what-if first
azd up                                      # provision + remote ACR build + deploy
./infra/scripts/seed-search.ps1 -Python <venv python>   # create and seed patterns-index
# enable browser sign-in at the app URL (SPA redirect URI + tenant-wide consent; needs an Entra admin)
./infra/scripts/create-entra-app.ps1 -SpaRedirectUris "https://<app-fqdn>/auth-redirect.html,http://localhost:5173/auth-redirect.html"
```

If `azd deploy` fails with ACR `InvalidCorrelationRequestId` (seen with azd
1.22; upgrade azd first), build and roll out manually. Recording the image in the
azd env keeps the next `azd provision` from reverting the app to the placeholder:

```powershell
az acr build -r <acr> -t agentspark/web-<env>:<tag> --platform linux/amd64 --no-logs .
az containerapp update -n <app> -g rg-<env> --image <acr>.azurecr.io/agentspark/web-<env>:<tag>
azd env set SERVICE_WEB_IMAGE_NAME <acr>.azurecr.io/agentspark/web-<env>:<tag>
```

Structured agent output uses function calling (not strict JSON-schema mode),
because Azure strict mode rejects the optional fields in the app's schemas. The
Diagnostic Agent retries extraction once if a "supplied" fact's quote isn't
found verbatim (ignoring whitespace and typographic punctuation) in the user
input. This also applies to live guided-chat deployment/readiness/pilot capture.
If the second attempt also fails, `/chat` or uncached `/analyze` returns 502.
App logs name recognized affected fields, never their content or unknown
model-generated field names.

For guided-interview acceptance, verify the visible round counter, a maximum of
three related questions, omission of known facts and a hard stop at round ten.
Reload must preserve the limit; an eleventh API chat request must return 409
without calling the model or changing history. Complete missing fields through
the editable checklist, rerun analysis and export a PDF. Confirm saved deployment
constraints and draft readiness findings appear, but no automatic evidence,
owner confirmations, Ready status or human approval is created.
Exercise stale checklist saves (409 with unsaved edits retained), invalid counts,
read-only team access and blocked/failed turns not consuming the budget. A changed
checklist invalidates current analysis/approval; archived decisions stay unchanged.

Users sign in with **Sign in with Microsoft** (MSAL pop-up, authorization code + PKCE,
configured by `AUTH_SPA_CLIENT_ID`, `AUTH_SPA_AUTHORITY` and `AUTH_SPA_SCOPE`;
tokens are held in memory only and the pop-up returns to the blank `/auth-redirect.html`). For scripted tests, get a token with
`az account get-access-token --tenant <tenant-id> --scope api://<AUTH_AUDIENCE>/access_as_user`
and use "Use an access token instead".
Personal-workflow reviewers need the reviewer app role (value `AgentSense.Reviewer`,
display name `AgentSpark Reviewer` for updated registrations; older registrations
may still display `AgentSense Reviewer`) assigned in the
enterprise application; team reviewers only need their in-app team reviewer grant.
Call `/ready` once after seeding; run acceptance with two
identities so creator/reviewer separation is exercised. `azd down --purge`
deletes the whole environment.

## Release artifact and approval

After quality gates, CI builds `linux/amd64`, checks non-root operation, verifies
unconfigured production startup fails, and runs a complete fictional workflow
against a read-only, capability-dropped container. A successful run uploads:

- `agentspark-linux-amd64.tar.gz`: `docker save` archive of the tested image.
- `image-inspect.json`: image ID, labels, runtime settings and layer metadata.
- Runtime and frontend dependency locks.
- `release.json`: exact tested Git revision, image tag/platform, `deployed: false`.
- `SHA256SUMS`: integrity checks for those files.

The artifact is named `agentspark-<tested-sha>-linux-amd64` and expires after
**three days** to bound hosted artifact storage. Before expiry, an authorized
release owner must retain the approved archive and metadata in the organization's
approved immutable release storage if a long-term release/rollback is needed.
No registry or archival service is configured automatically.

Use the final successful run's tested SHA. Pull-request runs may use GitHub's
synthetic merge SHA, not the branch-head SHA. A merged `main` run creates the
release candidate for that exact merged commit; do not promote a stale PR build.
Checksums detect corruption, not malicious replacement of both archive and sums:
verify the trusted GitHub run/revision and approval record as well.

In the extracted artifact directory, verify every checksum before loading:

```powershell
Get-Content SHA256SUMS | ForEach-Object {
  $expected, $name = $_ -split '\s+', 2
  if ((Get-FileHash -LiteralPath $name -Algorithm SHA256).Hash -ne $expected) {
    throw "Release checksum mismatch: $name"
  }
}
docker load --input agentspark-linux-amd64.tar.gz
$release = Get-Content release.json -Raw | ConvertFrom-Json
docker image inspect $release.image
```

Base tags (`python:3.12-slim-bookworm`, `node:24-bookworm-slim`) intentionally
receive patch updates. The Git commit and dependency locks do **not** guarantee a
byte-identical rebuild at a later date. Promote/roll back the tested archive and
recorded image ID, not a new rebuild of the same tag. Revalidate whenever a base
image or dependency changes.

### Pre-release checklist

1. All required jobs passed on the selected merged commit; review tests and
   dependency changes. Record image ID, archive checksum and approval.
2. Provision/configure existing infrastructure separately: HTTPS, identity
   provider/API audience/reviewer role, secret injection, network/rate limits,
   Azure endpoints and policies. Never bake `.env` or tokens into images.
3. Enable Cosmos per-document TTL, confirm workflows partition `/session_id` and
   non-expiring directory partition `/organization_id`, approve
   retention and legacy-data migration. Backups and external log retention require
   separate approval; active-document deletion is not backup erasure.
4. Confirm model deployment, seeded Search patterns (including required IDs),
   resource permissions, capacity and budget. `/ready` must report the intended
   live mode and ready dependencies.
5. Validate signed-in personal/team isolation, role permissions, revocation and
   independent reviewer access using approved test
   identities in a staging environment. Offline CI does **not** verify a real
   provider, Azure service or production network.
6. Stage the exact image with the host's deployment/rollback mechanism. Run
   `python scripts\smoke.py --url https://<staging-host> --expect-mode live`
   and approved authenticated acceptance checks before traffic promotion.
7. Retain the previous approved image and compatible configuration. Get explicit
   operator approval before any production change; no workflow here performs it.

## Monitoring, incident handling and rollback

- Monitor `/health` availability, conservatively polled `/ready`, HTTP
  401/403/409/429/5xx rates, latency, dependency throttling, session expiry,
  resource usage and model cost. Set organization-owned alert thresholds/SLOs.
  No monitoring backend or alert rules are provisioned by this phase.
- Treat readiness failure as an incident/dependency signal, never as permission to
  switch live traffic to demo mode. Check identity/JWKS reachability, endpoint/key
  rotation, Search seeding and Cosmos TTL/permissions; do not log bearer tokens,
  user content, raw dependency exceptions or credential-bearing commands.
- A 409 is a concurrency conflict: reload current state before retrying. A missing
  or expired session is not an Azure outage. Restore data only under the approved
  retention and access policy; do not make expired/unowned legacy records public.
- For rollback, stop promotion and route traffic to the previous approved image
  using the hosting platform's change controls. Restore its compatible
  configuration/secret references, then check liveness, readiness, assets and
  approved authenticated acceptance. Keep rollback evidence and incident timing.
- The directory container is an additive prerequisite; there is no automated
  database migration or reassignment of existing personal data. A future incompatible data
  change requires its own backup/migration/rollback plan; replacing the image does
  not roll back data, external effects, approvals, exports or retention deletions.
