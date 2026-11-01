![AgentSpark agentic architecture overview](docs/agentspark-architecture.png)

# AgentSpark

**The agent that tells you where agents belong.**

AgentSpark helps enterprises decide **whether, where, and how to use AI agents**.
It turns a workflow interview into a scored assessment, cloud-specific architecture
recommendations, an estimated business case, and a reviewable blueprint.

## Architecture

[View the full-size diagram](docs/agentspark-architecture.png). This is a conceptual
overview, not an as-deployed specification: current retrieval is keyword-based,
and the diagram's model/hosting labels are illustrative. Current configuration is covered in the
[assessment reference](docs/assessment-reference.md) and [operations runbook](docs/operations.md).

## What you can do

- **Start business-first discovery:** create a scoped engagement with an objective,
  sponsor, business units, topics and dates; save manual role contributions,
  candidate opportunities and links to existing assessments.
- **Build a stakeholder-backed opportunity shortlist:** assign active team members
  their own structured contributions, generate source-linked hypotheses using an
  approved model, and rank opportunities using explicit weighted assumptions.
  Review a selected opportunity into an assessment without confirming its claims.
- **Collaborate around a process:** create process cards with owners, steps,
  systems, goals and baselines. Request process/step-specific input from active
  signed-in team members, with due dates and visible submission/clarification status.
  People retain their own drafts; submitted sources inform synthesis and selected
  opportunities. Review evidence and resolve clarifications without automatically
  confirming assessment facts. Compare unchanged work, process improvement,
  deterministic automation, AI assistance and hybrid options using explicit rationales.
  Source edits stale reviews, synthesis and ratings; reviewed handoffs and report
  exports retain frozen process provenance. Legacy engagements retain their existing
  source digest and fixed retention. See [process collaboration](docs/discovery-processes.md).
- **Interview by role:** business operators, process owners and technical owners
  receive their assigned questions. Unconfirmed answers remain unresolved; role
  completion never bypasses the full assessment's evidence requirements.
- **Make an executive decision:** inspect a source-linked executive brief with
  an advisory decision, illustrative capacity value, gaps and next action.
  Export Markdown or a one-page PDF without confusing suitability with pilot readiness.
- **Explore before signing in:** the concise public homepage links to 11 focused
  About, Platform, Solutions and Resources pages. Each submenu has a dedicated URL,
  page title and active-navigation state; direct links, refresh and browser history
  work without discarding a restored assessment. The public experience uses an
  original process-to-opportunity hero, a visitor-controlled four-stage product
  reconstruction, illustrated product/solution pages and grouped visual menus.
  Discover, Prioritize, Prepare and Decide previews are fictional and make no
  model calls or saved records. Keyboard tabs, finite entry motion and reduced-motion
  settings keep the experience accessible. The premium redesign replaces
  the previous 2000px homepage limit with six bounded sections and a 4800px desktop
  ceiling, making room for product evidence without copying a long competitor page.
  The shared discovery invitation illustrates question, team insights, evidence and
  a human-reviewed next step. Its background and stage highlights play once on entry
  and settle within five seconds; keyboard-accessible replay is optional. Small
  mobile screens and reduced-motion settings use a static illustration.
  Its original AI readiness and Process intelligence use-case cards explain data,
  ownership and pilot gaps alongside process steps and improvement alternatives.
  Both remain visible without autoplay and use clearly fictional previews, not
  measured customer results, organizational monitoring or process-mining claims.
  The homepage identifies AgentSpark as an AI opportunity discovery and assessment
  platform and names the shortlist, readiness gaps, architecture and executive brief
  customers can review before investing in a pilot.
  Technology panels separate available platform capabilities, Azure/AWS blueprint
  candidates and customer implementation responsibilities; logos never imply
  unsupported model or tool integrations. The workflow-review call to action uses
  existing authenticated discovery, not an unimplemented booking/contact service.
  Platform pages show the fictional discovery walkthrough and explicit source/rating
  limitations. `/resources/example-assessment` preserves the claims, invoice and
  onboarding explorer, readiness gaps, capacity assumptions and Azure/AWS candidates.
  `/platform/architecture` includes a fictional invoice-assistance diagram that
  separates inputs, AI suggestions, human approval and authorized business actions.
  It distinguishes AgentSpark's advisory blueprint from integrations, controls
  and deployment that a customer delivery team must implement and validate.
  Public previews make no model calls and create no records. **Start discovery**
  opens discovery engagements through organization access in live mode, preserving
  the selected destination after sign-in and any restored assessment.
  **Assess my workflow** still opens intake; **Workspace** opens your library.
  **Product overview** returns without discarding active work. This redesign does
  not change the signed-in workspace or imply deployment or pilot readiness.
  `/workspace` is the private entry boundary; legacy root assessment restoration
  remains supported. Browser Back and overview actions protect unsaved discovery.
  Unknown public URLs show a clear not-found page; unknown `/api` paths remain
  JSON 404 responses rather than being rewritten to the public website.
- **Assess a workflow:** use up to 10 grouped interview rounds for suitability and
  draft readiness, then finish missing answers in an editable checklist.
- **Select the assessment model before interviewing:** choose an administrator-enabled
  Azure OpenAI or Anthropic-on-Azure-Foundry connection at intake. One model is pinned
  per assessment after generation begins; no provider fallback is used. Saved state,
  archived decisions and PDFs retain the model identity. Historical records without
  provenance are labelled as such; demo fixtures never call either provider.
- **Choose Azure or AWS:** receive service candidates and a blueprint for the
  proposed customer solution. AgentSpark itself remains Azure-hosted.
- **Choose the execution architecture:** capture runtime requirements and inspect
  separate reasoning and durable-execution recommendations: application code,
  bounded AI, LangGraph, Temporal, Azure Durable Functions or AWS Step Functions.
  Versioned rules explain alternatives, trade-offs and unresolved validation needs;
  no framework is deployed or assumed to fit automatically.
- **Inspect the recommendation:** review the 12-criteria readiness score, grounded
  patterns, estimated ROI scenarios, and policy outcome.
- **Record evidence:** distinguish client statements, source-supported findings,
  assumptions, and open questions; record reviewer attestations and validation needs.
- **Assess delivery readiness:** identify integration, data, security, oversight,
  cloud and operational blockers; record owners and pilot entry criteria separately
  from agent suitability.
- **Collaborate:** use organization/team workspaces, invite links, and independent
  creator/reviewer approval.
- **Retain decisions:** export Markdown blueprints and inspect archived decisions
  with the evidence and deployment preferences reviewed at the time.
- **Download a PDF report:** use **Export PDF** in Blueprint & Review for the current
  assessment, including evidence, implementation readiness, ROI and approval status.

**Flow:** Optional discovery engagement -> Intake -> Role-based diagnostic interview -> Evidence & assumptions -> Analysis ->
Blueprint & review -> Decision archive.

Discovery notes are workspace-visible, not anonymous or verified evidence.
New engagements expire 30 days after creation; reads and ordinary edits never
extend that period. Authorized explicit renewal starts another 30 days. Legacy
engagements keep their old expiry until renewed. Participation uses existing
signed-in organization/team invitations, not anonymous or external access links.
Draft responses are excluded from synthesis; source changes mark snapshots stale.
Unknown ratings withhold priority scores. Reviewed handoffs copy unverified
provenance, not confirmed facts, and retain ordinary assessment/decision expiry.

## Run locally

Requires **Python 3.12** and **Node.js 24**. From the repository root, with a Python
virtual environment active:

```powershell
Copy-Item .env.example .env
python -m pip install --only-binary=:all: --require-hashes -r requirements.lock
npm --prefix frontend ci
npm --prefix frontend run build
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open **http://localhost:8000**. Local development defaults to deterministic demo
mode; select a named fictional sample to exercise the complete workflow.
Demo is shared and unauthenticated: use fictional data and do not expose it publicly.

Alternatively, with Docker Compose v2.24+:

```powershell
docker compose up --build agentspark
```

For live Azure dependencies, Microsoft sign-in, frontend hot reload, and deployment,
follow the [operations runbook](docs/operations.md). Live mode requires explicit
configuration and does not silently fall back to demo.

## Validate changes

```powershell
python -m pip install -r requirements-tools.txt
python scripts/check.py
npm --prefix frontend run test:e2e
```

The checks cover backend regressions, the offline workflow scenario, scoring
evaluations, dependency consistency, frontend types/build, and browser workflows.
Browser checks require Playwright Chromium; see the
[toolchain and setup instructions](docs/operations.md#supported-toolchain-and-repeatable-checks).
[GitHub CI](.github/workflows/ci.yml) also builds and smoke-tests a non-root container.
CI does **not** deploy automatically.

## Important boundaries

- Approval is advisory: AgentSpark does not deploy a customer solution or execute
  business actions such as releasing payments.
- AWS selection changes the assessment target, not where AgentSpark processes data.
  Cloud availability, residency, model access, and prices require validation.
- Evidence references and reviewer attestations are not automated verification.
  Document uploads are not part of the current evidence register.
- ROI scenarios are assumption-based estimates, not guaranteed cash savings.
  Generated scaffolds are illustrative, untested, and not deployment-ready.
- Evidence/input changes invalidate current analysis and approval; previous archived
  decisions remain unchanged. Access, retention, and deletion rules still apply.
- Legacy `AGENTSENSE_*` settings, `AgentSense.Reviewer`, database/storage names, and
  browser identifiers remain intentionally compatible.

## Documentation

- [Assessment reference](docs/assessment-reference.md): scoring, grounding, evidence,
  governance, API contracts, permissions, and compatibility.
- [Operations runbook](docs/operations.md): configuration, delivery, security
  boundaries, retention, release checks, and rollback.

## Maintainer and attribution

**Muntazir Abbas** maintains and develops AgentSpark.

The base work was forked from
[AgentSense by Shriram K Vasudevan](https://github.com/shriramkv/The-AgentSense).
AgentSpark builds on that foundation; original commit history and contributor
credits are retained. Development uses AI coding assistance, with human review
and automated validation.
