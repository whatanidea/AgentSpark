import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Barrier
import unittest
from unittest.mock import patch
from uuid import uuid4

from anthropic import AnthropicFoundry
import httpx2
from fastapi.testclient import TestClient

from app.api import routes
from app.agents.demo_scenarios import demo_diagnosis
from app.database.cosmos_client import DatabaseClient
from app.main import app
from app.orchestration import langgraph_flow as flow
from app.utils import runtime
from app.utils.errors import DependencyUnavailable, InvalidDependencyResponse
from app.utils.foundry_claude import FoundryClaudeChat
from app.utils.llm import get_chat_llm, structured_call
from app.utils.model_catalog import assessment_model, available_models, model_definition, selected_model
from app.utils.models import AzureServiceMapping, WorkflowState


ENV = {
    "AZURE_OPENAI_API_KEY": "fictional-test-key", "AZURE_OPENAI_ENDPOINT": "https://fictional.openai.azure.com",
    "AZURE_OPENAI_CHAT_DEPLOYMENT": "gpt-5-mini",
    "FOUNDRY_CLAUDE_ENABLED": "true", "AZURE_ANTHROPIC_API_KEY": "fictional-claude-key",
    "AZURE_ANTHROPIC_ENDPOINT": "https://fictional.services.ai.azure.com",
    "AZURE_ANTHROPIC_DEPLOYMENT": "claude-haiku-5-5", "AZURE_ANTHROPIC_MODEL_NAME": "claude-haiku-5-5",
    "AZURE_ANTHROPIC_MODEL_VERSION": "2",
}


class ModelRoutingTests(unittest.TestCase):
    def setUp(self):
        for item in (patch.dict(os.environ, ENV), patch.object(runtime.settings, "mode", "live")):
            item.start()
            self.addCleanup(item.stop)
        get_chat_llm.cache_clear()
        self.addCleanup(get_chat_llm.cache_clear)

    def test_catalog_only_exposes_approved_identities_not_credentials_or_endpoints(self):
        catalog = available_models()
        self.assertEqual([item["id"] for item in catalog["items"]], ["azure-openai", "foundry-claude-haiku"])
        self.assertTrue(all(item["available"] for item in catalog["items"]))
        text = json.dumps(catalog)
        self.assertNotIn("fictional-test-key", text)
        self.assertNotIn("fictional-claude-key", text)
        self.assertNotIn("services.ai.azure.com", text)

    def test_disabled_claude_never_falls_back_to_openai(self):
        with patch.dict(os.environ, {"FOUNDRY_CLAUDE_ENABLED": "false"}):
            catalog = available_models()
            self.assertTrue(catalog["items"][0]["available"])
            self.assertFalse(catalog["items"][1]["available"])
            self.assertIsNone(catalog["items"][1]["definition"])
            self.assertEqual(catalog["items"][1]["reason"], "Coming soon. Continue with Azure OpenAI.")
            with self.assertRaises(DependencyUnavailable):
                with assessment_model(model_definition("foundry-claude-haiku")):
                    get_chat_llm()

    def test_selection_pins_configuration_but_allows_key_rotation(self):
        selection = model_definition("foundry-claude-haiku")
        with patch.dict(os.environ, {"AZURE_ANTHROPIC_API_KEY": "rotated-test-key"}):
            with assessment_model(selection):
                self.assertEqual(selected_model.get(), selection)
        with patch.dict(os.environ, {"AZURE_ANTHROPIC_DEPLOYMENT": "changed-deployment"}):
            with self.assertRaises(DependencyUnavailable):
                with assessment_model(selection):
                    self.fail("Changed connections must not be used.")
        self.assertIsNone(selected_model.get())

    def test_provider_clients_and_concurrent_assessment_contexts_do_not_leak(self):
        barrier = Barrier(2)
        def factory(model_id):
            with assessment_model(model_definition(model_id)):
                barrier.wait(timeout=10)
                client = get_chat_llm()
                self.assertEqual(selected_model.get().id, model_id)
                return client
        with ThreadPoolExecutor(max_workers=2) as pool:
            clients = list(pool.map(factory, ("azure-openai", "foundry-claude-haiku")))
        self.assertNotIsInstance(clients[0], FoundryClaudeChat)
        self.assertIsInstance(clients[1], FoundryClaudeChat)
        self.assertIsNone(selected_model.get())
        with assessment_model(model_definition("azure-openai")):
            self.assertIs(get_chat_llm(), clients[0])
        with assessment_model(model_definition("foundry-claude-haiku")):
            self.assertIs(get_chat_llm(), clients[1])

    def test_unapproved_models_and_non_foundry_endpoints_are_rejected(self):
        with self.assertRaises(DependencyUnavailable):
            model_definition("arbitrary-user-model")
        for endpoint in ("http://fictional.services.ai.azure.com", "https://example.com",
                         "https://fictional.services.ai.azure.com/anthropic",
                         "https://fictional.services.ai.azure.com?redirect=example.com"):
            with self.subTest(endpoint=endpoint), patch.dict(os.environ, {"AZURE_ANTHROPIC_ENDPOINT": endpoint}):
                with self.assertRaises(DependencyUnavailable):
                    model_definition("foundry-claude-haiku")

    def claude(self, responses):
        requests = []
        def transport(request):
            requests.append(request)
            body = responses.pop(0)
            return httpx2.Response(200, json={
                "id": "test-message", "type": "message", "role": "assistant", "model": "claude-haiku-5-5",
                "content": body, "stop_reason": "tool_use" if body[0]["type"] == "tool_use" else "end_turn",
                "stop_sequence": None, "usage": {"input_tokens": 10, "output_tokens": 5},
            })
        http_client = httpx2.Client(transport=httpx2.MockTransport(transport))
        self.addCleanup(http_client.close)
        client = AnthropicFoundry(base_url=ENV["AZURE_ANTHROPIC_ENDPOINT"] + "/anthropic",
                                  api_key="fictional-claude-key", http_client=http_client, max_retries=0)
        return FoundryClaudeChat(client=client, deployment="claude-haiku-5-5"), requests

    def test_real_sdk_wire_format_uses_anthropic_tools_and_token_callbacks(self):
        llm, requests = self.claude([[{"type": "tool_use", "id": "tool_test", "name": "AzureServiceMapping",
                                      "input": {"compute": "Azure Functions"}}]])
        callback = flow.TokenCountingCallback()
        with assessment_model(model_definition("foundry-claude-haiku")):
            from langchain_core.runnables import RunnableLambda
            result = RunnableLambda(lambda _: structured_call(llm, "system", "fictional workflow", AzureServiceMapping)).invoke(
                {}, config={"callbacks": [callback]})
        self.assertEqual(result.compute, "Azure Functions")
        request = requests[0]
        self.assertEqual(request.url.path, "/anthropic/v1/messages")
        self.assertEqual(request.headers["api-key"], "fictional-claude-key")
        body = json.loads(request.content)
        self.assertEqual(body["model"], "claude-haiku-5-5")
        self.assertEqual(body["tool_choice"], {"type": "tool", "name": "AzureServiceMapping"})
        self.assertNotIn("response_format", body)
        self.assertEqual(callback.total_tokens, 15)

    def test_claude_json_retry_omits_openai_response_format_and_preserves_provider(self):
        llm, requests = self.claude([
            [{"type": "tool_use", "id": "bad", "name": "AzureServiceMapping", "input": {}}],
            [{"type": "text", "text": '{"compute":"Azure Functions"}'}],
        ])
        with assessment_model(model_definition("foundry-claude-haiku")):
            result = structured_call(llm, "system", "input", AzureServiceMapping)
        self.assertEqual(result.compute, "Azure Functions")
        self.assertEqual(len(requests), 2)
        retry = json.loads(requests[1].content)
        self.assertNotIn("response_format", retry)
        self.assertNotIn("tools", retry)
        self.assertIn("JSON schema", retry["system"])

    def test_invalid_claude_retry_is_explicit_and_never_switches_providers(self):
        llm, requests = self.claude([
            [{"type": "tool_use", "id": "bad", "name": "AzureServiceMapping", "input": {}}],
            [{"type": "text", "text": "not JSON"}],
        ])
        with assessment_model(model_definition("foundry-claude-haiku")):
            with self.assertRaises(InvalidDependencyResponse) as error:
                structured_call(llm, "system", "input", AzureServiceMapping)
        self.assertEqual(error.exception.dependency, "anthropic")
        self.assertEqual(len(requests), 2)

    def test_claude_rate_limits_fail_once_without_schema_retry_or_secret_logging(self):
        calls = []
        def transport(request):
            calls.append(request)
            return httpx2.Response(429, json={"type": "error", "error": {
                "type": "rate_limit_error", "message": "SECRET-FICTIONAL-PROVIDER-DETAIL"}})
        with httpx2.Client(transport=httpx2.MockTransport(transport)) as http_client:
            client = AnthropicFoundry(base_url=ENV["AZURE_ANTHROPIC_ENDPOINT"] + "/anthropic",
                                      api_key="fictional-claude-key", http_client=http_client, max_retries=0)
            llm = FoundryClaudeChat(client=client, deployment="claude-haiku-5-5")
            with assessment_model(model_definition("foundry-claude-haiku")), self.assertLogs(
                    "app.utils.llm", level="ERROR") as logs:
                with self.assertRaises(DependencyUnavailable) as error:
                    structured_call(llm, "system", "SECRET-FICTIONAL-INPUT", AzureServiceMapping)
        self.assertEqual(error.exception.dependency, "anthropic")
        self.assertEqual(len(calls), 1)
        self.assertNotIn("SECRET", "\n".join(logs.output))


class LiveTestBudgetTests(unittest.TestCase):
    def test_budget_rejects_invalid_or_unbounded_limits(self):
        from decimal import Decimal
        from scripts.check_live_claude import TestBudget
        for value in ("0", "-1", "2.01", "NaN", "Infinity"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                TestBudget(Decimal(value))

    def test_budget_reserves_before_calls_and_cannot_exceed_ceiling_concurrently(self):
        from decimal import Decimal
        from scripts.check_live_claude import TestBudget
        budget = TestBudget(Decimal("0.1"))
        request = {"max_tokens": 8192, "messages": [{"role": "user", "content": "Fictional"}]}
        def reserve(_):
            try:
                budget.reserve(request)
                return True
            except RuntimeError:
                return False
        with ThreadPoolExecutor(max_workers=8) as pool:
            accepted = list(pool.map(reserve, range(16)))
        self.assertEqual(sum(accepted), 2)
        self.assertEqual(budget.calls, 2)
        self.assertLessEqual(budget.reserved, budget.limit)

    def test_oversized_inputs_or_missing_output_bounds_make_no_reservation(self):
        from decimal import Decimal
        from scripts.check_live_claude import TestBudget
        budget = TestBudget(Decimal("2"))
        for request in ({"max_tokens": 8192, "content": "x" * 100000}, {"max_tokens": 0}, {"max_tokens": 8193}):
            with self.assertRaises(ValueError):
                budget.reserve(request)
        self.assertEqual(budget.calls, 0)
        self.assertEqual(budget.reserved, 0)


class ModelSelectionAPITests(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        env = patch.dict(os.environ, {**ENV, "DEMO_ARCHIVE_PATH": str(Path(directory.name) / "archive.sqlite3")})
        env.start()
        self.addCleanup(env.stop)
        self.database = DatabaseClient()
        for item in (patch.object(routes, "db_client", self.database), patch.object(flow, "db_client", self.database)):
            item.start()
            self.addCleanup(item.stop)
        self.client = TestClient(app)
        self.session = str(uuid4())
        self.body = {"session_id": self.session, "business_domain": "Fictional workflow", "team_size": "1-50",
                     "existing_systems": "Fictional ERP", "pain_points": "Fictional delay",
                     "compliance_requirements": "Low"}

    def test_new_live_interview_requires_selection_and_unknown_ids_fail_before_writes(self):
        with patch.object(runtime.settings, "mode", "live"):
            for body in (self.body, {**self.body, "model_id": "arbitrary-model"}):
                self.assertEqual(self.client.post("/api/v1/intake", json=body).status_code, 422)
            self.assertEqual(self.client.post("/api/v1/chat", json={
                "session_id": self.session, "message": "Fictional facts"}).status_code, 422)
        self.assertNotIn(self.session, self.database.mock_db)

    def test_saved_selection_routes_interview_and_cannot_change_after_generation(self):
        with patch.object(runtime.settings, "mode", "live"):
            response = self.client.post("/api/v1/intake", json={**self.body, "model_id": "azure-openai"})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertFalse(self.database.get_workflow_state(self.session).model_locked)
            response = self.client.post("/api/v1/intake", json={**self.body, "model_id": "foundry-claude-haiku"})
            self.assertEqual(response.status_code, 200, response.text)
            def extraction(*args, **kwargs):
                self.assertEqual(selected_model.get().id, "foundry-claude-haiku")
                return demo_diagnosis("invoice")
            with patch.object(routes.diagnostic_agent, "analyze_chat_history", side_effect=extraction):
                response = self.client.post("/api/v1/chat", json={"session_id": self.session, "message": "Fictional facts"})
            self.assertEqual(response.status_code, 200, response.text)
            response = self.client.post("/api/v1/intake", json={**self.body, "model_id": "azure-openai"})
            self.assertEqual(response.status_code, 409, response.text)
            state = self.database.get_workflow_state(self.session)
            self.assertEqual(state.inference_model.id, "foundry-claude-haiku")
            self.assertIsNone(selected_model.get())

    def test_selection_propagates_through_langgraph_threads_and_report_archives(self):
        state = WorkflowState(session_id=self.session, inference_model=None)
        with patch.object(runtime.settings, "mode", "live"):
            state.inference_model = model_definition("foundry-claude-haiku")
        state.demo_scenario = "invoice"
        self.database.save_workflow_state(state)
        original = flow.diagnostic_agent.analyze_chat_history
        def extraction(*args, **kwargs):
            self.assertEqual(selected_model.get().id, "foundry-claude-haiku")
            return original(*args, **kwargs)
        # Agents remain deterministic fixtures here; the graph must still carry the real selection.
        with patch.object(runtime.settings, "mode", "live"), patch.object(
                flow.diagnostic_agent, "analyze_chat_history", side_effect=extraction), patch(
                "app.rag.retrieval.get_search_client", return_value=(None, "fictional-patterns")):
            result = flow.run_orchestration(self.session)
        self.assertEqual(result.inference_model, state.inference_model)
        blueprint = self.client.get(f"/api/v1/blueprint/{self.session}").json()
        self.assertEqual(blueprint["inference_model"]["id"], "foundry-claude-haiku")
        from app.utils.pdf_report import build_blueprint_pdf
        from io import BytesIO
        from pypdf import PdfReader
        text = "\n".join(page.extract_text() for page in PdfReader(BytesIO(build_blueprint_pdf(blueprint))).pages)
        self.assertIn("claude-haiku-5-5", text)
        response = self.client.post(f"/api/v1/review/{self.session}", json={
            "analysis_id": result.analysis_id, "decision": "approve",
            "reviewer": "Fictional reviewer", "note": "Fictional test only."})
        self.assertEqual(response.status_code, 200, response.text)
        record = self.database.get_decision(self.session, result.analysis_id)
        self.assertEqual(record.details["inference_model"]["id"], "foundry-claude-haiku")
        # Invalidating generated output must not unlock an assessment for a different provider.
        state = self.database.get_workflow_state(self.session)
        state.invalidate_analysis()
        self.database.save_workflow_state(state)
        with patch.object(runtime.settings, "mode", "live"):
            response = self.client.post("/api/v1/intake", json={**self.body, "model_id": "azure-openai"})
        self.assertEqual(response.status_code, 409, response.text)
        self.assertIsNone(selected_model.get())

    def test_demo_cannot_claim_to_run_on_claude_and_legacy_models_are_unrecorded(self):
        response = self.client.post("/api/v1/intake", json={**self.body, "model_id": "foundry-claude-haiku"})
        self.assertEqual(response.status_code, 503)
        self.assertIsNone(WorkflowState(session_id="historical").inference_model)
        response = self.client.post("/api/v1/intake", json=self.body)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["inference_model"]["id"], "demo")
