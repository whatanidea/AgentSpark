from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import json
import os
import re
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from pypdf import PdfReader

from app.api import routes
from app.database.cosmos_client import DatabaseClient
from app.main import app
from app.orchestration import langgraph_flow
from app.security import auth
from app.utils.pdf_report import build_blueprint_pdf


def pdf_text(document):
    reader = PdfReader(BytesIO(document), strict=True)
    return reader, re.sub(r"\s+", " ", "\n".join(page.extract_text() for page in reader.pages))


class PDFExportTests(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        environment = patch.dict(os.environ, {"AGENTSENSE_MODE": "demo", "AGENTSENSE_AUTH_MODE": "local-demo",
            "DEMO_ARCHIVE_PATH": str(Path(directory.name) / "archive.sqlite3")})
        environment.start()
        self.addCleanup(environment.stop)
        self.database = DatabaseClient()
        for item in (patch.object(routes, "db_client", self.database),
                     patch.object(langgraph_flow, "db_client", self.database),
                     patch.object(auth, "auth_settings", auth.AuthSettings("local-demo")),
                     patch.object(routes, "auth_settings", auth.AuthSettings("local-demo"))):
            item.start()
            self.addCleanup(item.stop)
        self.client = TestClient(app)
        self.session = str(uuid4())
        self.intake = {"session_id": self.session, "business_domain": "Fictional Finance",
                       "team_size": "201-1000", "existing_systems": "SAP", "pain_points": "Delayed invoices",
                       "compliance_requirements": "High", "demo_scenario": "invoice",
                       "target_cloud": "aws", "preferred_region": "eu-central-1"}
        self.assertEqual(self.client.post("/api/v1/intake", json=self.intake).status_code, 200)
        self.path = f"/api/v1/blueprint/{self.session}"

    def analyze(self):
        response = self.client.post(f"/api/v1/analyze/{self.session}")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def download(self, analysis, expected=200, **params):
        result = self.client.get(self.path + "/pdf", params={
            "analysis_id": analysis["analysis_id"], "status": analysis["status"], **params})
        self.assertEqual(result.status_code, expected, result.text if expected != 200 else "")
        return result

    def review(self, analysis, decision):
        response = self.client.post(f"/api/v1/review/{self.session}", json={
            "analysis_id": analysis["analysis_id"], "decision": decision, "reviewer": "Fictional PDF reviewer",
            "note": f"Fictional {decision} decision; no business execution authorized."})
        self.assertEqual(response.status_code, 200, response.text)
        return self.client.get(self.path).json()

    def test_provisional_pdf_has_real_pages_status_cloud_roi_and_legacy_limitations(self):
        analysis = self.analyze()
        before = self.client.get(f"/api/v1/sessions/{self.session}").json()
        response = self.download(analysis)
        self.assertTrue(response.content.startswith(b"%PDF-"))
        self.assertTrue(response.content.rstrip().endswith(b"%%EOF"))
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertEqual(response.headers["content-disposition"], 'attachment; filename="AgentSpark_Assessment.pdf"')
        self.assertIn("no-store", response.headers["cache-control"])
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        reader, text = pdf_text(response.content)
        self.assertGreater(len(reader.pages), 1)
        for page in reader.pages:
            self.assertAlmostEqual(float(page.mediabox.width), 595.2756, places=2)
            self.assertAlmostEqual(float(page.mediabox.height), 841.8898, places=2)
            self.assertIn("PROVISIONAL - NOT APPROVED", page.extract_text())
            self.assertIn(analysis["analysis_id"], page.extract_text())
        for value in ("AgentSpark Assessment Report", "PROVISIONAL - NOT APPROVED", analysis["analysis_id"],
                      "aws", "eu-central-1", "Business value and pilot measures",
                      "Business value deferred", "Evidence register", "Implementation Readiness Report",
                      "Not assessed", "not deployment-ready", "Source", "SHA256"):
            self.assertIn(value, text)
        self.assertIn(re.sub(r"\s+", " ", self.client.get(self.path).json()["assessment_limitations"]), text)
        self.assertIn(f"Page {len(reader.pages)}", text)
        self.assertEqual(reader.metadata.author, "AgentSpark")
        self.assertEqual(self.client.get(f"/api/v1/sessions/{self.session}").json(), before)

    def test_pdf_preserves_evidence_readiness_and_approved_reviewer_snapshot(self):
        identifier = str(uuid4())
        evidence_path = f"/api/v1/sessions/{self.session}/evidence"
        self.assertEqual(self.client.put(evidence_path, json={"revision": 0, "entries": [{
            "id": identifier, "kind": "supported_finding", "statement": "Fictional sandbox access requires approval",
            "source_reference": "Fictional access report, page 4", "reporting_period": "October 2026",
            "related_facts": ["systems"],
        }]}).status_code, 200)
        self.assertEqual(self.client.post(f"{evidence_path}/{identifier}/confirm", json={
            "revision": 1, "method": "Inspected fictional access report page 4"}).status_code, 200)
        result = self.client.put(f"/api/v1/sessions/{self.session}/implementation-readiness", json={
            "revision": 0, "evidence_revision": 2, "assessment": {"checks": [{
                "id": "integration_access", "status": "blocked", "finding": "Fictional sandbox is unavailable",
                "owner": "Fictional SAP administrator", "owner_status": "proposed", "evidence_ids": [identifier],
                "next_action": "Confirm approved SAP access", "completion_criteria": "Successful sandbox connection",
            }], "pilot": {"scope": "Sandbox invoices only", "success_metrics": "95% routing accuracy across 100 cases",
                          "failure_handling": "Manual queue after timeout",
                          "authorization_boundaries": "Finance authorizes all payments"}}})
        self.assertEqual(result.status_code, 200, result.text)
        analysis = self.analyze()
        approved = self.review(analysis, "approve")
        _, text = pdf_text(self.download(approved).content)
        for value in ("ADVISORY RECOMMENDATION APPROVED", "Fictional PDF reviewer", "October 2026",
                      "Inspected fictional access report page 4", identifier, "Fictional SAP administrator",
                      "Confirm approved SAP access", "P0", "95% routing accuracy", "Finance authorizes all payments",
                      "Source references", "not compliance certification"):
            self.assertIn(value, text)
        self.assertNotIn("PROVISIONAL - NOT APPROVED", text)
        self.download(analysis, expected=409)

    def test_policy_and_human_rejections_do_not_export_implementation_content(self):
        analysis = self.analyze()
        rejected = self.review(analysis, "reject")
        rejected.update(architecture_doc="MUST-NOT-LEAK-ARCHITECTURE", code_scaffold="MUST-NOT-LEAK-CODE")
        _, text = pdf_text(build_blueprint_pdf(rejected))
        self.assertIn("REJECTED RECOMMENDATION", text)
        self.assertIn("Fictional reject decision", text)
        self.assertIn("non-agentic alternative", text)
        self.assertNotIn("MUST-NOT-LEAK", text)
        self.download(rejected)
        self.client.post("/api/v1/intake", json={**self.intake, "demo_scenario": "payroll"})
        rejected = self.analyze()
        self.assertEqual(rejected["status"], "rejected")
        _, text = pdf_text(self.download(rejected).content)
        self.assertIn("REJECTED RECOMMENDATION", text)
        self.assertNotIn("Illustrative, untested scaffold", text)

    def test_missing_stale_and_malformed_export_requests_fail_explicitly(self):
        result = self.client.get(self.path + "/pdf", params={"analysis_id": str(uuid4()), "status": "completed"})
        self.assertEqual(result.status_code, 404)
        analysis = self.analyze()
        self.download(analysis, expected=409, analysis_id=str(uuid4()))
        self.download(analysis, expected=409, status="completed")

    def test_query_validation_and_unknown_sessions_do_not_return_a_pdf(self):
        analysis = self.analyze()
        for params in ({}, {"analysis_id": analysis["analysis_id"]}, {"analysis_id": "../invalid", "status": "completed"},
                       {"analysis_id": analysis["analysis_id"], "status": "processing"}):
            response = self.client.get(self.path + "/pdf", params=params)
            self.assertEqual(response.status_code, 422, response.text)
            self.assertIn("application/json", response.headers["content-type"])
        response = self.client.get("/api/v1/blueprint/missing/pdf",
                                   params={"analysis_id": str(uuid4()), "status": "completed"})
        self.assertEqual(response.status_code, 404)

    def test_concurrent_invalidation_and_review_change_cannot_return_a_stale_pdf(self):
        for invalidate in (True, False):
            with self.subTest(invalidate=invalidate):
                analysis = self.analyze()

                def change_during_render(snapshot):
                    state = self.database.get_workflow_state(self.session)
                    if invalidate:
                        state.invalidate_analysis()
                    else:
                        state.status = "completed"
                    self.database.save_workflow_state(state)
                    return b"%PDF-stale-document"

                with patch.object(routes, "build_blueprint_pdf", side_effect=change_during_render):
                    self.download(analysis, expected=409)

    def test_invalidation_and_expiry_remove_pdf_access(self):
        analysis = self.analyze()
        self.client.put(f"/api/v1/sessions/{self.session}/implementation-readiness", json={
            "revision": 0, "evidence_revision": 0, "assessment": {"checks": [{
                "id": "integration_access", "status": "blocked", "finding": "New blocker"}]}})
        self.download(analysis, expected=404)
        analysis = self.analyze()
        self.database.mock_db[self.session]["expires_at"] = "2000-01-01T00:00:00+00:00"
        self.download(analysis, expected=404)

    def test_redaction_and_markup_do_not_load_remote_content_or_lose_long_text(self):
        self.analyze()
        state = self.database.get_workflow_state(self.session)
        state.blueprint["architecture_doc"] = (
            "# Caf\u00e9 release \u4e2d\n"
            '<img src="https://invalid.example/remote.png"/> & <b>literal markup</b>\n\n'
            "| Item | Detail |\n|---|---|\n| Large value | " + "LONGVALUE " * 800 +
            "END-LONG-TABLE |\n\n```python\n    " + "x" * 1500 + "\n```\n"
            "Contact fictional@example.com; secret=fictional-export-secret")
        self.database.save_workflow_state(state)
        snapshot = self.client.get(self.path).json()
        with patch("urllib.request.urlopen", side_effect=AssertionError("PDF must not fetch external content")):
            response = self.download(snapshot)
        reader, text = pdf_text(response.content)
        self.assertGreater(len(reader.pages), 5)
        for marker in ("Caf\u00e9", "[U+4E2D]", "<img", "literal markup", "END-LONG-TABLE"):
            self.assertIn(marker, text)
        self.assertNotIn("fictional@example.com", text)
        self.assertNotIn("fictional-export-secret", text)
        self.assertIn("HTML and remote media", text)
        self.assertFalse(reader.trailer["/Root"].get("/OpenAction"))
        for page in reader.pages:
            self.assertFalse(page.get("/Annots"), "Untrusted source references must not become active PDF links")

    def test_legacy_missing_snapshots_are_labeled_not_fabricated(self):
        self.analyze()
        snapshot = self.client.get(self.path).json()
        snapshot.update(evidence_report=None, readiness_report=None, roi={"cost_saved_per_year": 1234567},
                        diagnosis=None, retrieved_patterns=[])
        _, text = pdf_text(build_blueprint_pdf(snapshot))
        for marker in ("historical assessment", "historical illustrative estimate", "Unknown costs are not zero",
                       "No diagnostic provenance", "No retained pattern sources"):
            self.assertIn(marker, text)
        self.assertNotIn("1234567", text)

    def test_optional_value_pdf_separates_capacity_cash_and_provenance(self):
        response = self.client.post(f"/api/v1/analyze/{self.session}", json={"roi_assumptions": {
            "mode": "estimate", "working_days_per_year": 250, "manual_minutes_per_item": 20,
            "effort_reduction_percent": 40, "loaded_hourly_rate": 80,
            "annual_cash_savings": 0, "annual_operating_cost": 30000, "implementation_cost": 10000,
            "annual_avoided_hiring_value": 100000,
            "service_improvements": "Measure response time in a bounded pilot.",
            "evidence": {"loaded_hourly_rate": {"basis": "finance_approved", "reference": "Fictional role rate card"}},
        }})
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(result["roi"]["annual_net_cash_benefit"], -30000)
        self.assertIsNone(result["roi"]["payback_months"])
        _, text = pdf_text(self.download(result).content)
        for marker in ("Capacity released", "not cash savings", "Supplied cash savings",
                       "Separate avoided-hiring", "Total implementation cost", "-40000",
                       "finance_approved", "Fictional role rate card", "Measure response time"):
            self.assertIn(marker, text)
        self.assertNotIn("conservative", text)
        self.assertNotIn("optimistic", text)

    def test_parallel_reports_do_not_mix_private_content(self):
        self.analyze()
        snapshot = self.client.get(self.path).json()
        snapshots = [{**snapshot, "architecture_doc": f"PRIVATE-WORKFLOW-{index}"} for index in range(3)]
        with ThreadPoolExecutor(max_workers=3) as pool:
            results = list(pool.map(build_blueprint_pdf, snapshots))
        for index, result in enumerate(results):
            _, text = pdf_text(result)
            self.assertIn(f"PRIVATE-WORKFLOW-{index}", text)
            for other in range(3):
                if other != index:
                    self.assertNotIn(f"PRIVATE-WORKFLOW-{other}", text)

    def test_generation_failure_uses_standard_safe_logged_error_not_a_fake_pdf(self):
        analysis = self.analyze()
        with patch.object(routes, "build_blueprint_pdf", side_effect=RuntimeError("fictional-secret-error")), \
                self.assertLogs("app.api.middleware", level="ERROR") as logs:
            result = TestClient(app, raise_server_exceptions=False).get(self.path + "/pdf", params={
                "analysis_id": analysis["analysis_id"], "status": analysis["status"]})
        self.assertEqual(result.status_code, 500)
        self.assertEqual(result.json()["code"], "internal_error")
        self.assertNotIn("fictional-secret-error", json.dumps(logs.output) + result.text)

    def test_decision_story_is_five_scannable_pages_before_a_bookmarked_reference(self):
        analysis = self.analyze()
        reader, text = pdf_text(self.download(analysis).content)
        chapters = (
            "The decision at a glance", "How the work would change", "What must be true before a pilot?",
            "What value do we know today?", "Start small. Earn the right to expand.",
            "Reference / Evidence and technical detail",
        )
        for index, title in enumerate(chapters):
            self.assertIn(title, re.sub(r"\s+", " ", reader.pages[index].extract_text()))
        outline = [entry["/Title"] for entry in reader.outline if isinstance(entry, dict)]
        self.assertEqual(outline, list(chapters))
        main_text = " ".join(page.extract_text() for page in reader.pages[:5])
        self.assertNotIn("Diagnostic inputs and provenance", main_text)
        self.assertNotIn("Illustrative, untested scaffold", main_text)
        self.assertIn("Diagnostic inputs and provenance", text)
        self.assertIn("Proposed responsibility flow, not a verified map", main_text)
        self.assertIn("Capacity is not cash savings", main_text)
        self.assertIn("Unknown", reader.pages[3].extract_text())
        self.assertIn("What should we do?", reader.pages[0].extract_text())
        self.assertIn("Your next move", reader.pages[0].extract_text())
        sizes = []
        reader.pages[0].extract_text(visitor_text=lambda text, cm, tm, font, size: sizes.append(size) if text.strip() else None)
        self.assertIn(27, sizes)
        self.assertIn(10.2, sizes)

    def test_visual_summary_distinguishes_zero_from_unknown_and_does_not_inflate_permissions(self):
        self.analyze()
        snapshot = self.client.get(self.path).json()
        snapshot["workflow_intelligence"].update(volume_per_day=0, decision_points=0, systems=[])
        reader, _ = pdf_text(build_blueprint_pdf(snapshot))
        cover = re.sub(r"\s+", " ", reader.pages[0].extract_text())
        self.assertIn("0 / day", cover)
        self.assertIn("Connected systems 0", cover)
        self.assertIn("Human decision points 0", cover)
        self.assertIn("does not authorize", cover)
        snapshot["workflow_intelligence"] = {}
        reader, _ = pdf_text(build_blueprint_pdf(snapshot))
        cover = re.sub(r"\s+", " ", reader.pages[0].extract_text())
        self.assertIn("Reported daily work Unknown", cover)
        self.assertIn("Connected systems Unknown", cover)
        self.assertIn("Human decision points Unknown", cover)

    def test_long_cover_and_main_section_markup_are_safe_without_dropping_reference_tail(self):
        self.analyze()
        snapshot = self.client.get(self.path).json()
        snapshot["workflow_intelligence"]["workflow_name"] = "Long fictional workflow " * 8
        snapshot["workflow_intelligence"]["summary"] = (
            '<img src="https://invalid.example/cover.png"/> & literal markup ' * 25 + "REFERENCE-SUMMARY-END")
        snapshot["suitability_score"]["adoption"]["human_boundaries"] = [
            "Long authorization boundary " * 70 + "REFERENCE-BOUNDARY-END"]
        with patch("urllib.request.urlopen", side_effect=AssertionError("No remote content")):
            reader, text = pdf_text(build_blueprint_pdf(snapshot))
        for marker in ("<img", "REFERENCE-SUMMARY-END", "REFERENCE-BOUNDARY-END", "[see reference]"):
            self.assertIn(marker, text)
        for page in reader.pages:
            self.assertFalse(page.get("/Annots"))
            self.assertIn(snapshot["analysis_id"], page.extract_text())

    def test_rejected_report_has_a_clear_alternative_instead_of_a_pilot_implementation_story(self):
        analysis = self.analyze()
        rejected = self.review(analysis, "reject")
        reader, text = pdf_text(self.download(rejected).content)
        outline = [entry["/Title"] for entry in reader.outline if isinstance(entry, dict)]
        self.assertEqual(outline, ["The decision at a glance", "Why this proposal stopped",
                                  "Reference / Evidence and technical detail"])
        self.assertIn("Consider a non-agentic alternative", reader.pages[1].extract_text())
        self.assertNotIn("How the work would change", text)
        self.assertNotIn("Start small. Earn the right to expand.", text)
