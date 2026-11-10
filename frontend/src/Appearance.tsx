import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { isAppearance, readAppearance, resolvedTheme, STORAGE_KEY, updateDocumentAppearance, type Appearance } from "./appearanceState";
export type { Appearance } from "./appearanceState";

const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const AppearanceContext = createContext<{
  preference: Appearance; theme: "dark" | "light"; choose: (value: Appearance) => void;
} | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(readAppearance);
  const [systemDark, setSystemDark] = useState(() => typeof window !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches);
  const theme = resolvedTheme(state.preference, systemDark);
  useBrowserLayoutEffect(() => {
    updateDocumentAppearance(state.preference, theme);
  }, [theme, state.preference]);
  useBrowserLayoutEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const changed = () => setSystemDark(media.matches);
    media.addEventListener("change", changed);
    changed();
    const stored = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      if (event.newValue === null) setState({ preference: "dark", error: "" });
      else if (isAppearance(event.newValue)) setState({ preference: event.newValue, error: "" });
      else {
        console.error("Another tab saved an invalid appearance preference.");
        setState(current => ({ ...current, error: "Another tab saved an invalid appearance preference. Choose an appearance to replace it." }));
      }
    };
    window.addEventListener("storage", stored);
    const saved = readAppearance();
    setState(current => current.preference === saved.preference && current.error === saved.error ? current : saved);
    return () => { media.removeEventListener("change", changed); window.removeEventListener("storage", stored); };
  }, []);
  function choose(preference: Appearance) {
    let error = "";
    try { localStorage.setItem(STORAGE_KEY, preference); }
    catch (cause) {
      console.error("Could not save the appearance preference.", cause);
      error = "Appearance changed for this tab, but could not be saved in this browser. Check your browser storage settings.";
    }
    setState({ preference, error });
  }
  return <AppearanceContext.Provider value={{ preference: state.preference, theme, choose }}>
    {children}
    {state.error && <div role="alert" className="appearance-notice">
      <p>{state.error}</p>
      <button type="button" onClick={() => choose(state.preference)}>Save appearance again</button>
      <button type="button" onClick={() => setState(current => ({ ...current, error: "" }))} aria-label="Dismiss appearance notice">Dismiss</button>
    </div>}
  </AppearanceContext.Provider>;
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("Appearance controls require the appearance provider.");
  return value;
}

export function AppearanceControl() {
  const { preference, theme, choose } = useAppearance();
  return <label className="appearance-control">
    <span className="sr-only">Appearance</span>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      {preference === "system" ? <path d="M3 4h18v13H3zM8 21h8m-4-4v4" />
        : theme === "dark" ? <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />
          : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>}
    </svg>
    <select value={preference} title={`Appearance: ${preference}`} onChange={event => {
      if (!isAppearance(event.target.value)) throw new Error("Unknown appearance selection.");
      choose(event.target.value);
    }}>
      <option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option>
    </select>
  </label>;
}
