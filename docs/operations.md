# Delivery and operations runbook

## What Phase 6 does (and does not do)

The [delivery workflow](../.github/workflows/ci.yml) validates pull requests, `main`
and `feat/**` pushes, and manual runs. It does **not** deploy, provision Azure,
publish an image to a registry, create a GitHub release, or approve a production
change. No Azure or OIDC credentials are supplied to CI.

Configure branch protection for `main` after this workflow is merged: require
`Tests, types and browser` and `Container smoke and release artifact`, require
review, and disallow bypasses as appropriate. Adding YAML alone does not configure
repository protections. Manual workflow runs are available after the workflow
exists on the default branch. Duplicate push/PR runs for a branch cancel older
in-progress runs; use the final PR run, not a cancelled predecessor.

## Supported toolchain and repeatable checks

- Python 3.12 and Node 24; see [.python-version](../.python-version) and
  [.node-version](../.node-version). Patch releases track those supported lines.
- Runtime direct pins: [requirements.txt](../requirements.txt). Universal
  transitive resolution and distribution SHA256 hashes:
  [requirements.lock](../requirements.lock). It covers Windows and Linux markers.
- Browser/build dependencies: [frontend/package-lock.json](../frontend/package-lock.json).
  Use `npm ci`, not an unconstrained install, for verification.

From the repository root, with the chosen Python virtual environment active:

```powershell
python -m pip install --only-binary=:all: --require-hashes -r requirements.lock
python -m pip install -r requirements-tools.txt
npm --prefix frontend ci
python scripts\check_lock.py
python scripts\check.py
npm --prefix frontend audit --audit-level=high
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:e2e
```

The check runner uses the active interpreter, strips inherited cloud/auth settings,
and selects local fictional-demo mode for its child processes. It runs unit
regressions, FastAPI E2E, scoring evaluations, `pip check`, TypeScript (including
the browser suite), and the production SPA build. `--only backend` or
`--only frontend` selects smaller checks. The browser suite owns its server on
loopback port 8767, refuses to reuse another process, deletes its own fictional
sessions, and stops its server afterward. Do not run it against a real service.
Traces/screenshots are disabled; all fixtures are fictional.

### Dependency updates

Edit direct pins deliberately, then use the pinned lock generator:

```powershell
python -m pip install -r requirements-tools.txt
python scripts\lock.py
python scripts\check_lock.py
```

The generator preserves already locked compatible versions. To intentionally
refresh transitive versions, update the direct constraints or remove the **specific
tracked lock file** in a reviewed dependency-update change, then regenerate and
test from a clean environment. Never hand-edit versions or distribution hashes.
Some organization mirrors advertise MD5 as well as SHA256: the generator removes
unsupported MD5 values and refuses packages without SHA256; it never disables
TLS or permits unhashed runtime installation. Configure `UV_DEFAULT_INDEX` and
pip's index normally when an approved mirror is required; no mirror URL or
credentials are embedded in the lock.

Frontend updates must update the package lock, run the advisory check and rebuild.
High/critical npm advisories fail CI; that check is time-dependent and may fail
even without code changes. Investigate and update deliberately, not with
`--force`, skipped checks, or an unreviewed major upgrade. Python hash verification
and `pip check` are integrity/compatibility gates, **not a vulnerability audit**.
Review Python/container advisories and base-image updates as part of release
approval; CI does not claim an exhaustive security scan.

## Container behavior

The multi-stage [Dockerfile](../Dockerfile) builds and type-checks the SPA, installs
hash-locked binary Python distributions without a compiler, and copies only the
runtime application, policies, and compiled frontend. It runs as UID/GID 10001,
defaults to `ENVIRONMENT=production`, and refuses an unconfigured startup.
Git metadata, `.env*`, tests, host dependencies and host build outputs are not
runtime inputs. No source bind mount can hide the compiled assets.

For a **local-only, unauthenticated fictional demo**, Docker Compose v2.24+:

```powershell
docker compose up --build --detach
python scripts\smoke.py --url http://127.0.0.1:8000 --expect-mode demo --demo-workflow
docker compose down
```

Compose reads `.env` if present, otherwise uses local demo defaults, binds only to
loopback, drops capabilities, prevents privilege escalation and uses a read-only
filesystem with temporary scratch space. A configured `.env` can select live or
production mode; it must then include the OIDC/Azure prerequisites. Do not expose
the shared local demo publicly or scale it to multiple workers. Process-local
sessions disappear on restart, but the `decision_archive` named volume preserves
SQLite decision snapshots at `/home/agentsense/.agentspark/decisions.sqlite3`.
Normal `docker compose down` preserves that volume; removing it destroys the demo
archive. The archive mount is writable while the root filesystem remains
read-only. Compose is a local launcher, not a production orchestrator.

### Decision archive operations

`DECISION_ARCHIVE_RETENTION_DAYS` defaults to 30 (allowed range 1–3650).
Set it before startup; it affects only newly finalized decisions. Active-session
retention remains controlled independently by `SESSION_RETENTION_HOURS`.
Local non-container previews use `~/.agentspark/decisions.sqlite3` unless
`DEMO_ARCHIVE_PATH` is configured. Protect the directory with appropriate OS
permissions; demo identity/data remain shared, not tenant-isolated. `/ready`
checks that the demo archive is writable and reports failures without falling
back to transient storage.

Live archives use the existing TTL-enabled `/session_id` Cosmos container.
Retain range indexing for `home.sort_key`; Home performs bounded owner-filtered
cross-partition keyset queries. Final session updates and decision creation use a
same-partition transaction and ETag preconditions. Legacy session summaries are
listed in a separate bounded fallback phase and are not backfilled into archives.
Review costs, indexing and representative load with real Cosmos before release.
Contract tests do not substitute for cloud integration testing.

Workflow deletion cascades to every retained snapshot/comment. Cosmos deletion
uses batches of at most 99 archive documents before conditionally deleting the
active session. A failure can leave a partial deletion; the API reports failure,
and operators/users must retry rather than assume success. Application expiry is
immediate; Cosmos TTL cleanup is asynchronous and local SQLite expiry is pruned
on access. SQLite secure deletion is enabled, but filesystem snapshots, backups,
logs, telemetry and user exports require separate retention controls.

These are minimized, deletable decision snapshots, not an immutable audit log.
They omit complete transcripts and code scaffolds. Current live access is personal
and owner-isolated; organizations, team memberships and shared permissions are
not implemented. Future enterprise rollout requires a deliberate tenant/partition
and RBAC design rather than merely adding organization filters to the UI.

Browser/backend gates use isolated temporary archives and remove their own files.
The CI container smoke uses a disposable writable tmpfs archive mount for UID/GID
10001; it does not persist fictional CI decisions. Local Docker validation is
unavailable on hosts without Docker; require the hosted container gate before merge.

The image health check uses dependency-free `/health`. `/ready` probes live
dependencies, including a billable one-token OpenAI call: run it conservatively,
not as a high-frequency liveness check. The smoke command requires an expected
runtime mode, validates the built SPA and hashed assets, and requires HTTPS for
non-loopback origins. Without `--demo-workflow` it performs no workflow writes.
That flag is refused against live/OIDC services and creates/deletes only its own
fictional case.

## Release artifact and approval

After quality gates, CI builds `linux/amd64`, checks non-root operation, verifies
unconfigured production startup fails, and runs a complete fictional workflow
against a read-only, capability-dropped container. A successful run uploads:

- `agentsense-linux-amd64.tar.gz`: `docker save` archive of the tested image.
- `image-inspect.json`: image ID, labels, runtime settings and layer metadata.
- Runtime and frontend dependency locks.
- `release.json`: exact tested Git revision, image tag/platform, `deployed: false`.
- `SHA256SUMS`: integrity checks for those files.

The artifact is named `agentsense-<tested-sha>-linux-amd64` and expires after
**three days** to bound hosted artifact storage. Before expiry, an authorized
release owner must retain the approved archive and metadata in the organization's
approved immutable release storage if a long-term release/rollback is needed.
No registry or archival service is configured automatically.

Use the final successful run's tested SHA. Pull-request runs may use GitHub's
synthetic merge SHA, not the branch-head SHA. A merged `main` run creates the
release candidate for that exact merged commit; do not promote a stale PR build.
Checksums detect corruption, not malicious replacement of both archive and sums:
verify the trusted GitHub run/revision and approval record as well.

In the extracted artifact directory, verify every checksum before loading:

```powershell
Get-Content SHA256SUMS | ForEach-Object {
  $expected, $name = $_ -split '\s+', 2
  if ((Get-FileHash -LiteralPath $name -Algorithm SHA256).Hash -ne $expected) {
    throw "Release checksum mismatch: $name"
  }
}
docker load --input agentsense-linux-amd64.tar.gz
$release = Get-Content release.json -Raw | ConvertFrom-Json
docker image inspect $release.image
```

Base tags (`python:3.12-slim-bookworm`, `node:24-bookworm-slim`) intentionally
receive patch updates. The Git commit and dependency locks do **not** guarantee a
byte-identical rebuild at a later date. Promote/roll back the tested archive and
recorded image ID, not a new rebuild of the same tag. Revalidate whenever a base
image or dependency changes.

### Pre-release checklist

1. All required jobs passed on the selected merged commit; review tests and
   dependency changes. Record image ID, archive checksum and approval.
2. Provision/configure existing infrastructure separately: HTTPS, identity
   provider/API audience/reviewer role, secret injection, network/rate limits,
   Azure endpoints and policies. Never bake `.env` or tokens into images.
3. Enable Cosmos per-document TTL, confirm partition `/session_id`, approve
   retention and legacy-data migration. Backups and external log retention require
   separate approval; active-document deletion is not backup erasure.
4. Confirm model deployment, seeded Search patterns (including required IDs),
   resource permissions, capacity and budget. `/ready` must report the intended
   live mode and ready dependencies.
5. Validate signed-in owner isolation and reviewer access using approved test
   identities in a staging environment. Offline CI does **not** verify a real
   provider, Azure service or production network.
6. Stage the exact image with the host's deployment/rollback mechanism. Run
   `python scripts\smoke.py --url https://<staging-host> --expect-mode live`
   and approved authenticated acceptance checks before traffic promotion.
7. Retain the previous approved image and compatible configuration. Get explicit
   operator approval before any production change; no workflow here performs it.

## Monitoring, incident handling and rollback

- Monitor `/health` availability, conservatively polled `/ready`, HTTP
  401/403/409/429/5xx rates, latency, dependency throttling, session expiry,
  resource usage and model cost. Set organization-owned alert thresholds/SLOs.
  No monitoring backend or alert rules are provisioned by this phase.
- Treat readiness failure as an incident/dependency signal, never as permission to
  switch live traffic to demo mode. Check identity/JWKS reachability, endpoint/key
  rotation, Search seeding and Cosmos TTL/permissions; do not log bearer tokens,
  user content, raw dependency exceptions or credential-bearing commands.
- A 409 is a concurrency conflict: reload current state before retrying. A missing
  or expired session is not an Azure outage. Restore data only under the approved
  retention and access policy; do not make expired/unowned legacy records public.
- For rollback, stop promotion and route traffic to the previous approved image
  using the hosting platform's change controls. Restore its compatible
  configuration/secret references, then check liveness, readiness, assets and
  approved authenticated acceptance. Keep rollback evidence and incident timing.
- This phase makes **no database/schema migration**. A future incompatible data
  change requires its own backup/migration/rollback plan; replacing the image does
  not roll back data, external effects, approvals, exports or retention deletions.
