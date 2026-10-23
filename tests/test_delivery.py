import os
import json
from pathlib import Path
import re
import unittest
from unittest.mock import patch

import yaml

from scripts.check import offline_environment
from scripts.lock import strong_hashes
from scripts.smoke import Assets, smoke, validate_url

ROOT = Path(__file__).resolve().parents[1]


class DependencyLockTests(unittest.TestCase):
    def test_mirror_md5_is_removed_but_sha256_is_preserved_for_pip(self):
        digest = "a" * 64
        result = strong_hashes("sample==1.0 \\\n    --hash=md5:" + "b" * 32 + " \\\n    --hash=sha256:" + digest + "\n")
        self.assertNotIn("md5", result)
        self.assertIn("--hash=sha256:" + digest, result)

    def test_missing_strong_hashes_unknown_algorithms_and_empty_lock_fail(self):
        for text in ("", "sample==1.0", "sample==1.0 --hash=md5:" + "a" * 32,
                     "sample==1.0 --hash=sha1:" + "a" * 40):
            with self.subTest(text=text):
                with self.assertRaises(ValueError):
                    strong_hashes(text)

    def test_checked_in_lock_has_only_strong_hashes_and_covers_direct_pins(self):
        lock = (ROOT / "requirements.lock").read_text()
        self.assertEqual(strong_hashes(lock), lock)
        self.assertFalse(re.search(r"https?://", lock), "The lock must not embed registry URLs.")
        for requirement in (ROOT / "requirements.txt").read_text().splitlines():
            if requirement and not requirement.startswith("#"):
                package, version = requirement.split("==")
                package = package.split("[")[0].lower().replace("_", "-")
                self.assertRegex(lock.lower().replace("_", "-"), rf"(?m)^{re.escape(package)}=={re.escape(version)}(?: |$)")

    def test_check_runner_does_not_pass_cloud_credentials_to_offline_tests(self):
        with patch.dict(os.environ, {"AZURE_OPENAI_API_KEY": "fixture", "AZURE_SEARCH_KEY": "fixture",
                                     "COSMOS_DB_KEY": "fixture", "AUTH_ISSUER": "https://example.org",
                                     "ENVIRONMENT": "production", "SESSION_RETENTION_HOURS": "720"}):
            env = offline_environment()
        self.assertNotIn("AZURE_OPENAI_API_KEY", env)
        self.assertNotIn("COSMOS_DB_KEY", env)
        self.assertNotIn("AUTH_ISSUER", env)
        self.assertEqual(env["AGENTSENSE_AUTH_MODE"], "local-demo")
        self.assertEqual(env["SESSION_RETENTION_HOURS"], "24")


class SmokeTests(unittest.TestCase):
    def responses(self, path):
        return {
            "/health": {"status": "ok", "mode": "demo"},
            "/ready": {"ready": True, "mode": "demo"},
            "/": b'<div id="root"></div><script src="/assets/app.js"></script><link href="/assets/app.css">',
            "/assets/app.js": b"console.log('fixture')",
            "/assets/app.css": b"body { margin: 0; }",
        }[path]

    def test_accepts_only_origins_and_requires_remote_https(self):
        for url in ("http://127.0.0.1:8000", "https://example.org/", "http://[::1]:8000"):
            self.assertEqual(validate_url(url), url.rstrip("/"))
        for url in ("file:///tmp/file", "http://example.org", "https://user:pass@example.org",
                    "https://example.org/api", "https://example.org?token=fixture", "https://example.org/#fragment"):
            with self.subTest(url=url):
                with self.assertRaises(ValueError):
                    validate_url(url)

    def test_asset_parser_only_follows_same_origin_build_assets(self):
        assets = Assets()
        assets.feed('<script src="https://example.org/a.js"></script><script src="/assets/a.js"></script>'
                    '<link href="/assets/a.css"><a href="/api/v1/sessions/private">link</a>')
        self.assertEqual(assets.urls, ["/assets/a.js", "/assets/a.css"])

    def test_read_only_smoke_validates_spa_and_assets_without_mutation(self):
        with patch("scripts.smoke.request", side_effect=lambda origin, path: self.responses(path)) as request:
            smoke("http://127.0.0.1:8000", "demo")
        self.assertEqual(request.call_count, 5)
        self.assertTrue(all(len(call.args) == 2 for call in request.call_args_list))

    def test_wrong_mode_or_unready_release_cannot_pass(self):
        for path, value in (("/health", {"status": "ok", "mode": "live"}),
                            ("/ready", {"ready": False, "mode": "demo"})):
            with self.subTest(path=path), patch(
                "scripts.smoke.request", side_effect=lambda origin, requested:
                    value if requested == path else self.responses(requested),
            ):
                with self.assertRaises(RuntimeError):
                    smoke("http://127.0.0.1:8000", "demo")

    def test_spa_missing_assets_or_html_fallback_for_javascript_fails(self):
        for path, value in (("/", b"API only"), ("/", b'<div id="root"></div>'),
                            ("/assets/app.js", b"<!doctype html><html></html>")):
            with self.subTest(path=path), patch(
                "scripts.smoke.request", side_effect=lambda origin, requested:
                    value if requested == path else self.responses(requested),
            ):
                with self.assertRaises(RuntimeError):
                    smoke("http://127.0.0.1:8000", "demo")

    def test_demo_mutation_cannot_run_against_live_release(self):
        def response(origin, path):
            value = self.responses(path)
            return {**value, "mode": "live"} if path in ("/health", "/ready") else value
        with patch("scripts.smoke.request", side_effect=response) as request:
            with self.assertRaises(RuntimeError):
                smoke("https://example.org", "live", demo_workflow=True)
        self.assertTrue(all(len(call.args) == 2 for call in request.call_args_list))

    def test_fictional_workflow_smoke_requires_pdf_and_cleans_up_after_failure(self):
        for pdf, valid in ((b"%PDF-1.4\n%%EOF\n", True), (b"%PDF-1.4\n", False),
                           ({"detail": "not a PDF"}, False), (b"<html>error</html>", False)):
            def response(origin, path, method="GET", body=None):
                if "/pdf?" in path:
                    self.assertTrue(path.endswith("?analysis_id=fixture-analysis&status=awaiting_human_review"))
                    return pdf
                if path == "/api/v1/auth/config":
                    return {"mode": "local-demo"}
                if path.startswith("/api/v1/"):
                    return {"analysis_id": "fixture-analysis", "status": "awaiting_human_review",
                            "diagnosis": {"missing_facts": []}, "provisional": True,
                            "scaffold_status": "illustrative_untested"}
                return self.responses(path)
            with self.subTest(pdf=pdf), patch("scripts.smoke.request", side_effect=response) as request:
                if valid:
                    smoke("http://127.0.0.1:8000", "demo", demo_workflow=True)
                else:
                    with self.assertRaisesRegex(RuntimeError, "complete PDF"):
                        smoke("http://127.0.0.1:8000", "demo", demo_workflow=True)
                self.assertTrue(request.call_args.args[1].startswith("/api/v1/sessions/smoke-"))
                self.assertEqual(request.call_args.args[2], "DELETE")


class DeliveryConfigurationTests(unittest.TestCase):
    def test_public_package_image_and_release_artifacts_use_agentspark(self):
        package = json.loads((ROOT / "frontend" / "package.json").read_text())
        lock = json.loads((ROOT / "frontend" / "package-lock.json").read_text())
        self.assertEqual(package["name"], "agentspark-frontend")
        self.assertEqual(lock["name"], package["name"])
        self.assertEqual(lock["packages"][""]["name"], package["name"])
        dockerfile = (ROOT / "Dockerfile").read_text()
        self.assertIn('org.opencontainers.image.title="AgentSpark"', dockerfile)
        workflow = (ROOT / ".github" / "workflows" / "ci.yml").read_text()
        self.assertIn("tags: agentspark:${{ github.sha }}", workflow)
        self.assertIn("release/agentspark-linux-amd64.tar.gz", workflow)
        self.assertIn("sha256sum agentspark-linux-amd64.tar.gz", workflow)
        self.assertIn("name: agentspark-${{ github.sha }}-linux-amd64", workflow)
        self.assertNotIn("agentsense-linux-amd64", workflow)

    def test_rebranding_preserves_storage_and_legacy_configuration_contracts(self):
        from app.security.auth import AuthSettings
        from app.utils.runtime import load_settings
        self.assertEqual(AuthSettings("local-demo").reviewer_role, "AgentSense.Reviewer")
        with patch.dict(os.environ, {"AGENTSENSE_MODE": "demo"}):
            self.assertEqual(load_settings().mode, "demo")
        dockerfile = (ROOT / "Dockerfile").read_text()
        self.assertIn("DEMO_ARCHIVE_PATH=/home/agentsense/.agentspark/decisions.sqlite3", dockerfile)
        app_source = (ROOT / "frontend" / "src" / "App.tsx").read_text()
        self.assertIn('"agentsense.session.v1"', app_source)
        architecture = (ROOT / "docs" / "architecture.svg").read_text(encoding="utf-8")
        self.assertIn(">AgentSpark</text>", architecture)
        self.assertIn("Shriram K Vasudevan", architecture)

    def test_actions_are_immutable_read_only_and_packaging_depends_on_quality(self):
        workflow = yaml.load((ROOT / ".github" / "workflows" / "ci.yml").read_text(), Loader=yaml.BaseLoader)
        self.assertEqual(workflow["permissions"], {"contents": "read"})
        self.assertEqual(workflow["jobs"]["package"]["needs"], "quality")
        self.assertIn("pull_request", workflow["on"])
        for job in workflow["jobs"].values():
            self.assertIn("timeout-minutes", job)
            for step in job["steps"]:
                if "uses" in step:
                    self.assertRegex(step["uses"], r"^[A-Za-z0-9_/-]+@[a-f0-9]{40}$")
        self.assertNotIn("secrets.", (ROOT / ".github" / "workflows" / "ci.yml").read_text())

    def test_compose_does_not_shadow_the_built_frontend_or_expose_shared_demo_publicly(self):
        service = yaml.safe_load((ROOT / "docker-compose.yml").read_text())["services"]["agentspark"]
        self.assertEqual(service["volumes"], ["decision_archive:/home/agentsense/.agentspark"])
        self.assertEqual(service["ports"], ["127.0.0.1:8000:8000"])
        self.assertTrue(service["read_only"])
        self.assertEqual(service["cap_drop"], ["ALL"])

    def test_container_uses_locked_dependencies_nonroot_and_explicit_source_copies(self):
        dockerfile = (ROOT / "Dockerfile").read_text()
        self.assertIn("--require-hashes -r requirements.lock", dockerfile)
        self.assertIn("USER 10001:10001", dockerfile)
        self.assertIn("ENVIRONMENT=production", dockerfile)
        self.assertNotIn("COPY . ", dockerfile)
        self.assertNotIn("gcc", dockerfile)
        ignores = (ROOT / ".dockerignore").read_text().splitlines()
        for name in (".git", ".env", ".env.*", "**/node_modules", "**/dist"):
            self.assertIn(name, ignores)


if __name__ == "__main__":
    unittest.main()
