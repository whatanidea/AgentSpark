import os
import json
import subprocess
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

os.environ["AGENTSENSE_MODE"] = "demo"

from azure.core.exceptions import ServiceRequestError
from langchain_core.exceptions import OutputParserException
from openai import APITimeoutError
import httpx

from app.agents.diagnostic_agent import DiagnosticAgent
from app.agents.mapping_agent import MappingAgent
from app.agents.recommendation_agent import RecommendationAgent
from app.agents.blueprint_agent import BlueprintAgent
from app.database.cosmos_client import DatabaseClient
from app.rag import retrieval, ingestion
from app.rag.search_client import get_search_client
from app.utils import runtime, health
from app.utils.errors import DependencyUnavailable, InvalidDependencyResponse
from app.utils.llm import get_chat_llm, structured_call
from app.utils.models import AzureServiceMapping, WorkflowIntelligence
from app.scoring.scoring_engine import scoring_engine


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        get_chat_llm.cache_clear()
        get_search_client.cache_clear()

    def tearDown(self):
        get_chat_llm.cache_clear()
        get_search_client.cache_clear()

    def test_local_default_is_demo_and_production_requires_explicit_mode(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(runtime.load_settings().mode, "demo")
        with patch.dict(os.environ, {"ENVIRONMENT": "production"}, clear=True):
            with self.assertLogs("app.utils.runtime", level="ERROR"):
                with self.assertRaises(ValueError):
                    runtime.load_settings()
        for mode in ("demo", "live"):
            with patch.dict(os.environ, {"ENVIRONMENT": "production", "AGENTSENSE_MODE": mode}, clear=True):
                self.assertEqual(runtime.load_settings().mode, mode)

    def test_invalid_runtime_mode_fails(self):
        with patch.dict(os.environ, {"AGENTSENSE_MODE": "auto"}):
            with self.assertLogs("app.utils.runtime", level="ERROR"):
                with self.assertRaises(ValueError):
                    runtime.load_settings()

    def test_demo_ignores_cloud_credentials(self):
        with patch.object(runtime.settings, "mode", "demo"), \
                patch.dict(os.environ, {"COSMOS_DB_ENDPOINT": "https://example.documents.azure.com",
                                        "COSMOS_DB_KEY": "configured-key"}), \
                patch("app.database.cosmos_client.CosmosClient") as client:
            self.assertTrue(DatabaseClient().use_mock)
            self.assertIsNone(get_chat_llm())
            self.assertIsNone(get_search_client()[0])
            self.assertTrue(DiagnosticAgent().use_mock)
            self.assertTrue(MappingAgent().use_mock)
            self.assertTrue(RecommendationAgent().use_mock)
            self.assertTrue(BlueprintAgent().use_mock)
        client.assert_not_called()

    def test_live_missing_credentials_never_select_demo(self):
        with patch.object(runtime.settings, "mode", "live"), patch.dict(os.environ, {}, clear=True):
            self.assertFalse(DiagnosticAgent().use_mock)
            self.assertFalse(DatabaseClient().use_mock)
            for factory in (get_chat_llm, get_search_client):
                with self.subTest(factory=factory.__name__):
                    with self.assertLogs("app.utils.runtime", level="ERROR"):
                        with self.assertRaises(DependencyUnavailable):
                            factory()

    def test_invalid_endpoint_is_reported_as_configuration_failure(self):
        with patch.dict(os.environ, {"AZURE_OPENAI_ENDPOINT": "not a URL", "AZURE_OPENAI_API_KEY": "key"}):
            with self.assertLogs("app.utils.runtime", level="ERROR"):
                with self.assertRaises(DependencyUnavailable):
                    runtime.require_config("openai", "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY")

    def test_structured_call_does_not_retry_transport_failure_as_json(self):
        llm = Mock()
        llm.with_structured_output.return_value.invoke.side_effect = APITimeoutError(
            request=httpx.Request("POST", "https://example.openai.azure.com"))
        with self.assertLogs("app.utils.llm", level="ERROR"):
            with self.assertRaises(DependencyUnavailable):
                structured_call(llm, "system", "input", AzureServiceMapping)
        llm.invoke.assert_not_called()

    def test_structured_call_uses_function_calling_not_strict_json_schema(self):
        from langchain_openai import AzureChatOpenAI

        requests = []

        def transport(request):
            requests.append(json.loads(request.content))
            return httpx.Response(200, json={
                "id": "mock-completion", "object": "chat.completion", "created": 1, "model": "gpt-5-mini",
                "choices": [{"index": 0, "finish_reason": "tool_calls", "message": {
                    "role": "assistant", "content": None, "tool_calls": [{
                        "id": "call_1", "type": "function", "function": {
                            "name": "AzureServiceMapping", "arguments": '{"compute":"Azure Functions"}'}}]}}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            })

        with httpx.Client(transport=httpx.MockTransport(transport)) as http_client:
            llm = AzureChatOpenAI(azure_endpoint="https://example.openai.azure.com",
                                 azure_deployment="gpt-5-mini", api_key="test-only-key",
                                 api_version="2025-04-01-preview", http_client=http_client, max_retries=0)
            result = structured_call(llm, "system", "input", AzureServiceMapping)
        self.assertEqual(result.compute, "Azure Functions")
        self.assertEqual(len(requests), 1)
        self.assertNotIn("response_format", requests[0])
        self.assertEqual(requests[0]["tools"][0]["function"]["name"], "AzureServiceMapping")

    def test_invalid_structured_output_has_one_real_json_retry(self):
        llm = Mock()
        llm.with_structured_output.return_value.invoke.side_effect = OutputParserException("invalid")
        llm.invoke.return_value = SimpleNamespace(content='```json\n{"compute":"Azure Functions"}\n```')
        result = structured_call(llm, "system", "input", AzureServiceMapping)
        self.assertEqual(result.compute, "Azure Functions")
        llm.invoke.assert_called_once()

    def test_invalid_json_is_an_explicit_failure_not_default_mapping(self):
        llm = Mock()
        llm.with_structured_output.return_value.invoke.side_effect = OutputParserException("invalid")
        llm.invoke.return_value = SimpleNamespace(content="invalid")
        with self.assertLogs("app.utils.llm", level="WARNING"):
            with self.assertRaises(InvalidDependencyResponse):
                structured_call(llm, "system", "input", AzureServiceMapping)

    def test_empty_mapping_cannot_succeed_using_schema_defaults(self):
        llm = Mock()
        llm.with_structured_output.return_value.invoke.return_value = {}
        llm.invoke.return_value = SimpleNamespace(content="{}")
        with self.assertLogs("app.utils.llm", level="WARNING"):
            with self.assertRaises(InvalidDependencyResponse):
                structured_call(llm, "system", "input", AzureServiceMapping)

    def test_live_agents_propagate_errors_instead_of_placeholder_outputs(self):
        from app.agents.demo_scenarios import demo_diagnosis
        from app.utils.models import EnterpriseContext
        from app.rag.pattern_library import PATTERNS
        diagnosis = demo_diagnosis("invoice")
        intel = diagnosis.intelligence
        score = scoring_engine.evaluate(intel)
        calls = [
            ("app.agents.diagnostic_agent.get_chat_llm",
             lambda: DiagnosticAgent().analyze_chat_history([])),
            ("app.agents.diagnostic_agent.get_chat_llm",
             lambda: DiagnosticAgent().chat("Describe workflow", [])),
            ("app.agents.mapping_agent.get_chat_llm",
             lambda: MappingAgent().map_services(intel)),
            ("app.agents.recommendation_agent.get_chat_llm",
             lambda: RecommendationAgent().generate_recommendation(score, {}, intel, patterns=PATTERNS)),
            ("app.agents.blueprint_agent.get_chat_llm",
             lambda: BlueprintAgent().generate_blueprint(
                 score, {}, intelligence=intel, context=EnterpriseContext(), mapping={},
                 governance={"decision": "HUMAN_REVIEW_REQUIRED"}, roi={}, diagnosis=diagnosis)),
        ]
        with patch.object(runtime.settings, "mode", "live"):
            for target, call in calls:
                with self.subTest(target=target):
                    with patch(target, side_effect=DependencyUnavailable("openai")):
                        with self.assertRaises(DependencyUnavailable):
                            call()

    def test_empty_live_chat_is_not_saved_as_a_successful_response(self):
        llm = Mock()
        llm.invoke.return_value = SimpleNamespace(content="")
        with patch.object(runtime.settings, "mode", "live"), \
                patch("app.agents.diagnostic_agent.get_chat_llm", return_value=llm):
            with self.assertLogs("app.agents.diagnostic_agent", level="ERROR"):
                with self.assertRaises(InvalidDependencyResponse):
                    DiagnosticAgent().chat("Describe workflow", [])

    def test_live_search_outages_and_empty_results_do_not_use_local_patterns(self):
        client = Mock()
        for failure in (False, True):
            with self.subTest(failure=failure):
                client.search.side_effect = ServiceRequestError("unavailable") if failure else None
                client.search.return_value = []
                with patch.object(retrieval, "get_search_client", return_value=(client, "index")), \
                        patch.object(retrieval, "keyword_rank") as local:
                    with self.assertLogs("app.rag.retrieval", level="ERROR"):
                        with self.assertRaises(DependencyUnavailable):
                            retrieval.retrieve_patterns("workflow")
                local.assert_not_called()

    def test_partial_ingestion_never_reports_success(self):
        client = Mock()
        client.upload_documents.return_value = [SimpleNamespace(succeeded=False)]
        with patch.object(ingestion, "get_search_client", return_value=(client, "index")):
            with self.assertLogs("app.rag.ingestion", level="ERROR"):
                with self.assertRaises(InvalidDependencyResponse):
                    ingestion.ingest_document("id", "text", {})

    def test_readiness_probes_every_live_dependency_and_preserves_mode(self):
        with patch.object(runtime.settings, "mode", "live"), \
                patch.object(health, "check_openai", side_effect=DependencyUnavailable("openai")) as openai, \
                patch.object(health, "check_search") as search, \
                patch.object(health.db_client, "check_ready") as cosmos, \
                patch.object(health.tenant_directory, "check_ready") as directory:
            ready, dependencies = health.readiness()
        self.assertFalse(ready)
        self.assertEqual(dependencies, {"openai": "unavailable", "search": "ready", "cosmos": "ready",
                                        "tenant_directory": "ready"})
        openai.assert_called_once()
        search.assert_called_once()
        cosmos.assert_called_once()
        directory.assert_called_once()

    def test_demo_readiness_never_calls_cloud_probes(self):
        with patch.object(runtime.settings, "mode", "demo"), \
                patch.object(health, "check_openai") as openai:
            ready, dependencies = health.readiness()
        self.assertTrue(ready)
        self.assertEqual(dependencies, {"openai": "demo", "search": "demo", "cosmos": "demo",
                                        "decision_archive": "ready", "tenant_directory": "ready"})
        openai.assert_not_called()

    def test_live_readiness_missing_configuration_in_a_fresh_process(self):
        environment = dict(os.environ, AGENTSENSE_MODE="live", PYTHONDONTWRITEBYTECODE="1",
                           AGENTSENSE_AUTH_MODE="oidc", AUTH_ISSUER="https://issuer.example",
                           AUTH_AUDIENCE="agentsense-api", AUTH_JWKS_URL="https://issuer.example/keys")
        for key in ("AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT", "AZURE_SEARCH_KEY",
                    "AZURE_SEARCH_ENDPOINT", "COSMOS_DB_KEY", "COSMOS_DB_ENDPOINT"):
            environment[key] = "your_placeholder"
        result = subprocess.run([sys.executable, "-B", "-c", """
import json
from fastapi.testclient import TestClient
from app.main import app
client = TestClient(app)
health = client.get('/health')
ready = client.get('/ready')
chat = client.post('/api/v1/chat', json={'session_id': 'live-check', 'message': 'Describe a workflow'})
print(json.dumps({'health': health.json(), 'ready': ready.json(),
                  'ready_status': ready.status_code, 'chat_status': chat.status_code}))
"""], capture_output=True, text=True, env=environment, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["health"]["mode"], "live")
        self.assertEqual(payload["ready_status"], 503)
        self.assertFalse(payload["ready"]["ready"])
        self.assertEqual(set(payload["ready"]["dependencies"].values()), {"unavailable"})
        self.assertEqual(payload["chat_status"], 401)

    def test_openai_probe_works_with_real_sdk_and_mock_http(self):
        from langchain_openai import AzureChatOpenAI

        requests = []

        def transport(request):
            requests.append(json.loads(request.content))
            return httpx.Response(200, json={
                "id": "mock-completion", "object": "chat.completion", "created": 1, "model": "gpt-4o",
                "choices": [{"index": 0, "message": {"role": "assistant", "content": "OK"},
                             "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            })

        with httpx.Client(transport=httpx.MockTransport(transport)) as http_client:
            llm = AzureChatOpenAI(azure_endpoint="https://example.openai.azure.com",
                                 azure_deployment="gpt-4o", api_key="test-only-key",
                                 api_version="2024-08-01-preview", http_client=http_client, max_retries=0)
            with patch.object(health, "get_chat_llm", return_value=llm):
                health.check_openai()
        self.assertEqual(len(requests), 1)
        token_limit = requests[0].get("max_completion_tokens", requests[0].get("max_tokens"))
        self.assertEqual(token_limit, 1)

    def test_reasoning_deployments_omit_temperature_and_default_keeps_it(self):
        base = {"AZURE_OPENAI_API_KEY": "test-only-key", "AZURE_OPENAI_ENDPOINT": "https://example.openai.azure.com"}
        cases = (({}, {"temperature": 0.1}, "reasoning_effort", 15.0),
                 ({"AZURE_OPENAI_REASONING_EFFORT": "Low", "AZURE_OPENAI_TIMEOUT_SECONDS": "60"},
                  {"reasoning_effort": "low"}, "temperature", 60.0))
        for extra, expected, absent, timeout in cases:
            with self.subTest(extra=extra), patch.object(runtime.settings, "mode", "live"), \
                    patch.dict(os.environ, {**base, **extra}, clear=True), \
                    patch("langchain_openai.AzureChatOpenAI") as client:
                get_chat_llm.cache_clear()
                get_chat_llm(temperature=0.1)
                kwargs = client.call_args.kwargs
                self.assertLessEqual(expected.items(), kwargs.items())
                self.assertNotIn(absent, kwargs)
                self.assertEqual(kwargs["timeout"], timeout)

    def test_invalid_reasoning_or_timeout_settings_fail_closed(self):
        base = {"AZURE_OPENAI_API_KEY": "test-only-key", "AZURE_OPENAI_ENDPOINT": "https://example.openai.azure.com"}
        for extra in ({"AZURE_OPENAI_REASONING_EFFORT": "extreme"}, {"AZURE_OPENAI_TIMEOUT_SECONDS": "0"},
                      {"AZURE_OPENAI_TIMEOUT_SECONDS": "soon"}):
            with self.subTest(extra=extra), patch.object(runtime.settings, "mode", "live"), \
                    patch.dict(os.environ, {**base, **extra}, clear=True), \
                    patch("langchain_openai.AzureChatOpenAI") as client:
                get_chat_llm.cache_clear()
                with self.assertLogs("app.utils.llm", level="ERROR"), self.assertRaises(DependencyUnavailable):
                    get_chat_llm()
                client.assert_not_called()

    def test_openai_probe_for_reasoning_deployment_sends_no_temperature(self):
        from langchain_openai import AzureChatOpenAI

        requests = []

        def transport(request):
            requests.append(json.loads(request.content))
            return httpx.Response(200, json={
                "id": "mock-completion", "object": "chat.completion", "created": 1, "model": "gpt-5-mini",
                "choices": [{"index": 0, "message": {"role": "assistant", "content": "OK"},
                             "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 9, "total_tokens": 10},
            })

        with httpx.Client(transport=httpx.MockTransport(transport)) as http_client, \
                patch.dict(os.environ, {"AZURE_OPENAI_REASONING_EFFORT": "low"}):
            llm = AzureChatOpenAI(azure_endpoint="https://example.openai.azure.com",
                                 azure_deployment="gpt-5-mini", api_key="test-only-key",
                                 api_version="2025-04-01-preview", http_client=http_client,
                                 max_retries=0, reasoning_effort="low")
            with patch.object(health, "get_chat_llm", return_value=llm):
                health.check_openai()
        self.assertEqual(len(requests), 1)
        self.assertEqual(requests[0].get("max_completion_tokens"), 16)
        self.assertNotIn("max_tokens", requests[0])
        self.assertEqual(requests[0].get("reasoning_effort"), "minimal")
        self.assertNotIn("temperature", requests[0])


if __name__ == "__main__":
    unittest.main()
