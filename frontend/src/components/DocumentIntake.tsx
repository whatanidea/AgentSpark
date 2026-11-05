import { useEffect, useId, useRef, useState } from "react";
import { api, type CloudProvider, type DocumentApproval, type DocumentField, type DocumentPreview, type InferenceModel } from "../api";
import { Button, Card } from "./ui";

type ReviewedField = { proposal: DocumentField; value: string; selected: boolean };
type Props = {
  sessionId: string; modelId: InferenceModel["id"] | ""; targetCloud: CloudProvider | "";
  busy: boolean; contextValues: Record<string, string>; baseline: Record<string, string>;
  onBusyChange: (busy: boolean) => void;
  onReady: () => void;
  onContext: (key: string, value: string) => void;
  onChange: (approval: DocumentApproval | null, active: boolean) => void;
};

function contextKey(identifier: string) {
  return identifier.startsWith("intake.") || identifier.startsWith("context.") ? identifier.split(".", 2)[1] : null;
}

export default function DocumentIntake(props: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const fileInputId = useId();
  const [filename, setFilename] = useState("");
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [fields, setFields] = useState<ReviewedField[]>([]);
  const [baseline, setBaseline] = useState<Record<string, string>>({});
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const contextVersion = JSON.stringify(props.contextValues);
  useEffect(() => {
    if (!preview && !loading) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [preview, loading]);
  useEffect(() => {
    if (preview) { setApproved(false); props.onChange(null, true); }
  }, [contextVersion]);

  function valueOf(field: ReviewedField) {
    const key = contextKey(field.proposal.field_id);
    return key && field.selected ? props.contextValues[key] ?? field.value : field.value;
  }

  function approval(next: ReviewedField[], checked: boolean, document = preview) {
    if (!document || !checked || !next.some(field => field.selected)) { props.onChange(null, Boolean(document)); return; }
    props.onChange({
      metadata: document.metadata, version: document.version, confirm_overwrite: false, context_approved: true,
      fields: next.filter(field => field.selected).map(field => {
        const value = valueOf(field).trim();
        return { ...field.proposal, value, edited: value !== field.proposal.value };
      }),
    }, true);
  }

  async function upload(file: File) {
    if (!props.modelId) { setError("Choose the assessment model before uploading a document."); return; }
    if (file.size === 0 || file.size > 5 * 1024 * 1024) { setError("Choose one nonempty PDF or DOCX, up to 5 MiB."); return; }
    if (!/\.(pdf|docx)$/i.test(file.name)) { setError("Only searchable PDF and DOCX files are supported."); return; }
    if (preview && !window.confirm("Discard this unapproved document preview and review another file?")) return;
    setFilename(file.name);
    setLoading(true); props.onBusyChange(true); setError(""); setApproved(false); props.onChange(null, Boolean(preview));
    try {
      const result = await api.previewDocument(file, props.sessionId, props.modelId, props.targetCloud || undefined);
      if (result.candidates.some(candidate => !result.fields.some(field => field.id === candidate.field_id))) {
        throw new Error("Document review returned an unsupported field. Nothing was applied.");
      }
      const next = result.candidates.map(proposal => ({ proposal, value: proposal.value,
        selected: !result.conflicting_fields.includes(proposal.field_id) }));
      setBaseline(props.baseline);
      props.onReady();
      for (const field of next.filter(field => field.selected)) {
        const key = contextKey(field.proposal.field_id);
        if (key) props.onContext(key, field.value);
      }
      setPreview(result); setFields(next); props.onChange(null, true);
    } catch (failure) {
      setError(`${failure instanceof Error ? failure.message : "Document reading failed."}${preview ? " Your previous preview is still available." : ""}`);
    } finally {
      setLoading(false); props.onBusyChange(false);
    }
  }

  function select(index: number, selected: boolean) {
    const changed = fields[index];
    const next = fields.map((field, position) => position === index ? { ...field, selected }
      : selected && field.proposal.field_id === changed.proposal.field_id ? { ...field, selected: false } : field);
    const key = contextKey(changed.proposal.field_id);
    if (key) props.onContext(key, selected ? changed.value : baseline[key] || "");
    setFields(next); setApproved(false); approval(next, false);
  }

  function edit(index: number, value: string) {
    const next = fields.map((field, position) => position === index ? { ...field, value } : field);
    const key = contextKey(fields[index].proposal.field_id);
    if (key) props.onContext(key, value);
    setFields(next); setApproved(false); approval(next, false);
  }

  const valid = fields.some(field => field.selected) && fields.filter(field => field.selected).every(field => valueOf(field).trim());
  return (
    <Card title="Start from a document" description="Upload a workflow brief, process description or intake document. Review proposed facts before anything is saved.">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-zinc-700">Searchable PDF or DOCX</p>
          <p aria-live="polite" className="text-sm text-zinc-500 mt-1 break-words">{filename || "No file selected"}</p>
        </div>
        <input ref={fileInput} id={fileInputId} type="file" hidden aria-label="Upload a PDF or DOCX"
          aria-describedby={`${fileInputId}-help`} accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={props.busy || loading || !props.modelId}
          onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void upload(file); }} />
        <Button variant="ghost" className="shrink-0" disabled={props.busy || loading || !props.modelId}
          aria-controls={fileInputId} aria-describedby={`${fileInputId}-help`} onClick={() => fileInput.current?.click()}>
          Select file
        </Button>
      </div>
      <p id={`${fileInputId}-help`} className="text-xs text-zinc-500 mt-3">One file, up to 5 MiB. PDFs: up to 50 pages. Scans need OCR first.
        Original files are discarded after the request, never added to shared reference search. Only approved context and bounded redacted excerpts are retained.</p>
      {error && <p role="alert" className="text-sm text-rose-700 mt-4">{error}</p>}
      {preview && <section aria-label="Review extracted context" className="mt-6 space-y-4 min-w-0">
        <div>
          <h2 className="text-base font-semibold break-words">Review: {preview.metadata.filename}</h2>
          <p className="text-xs text-zinc-500 mt-1">Source-backed proposals, not saved or independently verified. Edit, omit or resolve conflicts below.</p>
        </div>
        {preview.warnings.map((warning, index) => <p key={index} className="notice notice-warning block">{warning}</p>)}
        {preview.conflicting_fields.length > 0 && <p className="notice notice-warning block">
          Conflicting values were found. Those fields start unselected; choose one supported value, edit it if necessary, or leave it unresolved.
        </p>}
        {!fields.length && <p className="notice block">No supported explicit facts were proposed. Use manual intake, or upload a document with clearer workflow facts.</p>}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {fields.map((field, index) => {
            const spec = preview.fields.find(item => item.id === field.proposal.field_id);
            if (!spec) return <p key={index} role="alert">Unsupported proposal. Discard this preview and retry.</p>;
            return (
              <article key={`${field.proposal.field_id}-${index}`} className="rounded-xl border border-zinc-200 p-4 min-w-0">
                <label className="flex items-start gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={field.selected} disabled={props.busy || loading}
                    aria-label={`Use ${spec.label} proposal ${index + 1}`} onChange={event => select(index, event.target.checked)} />
                  <span>{spec.label} <span className="font-normal text-xs text-zinc-500">/ {spec.group}</span></span>
                </label>
                <label className="block text-xs text-zinc-600 mt-3">
                  Reviewed {spec.label}
                  {spec.options.length > 0 ? <select className="form-control mt-1" value={valueOf(field)}
                    disabled={props.busy || loading || !field.selected} onChange={event => edit(index, event.target.value)}>
                    {spec.options.map(option => <option key={option}>{option}</option>)}
                  </select> : <textarea className="form-control mt-1" rows={2} maxLength={spec.max_length} value={valueOf(field)}
                    inputMode={spec.kind === "number" ? "numeric" : "text"} disabled={props.busy || loading || !field.selected}
                    onChange={event => edit(index, event.target.value)} />}
                </label>
                <p className="text-[11px] text-zinc-500 mt-3">{field.proposal.location} / exact redacted source excerpt</p>
                <blockquote className="mt-1 border-l-2 border-brand-200 pl-3 text-xs text-zinc-600 whitespace-pre-wrap break-words">{field.proposal.quote}</blockquote>
                {valueOf(field) !== field.proposal.value && <p className="text-[11px] text-amber-800 mt-2">Human-edited value; the source excerpt does not independently verify this edit.</p>}
              </article>
            );
          })}
        </div>
        <p className="text-xs text-zinc-600">After approval, AgentSpark asks only for missing essential facts. If those facts are complete, analysis and the advisory blueprint start automatically. Readiness and pilot gaps remain unverified.</p>
        <label className="flex items-start gap-2 text-sm text-zinc-700">
          <input type="checkbox" checked={approved} disabled={props.busy || loading || !valid}
            onChange={event => { setApproved(event.target.checked); approval(fields, event.target.checked); }} />
          <span>I reviewed the selected context and source excerpts. They are appropriate for this assessment, not verified operational evidence.</span>
        </label>
        <Button variant="ghost" disabled={props.busy || loading} onClick={() => {
          for (const field of fields.filter(field => field.selected)) {
            const key = contextKey(field.proposal.field_id);
            if (key && props.contextValues[key] === field.proposal.value) props.onContext(key, baseline[key] || "");
          }
          setPreview(null); setFields([]); setApproved(false); props.onChange(null, false);
        }}>Discard preview and use manual intake</Button>
      </section>}
    </Card>
  );
}
