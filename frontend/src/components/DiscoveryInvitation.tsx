import { useEffect, useRef, useState } from "react";

const stages = [
  { label: "Business question", path: "M4 4h16v12H9l-5 4V4Zm4 4h8M8 12h5" },
  { label: "Team insights", path: "M15 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-5a3 3 0 0 1 0 6m0 3a4 4 0 0 1 4 4v2" },
  { label: "Evidence", path: "M6 3h9l4 4v14H6V3Zm8 0v5h5M9 12h7M9 16h5" },
  { label: "Clear next step", path: "m4 7 2 2 3-4m-5 12 2 2 3-4M12 7h8M12 17h8" },
];

export default function DiscoveryInvitation({ disabled, onDiscover }: {
  disabled: boolean; onDiscover: () => void;
}) {
  const section = useRef<HTMLElement>(null);
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setRun(value => value + 1);
        observer.disconnect();
      }
    }, { threshold: 0.3 });
    if (section.current) observer.observe(section.current);
    return () => observer.disconnect();
  }, []);

  return <section ref={section} className="landing-final landing-container discovery-invitation" aria-labelledby="final-title">
    <div className="invitation-copy">
      <p className="landing-eyebrow">Start small. Decide with clarity.</p>
      <h2 id="final-title">Start with a business question.<br />Leave with a clearer next step.</h2>
      <p>No autonomous business actions. No deployment implied.<br />Just a clearer, evidence-led next step.</p>
      <button className="landing-button landing-button-primary" disabled={disabled} onClick={onDiscover}>
        Start discovery <span aria-hidden="true">↗</span>
      </button>
    </div>
    <figure className="invitation-journey" aria-label="From business question to a reviewed next step">
      <div key={run} className="invitation-art" data-animated={run > 0}>
        <div className="invitation-background" aria-hidden="true">
          <span className="invitation-glow invitation-glow-first" />
          <span className="invitation-glow invitation-glow-second" />
          <svg viewBox="0 0 600 240" fill="none" focusable="false">
            <path d="M30 180 110 70 240 120 370 40 470 140 570 80" />
            {[ [30, 180], [110, 70], [240, 120], [370, 40], [470, 140], [570, 80] ].map(([x, y]) =>
              <circle key={x} cx={x} cy={y} r="4" />)}
          </svg>
        </div>
        <ol className="invitation-stages" aria-label="Illustrative discovery journey">
          {stages.map(stage => <li key={stage.label}>
            <svg aria-hidden="true" focusable="false" width="28" height="28" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d={stage.path} />
            </svg>
            <span>{stage.label}</span>
          </li>)}
        </ol>
      </div>
      <figcaption>Illustrative journey. People review the next step.</figcaption>
      <button className="invitation-replay" onClick={() => setRun(value => value + 1)}>
        <span aria-hidden="true">↻</span> Replay illustration
      </button>
    </figure>
  </section>;
}
