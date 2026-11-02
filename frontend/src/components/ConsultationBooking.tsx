import { useEffect, useRef, useState } from "react";
import { MarketingIcon } from "./MarketingVisuals";
import "./ConsultationBooking.css";

const EVENT = "vienna-now-rdnzte/agentspark-consulting";
const BOOKING_URL = `https://cal.com/${EVENT}`;
const ASSISTANT_PROMPT = `If not added, add mcp.cal.com/mcp, then book ${EVENT}`;
const NAMESPACE = "agentspark-consulting";

function CalendarEmbed() {
  const container = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "slow">("loading");
  useEffect(() => {
    const element = container.current;
    if (!element) throw new Error("The consultation calendar container is missing.");
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start", behavior: "auto" });
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    const timeout = window.setTimeout(() => {
      if (!disposed) setStatus("slow");
    }, 20000);
    async function load() {
      try {
        const { getCalApi } = await import("@calcom/embed-react");
        if (disposed) return;
        const cal = await getCalApi({ namespace: NAMESPACE });
        if (disposed) return;
        window.Cal.config = { ...window.Cal.config, forwardQueryParams: false };
        const ready = () => {
          window.clearTimeout(timeout);
          if (!disposed) setStatus("ready");
        };
        const failed = () => {
          window.clearTimeout(timeout);
          if (!disposed) setStatus("failed");
        };
        cal("on", { action: "linkReady", callback: ready });
        cal("on", { action: "linkFailed", callback: failed });
        unsubscribe = () => {
          cal("off", { action: "linkReady", callback: ready });
          cal("off", { action: "linkFailed", callback: failed });
        };
        cal("inline", { elementOrSelector: element, calLink: EVENT, config: {
          layout: "month_view", useSlotsViewOnSmallScreen: "true", theme: "light",
        } });
        cal("ui", { hideEventTypeDetails: false, layout: "month_view" });
      } catch {
        window.clearTimeout(timeout);
        if (!disposed) setStatus("failed");
      }
    }
    void load();
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      unsubscribe?.();
      element.replaceChildren();
    };
  }, []);
  return <div className="consultation-calendar">
    <h3 ref={heading} tabIndex={-1}>Choose a consultation time</h3>
    {status === "loading" && <p role="status">Loading the Cal.com calendar...</p>}
    {(status === "slow" || status === "failed") && <div className="consultation-calendar-fallback" role="region" aria-label="Alternative consultation booking">
      <p role="alert">{status === "slow" ? "The embedded calendar is taking longer than expected." : "Cal.com could not load the embedded calendar."} Your browser or network may be preventing it from opening. You can book on the secure Cal.com page instead.</p>
      <a className="landing-button landing-button-primary" href={BOOKING_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
        Open booking page <span className="consulting-sr-only">(opens a new tab)</span><span aria-hidden="true">&#8599;</span>
      </a>
    </div>}
    <div ref={container} className="consultation-embed" role="region" aria-label="Cal.com consultation calendar" hidden={status === "slow" || status === "failed"} />
  </div>;
}

export default function ConsultationBooking({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [calendar, setCalendar] = useState(false);
  const [copy, setCopy] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  useEffect(() => {
    const element = dialog.current;
    if (!element) throw new Error("The consultation booking dialog is missing.");
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  async function copyPrompt() {
    setCopy("copying");
    if (!navigator.clipboard?.writeText) { setCopy("failed"); return; }
    try { await navigator.clipboard.writeText(ASSISTANT_PROMPT); setCopy("copied"); }
    catch { setCopy("failed"); }
  }
  return <dialog ref={dialog} className="consultation-dialog" aria-labelledby="consultation-title"
    aria-describedby="consultation-description" onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], textarea, iframe"))
        .filter(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
      const first = controls[0], last = controls[controls.length - 1];
      if (first && last && document.activeElement === (event.shiftKey ? first : last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }}>
    <div className="consultation-dialog-header"><div><p className="landing-eyebrow">AgentSpark Consulting</p>
      <h2 id="consultation-title">A conversation. A clearer next step.</h2></div>
      <button type="button" className="consultation-close" onClick={onClose} aria-label="Close consultation booking">Close <span aria-hidden="true">&times;</span></button></div>
    <div className="consultation-dialog-body">
      <p id="consultation-description">Book directly, or ask your AI assistant to help. Your meeting is only booked after Cal.com confirms it.</p>
      <div className="consultation-options">
        <section aria-labelledby="consultation-human-title"><MarketingIcon name="people" /><p className="landing-eyebrow">For you</p>
          <h3 id="consultation-human-title">Choose a time together.</h3>
          <p>Opening the calendar connects to Cal.com, which processes scheduling details under its <a href="https://cal.com/privacy" target="_blank" rel="noopener noreferrer">privacy policy (new tab)</a>. Do not include passwords, API keys or confidential client data.</p>
          <div className="landing-actions">{!calendar && <button type="button" className="landing-button landing-button-primary" onClick={() => setCalendar(true)}>Open calendar</button>}
            <a className="consulting-text-link" href={BOOKING_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Book directly on Cal.com <span className="consulting-sr-only">(opens a new tab)</span><span aria-hidden="true">&#8599;</span></a></div>
        </section>
        <section aria-labelledby="consultation-agent-title"><MarketingIcon name="decision" /><p className="landing-eyebrow">For your assistant</p>
          <h3 id="consultation-agent-title">Let your agent coordinate.</h3>
          <p>Paste these instructions into a compatible AI assistant. Review any request to connect Cal.com, authorize access yourself and confirm the meeting details.</p>
          <button type="button" className="landing-button landing-button-secondary" disabled={copy === "copying"} onClick={() => void copyPrompt()}>Copy instructions for your AI assistant</button>
          <p role="status" className="consultation-copy-status">{copy === "copied" ? "Copied. Paste into your assistant. Nothing has been booked or connected." : copy === "copying" ? "Copying instructions..." : ""}</p>
          {copy === "failed" && <p role="alert">Copy did not succeed. Select and copy the instructions below manually.</p>}
          <label htmlFor="consultation-prompt">Booking instructions</label>
          <textarea id="consultation-prompt" readOnly rows={3} value={ASSISTANT_PROMPT} onFocus={event => event.currentTarget.select()} />
        </section>
      </div>
      {calendar && <CalendarEmbed />}
      <p className="consultation-boundary">Scheduling is separate from the AgentSpark workspace. We do not forward page query parameters or prefill assessment data. A consultation does not authorize implementation or commit you to an engagement.</p>
    </div>
  </dialog>;
}
