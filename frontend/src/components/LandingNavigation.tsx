import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { PUBLIC_PAGES } from "./publicPages";

const menus = {
  Platform: PUBLIC_PAGES.filter(page => page.section === "Platform"),
  Solutions: PUBLIC_PAGES.filter(page => page.section === "Solutions"),
  Resources: PUBLIC_PAGES.filter(page => page.section === "Resources"),
} as const;
type Menu = keyof typeof menus;

export default function LandingNavigation({ disabled, signedIn, onWorkspace, onDiscover }: {
  disabled: boolean; signedIn: boolean; onWorkspace: () => void; onDiscover: () => void;
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
        <NavLink to="/about" onClick={close}>About</NavLink>
        {(Object.keys(menus) as Menu[]).map(name => <div className="marketing-menu" key={name}>
          <button ref={element => { triggers.current[name] = element; }} aria-expanded={open === name} data-active={pathname.startsWith(`/${name.toLowerCase()}/`)}
            aria-controls={`marketing-${name.toLowerCase()}`} onClick={() => setOpen(current => current === name ? null : name)}>
            {name}<svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="m3 4 3 3 3-3" fill="none" stroke="currentColor" /></svg>
          </button>
          <div id={`marketing-${name.toLowerCase()}`} className="marketing-dropdown" hidden={open !== name}>
            <p className="landing-eyebrow">{name === "Platform" ? "From discovery to decision" : name === "Solutions" ? "Built around your work" : "Explore with clarity"}</p>
            <ul>{menus[name].map(page => <li key={page.path}>
              <NavLink to={page.path} onClick={close}><strong>{page.name}<span aria-hidden="true">↗</span></strong><small>{page.summary}</small></NavLink>
            </li>)}</ul>
          </div>
        </div>)}
      </nav>
      <div className="marketing-header-actions">
        <button className="marketing-workspace" disabled={disabled} onClick={() => { close(); onWorkspace(); }}>{signedIn ? "Workspace" : "Sign in"}</button>
        <button className="landing-button landing-button-primary marketing-header-cta" disabled={disabled}
          onClick={() => { close(); onDiscover(); }}>Start discovery <span aria-hidden="true">↗</span></button>
        <button ref={toggle} className="marketing-mobile-toggle" aria-label={mobile ? "Close navigation" : "Open navigation"}
          aria-expanded={mobile} aria-controls="marketing-navigation" onClick={() => { setMobile(current => !current); setOpen(null); }}>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24"><path d={mobile ? "m6 6 12 12M6 18 18 6" : "M4 7h16M4 12h16M4 17h16"}
            fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
      </div>
    </div>
  </header>;
}
