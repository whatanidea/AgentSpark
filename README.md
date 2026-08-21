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
| 5 | Validate | **Validation Agent** | Guardrail checks + **Human-in-the-Loop gate** decision |
| 6 | Estimate | **ROI Engine** | Hours/$ saved per year, payback period, ROI multiple |
| 7 | Blueprint | **Blueprint Agent** | Architecture doc, Mermaid diagram, cost estimate, roadmap, code scaffold |

Every run emits an **agent trace** (per-step status + latency) for observability/audit.

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
- The **Recommendation Agent retrieves real patterns** (via Azure AI Search, with a local
  fallback) and composes them by name — no hand-wavy "use a multi-agent system."

---

## Architecture

```
React SPA  ──/api/v1──►  FastAPI  ──►  LangGraph Orchestrator
                                        │
   Diagnostic → Scoring(12) → Mapping → Recommendation(RAG) → Validation(HITL) → Blueprint
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

> **Mock mode:** with no Azure credentials the entire product still runs end-to-end on
> deterministic mock data and a local pattern-library fallback — so it always demos.

---

## Setup

```bash
# 1. Configure (optional — runs in mock mode without this)
cp .env          # then fill in your Azure keys

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
- **Azure OpenAI Embeddings (`text-embedding-3-small`)**: vectorizes the pattern library for
  Azure AI Search retrieval.
- **Azure AI Search**: hybrid retrieval over the curated agentic-pattern knowledge base (RAG).
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
  agents/        diagnostic · mapping · recommendation · blueprint · validation
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
