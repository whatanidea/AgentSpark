"""Verify a running release. Mutating fictional-demo checks require an explicit flag."""
import argparse
from html.parser import HTMLParser
import json
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from uuid import uuid4


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        asset = values.get("src") if tag == "script" else values.get("href") if tag == "link" else None
        if asset and asset.startswith("/assets/"):
            self.urls.append(asset)


def validate_url(url):
    parsed = urlsplit(url)
    if (parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password
            or parsed.query or parsed.fragment or parsed.path not in ("", "/")):
        raise ValueError("Use an origin URL without credentials, path, query, or fragment.")
    if parsed.scheme != "https" and parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
        raise ValueError("Non-loopback origins require HTTPS.")
    return url.rstrip("/")


def request(origin, path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    with urlopen(Request(origin + path, data=data, method=method,
                         headers={"Content-Type": "application/json"}), timeout=30) as response:
        content = response.read()
        return json.loads(content) if "application/json" in response.headers.get("Content-Type", "") else content


def smoke(origin, expected_mode, demo_workflow=False):
    origin = validate_url(origin)
    health = request(origin, "/health")
    if health.get("status") != "ok" or health.get("mode") != expected_mode:
        raise RuntimeError("Liveness or selected runtime mode mismatch.")
    ready = request(origin, "/ready")
    if ready.get("ready") is not True or ready.get("mode") != expected_mode:
        raise RuntimeError("Release is not ready.")
    page = request(origin, "/")
    if not isinstance(page, bytes) or b'id="root"' not in page:
        raise RuntimeError("Built SPA was not served.")
    assets = Assets()
    assets.feed(page.decode())
    if not any(path.endswith(".js") for path in assets.urls) or not any(path.endswith(".css") for path in assets.urls):
        raise RuntimeError("SPA does not reference compiled JavaScript and CSS.")
    for path in assets.urls:
        content = request(origin, path)
        if not isinstance(content, bytes) or not content or content.lstrip().lower().startswith(b"<!doctype html"):
            raise RuntimeError("Compiled asset is empty or incorrectly served as the SPA.")
    if demo_workflow:
        if expected_mode != "demo" or request(origin, "/api/v1/auth/config").get("mode") != "local-demo":
            raise RuntimeError("Fictional workflow checks require explicit local-demo mode.")
        session = "smoke-" + str(uuid4())
        path = "/api/v1/sessions/" + session
        request(origin, "/api/v1/intake", "POST", {
            "session_id": session, "demo_scenario": "claims", "business_domain": "Fictional smoke fixture",
            "team_size": "1-50", "existing_systems": "Example systems", "pain_points": "Fictional sample only",
            "compliance_requirements": "High",
        })
        try:
            result = request(origin, "/api/v1/analyze/" + session, "POST", {})
            if result.get("status") != "awaiting_human_review" or result["diagnosis"]["missing_facts"]:
                raise RuntimeError("Fictional analysis did not preserve the human review gate.")
            blueprint = request(origin, "/api/v1/blueprint/" + session)
            if blueprint.get("provisional") is not True or blueprint.get("scaffold_status") != "illustrative_untested":
                raise RuntimeError("Blueprint approval/scaffold boundary failed.")
            if request(origin, path).get("analysis_id") != result.get("analysis_id"):
                raise RuntimeError("Workflow snapshot was not persisted.")
        finally:
            request(origin, path, "DELETE")
    print(f"Release smoke passed: {expected_mode}, SPA + {len(assets.urls)} assets"
          + (" + fictional workflow lifecycle." if demo_workflow else "."))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--expect-mode", choices=("demo", "live"), required=True)
    parser.add_argument("--demo-workflow", action="store_true")
    args = parser.parse_args()
    smoke(args.url, args.expect_mode, args.demo_workflow)


if __name__ == "__main__":
    main()
