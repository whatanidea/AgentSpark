# AgentSense - The Agent for All your Agentic Needs.

> **The agent that tells you where agents belong.**

AgentSense is an AI-powered enterprise transformation advisor. Before an organization
spends a single sprint "agentifying" a workflow, AgentSense answers four questions:

1. **IF** AI agents should be used at all
2. **WHERE** they add the most value across a backlog
3. **WHICH** architecture pattern fits
4. **HOW** to implement it — with an Azure mapping, a governance gate, and starter code

It is a **meta-agent**: a multi-agent system whose job is to design *other* agentic systems
responsibly — including telling you when the honest answer is "don't use an agent here."

- 🎥 Demo video: https://youtu.be/GVvUbAuSXLs

---

## What it does (end to end)

A seven-stage pipeline orchestrated with **LangGraph**:

| # | Stage | Agent / Component | Output |
|---|-------|-------------------|--------|
| 1 | Diagnose | **Diagnostic Agent** | Structured `WorkflowIntelligence` from a guided interview (input guardrails screen every message) |
| 2 | Score | **Scoring Engine** | Agentification Readiness Index — 12 weighted, explained criteria |
| 3 | Map | **Mapping Agent** | Recommended Microsoft Azure service stack |
| 4 | Recommend | **Recommendation Agent** | RAG-grounded design from a 50-pattern library, with confidence + self-critique |
| 5 | Estimate | **ROI Engine** | Hours/$ saved per year, payback period, ROI multiple |
| 6 | Govern | **Governance Agent** | Validated, ordered policies over risk, completeness, autonomy, and actual first-year ROI |
| 7 | Outcome | **Blueprint Agent** or rejection outcome | Approved/provisional blueprint, or a non-agentic alternative without generating a blueprint |

Every run emits an **agent trace** (per-step status + latency) for observability/audit.

### Governance and human review

AgentSense approves **advisory recommendations**, not execution or deployment of a
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

Every successful reanalysis gets a new analysis ID and clears the previous review.
Accepted chat or intake changes invalidate the current analysis and review; blocked
chat does not. Only the **current analysis's** review is retained, not a historical
ledger. Blueprint responses and Markdown exports identify provisional/rejected
outcomes. The Blueprint screen contains the review controls.

**Demo boundary:** review endpoints are unauthenticated and reviewer names are
self-reported. Conditional version checks reject conflicting writes, but neither
an analysis ID nor an ETag is an access control. Do not expose these controls as
production approval authority; authenticated ownership checks are required before
a multi-user production release. In-memory reviews last only for
the process lifetime; durable retention requires configured Cosmos DB.

Policies are validated at startup from `governance_rules.yaml`. Unknown fields,
operators, values, decisions, and duplicate IDs fail startup with a logged error.
Each policy contains `conditions` with `field`, `operator` (`eq`, `lt`, `gt`), and
`value`; all conditions must match, and the first matching policy wins. There are no
Python expressions or `eval`. If no policy matches, `default_decision` is honored.

Cost governance compares **annual gross labor savings** with the **one-time build
cost** over a first-year horizon. Negative first-year net savings reject the
recommendation; operating costs are not included and require separate budgeting.
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
- **🧠 Honest by design** — confidence is grounded in data completeness; the Recommendation Agent
  states its own biggest risk; low-value workflows are told to *not* use agents.

### Why it's credible, not just generated
- The **12-criteria score is transparent**: every criterion shows its weight, normalized
  strength, contribution to the 0–100 index, and a plain-English rationale. The contributions
  provably sum to the score (enforced by the eval harness).
- It is **honest**: high-compliance / high-error-cost workflows are never marked fully
  autonomous — they are routed through a mandatory human-in-the-loop gate. A fixed-rule
  payroll task is correctly flagged *Not suitable for agents → use standard software/RPA*.
- The **Recommendation Agent retrieves real patterns** (via Azure AI Search in live
  mode or the local library in demo mode) and composes them by name.

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
- **API / Orchestration:** FastAPI + LangGraph state graph
- **Reasoning:** Azure OpenAI (GPT-4o) via LangChain, using **structured outputs / function
  calling** so every agent returns schema-validated Pydantic objects
- **Knowledge (RAG):** Azure AI Search over a curated agentic-pattern library
- **State / Memory:** Azure Cosmos DB (per-session `WorkflowState`)
- **Deploy:** Docker → Azure App Service (GitHub Actions in `.github/workflows/deploy.yml`)

> **Demo mode:** `AGENTSENSE_MODE=demo` runs end-to-end on deterministic mock data,
> process-local storage, and the local pattern library. Local development defaults
> to demo even if Azure credentials are present. Live mode must be selected explicitly.

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

Before live use, provision the Cosmos database (default `agentsense_db`) and its
`workflows` container with partition key `/session_id`. The application no longer
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
  per-dependency status for OpenAI, Search, and Cosmos. Demo dependencies are marked
  `demo`; this is not a claim that Azure was tested.
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

# 2. Backend deps
pip install -r requirements.txt

# 3. Build the frontend (one-time; outputs frontend/dist that FastAPI serves)
npm --prefix frontend ci
npm --prefix frontend run build

# 4. Run
uvicorn app.main:app --host 0.0.0.0 --port 8000
#    → open http://localhost:8000

# or, build + run everything with Docker (multi-stage: node build → python serve)
docker-compose up --build
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

### Dependencies
FastAPI · Uvicorn · Gradio · LangGraph · LangChain (+ `langchain-openai`) · Pydantic ·
`azure-cosmos` · `azure-search-documents` · `azure-identity` · httpx. Full list in
[`requirements.txt`](requirements.txt).

---

## AI Tools Used (disclosure)

Here is how AI was used in building and running AgentSense:

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
**input guardrails** (prompt-injection + PII), **self-critique + confidence**, and **agent-trace
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
  security/      guardrails.py             (prompt-injection + PII screening)
  database/      cosmos_client.py          (Cosmos + in-memory mock)
  api/           routes.py                 (FastAPI endpoints)
  utils/         models.py · llm.py · env.py
frontend/        React + TS + Vite + Tailwind SPA
  src/components/ Intake · Diagnose · Analyze · Blueprint · Portfolio · Security
evals/           run_evals.py              (scoring invariants)
test_e2e_scenario.py
```

_All work is original. Open-source libraries are credited via `requirements.txt`._
