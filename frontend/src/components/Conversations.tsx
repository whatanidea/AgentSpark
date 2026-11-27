import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, ApiError, uid } from "../api";
import { conversations, type ChatDraft, type ChatKind, type ChatSummary, type Conversation } from "../conversations";
import { Button } from "./ui";
import BrandMark from "./BrandMark";
import Icon from "./Icon";
import "./Conversations.css";

const labels: Record<string, string> = {
  title: "Engagement title", objective: "Objective", business_units: "Business units",
  sponsor: "Sponsor", engagement_owner: "Engagement owner", required_topics: "Required topics",
  excluded_topics: "Excluded topics", success_measures: "Success measures",
  business_domain: "Business domain", team_size: "Team size", existing_systems: "Existing systems",
  pain_points: "Pain points", compliance_requirements: "Compliance requirements",
  target_cloud: "Target cloud", preferred_region: "Preferred region",
  data_residency_requirements: "Data residency requirements", deployment_constraints: "Deployment constraints",
};
const limits: Record<string, number> = {
  title: 200, objective: 2000, business_units: 1000, sponsor: 200, engagement_owner: 200,
  required_topics: 2000, excluded_topics: 2000, success_measures: 1000, business_domain: 200,
  team_size: 30, existing_systems: 4000, pain_points: 8000, compliance_requirements: 10,
  target_cloud: 10, preferred_region: 100, data_residency_requirements: 2000, deployment_constraints: 2000,
};
const choices: Record<string, string[]> = {
  team_size: ["1-50", "51-200", "201-1000", "1000+"],
  compliance_requirements: ["Low", "Medium", "High"], target_cloud: ["azure", "aws"],
};
const actionLabel = (kind: ChatKind) => kind === "discovery" ? "Discovery" : "Enterprise Intake";
const date = (value: string) => new Date(value).toLocaleDateString();
const errorText = (error: unknown) => error instanceof Error ? error.message : "The request failed. Reload saved messages before retrying.";

function Markdown({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
    img: () => <span>[External image omitted]</span>,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  }}>{text}</ReactMarkdown>;
}

function Review({ chat, draft, working, onSave, onConfirm, onClose, onDirty }: {
  chat: Conversation; draft: ChatDraft; working: boolean;
  onSave: (fields: Record<string, string>) => Promise<ChatDraft | undefined>; onConfirm: () => Promise<void>;
  onClose: () => void; onDirty: (dirty: boolean) => void;
}) {
  const [fields, setFields] = useState(draft.fields);
  const [acknowledged, setAcknowledged] = useState(false);
  const [savedDigest, setSavedDigest] = useState("");
  const changed = JSON.stringify(fields) !== JSON.stringify(draft.fields);
  const ready = !changed && savedDigest === draft.digest;
  useLayoutEffect(() => { setFields(draft.fields); setAcknowledged(false); }, [draft]);
  useEffect(() => { onDirty(changed); return () => onDirty(false); }, [changed, onDirty]);
  return <section className="chat-review" aria-label={`${actionLabel(draft.kind)} context preview`}>
    <div className="chat-section-heading">
      <div><p className="eyebrow">Review before creating</p><h3>{actionLabel(draft.kind)} context preview</h3></div>
      <Button variant="ghost" disabled={working || chat.creation_pending} onClick={onClose}>Close preview</Button>
    </div>
    <p>Unknowns stay blank. Quoted user statements are unverified; edits are your reviewed assertions, not measured evidence.</p>
    <p className="chat-muted">Preview expires {new Date(draft.expires_at).toLocaleTimeString()}. No workflow has been created{chat.creation_pending ? " yet; your confirmation is reserved for recovery" : ""}.</p>
    <form onSubmit={async event => {
      event.preventDefault();
      const saved = await onSave(fields);
      if (saved) setSavedDigest(saved.digest);
      setAcknowledged(false);
    }}>
      <fieldset disabled={working || chat.creation_pending}>
        <div className="chat-field-grid">{Object.entries(fields).map(([field, value]) => {
          const capture = draft.captures.find(item => item.field === field);
          const required = (draft.kind === "discovery"
            ? ["title", "objective", "business_units", "sponsor", "engagement_owner"]
            : ["business_domain", "team_size", "compliance_requirements", "target_cloud"]).includes(field);
          return <label key={field} className={limits[field] > 1000 ? "chat-wide-field" : ""}>
            <span>{labels[field]}{required ? " *" : ""}</span>
            {choices[field] ? <select className="form-control" value={value} required={required}
              onChange={event => { const value = event.target.value; setFields(previous => ({ ...previous, [field]: value })); setAcknowledged(false); }}>
              <option value="">Unknown - choose explicitly</option>
              {choices[field].map(choice => <option key={choice} value={choice}>{choice}</option>)}
            </select> : <textarea className="form-control" rows={limits[field] > 1000 ? 3 : 1}
              value={value} maxLength={limits[field]} required={required} placeholder="Unknown - add details"
              onChange={event => { const value = event.target.value; setFields(previous => ({ ...previous, [field]: value })); setAcknowledged(false); }} />}
            <span className="chat-muted">{!value ? "Unknown" : capture?.value === value ? "Quoted user statement (unverified)"
              : "Your edited assertion (unverified)"}</span>
          </label>;
        })}</div>
        <Button type="submit" disabled={working}>Save reviewed preview</Button>
      </fieldset>
    </form>
    <details className="chat-source-details">
      <summary>Selected excerpts that will be copied ({draft.sources.length})</summary>
      {draft.sources.map((source, index) => <blockquote key={`${source.message_id}:${index}`}>
        <p>{source.quote}</p><cite>User message {source.message_id} - bounded excerpt, unverified</cite>
      </blockquote>)}
    </details>
    <p className="chat-sharing-warning">Creating copies the displayed fields and excerpts into a {chat.can_create ? "workspace" : "workflow"} record
      {draft.kind === "discovery" ? " retained for 30 days" : " with the assessment's separate retention"}.
      Team members with access can read that record. Deleting this private chat does not delete the copied context.
      All existing diagnostic and approval gates still apply.</p>
    {!ready && !chat.creation_pending && <p className="chat-muted">Save your completed review, then approve the saved values below.</p>}
    <label className="chat-ack"><input type="checkbox" checked={acknowledged} disabled={working || !ready || chat.creation_pending}
      onChange={event => setAcknowledged(event.target.checked)} />
      I reviewed the saved values and approve copying this context into the workflow.</label>
    <Button disabled={working || (!chat.creation_pending && (!acknowledged || !ready))}
      onClick={() => void onConfirm()}>{chat.creation_pending ? "Finish confirmed handoff" : `Create ${actionLabel(draft.kind)}`}</Button>
  </section>;
}

type Props = {
  workspaceName?: string; demo: boolean; canCreate: boolean;
  onBusyChange: (busy: boolean) => void; onUnsavedChange: (dirty: boolean) => void;
  onOpen: (kind: ChatKind, id: string) => Promise<void>;
};

export default function Conversations({ workspaceName, demo, canCreate, onBusyChange, onUnsavedChange, onOpen }: Props) {
  const [items, setItems] = useState<ChatSummary[]>([]);
  const [cursor, setCursor] = useState("");
  const [chat, setChat] = useState<Conversation | null>(null);
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [model, setModel] = useState("");
  const [composer, setComposer] = useState("");
  const [working, setWorking] = useState(false);
  const [sending, setSending] = useState(false);
  const [stage, setStage] = useState("");
  const [partial, setPartial] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [search, setSearch] = useState("");
  const [previewOpen, setPreviewOpen] = useState(true);
  const [previewDirty, setPreviewDirty] = useState(false);
  const [title, setTitle] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  const controller = useRef<AbortController | null>(null);
  const turn = useRef("");
  const stopped = useRef(false);
  const alive = useRef(true);
  const thread = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const follow = useRef(true);
  const dirty = Boolean(composer.trim() || previewDirty || (renaming && title.trim() !== chat?.title));
  const busy = working || sending;

  useEffect(() => {
    alive.current = true;
    void Promise.all([conversations.list(), api.models()]).then(([history, catalog]) => {
      if (!alive.current) return;
      setItems(history.items); setCursor(history.cursor);
      const available = catalog.items.filter(item => item.available && ["demo", "azure-openai"].includes(item.id));
      setModels(available.map(item => ({ id: item.id, label: item.label })));
      if (!available.length) setError("No approved chat model is configured. Ask your administrator to configure Azure OpenAI.");
      if (available.some(item => item.id === "demo")) setModel("demo");
    }).catch(error => { if (alive.current) setError(errorText(error)); });
    return () => { alive.current = false; controller.current?.abort(); };
  }, []);
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  useEffect(() => { onUnsavedChange(dirty); return () => onUnsavedChange(false); }, [dirty, onUnsavedChange]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty || sending) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty, sending]);
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    if (follow.current && thread.current && (chat?.messages.length || sending)) thread.current.scrollTop = thread.current.scrollHeight;
  }, [partial, chat?.messages.length, stage]);
  useEffect(() => {
    if (!chat) return;
    const expires = new Date(chat.expires_at).getTime();
    let timer: number;
    const check = () => {
      if (Date.now() >= expires) {
        stopped.current = true; controller.current?.abort();
        setChat(null); setComposer(""); setPartial(""); setPreviewDirty(false); setSending(false);
        setItems(previous => previous.filter(item => new Date(item.expires_at).getTime() > Date.now()));
        setError("This conversation reached its fixed expiry. Its saved content is no longer accessible.");
      } else timer = window.setTimeout(check, Math.min(expires - Date.now(), 60000));
    };
    check();
    return () => window.clearTimeout(timer);
  }, [chat?.id, chat?.expires_at]);

  function remember(value: Conversation) {
    if (!alive.current) return;
    if (new Date(value.expires_at).getTime() <= Date.now()) {
      setChat(null); setError("This conversation expired. Reload saved history.");
      return;
    }
    setChat(value);
    setItems(previous => [value, ...previous.filter(item => item.id !== value.id)]);
  }
  async function run<T,>(action: () => Promise<T>): Promise<T | undefined> {
    setWorking(true); setError(""); setNotice("");
    try { return await action(); }
    catch (error) { if (alive.current) setError(errorText(error)); }
    finally { if (alive.current) setWorking(false); }
  }
  function mayLeave() { return !dirty || window.confirm("Discard your unsent message or unsaved chat preview edits?"); }
  async function load(id: string) {
    if (!mayLeave()) return;
    await run(async () => {
      const value = await conversations.get(id);
      remember(value); setComposer(""); setPreviewDirty(false); setPreviewOpen(true); setPartial(""); setRenaming(false);
    });
  }
  async function reload() {
    if (!chat) {
      await run(async () => { const history = await conversations.list(); setItems(history.items); setCursor(history.cursor); });
      return;
    }
    if (!mayLeave()) return;
    await run(async () => { remember(await conversations.get(chat.id)); setPreviewDirty(false); setComposer(""); setPreviewOpen(true); });
  }
  async function send(retry = false) {
    const previous = chat?.messages[chat.messages.length - 1];
    const text = retry && previous?.role === "user" ? previous.content : composer.trim();
    if (!text || busy || chat?.pending || chat?.creation_pending) return;
    if (previewDirty && !window.confirm("Discard unsaved preview edits before sending?")) return;
    const id = retry && previous ? previous.id : uid();
    setSending(true); setError(""); setNotice(""); setElapsed(0); setPartial(""); setStage("Securing your request");
    stopped.current = false; turn.current = id; follow.current = true;
    const abort = new AbortController(); controller.current = abort;
    let active = chat;
    let received = 0;
    try {
      if (!active) active = await conversations.create(model);
      remember(active);
      const value = await conversations.send(active, id, text, {
        signal: abort.signal,
        onAccepted: event => {
          if (!alive.current || !active) return;
          if (event.message.id !== id) throw new ApiError(0, "The saved message did not match this request. Reload saved messages.");
          remember({ ...active, version: event.version, title: event.title, pending: event.pending, draft: null, suggestion: null,
            messages: active.messages.some(message => message.id === event.message.id)
              ? active.messages.map(message => message.id === event.message.id ? event.message : message)
              : [...active.messages, event.message] });
          setComposer(""); setPreviewDirty(false);
        },
        onStage: label => { if (alive.current) setStage(label); },
        onDelta: delta => {
          received += delta.length;
          if (received > 6000) throw new ApiError(0, "The response exceeded the chat limit. Reload saved messages.");
          if (alive.current) setPartial(current => current + delta);
        },
      });
      if (!alive.current || stopped.current) return;
      remember(value); setComposer(""); setPreviewDirty(false);
    } catch (error) {
      if (!alive.current || stopped.current) return;
      setError(errorText(error));
      if (active) {
        try {
          const saved = await conversations.get(active.id);
          remember(saved);
          if (saved.messages.some(message => message.id === id)) setComposer("");
        } catch (reloadError) { if (alive.current) setError(`${errorText(error)} Saved state could not be reloaded: ${errorText(reloadError)}`); }
      }
    } finally {
      if (alive.current) { setSending(false); setStage(""); setPartial(""); }
      controller.current = null;
    }
  }
  async function stop() {
    if (!chat) return;
    stopped.current = true;
    await run(async () => {
      const identifier = chat.pending?.id || turn.current;
      const value = await conversations.stop(chat, identifier);
      controller.current?.abort();
      remember(value); setComposer(""); setPartial(""); setStage(""); setSending(false);
      if (value.messages.some(message => message.reply_to === identifier)) {
        setNotice("The response finished before Stop was processed. The completed reply was kept.");
      }
    });
  }
  async function prepare(kind: ChatKind) {
    if (!chat || (previewDirty && !window.confirm("Discard unsaved preview edits before preparing another preview?"))) return;
    await run(async () => {
      remember(await conversations.preview(chat, kind));
      setPreviewOpen(true); setPreviewDirty(false);
    });
  }
  const last = chat?.messages[chat.messages.length - 1];
  const activeDraft = chat?.draft && (previewOpen || chat.creation_pending) ? chat.draft : null;
  const journey = chat?.link ? 2 : activeDraft || chat?.suggestion ? 1 : 0;
  const destination = chat?.link?.kind || activeDraft?.kind || chat?.suggestion?.kind;
  const filtered = items.filter(item => item.title.toLowerCase().includes(search.toLowerCase()));
  return <section className="conversation-workspace" aria-label="Conversation workspace">
    <aside className="chat-sidebar" aria-label="Private conversation history">
      <div className="chat-brand"><span aria-hidden="true" className="chat-spark"><BrandMark /></span><strong>Kaisersol Chat</strong></div>
      <Button disabled={busy || !model} onClick={() => {
        if (!mayLeave()) return;
        setChat(null); setComposer(""); setPreviewDirty(false); setPreviewOpen(true); setError(""); setPartial(""); setRenaming(false);
        textarea.current?.focus();
      }}>+ New conversation</Button>
      <details className="chat-history" open={historyOpen} onToggle={event => setHistoryOpen(event.currentTarget.open)}>
        <summary>Your conversations <span>{items.length}</span></summary>
        <input aria-label="Search loaded conversations" className="form-control" placeholder="Search loaded conversations" value={search}
          onChange={event => setSearch(event.target.value)} />
        <div className="chat-history-list">
          {filtered.map(item => <button key={item.id} disabled={busy} className={chat?.id === item.id ? "is-active" : ""}
            aria-current={chat?.id === item.id ? "true" : undefined} onClick={() => void load(item.id)}>
            <span>{item.title}</span><small>Expires {date(item.expires_at)}</small>
          </button>)}
          {!filtered.length && <p className="chat-muted">{search ? "No matches in loaded history." : "Your saved conversations appear here."}</p>}
        </div>
        {cursor && <Button variant="ghost" disabled={busy} onClick={() => void run(async () => {
          const page = await conversations.list(cursor);
          setItems(previous => [...previous, ...page.items.filter(item => !previous.some(existing => existing.id === item.id))]);
          setCursor(page.cursor);
        })}>Load older conversations</Button>}
      </details>
      <div className="chat-privacy">
        <strong>{demo ? "Shared local demo" : "Private by default"}</strong>
        <p>{workspaceName || "Personal workspace"}</p>
        <p>Fixed 30-day expiry. No cross-chat memory. Your browser does not persist transcripts.</p>
      </div>
    </aside>
    <div className="chat-main">
      <header className="chat-topbar">
        <div><h1>{chat?.title || "Workspace Chat"}</h1>
          <p>{chat ? `Expires ${date(chat.expires_at)} · ${chat.model.provider} / ${chat.model.model}` : workspaceName || "Personal workspace"}</p></div>
        <div className="chat-tools">
          <Button variant="ghost" disabled={busy} onClick={() => void reload()}>Reload saved</Button>
          {chat && <Button variant="ghost" disabled={busy || chat.creation_pending} onClick={() => { setTitle(chat.title); setRenaming(!renaming); }}>Rename</Button>}
          {chat && <Button variant="ghost" disabled={busy} onClick={() => {
            if (!mayLeave() || !window.confirm("Delete this conversation and its private messages now? A previously confirmed handoff may still finish; find it in Home. Copied workflow context and separately managed backups/provider records are not deleted.")) return;
            void run(async () => {
              await conversations.delete(chat);
              setItems(previous => previous.filter(item => item.id !== chat.id));
              setChat(null); setComposer(""); setPreviewDirty(false); setRenaming(false);
            });
          }}>Delete chat</Button>}
        </div>
      </header>
      <ol className="chat-journey" aria-label="Conversation journey">
        {["Explore", "Review a next step", "Continue in workflow"].map((label, index) =>
          <li key={label} aria-current={index === journey ? "step" : undefined}><small aria-hidden="true">0{index + 1}</small>{index === 2 && chat?.link ? actionLabel(chat.link.kind) : label}</li>)}
      </ol>
      {renaming && chat && <form className="chat-rename" onSubmit={event => {
        event.preventDefault(); void run(async () => { remember(await conversations.rename(chat, title.trim())); setRenaming(false); });
      }}><label>Conversation title<input className="form-control" value={title} maxLength={100} required onChange={event => setTitle(event.target.value)} /></label>
        <Button type="submit" disabled={busy || !title.trim()}>Save title</Button>
        <Button variant="ghost" type="button" disabled={busy} onClick={() => setRenaming(false)}>Cancel rename</Button>
      </form>}
      {demo && <p className="chat-demo">Local demo uses scripted responses and keyword routing, not live semantic reasoning. Unknown preview fields must be entered manually.</p>}
      {error && <div role="alert" className="chat-error">{error}<p>Nothing is created automatically. Reload saved state before retrying an uncertain request.</p></div>}
      {notice && <p role="status" className="chat-recovery px-6 py-3">{notice}</p>}
      <div className="chat-thread" ref={thread} aria-label="Messages" tabIndex={0} onScroll={event => {
        const element = event.currentTarget;
        follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
      }}>
        {!chat?.messages.length && !sending && <div className="chat-welcome">
          <div className="chat-signal" aria-hidden="true"><StudioRibbon variant={1}/><span className="chat-orb"><BrandMark /></span></div>
          <p className="eyebrow">Start with one business problem</p>
          <h2>What could work better?</h2>
          <p>Describe a recent example: who did the work, where it slowed down, and what you want to improve. Choose a starter to edit, or write your own.</p>
          <div className="chat-starters">
            {([
              ["discovery", "Find an opportunity", "Explore discovery opportunities across our customer onboarding process."],
              ["intake", "Assess a workflow", "I have a known workflow to assess through Enterprise Intake."],
              ["readiness", "Plan team adoption", "How could we train the people reviewing AI drafts and measure whether their work improves?"],
            ] as const).map(([icon, label, text]) =>
              <button key={icon} disabled={busy || !!composer.trim()} onClick={() => { setComposer(text); textarea.current?.focus(); }}><Icon name={icon} />{label}</button>)}
          </div>
        </div>}
        {chat?.messages.map(message => <article key={message.id} className={`chat-message chat-${message.role}`} aria-label={message.role === "user" ? "Your message" : "Kaisersol response"}>
          <div className="chat-avatar" aria-hidden="true">{message.role === "user" ? "You" : "AS"}</div>
          <div className="chat-message-content"><p className="chat-speaker">{message.role === "user" ? "You" : "Kaisersol"}</p>
            {message.role === "assistant" ? <Markdown text={message.content} /> : <p className="chat-user-text">{message.content}</p>}
            {message.interrupted && <p className="chat-interrupted">Response interrupted. No completed assistant reply was saved.</p>}
          </div>
        </article>)}
        {last?.role === "assistant" && !sending && !activeDraft && !chat?.link && !chat?.pending && !chat?.creation_pending && <div className="chat-followup">
          <span>Keep exploring</span><button disabled={busy || !!composer.trim()} onClick={() => {
            setComposer(destination === "intake" ? "What facts about this workflow are still missing before intake?" : destination === "discovery" ? "Who should we hear from before we scope discovery?" : "What evidence would help us decide the next step?");
            textarea.current?.focus();
          }}>{destination === "intake" ? "Check missing facts" : destination === "discovery" ? "Identify the people involved" : "Identify the evidence we need"} ↗</button>
        </div>}
        {sending && <article className="chat-message chat-assistant" aria-label="Response being curated">
          <div className="chat-avatar" aria-hidden="true">AS</div>
          <div className="chat-message-content">{partial ? <Markdown text={partial} /> : <div className="chat-skeleton" aria-hidden="true"><i /><i /><i /></div>}</div>
        </article>}
        {chat?.suggestion && !sending && !activeDraft && !chat.link && <section className="chat-suggestion" aria-label="Suggested next step">
          <p className="eyebrow">Optional handoff</p>
          <h3>{actionLabel(chat.suggestion.kind)} could help here</h3><p>{chat.suggestion.reason}</p>
          <p className="chat-muted">{chat.suggestion.kind === "discovery" ? "Use Discovery to gather perspectives and compare opportunities." : "Use Enterprise Intake when you know which workflow to assess."} Preview the context from {chat.suggestion.source_ids.length} of your messages before deciding.</p>
          <div className="chat-actions"><Button disabled={busy || !canCreate || !chat.can_create} onClick={() => void prepare(chat.suggestion!.kind)}>
            Start {actionLabel(chat.suggestion.kind)}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => void run(async () => remember(await conversations.dismiss(chat)))}>Not now</Button></div>
        </section>}
        {activeDraft && chat && <Review key={activeDraft.id} chat={chat} draft={activeDraft} working={busy}
          onDirty={setPreviewDirty} onClose={() => {
            if (previewDirty && !window.confirm("Discard unsaved preview edits?")) return;
            setPreviewOpen(false); setPreviewDirty(false);
          }}
          onSave={async fields => {
            const value = await run(() => conversations.edit(chat, activeDraft, fields));
            if (value) { remember(value); setPreviewDirty(false); return value.draft ?? undefined; }
          }}
          onConfirm={async () => { await run(async () => { remember(await conversations.confirm(chat, activeDraft)); setPreviewDirty(false); }); }} />}
        {chat?.link && <section className="chat-created" role="status">
          <p className="eyebrow">Created with your approval</p><h3>{actionLabel(chat.link.kind)} is ready</h3>
          <p>{chat.link.kind === "discovery" ? "Continue with the engagement, then use its reviewed opportunity handoff when ready for assessment."
            : "Continue in Enterprise Intake. Diagnostic, evidence and readiness gates are unchanged."}</p>
          <Button disabled={busy} onClick={() => {
            if (!mayLeave()) return;
            void run(() => onOpen(chat.link!.kind, chat.link!.workflow_id));
          }}>Open {actionLabel(chat.link.kind)}</Button>
          <p className="chat-muted">This conversation keeps one originating workflow. Use New conversation for another topic.</p>
        </section>}
      </div>
      <footer className="chat-composer-area">
        {busy && <div className="chat-progress" role="status" aria-live="polite">
          <div><span className="chat-status-dot" />{stage || "Processing your workspace request"}<span>{elapsed}s</span></div>
          <div className="chat-progress-track" role="progressbar" aria-label="Response progress" aria-valuetext={stage || "Working"}><i /></div>
        </div>}
        {chat?.pending && !sending && <div className="chat-recovery" role="status">A response was interrupted or is active in another tab.
          <Button disabled={busy} variant="ghost" onClick={() => void stop()}>Stop / recover response</Button></div>}
        {last?.role === "user" && last.interrupted && !chat?.pending && !sending &&
          <Button disabled={busy} variant="ghost" onClick={() => void send(true)}>Retry last response</Button>}
        {chat?.messages.length && !chat.link && !activeDraft ? <div className="chat-manual-actions">
          <span>Prefer to choose your own path?</span>
          <button disabled={busy || !canCreate || !chat.can_create} onClick={() => void prepare("discovery")}>Review Discovery preview</button>
          <button disabled={busy || !canCreate || !chat.can_create} onClick={() => void prepare("intake")}>Review Enterprise Intake preview</button>
          {(!canCreate || !chat.can_create) && <span>Read-only workspace: you may chat, but workflow creation needs write permission.</span>}
        </div> : null}
        <form className="chat-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
          <label className="sr-only" htmlFor="conversation-message">Message Kaisersol</label>
          <textarea id="conversation-message" ref={textarea} value={composer} rows={2} maxLength={4000}
            placeholder="Describe a process or ask a question..." disabled={busy || Boolean(chat?.pending || chat?.creation_pending)}
            onChange={event => setComposer(event.target.value)} onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
            }} />
          <div className="chat-composer-bottom">
            {!chat ? <label>Model<select aria-label="Chat model" value={model} disabled={busy} onChange={event => setModel(event.target.value)}>
              <option value="">Choose approved model</option>{models.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}
            </select></label> : <span className="chat-muted">Enter to send · Shift+Enter for a new line</span>}
            {sending ? <Button type="button" disabled={working || stage === "Securing your request"} onClick={() => void stop()}>Stop response</Button>
              : <Button type="submit" disabled={busy || !composer.trim() || (!chat && !model) || Boolean(chat?.pending || chat?.creation_pending)}>Send message <span aria-hidden="true">↑</span></Button>}
          </div>
        </form>
        <p className="chat-disclaimer">AI can be wrong. Validate important facts. Avoid sensitive data. {chat ? "Expiry does not extend when you reply." : "Chats expire 30 days after creation."}</p>
      </footer>
    </div>
  </section>;
}
import StudioRibbon from "./StudioRibbon";
