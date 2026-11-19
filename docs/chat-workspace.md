# Conversational workspace feature

## Implementation status

Home offers **Explore in Chat** without creating a conversation or a workflow. Each workspace destination has a distinct line icon and a visible label. Chat follows **Explore → Review a next step → Continue in workflow**, derived from the current suggestion, preview and confirmed link. A starter or follow-up fills the composer for editing; it never sends automatically or replaces an existing draft. Users can continue talking, dismiss a suggestion, review Discovery for an open question, or review Enterprise Intake for a known workflow. A confirmed thread opens its existing record rather than creating another. The work-story palette supports both appearance modes, with no change to retention or authorization.

- [x] Phase 1: private, workspace-scoped conversations; fixed 30-day expiry;
  bounded generation, streamed response/progress, Stop and recoverable Retry.
- [x] Phase 2: source-linked, editable Discovery and Enterprise Intake previews;
  explicit permission-checked, idempotent creation and existing-workflow continuation.
- [x] Phase 3: responsive interface, permission/expiry/recovery/routing tests,
  full regression qualification and an isolated local preview.

This file is the feature implementation record and is updated as phases are verified.
The implementation was qualified locally first. The user subsequently approved
merging and deploying it to the existing staging environment on 2026-11-17.
The image-only release preserves live/OIDC settings and existing resources.

### Dependency release remediation

PR #56 initially stopped at the npm advisory gate for picomatch. The user approved
pinning the reviewed upstream fix to immutable commit
`c63a5bf4e61dbdb81bc41e97dc2616c30acce337`, and separately approved exact-source
handling of GHSA-fc5q-39xc-vjpf while its version-only advisory remains applicable.
The SHA512-locked override changes no runtime dependency or build-tool major.
The gate verifies the parser and all consumers, exercises bounded attack inputs,
and still rejects audit/registry errors or any other high/critical advisory.
See [the operations runbook](operations.md#temporary-source-pinned-picomatch-fix).

Local patch qualification: six dependency-security tests and TypeScript/build
passed. A separate 112,464-case comparison against published picomatch 4.0.7
preserved matching results. The published baseline exceeded an isolated
one-second hostile-input deadline; the pinned patch completed. Full exact-source
CI and staging acceptance subsequently passed, as recorded below.
An intermediate CI run passed the source-aware advisory gate, backend, types and
build, but timed out during browser OS package installation on Ubuntu 26. Delivery
jobs now pin Ubuntu 24.04; the quality budget includes setup plus the full suite.

### Staging release acceptance

PR #56 merged as `19282360198fd5836cf2a0235b086458efc61186`.
[Merged-source delivery gates](https://github.com/whatanidea/AgentSpark/actions/runs/44279861626)
passed both jobs: 626 backend tests, six dependency-security tests, backend
E2E/evaluations, TypeScript/build, 342 standard browser cases, 11 Discovery
cases, Linux container lifecycle checks and the immutable release artifact.

On 2026-11-18, the exact merged source was deployed to the existing staging
Container App as revision `ca-web-6qyihtgdcltiy--0000050`, healthy at 100% traffic.
ACR Linux/amd64 run `ds1j` succeeded; an independent registry lookup confirmed:

```text
cr6qyihtgdcltiy.azurecr.io/agentspark/web-agentspark-stg@sha256:aa8b7e93031c651b63ca78d2d0c89a3859c35726e74399b87ce72ba09c695dc9
```

Post-deployment acceptance passed for all 24 public pages, assets/fonts,
OIDC/private readiness, authenticated Home, scoped libraries and the existing
hosted connector. Live Cosmos chat create/read/ETag rename/list/delete passed,
including exact creation+30-day expiry, unchanged expiry after rename, metadata-only
history and anonymous rejection. The fictional acceptance chat was deleted and
confirmed inaccessible. No live inference, real connector import or workflow
creation was performed by this deployment check.

The update changed only the image. Protected settings, identities, permissions,
secrets and fonts remained unchanged. Revision49 remains healthy and inactive
at 0% as rollback. Only the accepted image was persisted to the existing local
deployment environment; every other environment value was verified unchanged.
The source-pinned picomatch remediation remains temporary pending an official
patched release. Moderate Vite advisory GHSA-8g5g-mxqh-grgj remains explicitly
reported; this release does not claim zero advisories.

## Product and data contract

- Chat is a separate conversational front door, not the existing ten-round
  diagnostic interview. The existing interview, scoring and readiness gates remain.
- Conversations are private to the initiating identity within the selected
  personal or organization/team workspace. Active membership is rechecked.
  Workspace readers may chat privately; creating shared workflows still requires
  write permission. Local demo remains explicitly unauthenticated/shared.
- Chat expires 30 days after creation. Messages, previews and summaries do not
  renew that expiry. Expired content cannot be read or sent to the model.
  Earlier deletion is available; there is no cross-chat persistent memory.
  Database TTL is cleanup, not the authorization boundary. Backups and provider
  abuse-monitoring retention are separate and not promised to vanish at the deadline.
- The model proposes actions; it cannot execute them. Manual launch controls
  remain available. No engagement exists until an edited preview is confirmed.
- Only user statements can ground copied context. Assistant suggestions are
  never evidence. Reviewed statements remain unverified, not measured facts.
- A confirmed handoff copies only its displayed, bounded excerpts and reviewed
  fields into a separately retained workflow. Discovery normally lasts 30 days;
  assessments use existing session retention (24 hours by default). Deleting
  chat does not delete these independently approved records.
- One originating workflow per conversation prevents duplicate/conflicting
  launches. Continue through existing Discovery opportunity review/handoff to
  assess a discovered opportunity; start a new conversation for unrelated work.
- Use only the approved Azure OpenAI connection, or clearly labelled deterministic
  local demo. No provider fallback, public ChatGPT connection or new Azure resources.
- Progress reports actual server stages. Generation has indeterminate progress,
  not invented completion percentages. Completed paragraphs can stream after
  privacy screening; the final reply/action proposal is saved only after validation.
- Stop cancels the client stream and invalidates the server reservation. An
  interrupted request can be retried without another user message or workflow.
- Initial scope excludes chat attachments, web browsing, voice, image generation,
  arbitrary execution and persistent memory.

## Validation record

| Gate | Result |
| --- | --- |
| New conversation API/model/storage contracts | 45 passed |
| Full backend suite | 626 passed |
| Existing backend end-to-end scenario | Passed |
| Existing scoring/portfolio evaluation invariants | Passed |
| Dependency consistency | Passed; existing unrelated invalid-distribution warnings remain |
| Application and browser-test TypeScript | Passed |
| Production build | Passed; 24 public pages remain pre-rendered |
| Complete desktop/mobile browser regression | 342 passed, including 22 new chat cases |
| Repeated Stop/completion-race and Home recovery checks | 15 passed across desktop/mobile |
| Repeated edited Discovery review/approval journeys | 10 passed across desktop/mobile |
| Separate Discovery browser regression | 11 passed |
| Isolated local preview | Final backend on loopback port 8901; health/readiness/workspace and visible reply/suggestion verified |

Reproducible qualification commands:

```powershell
python -B scripts\check.py --only backend
python -B scripts\check.py --only frontend
npm --prefix frontend run test:e2e -- --trace retain-on-failure
npm --prefix frontend run test:e2e -- --config playwright.discovery.config.ts
git --no-pager diff --check
```

Final browser qualification used one worker with retries disabled. Earlier
qualification failures led to the corrections below; the complete final run passed.

### Phase 1 delivered

- Independent strict conversation contracts and Cosmos storage, not assessment
  interview history. Private owner/workspace checks include active membership.
- Exact creation+30-day expiry, remaining-lifetime TTL, early deletion, rename,
  newest-created-first paginated history and clearing an expired open transcript.
- Approved Azure OpenAI async paragraph streaming; strict saved-message
  acknowledgement makes the user's screened bubble visible before the reply.
  Stages, an indeterminate progress bar, elapsed time, Stop and Retry are local
  to the conversation. Errors are explicit; no provider failure becomes demo data.
- Durable turn reservations, stale-version conflicts, generation invalidation,
  completed-request idempotency, 60-turn/context/output/deadline limits, per-process
  concurrency and identity/organization quotas.
- Markdown without automatic external images/raw HTML; privacy screening across
  provider chunks, no transcript/draft browser persistence, no cross-chat memory.

### Phase 2 delivered

- Conservative structured action suggestions and manual Discovery/Intake options;
  dismissal suppresses repeated suggestions. Suggestions never execute writes.
- Inline editable previews leave unknowns empty. Extracted values need exact
  user-message quotes and supported IDs; assistant messages cannot ground facts.
- Saving a completed preview precedes its explicit acknowledgement and creation.
  The server validates current role, fields, version, expiry and preview digest.
- Durable confirmation plus atomic workflow/idempotency-receipt creation prevents
  duplicates, lost-response overwrites and resurrection of deleted/expired children.
- Approved selected context survives in separately retained workflow provenance
  and archived decisions. Existing diagnostic/readiness/review gates remain.
- A conversation can originate Discovery or direct Enterprise Intake. Discovery's
  existing reviewed opportunity handoff remains the continuation into assessment.

### Qualification findings addressed

- Numeric fixture suffixes correctly triggered phone redaction; test fixtures now
  use non-PII identifiers rather than weakening privacy screening.
- The thread scrolls internally, never scrolls an empty welcome screen to the
  bottom, fits the desktop viewport, and collapses history initially on mobile.
- Stop handles the legitimate race with an already-completed reply explicitly:
  completed output is retained with a notice, not falsely reported as interrupted.
  A controlled in-flight API test separately proves actual cancellation and retry.
- The shared privacy disclosure distinguishes assessment-session retention from
  chat expiry. Chat progress announcements are not hidden under a busy ancestor.
- Persistence validates the complete conversation before writing, including derived
  metadata. Oversized generated suggestions fail explicitly without making saved
  messages unreadable.
- Browser recovery checks allow either a genuine Stop or completion before a mobile
  tap. Controlled API tests independently verify in-flight invalidation. Home recovery
  handles workflows created by earlier tests instead of assuming an empty shared demo.
- Reviewed form values synchronize before browser interaction and use functional
  state updates, preventing an early edit from being overwritten by initialization
  or another field edit. Repeated browser tests verify the title remains intact.

Production/live model acceptance is separate from deterministic demo and mocked
provider/SDK tests. No real organization transcript, connector source, production
LLM invocation, distributed load benchmark or live Cosmos deployment is claimed.
Quotas are per process, not global cost ceilings. Deployment and external
backup/provider-retention policy approval are outside this local implementation.

## Local test journey

1. Open `http://127.0.0.1:8901/workspace` and choose **Chat**.
2. Send: "Explore discovery opportunities across our customer onboarding process."
3. Observe the saved user bubble, streamed scripted demo reply and progress state.
   Try Stop; if it wins the completion race, use Retry last response.
4. Choose Start Discovery, fill the required unknown fields, save the reviewed
   preview, check the copy approval and create it. Open the existing Discovery UI.
5. In a new conversation, send: "Start Enterprise Intake for a known workflow."
   Review the blank team size/compliance/cloud fields, complete the preview and
   explicitly create/open Intake. Existing interview and readiness gates remain.
6. Try rename, history search, reload, cancellation of an unsent-draft navigation
   and early deletion. Chat deletion does not delete approved workflow copies.

The shared local demo is process-local and loses conversations on restart.
Hosted mode uses Cosmos durability and the approved Azure OpenAI connection.
