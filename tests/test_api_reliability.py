import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
import os
from threading import Barrier, Event
import time
import unittest
from unittest.mock import patch
from uuid import uuid4

os.environ["AGENTSENSE_MODE"] = "demo"

import httpx
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import routes
from app.api.middleware import MAX_REQUEST_BYTES
from app.database.cosmos_client import db_client
from app.main import app
from app.orchestration import langgraph_flow as flow
from app.utils.errors import DependencyUnavailable, InvalidDependencyResponse
from app.utils.models import WorkflowIntelligence, WorkflowState
from app.utils.runtime import settings


class APIValidationTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_public_api_uses_agentspark_branding(self):
        response = self.client.get("/openapi.json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["info"]["title"], "AgentSpark API")

    def test_chat_rejects_empty_oversized_and_unknown_fields(self):
        for message in ("", "   ", "x" * 8001):
            with self.subTest(length=len(message)):
                response = self.client.post("/api/v1/chat", json={"session_id": "validation", "message": message})
                self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.post("/api/v1/chat", json={
            "session_id": "validation", "message": "Valid", "unexpected": True,
        }).status_code, 422)
        self.assertEqual(self.client.post("/api/v1/guardrail-check", json={
            "session_id": "validation", "message": "x" * 8000,
        }).status_code, 200)

    def test_session_identifier_boundaries(self):
        for session in ("", "../session", "bad#id", "bad\\id", "x" * 101, "space id"):
            with self.subTest(session=session):
                response = self.client.post("/api/v1/guardrail-check", json={
                    "session_id": session, "message": "Valid",
                })
                self.assertEqual(response.status_code, 422)
        for session in ("a", "x" * 100, "e2e-session_999"):
            with self.subTest(session=session):
                self.assertEqual(self.client.post("/api/v1/guardrail-check", json={
                    "session_id": session, "message": "Valid",
                }).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/review/bad%20id").status_code, 422)

    def test_intake_enforces_domain_team_and_compliance(self):
        payload = {"session_id": "intake-validation", "business_domain": "Domain", "team_size": "1-50",
                   "existing_systems": "", "pain_points": "", "compliance_requirements": "Low"}
        for changes in ({"business_domain": " "}, {"business_domain": "x" * 201},
                        {"team_size": "unbounded"}, {"compliance_requirements": "Unknown"},
                        {"existing_systems": "x" * 4001}, {"pain_points": "x" * 8001}):
            with self.subTest(changes=list(changes)):
                self.assertEqual(self.client.post("/api/v1/intake", json={
                    **payload, **changes,
                }).status_code, 422)

    def test_pattern_query_bounds(self):
        for params in ({"k": 0}, {"k": -1}, {"k": 51}, {"q": ""}, {"q": " "}, {"q": "x" * 2001}):
            with self.subTest(params=params):
                self.assertEqual(self.client.get("/api/v1/patterns", params=params).status_code, 422)
        for k in (1, 50):
            response = self.client.get("/api/v1/patterns", params={"k": k, "q": "x" * 2000})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(len(response.json()["results"]), k)

    def test_body_limit_exact_boundary_and_one_byte_over(self):
        encoded = json.dumps({"session_id": "body-limit", "message": "Valid"}).encode()
        at_limit = encoded + b" " * (MAX_REQUEST_BYTES - len(encoded))
        self.assertEqual(self.client.post("/api/v1/guardrail-check", content=at_limit,
                                        headers={"Content-Type": "application/json"}).status_code, 200)
        for headers in ({"Content-Type": "application/json"},
                        {"Content-Type": "application/json", "Content-Length": "1"}):
            with self.subTest(headers=headers):
                self.assertEqual(self.client.post("/api/v1/guardrail-check", content=at_limit + b" ",
                                                headers=headers).status_code, 413)

    def test_invalid_content_length_is_rejected(self):
        self.assertEqual(self.client.post("/api/v1/chat", content=b"{}",
                                        headers={"Content-Length": "-1"}).status_code, 400)

    def test_workflow_numeric_and_categorical_boundaries(self):
        maximums = {"steps": 1000, "decision_points": 1000,
                    "exceptions_per_week": 1000000, "volume_per_day": 10000000}
        for field, maximum in maximums.items():
            for value in (0, maximum):
                self.assertEqual(getattr(WorkflowIntelligence(workflow_name="Valid", **{field: value}), field), value)
            for value in (-1, maximum + 1, 1.5, True):
                with self.subTest(field=field, value=value):
                    with self.assertRaises(ValidationError):
                        WorkflowIntelligence(workflow_name="Invalid", **{field: value})
        for field in ("compliance_sensitivity", "data_availability", "rule_stability",
                      "human_judgment", "unstructured_content", "error_cost"):
            with self.subTest(field=field):
                with self.assertRaises(ValidationError):
                    WorkflowIntelligence(workflow_name="Invalid", **{field: "unknown"})

    def test_dependency_errors_have_safe_explicit_http_responses(self):
        for error, status, code in ((DependencyUnavailable("cosmos"), 503, "dependency_unavailable"),
                                    (InvalidDependencyResponse("cosmos"), 502, "invalid_dependency_response")):
            with self.subTest(status=status):
                with patch.object(db_client, "get_workflow_state", side_effect=error):
                    response = self.client.get("/api/v1/review/session")
                self.assertEqual(response.status_code, status)
                self.assertEqual(response.json()["code"], code)
                self.assertEqual(response.json()["dependency"], "cosmos")

    def test_no_raw_exception_details_leak(self):
        client = TestClient(app, raise_server_exceptions=False)
        with patch.object(db_client, "get_workflow_state", return_value=WorkflowState(session_id="session")), \
                patch.object(routes, "run_orchestration", side_effect=RuntimeError("secret-internal-value")):
            with self.assertLogs("app.api.middleware", level="ERROR") as captured:
                response = client.post("/api/v1/analyze/session")
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("secret-internal-value", response.text)
        self.assertNotIn("secret-internal-value", str(captured.output))

    def test_live_chat_failure_does_not_save_a_placeholder_exchange(self):
        session_id = str(uuid4())
        with patch.object(routes.diagnostic_agent, "chat", side_effect=DependencyUnavailable("openai")):
            response = self.client.post("/api/v1/chat", json={
                "session_id": session_id, "message": "Describe a workflow",
            })
        self.assertEqual(response.status_code, 503)
        self.assertNotIn(session_id, db_client.mock_db)

    def test_failed_live_analysis_does_not_persist_partial_results(self):
        session_id = str(uuid4())
        initial = WorkflowState(session_id=session_id, demo_scenario="invoice",
                                chat_history=[{"role": "user", "content": "Workflow"}])
        db_client.save_workflow_state(initial)
        try:
            with patch.object(flow.mapping_agent, "map_services", side_effect=DependencyUnavailable("openai")):
                response = self.client.post(f"/api/v1/analyze/{session_id}")
            self.assertEqual(response.status_code, 503)
            stored = db_client.get_workflow_state(session_id)
            self.assertEqual(stored.status, "init")
            self.assertIsNone(stored.analysis_id)
            self.assertIsNone(stored.workflow_intelligence)
        finally:
            db_client.mock_db.pop(session_id, None)

    def test_liveness_is_not_readiness_and_live_outage_is_not_demo(self):
        with patch.object(settings, "mode", "live"), \
                patch("app.main.readiness", return_value=(False, {
                    "openai": "unavailable", "search": "ready", "cosmos": "ready",
                })):
            health = self.client.get("/health")
            ready = self.client.get("/ready")
        self.assertEqual(health.status_code, 200)
        self.assertTrue(health.json()["live"])
        self.assertEqual(health.json()["mode"], "live")
        self.assertEqual(ready.status_code, 503)
        self.assertFalse(ready.json()["ready"])
        self.assertEqual(ready.json()["mode"], "live")


class ConcurrentRequestTests(unittest.TestCase):
    def test_two_reviewers_cannot_overwrite_each_other(self):
        session_id = str(uuid4())
        client = TestClient(app)
        db_client.save_workflow_state(WorkflowState(
            session_id=session_id, demo_scenario="invoice", chat_history=[{"role": "user", "content": "Workflow"}],
        ))
        analysis = client.post(f"/api/v1/analyze/{session_id}").json()
        original_read = db_client.get_workflow_state
        barrier = Barrier(2)

        def read_at_same_version(*args, **kwargs):
            state = original_read(*args, **kwargs)
            barrier.wait(timeout=5)
            return state

        def review(decision):
            with TestClient(app) as thread_client:
                return thread_client.post(f"/api/v1/review/{session_id}", json={
                    "analysis_id": analysis["analysis_id"], "decision": decision,
                    "reviewer": decision, "note": "Concurrent review test",
                })

        try:
            with patch.object(db_client, "get_workflow_state", side_effect=read_at_same_version):
                with ThreadPoolExecutor(max_workers=2) as executor:
                    responses = list(executor.map(review, ["approve", "reject"]))
            self.assertEqual(sorted(response.status_code for response in responses), [200, 409])
            winner = next(response.json() for response in responses if response.status_code == 200)
            self.assertEqual(original_read(session_id).human_review.decision, winner["human_review"]["decision"])
            conflict = next(response.json() for response in responses if response.status_code == 409)
            self.assertEqual(conflict["code"], "session_conflict")
        finally:
            db_client.mock_db.pop(session_id, None)

    def test_analysis_cannot_overwrite_a_new_chat_message(self):
        session_id = str(uuid4())
        db_client.save_workflow_state(WorkflowState(
            session_id=session_id, chat_history=[{"role": "user", "content": "Original workflow"}],
        ))
        original_invoke = flow.orchestrator_app.invoke

        def update_during_analysis(*args, **kwargs):
            result = original_invoke(*args, **kwargs)
            state = db_client.get_workflow_state(session_id)
            state.chat_history.append({"role": "user", "content": "New information"})
            state.invalidate_analysis()
            db_client.save_workflow_state(state)
            return result

        try:
            with patch.object(flow.orchestrator_app, "invoke", side_effect=update_during_analysis):
                response = TestClient(app).post(f"/api/v1/analyze/{session_id}")
            self.assertEqual(response.status_code, 409)
            state = db_client.get_workflow_state(session_id)
            self.assertEqual(state.chat_history[-1]["content"], "New information")
            self.assertIsNone(state.analysis_id)
        finally:
            db_client.mock_db.pop(session_id, None)


class AsyncAPIResponsivenessTests(unittest.IsolatedAsyncioTestCase):
    async def test_chunked_oversized_body_is_rejected_before_processing(self):
        async def chunks():
            yield b"x" * MAX_REQUEST_BYTES
            yield b"x"
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
            response = await client.post("/api/v1/chat", content=chunks())
        self.assertEqual(response.status_code, 413)

    async def test_health_responds_while_analysis_waits_on_sync_work(self):
        started, release = Event(), Event()

        def blocking_analysis(session_id):
            started.set()
            if not release.wait(timeout=5):
                raise TimeoutError("Test did not release analysis")
            return WorkflowState(session_id=session_id)

        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
            with patch.object(db_client, "get_workflow_state", return_value=WorkflowState(session_id="responsiveness")), \
                    patch.object(routes, "run_orchestration", side_effect=blocking_analysis):
                task = asyncio.create_task(client.post("/api/v1/analyze/responsiveness"))
                try:
                    self.assertTrue(await asyncio.to_thread(started.wait, 1))
                    before = time.monotonic()
                    response = await asyncio.wait_for(client.get("/health"), timeout=0.5)
                    self.assertLess(time.monotonic() - before, 0.5)
                    self.assertEqual(response.status_code, 200)
                    self.assertFalse(task.done())
                finally:
                    release.set()
                    await task


if __name__ == "__main__":
    unittest.main()
