# Document-assisted Enterprise Intake

Upload one searchable PDF or plain DOCX from Enterprise Intake after choosing
the assessment model. AgentSpark proposes existing intake and interview fields,
shows exact redacted source excerpts, and waits for human approval. Preview
does not create or save a workflow. The model is fixed when approved context is
saved; existing assessments must use their pinned model.

## Review and continuation

- Select, edit or omit proposals. Conflicting values start unselected; choose
  only one proposal per field. Unknown facts are not supplied automatically.
- New document intake does not silently confirm the manual form's default
  team size or compliance rating. Blank values remain unknown.
- Review the context acknowledgement, select the target cloud, then choose
  **Approve context and continue**. Edits invalidate the acknowledgement.
- Updating an existing assessment requires its preview version and explicit
  overwrite confirmation. Selected answers replace saved values; unselected
  answers remain. Current analysis and approval are invalidated. Archived
  decisions are unchanged.
- Existing essential-fact gates determine the next step. Missing facts lead
  to focused questions. Complete essential facts start analysis once and open
  the advisory blueprint/review. Missing readiness and pilot information is
  still visible and never automatically certified.
- Automatic analysis is pinned to the exact approved version. Concurrent edits
  before generation or persistence prevent a stale document-based result from
  being saved. Preserved source fields retain their original reviewer/time.
- Context approval is **not** operational evidence confirmation, implementation
  readiness, recommendation approval, or permission to execute anything.
  Human edits are attributed as intake/checklist claims rather than exact document
  facts. Unedited document facts show filename/location references.
- Leaving an unapproved preview requires confirmation. Discarding a preview
  restores unedited proposed intake values; explicit human edits remain in the
  manual form.

## Formats, limits and privacy

- One nonempty file, at most **5 MiB**; at most **50 PDF pages**.
- At most **40,000 extracted characters / 200 source sections**.
- DOCX reads standard/Strict OOXML main-body paragraphs and tables, including
  content controls and explicit line/tab breaks, not images, headers,
  footers, comments or embedded files.
- Image-only/scanned PDFs need OCR first. Pages without searchable text are
  explicitly flagged. No OCR service, malware scanner or shared-search upload
  is included.
- Encrypted, malformed, mismatched and unsupported files are rejected. DOCX
  XML forbids DTDs/entities/external entities; package limits apply before
  decompression. Macro-enabled documents are rejected.
- Parsing uses disposable subprocesses with a **20-second deadline**, bounded
  PDF decoding, two concurrent readers per replica, and a **256 MiB Linux
  address-space ceiling**. Windows local parsing uses the same library limits
  and deadline, without the Linux address-space control.
- Originals and full extracted content are never saved. They are discarded
  after the request. Only approved values, bounded redacted excerpts and
  reviewer provenance persist within the assessment's existing retention.
  Each approval payload is limited to **32,000 UTF-8 bytes** and 50 unique fields.
- Preview is stateless. Upload hashes, quotes and locations in approval
  payloads are **reviewer-provided claims**, not cryptographic attestation of an
  original retained file. Source checks ground server-generated proposals;
  they do not independently verify document truth.

## Processing visibility and API compatibility

The UI displays request-bound stages and elapsed time for upload/review,
diagnostic responses, workflow analysis/blueprint and Discovery synthesis.
Actual model invocation start/end events add a model-working indicator.
Structured-response retry is reported only when it actually occurs. Saves
also show request activity. No private reasoning, simulated percentage,
provider fallback, or process-local progress lookup is used.

`POST /api/v1/intake/document-preview` accepts a raw PDF/DOCX body with validated
`session_id`, `filename`, `model_id` and optional `target_cloud` query parameters.
Authorization and scoped write permissions are checked before parsing. Only
this exact upload path has a 5 MiB request limit; other API bodies retain 64 KiB.

`POST /api/v1/intake` accepts an optional `document` approval containing
metadata, selected fields, `context_approved: true`, preview `version`, and
`confirm_overwrite`. Ordinary manual intake retains its existing validation.

Clients without an explicit streaming header still receive ordinary JSON.
Intake, document preview, chat, analysis and Discovery synthesis additionally
support `Accept: application/x-ndjson`. Streams contain `stage`, `activity`,
`heartbeat` and one terminal `result` or `error` event. Once headers are sent,
an operation failure is a terminal error event carrying the corresponding
status/detail, not a second HTTP response or a successful result.

Connection interruption does not prove the operation was cancelled: an
already-running bounded provider call may finish. Reload saved state before
retrying. Completed analysis is persisted only after the full existing
orchestration and optimistic write succeeds.

## Local demonstration and tests

Demo mode never calls an AI provider. It recognizes explicit labelled fields
such as `Workflow name: Fictional Azure SRE`, `Steps: 7`,
`Compliance sensitivity: High`, or two-cell DOCX rows. Unlabelled prose remains
unresolved. All example numbers must be understood as fictional, not measured
data for an actual SRE workflow.

```powershell
python scripts\check.py
python scripts\check_lock.py
npm --prefix frontend run test:e2e
npm --prefix frontend run test:e2e -- --config playwright.discovery.config.ts
```

Parser/approval/progress tests are in `tests/test_document_intake.py`. Browser
journeys in `frontend/e2e/document-intake.spec.ts` cover PDF review, DOCX tables,
missing-question and direct-blueprint routes, conflicts, acknowledgement
invalidation, error states and mobile WebKit.
