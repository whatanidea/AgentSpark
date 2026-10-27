"""Opt-in synthetic Claude API integration. Real inference; isolated local storage, auth and pattern fixtures."""
import argparse
from contextlib import ExitStack
from decimal import Decimal
from io import BytesIO
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import Lock
from unittest.mock import patch
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class TestBudget:
    """Reserve conservative byte/token upper bounds; never refund a failed request."""
    def __init__(self, dollars: Decimal):
        if not dollars.is_finite() or not Decimal("0") < dollars <= Decimal("2"):
            raise ValueError("The live integration budget must be greater than zero and at most USD 2.")
        self.limit = dollars
        self.reserved = Decimal("0")
        self.calls = 0
        self.lock = Lock()

    def reserve(self, request: dict):
        if not 1 <= request["max_tokens"] <= 8192:
            raise ValueError("Synthetic calls require an output bound between 1 and 8192 tokens.")
        byte_count = len(json.dumps(request).encode("utf-8")) + 4096
        if byte_count > 100_000:
            raise ValueError("Synthetic requests must stay below 100,000 input bytes including overhead.")
        # USD 1 / 5 per million is above both published Haiku 5.5 input/output price tiers.
        upper_bound = (Decimal(byte_count) + Decimal(request["max_tokens"]) * 5) / 1_000_000
        with self.lock:
            if self.calls >= 20 or self.reserved + upper_bound > self.limit:
                raise RuntimeError("Live test budget exhausted before the next request; no call was made.")
            self.reserved += upper_bound
            self.calls += 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--subscription", required=True)
    parser.add_argument("--resource-group", required=True)
    parser.add_argument("--account", required=True)
    parser.add_argument("--deployment", default="claude-haiku-5-5")
    parser.add_argument("--budget-usd", type=Decimal, default=Decimal("2"))
    args = parser.parse_args()
    for value in (args.subscription, args.resource_group, args.account, args.deployment):
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]{0,99}", value):
            parser.error("Use Azure resource identifiers without shell metacharacters.")
    budget = TestBudget(args.budget_usd)
    az = shutil.which("az")
    if az is None:
        parser.error("An authenticated Azure CLI is required.")
    # Capture the key in memory only, never shell arguments, console output, or a credential file.
    credentials = json.loads(subprocess.check_output([
        az, "cognitiveservices", "account", "keys", "list", "--subscription", args.subscription,
        "--resource-group", args.resource_group, "--name", args.account, "--output", "json",
    ], text=True))

    # Local-only TestClient harness. Only the selected provider is live; no deployed auth/database is replaced.
    os.environ.update(AGENTSENSE_MODE="demo", AGENTSENSE_AUTH_MODE="local-demo", ENVIRONMENT="development")
    from fastapi.testclient import TestClient
    from pypdf import PdfReader
    from app.api import routes
    from app.database.cosmos_client import DatabaseClient
    from app.main import app
    from app.orchestration import langgraph_flow as flow
    from app.agents.demo_scenarios import demo_diagnosis
    from app.utils import runtime
    from app.utils.llm import get_chat_llm
    from app.utils.model_catalog import assessment_model, model_definition

    with TemporaryDirectory(prefix="agentspark-live-claude-") as directory, ExitStack() as stack:
        stack.enter_context(patch.dict(os.environ, {
            "FOUNDRY_CLAUDE_ENABLED": "true", "AZURE_ANTHROPIC_API_KEY": credentials["key1"],
            "AZURE_ANTHROPIC_ENDPOINT": f"https://{args.account}.services.ai.azure.com",
            "AZURE_ANTHROPIC_DEPLOYMENT": args.deployment, "AZURE_ANTHROPIC_MODEL_NAME": "claude-haiku-5-5",
            "AZURE_ANTHROPIC_MODEL_VERSION": "2",
            "DEMO_ARCHIVE_PATH": str(Path(directory) / "decisions.sqlite3"),
        }))
        database = DatabaseClient()
        stack.enter_context(patch.object(routes, "db_client", database))
        stack.enter_context(patch.object(flow, "db_client", database))
        stack.enter_context(patch.object(runtime.settings, "mode", "live"))
        stack.enter_context(patch("app.rag.retrieval.get_search_client", return_value=(None, "synthetic-test-patterns")))
        for agent in (flow.diagnostic_agent, flow.mapping_agent, flow.recommendation_agent, flow.blueprint_agent):
            stack.enter_context(patch.object(agent, "use_mock", False))
        get_chat_llm.cache_clear()
        stack.callback(get_chat_llm.cache_clear)
        with assessment_model(model_definition("foundry-claude-haiku")):
            llm = get_chat_llm()
        real_create = llm.client.messages.create
        def guarded_create(**kwargs):
            budget.reserve(kwargs)
            return real_create(**kwargs)
        stack.enter_context(patch.object(llm.client.messages, "create", side_effect=guarded_create))
        # Mapping uses temperature 0.1; share the same guarded SDK client across factory sampling keys.
        stack.enter_context(patch("app.utils.llm._chat_client", return_value=llm))
        client = TestClient(app)
        session = str(uuid4())
        def checked(response, status=200):
            if response.status_code != status:
                raise AssertionError(f"Integration endpoint {response.request.url.path} returned "
                                     f"{response.status_code}, expected {status}: {response.text[:1000]}")
            return response.json()
        try:
            checked(client.post("/api/v1/intake", json={
                "session_id": session, "business_domain": "Fictional invoice review integration test",
                "team_size": "201-1000", "existing_systems": "Fictional ERP and document repository",
                "pain_points": "Fictional manual invoice review; humans retain approval and payment authority.",
                "compliance_requirements": "High", "target_cloud": "aws", "model_id": "foundry-claude-haiku",
            }))
            facts = demo_diagnosis("invoice").intelligence.model_dump(mode="json")
            facts["workflow_name"] = "Fictional Invoice Review"
            facts["systems"] = ["Fictional ERP", "Fictional document repository"]
            checked(client.post("/api/v1/chat", json={"session_id": session,
                "message": "All of the following are explicit fictional test facts, not customer data:\n"
                           + json.dumps(facts)}))
            restored = checked(client.get(f"/api/v1/sessions/{session}"))
            if restored["inference_model"]["id"] != "foundry-claude-haiku":
                raise AssertionError("Saved model selection was not retained.")
            analysis = checked(client.post(f"/api/v1/analyze/{session}"))
            if analysis["status"] != "awaiting_human_review" or analysis["score"] is None:
                raise AssertionError("Synthetic complete workflow did not produce the expected human-review assessment.")
            if analysis["inference_model"]["id"] != "foundry-claude-haiku":
                raise AssertionError("Analysis provenance lost the selected model.")
            blueprint = checked(client.get(f"/api/v1/blueprint/{session}"))
            pdf = client.get(f"/api/v1/blueprint/{session}/pdf", params={
                "analysis_id": analysis["analysis_id"], "status": analysis["status"]})
            if pdf.status_code != 200:
                raise AssertionError(f"PDF integration failed with {pdf.status_code}.")
            text = "\n".join(page.extract_text() for page in PdfReader(BytesIO(pdf.content), strict=True).pages)
            if "claude-haiku-5-5" not in text or blueprint["inference_model"] != analysis["inference_model"]:
                raise AssertionError("Report model provenance is inconsistent.")
            checked(client.post(f"/api/v1/review/{session}", json={
                "analysis_id": analysis["analysis_id"], "decision": "approve",
                "reviewer": "Fictional integration reviewer", "note": "Synthetic test only, not a deployment approval."}))
            archive = checked(client.get(f"/api/v1/decisions/{session}/{analysis['analysis_id']}"))
            if archive["details"]["inference_model"] != analysis["inference_model"]:
                raise AssertionError("Archived model provenance is inconsistent.")
            print(f"PASS: live Claude interview, analysis, AWS blueprint, PDF and archive; "
                  f"{budget.calls} real model calls; conservative reserved upper bound USD {budget.reserved:.4f}.")
            print("Storage, auth and pattern retrieval used local isolated fixtures; this is not a staging infrastructure smoke.")
        finally:
            response = client.delete(f"/api/v1/sessions/{session}")
            if response.status_code not in (200, 404):
                raise AssertionError(f"Synthetic session cleanup failed with {response.status_code}.")


if __name__ == "__main__":
    main()
