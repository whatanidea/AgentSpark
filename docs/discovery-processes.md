# Process-led discovery

Inside an existing discovery engagement, add a process card before choosing technology:
owner, goal, bounded scope, systems, volume/period, baseline pain and ordered work steps.
Use “unconfirmed” for unknowns; a filled form is not verified evidence.

## Team contributions and review

- A writer can request a specific process/step contribution from an active authenticated
  team member. Operator questions cover manual work/exceptions/effort; process owners
  describe rules/authority/success; technical owners describe data/APIs/constraints.
- Assignments are immutable. Membership revocation or a changed membership generation
  removes response authority; reactivated members need a new request.
- Only the assignee edits a response. Saved drafts survive failed writes and are excluded
  from synthesis. Submissions require every role question, allowing “unconfirmed.”
- Baselines require a statement and source reference. “Measured” identifies a submitted
  measurement claim; it is not automatic verification.
- Independent workspace reviewers can request clarification, cite a disagreement between
  at least two sources, resolve it with rationale, or record a manual reviewer check.
  Team creators cannot review their own engagement.
- Editing reviewed submitted content reopens clarification and makes review/synthesis
  stale. Re-review the current sources. Existing review history remains visible.
  Reviewed baseline entries cannot be removed; amend and re-review them instead.

Process/step context is included in synthesis source labels, statements and references.
Accepted hypotheses carry their cited process IDs. Ratings include the source digest at
the time the assessor saves them; subsequent source or review changes require an explicit
ratings refresh, even after synthesis is regenerated.

## Compare before assessment

For process-linked opportunities, write a rationale for **all five** alternatives:
leave unchanged, process improvement, deterministic automation, AI assistance, hybrid.
Explicitly choose one; there is no AI default. This is a human comparison, not an
automated recommendation or savings guarantee.

Reviewed handoff freezes cited source statements/reviews, process/step scope, rating
assumptions, all comparison rationales and the selected approach. These are readable
in the assessment’s **Discovery origin** section and retained in decision snapshots
and PDF exports. Handoff does not populate confirmed facts, interview answers,
workflow intelligence or readiness authorization. Changing frozen provenance requires
a new opportunity rather than silently modifying a linked assessment.

## Bounds, persistence and compatibility

One existing Cosmos `WorkflowState` document holds the engagement: at most 10 processes,
10 steps per process, 50 immutable requests, 3 role answers and 5 referenced baselines
per request, 50 reviews, and 5 alternatives per opportunity. API models additionally
bound text and reference lengths and reject foreign/duplicate references. Discovery
and process-origin documents have a 1,000,000-byte UTF-8 save budget below Cosmos’s
2 MB limit. No new service, dependency, permission or public submission path is used.

All writes retain organization/team checks, guardrail scanning/redaction and conditional
ETag updates. Reads and saves do not slide expiry: only explicit engagement renewal
starts another 30-day window. Concurrent failures retain client drafts; save/discard
before switching contexts. Unsaved process editors block internal and browser Back
navigation synchronously.

New fields default to empty/optional; existing engagement APIs remain supported.
Legacy engagements without process collaboration retain the original source-digest
shape (`objective`, `units`, scope topics, and sources containing only `id`, `label`,
`statement`), so existing valid synthesis is not invalidated merely by deployment.
Nonempty process data and explicit source reviews opt into richer provenance hashing.
Legacy non-process opportunities retain the existing handoff requirements.

### Additive endpoints

All paths are under `/api/v1/engagements/{engagement_id}` and require `version`.

| Method | Path | Purpose |
| --- | --- | --- |
| PUT | `/processes/{process_id}` | Save bounded process/steps |
| POST | `/tasks` | Assign immutable authenticated step request |
| PUT | `/tasks/{task_id}/contribution` | Save draft or submit role response/evidence |
| POST | `/source-reviews` | Human source review/resolution |
| PUT | `/opportunities/{opportunity_id}/alternatives` | Save five rationales/preference |
| PUT | `/opportunities/{opportunity_id}/ratings` | Explicitly refresh priority assumptions |

Focused validation: `python -m unittest discover -s tests -p test_discovery_processes.py`,
`npm --prefix frontend run typecheck`, and
`npx --prefix frontend playwright test --config frontend\playwright.discovery.config.ts`
(build frontend first). The separate test-only server validates RSA-signed OIDC tokens
for independent browser identities; it is never imported by the production entrypoint.
CI runs that configuration separately with
`npm --prefix frontend run test:e2e -- --config playwright.discovery.config.ts`.
The default configuration explicitly excludes `discovery-processes.spec.ts`, preserving
its existing local-demo suite. The custom configuration selects only that authenticated
specification and starts its separate signed-auth fixture server.
# Guided Discovery engagements

The engagement command centre derives activity checks and next actions from the
saved record. It shows pending contribution requests, overdue requests (due before
today in UTC), submitted role perspectives, source counts and evidence issues.
Clarification-needed tasks do not count as submitted perspectives. Disagreements,
stale reviews and clarification requests take priority over ordinary next actions.
Checks describe documentation and review activity, **not an AI-readiness percentage,
verified evidence, financial benefits or permission to implement**.

Two optional playbooks support new and existing engagements:

- **AI-native readiness:** outcomes, existing tools and developer workloads,
  data/access/residency rules, approval and incident ownership, skills/adoption,
  and source-referenced baselines.
- **Workflow opportunity discovery:** work boundaries, friction, baselines,
  systems/data, human authority and non-AI alternatives. This guide also prompts
  the consultant to document the current process.

Each has six suggested-role prompts. Answers are saved facilitator notes, not
authenticated participant attestations. Empty answers and answers beginning with
`Unconfirmed`, `Unknown`, `TBD` or `Not known` remain visible gaps. Changing a guide
with answers requires confirmation and clears those answers; historical synthesis
snapshots remain historical. Playbook answers join the source register, pass
existing redaction/instruction checks and stale synthesis/reviews when edited.
Legacy records with no playbook preserve the original source-digest shape.
Guide selection alone does not populate confirmed assessment facts or provision
Anthropic, OpenAI, Gemini or other provider accounts.

Stage shortcuts focus Overview, Processes, People & inputs, Evidence, Opportunities
and Findings without changing routes or unmounting editors. They preserve drafts;
existing conflicting-action and departure protections still apply. The overview
explicitly uses the last saved record, and findings export is disabled while any
editor has unsaved changes.

Writers can record a human conclusion and rationale: gather more evidence, improve
the process first, explore conventional automation, investigate a bounded AI pilot,
or do not proceed. These are discussion outcomes, not assessment approval. Readers
can export the saved findings without write or reviewer access. Once a reasoned
conclusion is recorded, the suggested next action follows that human direction
instead of forcing an AI shortlist or unnecessary assessment; outstanding activity
and evidence gaps remain visible in the checks.

`GET /api/v1/discovery-playbooks` supplies the versioned guide catalogue.
`GET /api/v1/engagements/{id}/findings?version=...` and its `/findings/pdf` equivalent
return a standalone snapshot using normal workspace authorization and an exact
saved version (409 on stale versions). No linked assessment or synthesis is
required, and export does not extend retention or mutate records.
The report includes scope, guide answers, participation/request status, current
source-linked synthesis if available, candidate alternatives and relative priority
gaps, human conclusion, source register/review status, next actions, limitations
and exact snapshot provenance. Unsubmitted participant and task answers/evidence
are excluded; stale generated findings are withheld rather than presented as current.
Incomplete discoveries export with explicit gaps. Measurements remain submitted
claims, and reviewer checks remain attributed human judgments.

Tests: `tests/test_guided_discovery.py` and
`frontend/e2e/guided-discovery.spec.ts` (Chromium and mobile WebKit).
