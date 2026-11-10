import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { PUBLIC_PAGES } from "./publicPages";
import { MarketingIcon, publicVisual } from "./MarketingVisuals";
import { AppearanceControl } from "../Appearance";
import { ConsultationLink } from "./ConsultationBooking";

const menus = {
  Consulting: PUBLIC_PAGES.filter(page => ["/consulting/readiness", "/consulting/workflow-pilot", "/consulting/adoption"].includes(page.path)),
  Platform: PUBLIC_PAGES.filter(page => ["/platform/discovery", "/platform/assessment", "/platform/architecture"].includes(page.path)),
  Solutions: PUBLIC_PAGES.filter(page => ["/solutions/transformation", "/solutions/operations"].includes(page.path)),
  Resources: PUBLIC_PAGES.filter(page => ["/resources/how-it-works", "/resources/example-assessment", "/resources/trust"].includes(page.path)),
} as const;
type Menu = keyof typeof menus;
const menuCopy: Record<string, readonly [string, string]> = {
  "/consulting/readiness": ["Find a starting point", "Choose a useful first AI project."],
  "/consulting/workflow-pilot": ["Test one improvement", "Try a focused project before scaling."],
  "/consulting/adoption": ["Support your team", "Build confidence and track progress."],
  "/platform/discovery": ["Understand the work", "Gather input from your team."],
  "/platform/assessment": ["Review an opportunity", "Weigh benefits, gaps and next steps."],
  "/platform/architecture": ["See the proposed plan", "Review how an improvement could work."],
  "/solutions/transformation": ["Business improvement", "Choose where to focus your effort."],
  "/solutions/operations": ["Finance & operations", "Explore repetitive checks and handoffs."],
  "/resources/how-it-works": ["How it works", "Follow a business question through review."],
  "/resources/example-assessment": ["Example assessment", "Explore a sample without signing in."],
  "/resources/trust": ["Trust & limitations", "Understand access, data and product limits."],
};

export default function LandingNavigation({ disabled, signedIn, onWorkspace, onBook }: {
  disabled: boolean; signedIn: boolean; onWorkspace: () => void; onBook: () => void;
}) {
  const [open, setOpen] = useState<Menu | null>(null);
  const [mobile, setMobile] = useState(false);
  const { pathname } = useLocation();
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const triggers = useRef<Partial<Record<Menu, HTMLButtonElement | null>>>({});
  useEffect(() => { setOpen(null); setMobile(false); }, [pathname]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !header.current?.contains(event.target)) {
        setOpen(null); setMobile(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  function close() { setOpen(null); setMobile(false); }
  return <header ref={header} className="marketing-header" onBlur={event => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) close();
  }} onKeyDown={event => {
    if (event.key === "Escape") {
      if (open) { triggers.current[open]?.focus(); setOpen(null); }
      else if (mobile) { setMobile(false); toggle.current?.focus(); }
    }
  }}>
    <div className="landing-container marketing-header-inner">
      <Link className="landing-brand" to="/" aria-label="AgentSpark overview" onClick={close}>
        <span className="landing-brand-mark" aria-hidden="true">✦</span> AgentSpark
      </Link>
      <nav id="marketing-navigation" className="marketing-navigation" data-mobile-open={mobile} aria-label="Product navigation">
        {(Object.keys(menus) as Menu[]).map(name => <div className="marketing-menu" key={name}>
          <button ref={element => { triggers.current[name] = element; }} aria-expanded={open === name} data-active={pathname === `/${name.toLowerCase()}` || pathname.startsWith(`/${name.toLowerCase()}/`)}
            aria-controls={`marketing-${name.toLowerCase()}`} onClick={() => setOpen(current => current === name ? null : name)}>
            {name}<svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="m3 4 3 3 3-3" fill="none" stroke="currentColor" /></svg>
          </button>
          <div id={`marketing-${name.toLowerCase()}`} className="marketing-dropdown" hidden={open !== name}>
            <div className="premium-menu-feature" aria-hidden="true">
              <span className="premium-category-label">{name === "Consulting" ? "STRATEGY THROUGH ADOPTION" : name === "Platform" ? "FROM DISCOVERY TO DECISION" : name === "Solutions" ? "BUILT AROUND YOUR WORK" : "EXPLORE WITH CLARITY"}</span>
              <strong>{name === "Consulting" ? "Build the capability. Not just the pilot." : name === "Platform" ? "Align. Assess. Decide." : name === "Solutions" ? "The outcome comes first." : "Prepare a better conversation."}</strong>
              <div className="premium-menu-map"><MarketingIcon name="process" /><span /><MarketingIcon name="evidence" /><span /><MarketingIcon name="decision" /></div>
              <small>Evidence-led. Human-reviewed.</small>
            </div>
            <div className="premium-menu-links"><p className="landing-eyebrow">{name === "Consulting" ? "Practical support for your business" : name === "Platform" ? "Understand / review / decide" : name === "Solutions" ? "Start with a business problem" : "Examples & guidance"}</p>
            <ul>{menus[name].map(page => <li key={page.path}>
              <NavLink to={page.path} onClick={close}><span className="premium-menu-icon"><MarketingIcon name={publicVisual(page).icon} /></span>
                <div><strong>{menuCopy[page.path][0]}<span aria-hidden="true">→</span></strong><small>{menuCopy[page.path][1]}</small></div></NavLink>
            </li>)}</ul>
            <NavLink className="public-menu-overview" to={`/${name.toLowerCase()}`} onClick={close}>
              All {name.toLowerCase()} <span aria-hidden="true">→</span>
            </NavLink>
            </div>
          </div>
        </div>)}
      </nav>
      <div className="marketing-header-actions">
        <AppearanceControl />
        <button className="marketing-workspace" disabled={disabled} onClick={() => { close(); onWorkspace(); }}>{signedIn ? "Workspace" : "Sign in"}</button>
        <ConsultationLink className="landing-button landing-button-primary marketing-header-cta"
          onBook={() => { close(); onBook(); }} />
        <button ref={toggle} className="marketing-mobile-toggle" aria-label={mobile ? "Close navigation" : "Open navigation"}
          aria-expanded={mobile} aria-controls="marketing-navigation" onClick={() => { setMobile(current => !current); setOpen(null); }}>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24"><path d={mobile ? "m6 6 12 12M6 18 18 6" : "M4 7h16M4 12h16M4 17h16"}
            fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
      </div>
      <noscript><style>{".concept-site .marketing-navigation, .concept-site .marketing-mobile-toggle { display: none; }"}</style>
      <nav className="landing-container marketing-static-nav" aria-label="Public navigation without JavaScript">
        <Link to="/consulting">Consulting</Link><Link to="/platform">Platform</Link>
        <Link to="/solutions">Solutions</Link><Link to="/resources">Resources</Link>
      </nav></noscript>
    </div>
  </header>;
}
