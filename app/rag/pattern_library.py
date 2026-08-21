"""
Curated library of agentic design patterns.

This is the knowledge base AgentSense retrieves over (via Azure AI Search when
configured, or locally in mock mode). Each pattern is a vetted, reusable design
with explicit "when to use" guidance and the Azure services it maps to.

Keeping the canonical library in code means the product is never empty: the same
records are used to seed the Azure AI Search index (see ingestion.py) and to
serve retrieval offline.
"""
from typing import List, Dict

PATTERNS: List[Dict] = [
    {
        "id": "p01", "name": "Single-Agent Copilot", "category": "Orchestration",
        "description": "One LLM agent with tools that assists a human who stays in control of every action.",
        "when_to_use": "Low decision density, high compliance, or when trust must be earned incrementally.",
        "azure_services": ["Azure OpenAI", "Azure AI Search"],
    },
    {
        "id": "p02", "name": "Supervisor / Worker Multi-Agent", "category": "Orchestration",
        "description": "A supervisor agent decomposes a task and routes sub-tasks to specialist worker agents.",
        "when_to_use": "High process complexity with distinct sub-skills and cross-system coordination.",
        "azure_services": ["Azure AI Foundry", "Azure OpenAI"],
    },
    {
        "id": "p03", "name": "Sequential Pipeline (Chain-of-Agents)", "category": "Orchestration",
        "description": "Agents run in a fixed order, each consuming the previous agent's structured output.",
        "when_to_use": "Well-understood, stable multi-stage processes such as intake → analyse → report.",
        "azure_services": ["LangGraph", "Azure OpenAI"],
    },
    {
        "id": "p04", "name": "Human-in-the-Loop Gate", "category": "Governance",
        "description": "An approval checkpoint pauses autonomous execution for human sign-off before high-impact actions.",
        "when_to_use": "High compliance sensitivity or high error cost (finance, legal, healthcare).",
        "azure_services": ["Azure AI Foundry", "Azure Logic Apps"],
    },
    {
        "id": "p05", "name": "RAG-Grounded Agent", "category": "Knowledge",
        "description": "Agent retrieves enterprise documents/policies before answering, citing sources.",
        "when_to_use": "High unstructured-content workflows needing grounded, auditable answers.",
        "azure_services": ["Azure AI Search", "Azure OpenAI Embeddings"],
    },
    {
        "id": "p06", "name": "Tool-Calling Agent", "category": "Tooling",
        "description": "Agent invokes typed functions/APIs (CRM, ERP, search) via structured function calling.",
        "when_to_use": "Workflows that must act on multiple backend systems, not just converse.",
        "azure_services": ["Azure OpenAI", "Azure Functions"],
    },
    {
        "id": "p07", "name": "Reflection / Critic Loop", "category": "Quality",
        "description": "A second agent critiques and revises the first agent's output before release.",
        "when_to_use": "High error cost where output quality matters more than latency.",
        "azure_services": ["Azure OpenAI", "Azure AI Foundry"],
    },
    {
        "id": "p08", "name": "Episodic + Long-Term Memory", "category": "Memory",
        "description": "Persist conversation and decisions so agents recall prior context across sessions.",
        "when_to_use": "Multi-turn, multi-session processes (case management, onboarding).",
        "azure_services": ["Azure Cosmos DB", "Azure AI Search"],
    },
    {
        "id": "p09", "name": "Deterministic RPA + AI Triage", "category": "Hybrid",
        "description": "Rule-based automation handles the happy path; an agent triages only exceptions.",
        "when_to_use": "High volume, stable rules, with a long tail of exceptions needing judgement.",
        "azure_services": ["Power Automate", "Azure OpenAI"],
    },
    {
        "id": "p10", "name": "Plan-and-Execute Agent", "category": "Orchestration",
        "description": "Agent drafts an explicit multi-step plan, then executes and re-plans as it learns.",
        "when_to_use": "Open-ended goals where the steps are not known in advance.",
        "azure_services": ["Azure AI Foundry", "Azure OpenAI"],
    },
    {
        "id": "p11", "name": "Guardrail / Policy Filter", "category": "Governance",
        "description": "Pre/post filters enforce content, PII, and policy constraints on agent I/O.",
        "when_to_use": "Regulated domains, external-facing agents, or PII-heavy data.",
        "azure_services": ["Azure AI Content Safety", "Azure OpenAI"],
    },
    {
        "id": "p12", "name": "Swarm / Parallel Specialists", "category": "Orchestration",
        "description": "Many agents work the same problem from different angles; results are merged.",
        "when_to_use": "Research, broad search, or analysis where coverage beats a single pass.",
        "azure_services": ["Azure AI Foundry", "Azure OpenAI"],
    },
    {
        "id": "p13", "name": "Event-Driven Autonomous Agent", "category": "Orchestration",
        "description": "Agent wakes on an event/queue message, acts, and persists state — no human trigger.",
        "when_to_use": "High-volume, low-risk, fully automatable transactions.",
        "azure_services": ["Azure Service Bus", "Azure Functions", "Azure OpenAI"],
    },
    {
        "id": "p14", "name": "Structured Extraction Agent", "category": "Knowledge",
        "description": "Converts free text / documents into typed records via function-calling schemas.",
        "when_to_use": "Intake from emails, PDFs, forms where downstream systems need structure.",
        "azure_services": ["Azure OpenAI", "Azure AI Document Intelligence"],
    },
    {
        "id": "p15", "name": "Audit-Trail & Observability Layer", "category": "Governance",
        "description": "Every agent decision is logged with inputs, rationale, and outcome for review.",
        "when_to_use": "Any production agent in a compliance-sensitive enterprise.",
        "azure_services": ["Azure Monitor", "Azure Cosmos DB"],
    },
    {
        "id": "p16", "name": "Cost-Tiered Model Routing", "category": "Optimisation",
        "description": "Route easy turns to a small model and hard turns to a frontier model.",
        "when_to_use": "High-volume workflows where token cost matters at scale.",
        "azure_services": ["Azure OpenAI", "Azure AI Foundry"],
    },
    {
        "id": "p17", "name": "Conversational Diagnostic Agent", "category": "Knowledge",
        "description": "Agent runs a structured interview to elicit requirements before acting.",
        "when_to_use": "When inputs are ambiguous and must be clarified with the user first.",
        "azure_services": ["Azure OpenAI", "Azure Cosmos DB"],
    },
    {
        "id": "p18", "name": "Escalation / Fallback Routing", "category": "Governance",
        "description": "Agent hands off to a human or stricter workflow when confidence is low.",
        "when_to_use": "High error cost combined with variable input quality.",
        "azure_services": ["Azure AI Foundry", "Azure Logic Apps"],
    },
    {
        "id": "p19", "name": "Continuous Feedback / Eval Loop", "category": "Quality",
        "description": "Human feedback and automated evals recalibrate prompts and scores over time.",
        "when_to_use": "Any agent expected to improve post-launch rather than ship static.",
        "azure_services": ["Azure AI Foundry", "Azure Monitor"],
    },
    {
        "id": "p20", "name": "No-Agent / Standard Software", "category": "Hybrid",
        "description": "Deterministic code or a form is the right tool — no LLM needed.",
        "when_to_use": "Fully deterministic, low-complexity, rule-stable tasks. Honesty saves cost.",
        "azure_services": ["Azure App Service"],
    },
    {
        "id": "p21", "name": "Semantic Cache", "category": "Optimisation",
        "description": "Cache answers to semantically similar queries to cut latency and token cost.",
        "when_to_use": "High-volume workflows with repetitive questions.",
        "azure_services": ["Azure Cache for Redis", "Azure OpenAI Embeddings"],
    },
    {
        "id": "p22", "name": "Map-Reduce over Documents", "category": "Knowledge",
        "description": "Summarise/extract per chunk in parallel, then reduce into a final answer.",
        "when_to_use": "Long documents/contracts that exceed a single context window.",
        "azure_services": ["Azure OpenAI", "Azure AI Document Intelligence"],
    },
    {
        "id": "p23", "name": "Router / Intent Classifier", "category": "Orchestration",
        "description": "A lightweight classifier routes each request to the right specialist agent.",
        "when_to_use": "Mixed intents arriving on one channel (support, ops, sales).",
        "azure_services": ["Azure OpenAI", "Azure AI Foundry"],
    },
    {
        "id": "p24", "name": "Self-Consistency Voting", "category": "Quality",
        "description": "Sample multiple reasoning paths and take the majority answer.",
        "when_to_use": "Numeric/decision tasks where one pass is unreliable.",
        "azure_services": ["Azure OpenAI"],
    },
    {
        "id": "p25", "name": "Confidence-Gated Autonomy", "category": "Governance",
        "description": "Act autonomously above a confidence threshold; defer to a human below it.",
        "when_to_use": "Variable-quality inputs with meaningful error cost.",
        "azure_services": ["Azure OpenAI", "Azure AI Foundry"],
    },
    {
        "id": "p26", "name": "Schema-Constrained Generation", "category": "Tooling",
        "description": "Force outputs into a typed JSON schema via function calling.",
        "when_to_use": "Any step feeding a downstream system that needs structured data.",
        "azure_services": ["Azure OpenAI"],
    },
    {
        "id": "p27", "name": "Tool Sandboxing", "category": "Governance",
        "description": "Run agent-invoked tools/code in an isolated, least-privilege sandbox.",
        "when_to_use": "Agents that execute code or call powerful, mutating APIs.",
        "azure_services": ["Azure Container Apps", "Azure Functions"],
    },
    {
        "id": "p28", "name": "Prompt-Injection Defense", "category": "Security",
        "description": "Screen and quarantine untrusted content before it reaches the model context.",
        "when_to_use": "Agents that ingest external web/email/user content.",
        "azure_services": ["Azure AI Content Safety", "Azure OpenAI"],
    },
    {
        "id": "p29", "name": "PII Redaction Pipeline", "category": "Security",
        "description": "Detect and mask PII before storage, logging, or model calls.",
        "when_to_use": "Regulated data (PCI, HIPAA, GDPR) flowing through agents.",
        "azure_services": ["Azure AI Language (PII)", "Azure OpenAI"],
    },
    {
        "id": "p30", "name": "Least-Privilege Identity per Agent", "category": "Security",
        "description": "Each agent gets a scoped managed identity; no shared god-credential.",
        "when_to_use": "Multi-agent systems touching multiple enterprise systems.",
        "azure_services": ["Microsoft Entra ID", "Azure Key Vault"],
    },
    {
        "id": "p31", "name": "Blackboard Shared Memory", "category": "Memory",
        "description": "Agents read/write a shared structured state instead of message passing.",
        "when_to_use": "Many agents collaborating on one evolving artifact.",
        "azure_services": ["Azure Cosmos DB"],
    },
    {
        "id": "p32", "name": "Hierarchical Task Network", "category": "Orchestration",
        "description": "Decompose goals into nested sub-goals handled by tiers of agents.",
        "when_to_use": "Deep, structured processes with sub-processes.",
        "azure_services": ["Azure AI Foundry", "Azure OpenAI"],
    },
    {
        "id": "p33", "name": "Debate / Adversarial Agents", "category": "Quality",
        "description": "Two agents argue opposing positions; a judge agent decides.",
        "when_to_use": "High-stakes decisions needing scrutiny from multiple angles.",
        "azure_services": ["Azure OpenAI"],
    },
    {
        "id": "p34", "name": "Streaming Token Response", "category": "Optimisation",
        "description": "Stream tokens to the UI for perceived responsiveness.",
        "when_to_use": "Conversational, user-facing agents.",
        "azure_services": ["Azure OpenAI", "Azure App Service"],
    },
    {
        "id": "p35", "name": "Batch Async Processing", "category": "Optimisation",
        "description": "Queue and process large request volumes off the hot path.",
        "when_to_use": "Bulk back-office jobs with no real-time SLA.",
        "azure_services": ["Azure Service Bus", "Azure Functions"],
    },
    {
        "id": "p36", "name": "Citation-Backed Answers", "category": "Knowledge",
        "description": "Every claim links to its source document/snippet.",
        "when_to_use": "Compliance, legal, and audit-sensitive answers.",
        "azure_services": ["Azure AI Search", "Azure OpenAI"],
    },
    {
        "id": "p37", "name": "Graceful Degradation / Mock Fallback", "category": "Quality",
        "description": "Fall back to a deterministic stub when a dependency is down.",
        "when_to_use": "Demos and resilient production paths alike.",
        "azure_services": ["Azure App Service"],
    },
    {
        "id": "p38", "name": "Approval Workflow Integration", "category": "Governance",
        "description": "Route agent proposals into existing approval tools (Teams/Logic Apps).",
        "when_to_use": "Enterprises with established sign-off processes.",
        "azure_services": ["Azure Logic Apps", "Microsoft Teams"],
    },
    {
        "id": "p39", "name": "Drift & Quality Monitoring", "category": "Quality",
        "description": "Track output quality/score drift over time and alert on regressions.",
        "when_to_use": "Long-lived production agents.",
        "azure_services": ["Azure Monitor", "Azure AI Foundry"],
    },
    {
        "id": "p40", "name": "Token Budget Governor", "category": "Optimisation",
        "description": "Enforce per-session/per-tenant token and cost ceilings.",
        "when_to_use": "Multi-tenant SaaS or cost-sensitive deployments.",
        "azure_services": ["Azure API Management", "Azure OpenAI"],
    },
    {
        "id": "p41", "name": "Knowledge Graph Grounding", "category": "Knowledge",
        "description": "Ground reasoning in a structured entity graph, not just text.",
        "when_to_use": "Complex relationships (org charts, supply chains, policies).",
        "azure_services": ["Azure Cosmos DB (Gremlin)", "Azure OpenAI"],
    },
    {
        "id": "p42", "name": "Few-Shot Exemplar Retrieval", "category": "Knowledge",
        "description": "Retrieve the most similar solved examples as in-context exemplars.",
        "when_to_use": "Tasks with a corpus of past gold-standard cases.",
        "azure_services": ["Azure AI Search", "Azure OpenAI"],
    },
    {
        "id": "p43", "name": "Multi-Modal Intake", "category": "Knowledge",
        "description": "Accept images/scans/audio alongside text and normalise to structure.",
        "when_to_use": "Workflows starting from forms, receipts, or calls.",
        "azure_services": ["Azure AI Document Intelligence", "Azure OpenAI", "Azure AI Speech"],
    },
    {
        "id": "p44", "name": "Saga / Compensating Transactions", "category": "Governance",
        "description": "Make multi-step agent actions reversible via compensation steps.",
        "when_to_use": "Agents performing irreversible-looking multi-system writes.",
        "azure_services": ["Azure Durable Functions"],
    },
    {
        "id": "p45", "name": "Canary / Shadow Rollout", "category": "Quality",
        "description": "Run the agent in shadow mode beside humans before cutover.",
        "when_to_use": "De-risking the first production deployment.",
        "azure_services": ["Azure App Service (slots)", "Azure Monitor"],
    },
    {
        "id": "p46", "name": "Rate Limiting & Backoff", "category": "Optimisation",
        "description": "Respect downstream limits with retries and exponential backoff.",
        "when_to_use": "Agents hammering rate-limited enterprise APIs.",
        "azure_services": ["Azure API Management"],
    },
    {
        "id": "p47", "name": "Human Feedback Capture (RLHF-lite)", "category": "Quality",
        "description": "Capture thumbs/edits and feed them into prompt/score recalibration.",
        "when_to_use": "Any agent meant to improve after launch.",
        "azure_services": ["Azure Cosmos DB", "Azure AI Foundry"],
    },
    {
        "id": "p48", "name": "Policy-as-Prompt Governance", "category": "Governance",
        "description": "Encode enterprise policy as enforced system constraints, version-controlled.",
        "when_to_use": "Regulated orgs needing consistent, auditable agent behaviour.",
        "azure_services": ["Azure AI Foundry", "Azure DevOps"],
    },
    {
        "id": "p49", "name": "Agent-to-Agent (A2A) Messaging", "category": "Orchestration",
        "description": "Standardised typed messages let independent agents interoperate.",
        "when_to_use": "Cross-team or cross-vendor agent ecosystems.",
        "azure_services": ["Azure Service Bus", "Azure AI Foundry"],
    },
    {
        "id": "p50", "name": "Cost-Benefit Stop Condition", "category": "Optimisation",
        "description": "Halt agent iterations once marginal value drops below cost.",
        "when_to_use": "Open-ended research/planning loops that could run forever.",
        "azure_services": ["Azure AI Foundry", "Azure OpenAI"],
    },
]


def all_patterns() -> List[Dict]:
    return list(PATTERNS)


def keyword_rank(query: str, top_k: int = 4) -> List[Dict]:
    """Lightweight lexical ranking used in mock mode (no Azure Search)."""
    q = (query or "").lower()
    terms = [t for t in q.replace(",", " ").split() if len(t) > 3]
    scored = []
    for p in PATTERNS:
        haystack = " ".join([
            p["name"], p["category"], p["description"], p["when_to_use"],
        ]).lower()
        hits = sum(haystack.count(t) for t in terms)
        if hits:
            scored.append((hits, p))
    scored.sort(key=lambda x: x[0], reverse=True)
    ranked = [dict(p, score=round(hits / max(len(terms), 1), 2)) for hits, p in scored[:top_k]]
    if not ranked:  # always return something useful
        ranked = [dict(p, score=0.5) for p in PATTERNS[:top_k]]
    return ranked
