import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Link, useLocation } from "react-router-dom";
import BrandMark from "./BrandMark";
import LandingNavigation from "./LandingNavigation";
import { ConsultationLink } from "./ConsultationBooking";
import "./ExperiencePilot.css";

const HOME = "/?design=pilot";
const READINESS = "/consulting/readiness?design=pilot";
const chapters = [
  { id: "understand", label: "Understand the work" },
  { id: "compare", label: "Weigh the options" },
  { id: "decide", label: "Make the call" },
] as const;
const deliverables = [
  { id: "opportunity", label: "The opportunity" },
  { id: "readiness", label: "The reality check" },
  { id: "next", label: "The next move" },
] as const;
type ProductChapter = typeof chapters[number]["id"];
type Deliverable = typeof deliverables[number]["id"];
const sources = [
  { id: "S1", role: "Operations", initials: "OP", quote: "We enter the same details twice.", context: "An operator describes rechecking invoice information after another team has already entered it." },
  { id: "S2", role: "Process owner", initials: "PO", quote: "Exceptions need an accountable owner.", context: "A process owner identifies unclear responsibility when an invoice does not match the purchase order." },
  { id: "S3", role: "Technology", initials: "IT", quote: "Data access still needs validation.", context: "A technical stakeholder has not yet verified access to the records a proposed solution would need." },
];
const options = [
  { title: "Clarify the handoff", kind: "Process improvement", description: "Name an exception owner before introducing automation.", reason: "Duplicate checks and unclear ownership suggest a process problem worth investigating first.", gap: "Validate the handoff with the people doing the work.", source: "S1 · S2" },
  { title: "Apply predictable rules", kind: "Deterministic automation", description: "Check known fields. Route exceptions to a person.", reason: "Repeatable checks may suit ordinary rules rather than an open-ended agent.", gap: "Confirm the rules, system access and exception path.", source: "S1 · S3" },
  { title: "Assist with the evidence", kind: "AI assistance", description: "Prepare a source-linked summary for a finance reviewer.", reason: "Assistance may help with varied documents; it does not authorize payment.", gap: "Validate document quality, permissions and reviewer acceptance.", source: "S2 · S3" },
];

function ChapterTabs<T extends string>({ items, value, onChange, id, label }: {
  items: readonly { id: T; label: string }[]; value: T; onChange: (value: T) => void; id: string; label: string;
}) {
  return <div className="pilot-tabs" role="tablist" aria-label={label} onKeyDown={event => {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const index = buttons.findIndex(button => button === document.activeElement);
    if (index < 0) return;
    const next = event.key === "ArrowRight" ? (index + 1) % buttons.length
      : event.key === "ArrowLeft" ? (index + buttons.length - 1) % buttons.length
        : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    buttons[next].focus();
    buttons[next].click();
  }}>
    {items.map((item, index) => <button key={item.id} id={`${id}-${item.id}`} role="tab"
      type="button" aria-selected={value === item.id} tabIndex={value === item.id ? 0 : -1}
      aria-controls={`${id}-panel`} onClick={() => onChange(item.id)}>
      <span className="pilot-tab-number" aria-hidden="true">0{index + 1}</span>{item.label}
    </button>)}
  </div>;
}

function ProductExperience() {
  const [chapter, setChapter] = useState<ProductChapter>("understand");
  const [option, setOption] = useState(0);
  const id = useId();
  const selected = options[option];
  return <section id="pilot-experience" className="pilot-experience pilot-width" tabIndex={-1} aria-label="Interactive fictional product experience">
    <ChapterTabs<ProductChapter> items={chapters} value={chapter} onChange={setChapter} id={id} label="Explore the product" />
    <div className="pilot-app-window">
      <div className="pilot-window-bar"><span><BrandMark /> Kaisersol</span><span>Northstar / Finance <span className="pilot-sample-dot" /> Fictional workspace</span></div>
      <div className="pilot-app-layout">
        <aside className="pilot-app-sidebar" aria-label="Preview workspace context">
          <span className="pilot-sidebar-label">YOUR WORKSPACE</span>
          <span className="pilot-sidebar-item">Overview</span>
          <span className="pilot-sidebar-item pilot-sidebar-current">Invoice exceptions <span>↗</span></span>
          <span className="pilot-sidebar-item">Team perspectives</span>
          <div className="pilot-sidebar-bottom"><span className="pilot-person">FN</span><span>Finance team<small>Human review required</small></span></div>
        </aside>
        <div className="pilot-app-content" id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${chapter}`} tabIndex={0}>
          <div className="pilot-scene" key={chapter}>
            <div className="pilot-app-breadcrumb"><span>Decision workspace / Invoice exceptions</span><span className="pilot-status">For review</span></div>
            {chapter === "understand" && <>
              <h2>Start with the work.</h2><p className="pilot-app-intro">Three perspectives. One better question.</p>
              <div className="pilot-source-list">{sources.map(source => <details key={source.id} className="pilot-source">
                <summary><span className="pilot-person">{source.initials}</span><span><span className="pilot-source-role">{source.role}</span><strong>{source.quote}</strong></span><span className="pilot-source-reference">{source.id} <span aria-hidden="true">+</span></span></summary>
                <p>{source.context} This fictional statement is an input to investigate, not verified evidence of an outcome.</p>
              </details>)}</div>
              <div className="pilot-working-question"><span>THE QUESTION TO REVIEW</span><p>Why are invoice exceptions being checked twice before approval?</p></div>
            </>}
            {chapter === "compare" && <>
              <h2>Less technology. If that is the answer.</h2><p className="pilot-app-intro">Explore an option. Inspect the reasoning.</p>
              <div className="pilot-options">
                <div className="pilot-option-list" aria-label="Possible approaches">{options.map((item, index) =>
                  <button type="button" key={item.title} aria-pressed={option === index} onClick={() => setOption(index)}>
                    <small>{item.kind}</small><strong>{item.title}</strong><span aria-hidden="true">↗</span>
                  </button>)}</div>
                <div className="pilot-option-detail" key={option}><span className="pilot-document-label">OPTION TO INVESTIGATE</span><h3>{selected.description}</h3>
                  <p>{selected.reason}</p><div><strong>Still to validate</strong><p>{selected.gap}</p></div><span className="pilot-citation">Source statements {selected.source}</span></div>
              </div>
            </>}
            {chapter === "decide" && <>
              <h2>A next step you can explain.</h2><p className="pilot-app-intro">A reviewable recommendation. Not an automatic decision.</p>
              <div className="pilot-decision-record"><span className="pilot-document-label">DECISION BRIEF / DRAFT</span>
                <h3>Investigate a clearer handoff.</h3><p>Review exception ownership with Finance before choosing an automation approach.</p>
                <dl><div><dt>Supporting statements</dt><dd>S1: repeated checks. S2: unclear ownership.</dd></div><div><dt>Still unknown</dt><dd>Baseline effort, access and acceptance.</dd></div><div><dt>Decision authority</dt><dd>Authorized finance reviewer.</dd></div></dl>
                <Link to="/resources/example-assessment">Open the full example <span aria-hidden="true">↗</span></Link>
              </div>
            </>}
          </div>
          <div className="pilot-app-footnote"><span className="pilot-review-dot" /> Illustrative inputs. Unverified findings. No workflow has been created.</div>
        </div>
      </div>
    </div>
    <p className="pilot-demo-caption">A fictional example, not a live analysis. Explore at your own pace.</p>
  </section>;
}

function EvidenceStory() {
  const [source, setSource] = useState(0);
  return <section className="pilot-evidence-section" aria-labelledby="pilot-evidence-title">
    <div className="pilot-width pilot-evidence-layout">
      <div className="pilot-story-copy"><span className="pilot-eyebrow">Evidence, not guesswork.</span><h2 id="pilot-evidence-title">See why.<br />Not just what.</h2>
        <p>A useful recommendation should stand up to a second look. Open the statement behind it. See what it supports—and what it does not.</p>
        <div className="pilot-evidence-switch" aria-label="Choose a source statement">{sources.slice(0, 2).map((item, index) =>
          <button type="button" key={item.id} aria-pressed={source === index} onClick={() => setSource(index)}>{item.id} / {item.role}</button>)}</div>
      </div>
      <div className="pilot-source-paper" key={source} role="region" aria-label="Source statement preview">
        <div className="pilot-paper-top"><span>SOURCE STATEMENT / {sources[source].id}</span><span>Fictional example</span></div>
        <span className="pilot-paper-category">Invoice exception review</span>
        <blockquote>{sources[source].quote}</blockquote>
        <p className="pilot-paper-context">{sources[source].context}</p>
        <div className="pilot-paper-annotation"><span>WHAT THIS SUPPORTS</span><p>{source === 0 ? "Investigating the repeated check. Not claiming a measured time saving." : "Clarifying ownership. Not assuming the team has already agreed."}</p></div>
        <div className="pilot-paper-bottom">A statement to validate. Not a fact to assume.</div>
      </div>
    </div>
  </section>;
}

function ReadinessBrief() {
  const [deliverable, setDeliverable] = useState<Deliverable>("opportunity");
  const id = useId();
  return <section id="pilot-brief" className="pilot-brief-experience pilot-width" tabIndex={-1} aria-label="Illustrative engagement deliverables">
    <ChapterTabs<Deliverable> items={deliverables} value={deliverable} onChange={setDeliverable} id={id} label="Explore the engagement outputs" />
    <div className="pilot-brief-stage">
      <div className="pilot-brief-margin" aria-hidden="true"><span>FROM QUESTION<br />TO DIRECTION.</span><span>KAISERSOL<br />ADVISORY</span></div>
      <div className="pilot-engagement-paper" id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${deliverable}`} tabIndex={0}>
        <div className="pilot-paper-top"><span>OPPORTUNITY &amp; READINESS</span><span>Illustrative draft</span></div>
        <div className="pilot-scene" key={deliverable}>
          <span className="pilot-document-label">FINANCE / INVOICE EXCEPTIONS</span>
          {deliverable === "opportunity" && <><h2>Find the work<br />worth improving.</h2>
            <p className="pilot-brief-lead">Before choosing a tool, understand the friction.</p>
            <div className="pilot-brief-finding"><span>01 / THE OPPORTUNITY</span><h3>A clearer exception handoff.</h3><p>Review duplicated checks and unclear ownership with the people handling invoices. Compare a process change, ordinary rules and AI assistance.</p></div>
            <p className="pilot-brief-note">The output: a source-linked opportunity shortlist, with assumptions visible.</p></>}
          {deliverable === "readiness" && <><h2>Ambition.<br />Meet reality.</h2><p className="pilot-brief-lead">Make the missing foundations visible.</p>
            <dl className="pilot-readiness-list"><div><dt>Access to source records</dt><dd>Not verified</dd></div><div><dt>Process owner</dt><dd>Proposed, not accepted</dd></div><div><dt>Baseline effort</dt><dd>Not measured</dd></div></dl>
            <p className="pilot-brief-note">The output: a readiness review. These are illustrative gaps, not completed checks.</p></>}
          {deliverable === "next" && <><h2>A small step.<br />A clear purpose.</h2><p className="pilot-brief-lead">Agree what to learn before deciding what to build.</p>
            <div className="pilot-brief-finding"><span>03 / THE NEXT MOVE</span><h3>Validate one exception path.</h3><p>Agree an owner, observe representative cases and record a baseline. Review the findings together before authorizing a pilot.</p></div>
            <p className="pilot-brief-note">The output: a practical next-step roadmap. No deployment or savings are implied.</p></>}
        </div>
        <div className="pilot-paper-bottom"><span>HUMAN REVIEW REQUIRED</span><span>Sample, not a customer deliverable.</span></div>
      </div>
    </div>
    <p className="pilot-demo-caption">An illustration of the engagement outputs. Actual scope is agreed before delivery.</p>
  </section>;
}

function AmbientBackdrop({ readiness }: { readiness: boolean }) {
  const backdrop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = backdrop.current;
    if (!element) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const update = () => {
      frame = 0;
      element.style.setProperty("--ambient-offset", preference.matches ? "0px" : `${-Math.min(Math.max(window.scrollY, 0) * .12, 160)}px`);
    };
    const scroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    const configure = () => {
      window.removeEventListener("scroll", scroll);
      window.cancelAnimationFrame(frame);
      frame = 0;
      update();
      if (!preference.matches) window.addEventListener("scroll", scroll, { passive: true });
    };
    configure();
    preference.addEventListener("change", configure);
    return () => {
      window.removeEventListener("scroll", scroll);
      preference.removeEventListener("change", configure);
      window.cancelAnimationFrame(frame);
    };
  }, []);
  return <div ref={backdrop} className="pilot-ambient" data-scene={readiness ? "readiness" : "home"} aria-hidden="true">
    <div key={readiness ? "readiness" : "home"} className="pilot-ambient-field" />
  </div>;
}

export default function ExperiencePilot({ readiness, titleRef, disabled, signedIn, onWorkspace, onDiscover, onStart, onBook, message }: {
  readiness: boolean; titleRef: RefObject<HTMLHeadingElement>; disabled: boolean; signedIn: boolean;
  onWorkspace: () => void; onDiscover: () => void; onStart: () => void; onBook: () => void; message: string;
}) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } else if (["#landing-main", "#pilot-experience", "#pilot-brief"].includes(hash)) {
      const target = document.getElementById(hash.slice(1));
      target?.scrollIntoView({ block: "start", behavior: "auto" });
      target?.focus({ preventScroll: true });
    }
  }, [hash, readiness]);
  return <div className="pilot-site" data-pilot-page={readiness ? "readiness" : "home"}>
    <AmbientBackdrop readiness={readiness} />
    <Link className="pilot-skip" to={`${readiness ? READINESS : HOME}#landing-main`}>Skip to content</Link>
    <div className="landing concept-site work-story"><LandingNavigation disabled={disabled} signedIn={signedIn} onWorkspace={onWorkspace} onBook={onBook}/></div>
    <div className="pilot-header"><div className="pilot-header-inner">
      <nav aria-label="Pilot navigation"><Link to={HOME} aria-current={readiness ? undefined : "page"}>Overview</Link><Link to={READINESS} aria-current={readiness ? "page" : undefined}>Advisory</Link><Link to="/resources/example-assessment">Example</Link></nav>
    </div></div>
    <main id="landing-main" tabIndex={-1}>
      <section id="top" className="pilot-hero pilot-width" aria-labelledby="landing-title">
        <p className="pilot-hero-category">{readiness ? "Opportunity & readiness. A separately scoped advisory service." : "Kaisersol. The enterprise AI decision workspace."}</p>
        <h1 ref={titleRef} tabIndex={-1} id="landing-title">{readiness ? <>Your first move.<br /><span>Not your next experiment.</span></> : <>Big questions.<br /><span>Clear next moves.</span></>}</h1>
        <p className="pilot-hero-summary">{readiness ? "Find a worthwhile opportunity. Understand what is missing. Agree where to go next." : "Bring the evidence together. Weigh the possibilities. Decide what deserves your next investment."}</p>
        <div className="pilot-hero-actions">{readiness
          ? <><ConsultationLink className="pilot-button" onBook={onBook} /><Link className="pilot-text-action" to={`${READINESS}#pilot-brief`}>Explore the brief <span aria-hidden="true">↓</span></Link></>
          : <><Link className="pilot-button" to={`${HOME}#pilot-experience`}>Explore the experience <span aria-hidden="true">↓</span></Link><button type="button" className="pilot-text-action" disabled={disabled} onClick={onDiscover}>Start discovery <span aria-hidden="true">↗</span></button></>}</div>
        {message && <p role="status" className="pilot-feedback">{message}</p>}
      </section>
      {readiness ? <>
        <ReadinessBrief />
        <section className="pilot-method-section pilot-width" aria-labelledby="pilot-method-title"><span className="pilot-eyebrow">The work behind the brief.</span>
          <h2 id="pilot-method-title">A focused engagement.<br /><span>Not an open-ended programme.</span></h2>
          <ol className="pilot-method">{[
            ["Frame", "Agree the business question, scope and decision owner."],
            ["Discover", "Hear the people doing the work. Gather source perspectives."],
            ["Compare", "Evaluate alternatives without assuming AI is the answer."],
            ["Recommend", "Review the shortlist and agree a bounded next step."],
          ].map(([label, detail], index) => <li key={label}><span>0{index + 1}</span><h3>{label}</h3><p>{detail}</p></li>)}</ol>
        </section>
        <section className="pilot-scope-section" aria-labelledby="pilot-scope-title"><div className="pilot-width pilot-scope-layout">
          <h2 id="pilot-scope-title">Clear scope.<br />No surprises.</h2>
          <div className="pilot-faq">
            <details><summary>What do we leave with?<span aria-hidden="true">+</span></summary><p>An opportunity shortlist, a readiness review and a practical roadmap, within an agreed scope. They show the reasoning, assumptions, gaps and next decisions—not a guarantee of savings or production readiness.</p></details>
            <details><summary>What is not included?<span aria-hidden="true">+</span></summary><p>This is advisory, not a software subscription or automatic implementation. Provider accounts, licenses, data access, deployment and operating responsibilities are separate choices. No onboarding or business action is triggered by exploring this page.</p></details>
            <details><summary>How does booking work?<span aria-hidden="true">+</span></summary><p>Booking opens a choice of scheduling methods. The Cal.com calendar loads only when you choose it. No assessment content or page query parameters are forwarded. Do not send secrets or confidential customer data.</p></details>
          </div></div>
        </section>
      </> : <>
        <ProductExperience />
        <EvidenceStory />
        <section className="pilot-reality-section pilot-width" aria-labelledby="pilot-reality-title"><span className="pilot-eyebrow">Confidence includes the unknowns.</span>
          <h2 id="pilot-reality-title">“Not yet.”<br /><span>Can be the right answer.</span></h2>
          <p>Unverified access. An unmeasured baseline. An owner who has not agreed.<br className="pilot-desktop-break" /> See the gaps before they become commitments.</p>
          <Link className="pilot-text-action" to="/resources/trust">Explore the trust boundaries <span aria-hidden="true">↗</span></Link>
        </section>
      </>}
      <section className="pilot-closing" aria-labelledby="pilot-closing-title"><div className="pilot-width">
        <span className="pilot-eyebrow">{readiness ? "A better starting point." : "The next move is yours."}</span>
        <h2 id="pilot-closing-title">{readiness ? <>Bring one question.<br />Leave with direction.</> : <>Less speculation.<br />More forward.</>}</h2>
        <p>{readiness ? "Start a conversation about the work—not a commitment to a technology." : "Explore a fictional example, or bring a real workflow into your private workspace."}</p>
        <div className="pilot-hero-actions">{readiness ? <ConsultationLink onBook={onBook} className="pilot-button" /> : <><button type="button" className="pilot-button" disabled={disabled} onClick={onDiscover}>Start discovery <span aria-hidden="true">↗</span></button><button type="button" className="pilot-text-action" disabled={disabled} onClick={onStart}>Assess my workflow <span aria-hidden="true">↗</span></button></>}</div>
      </div></section>
    </main>
    <footer className="pilot-footer pilot-width"><div><Link to={HOME} className="pilot-brand"><BrandMark />Kaisersol</Link><p>Evidence-led. Human-reviewed.</p></div>
      <nav aria-label="Pilot footer"><Link to={readiness ? HOME : READINESS}>{readiness ? "The platform" : "Separately scoped advisory"}</Link><Link to="/resources/example-assessment">Full example</Link><Link to="/resources/trust">Trust & limitations</Link><Link to={readiness ? "/consulting/readiness" : "/"}>Compare current design</Link></nav>
      <p className="pilot-disclosure">Working design pilot. Fictional demonstration data. No live analysis or workflow creation through the previews.</p>
    </footer>
  </div>;
}
