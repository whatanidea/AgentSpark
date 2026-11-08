import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const IDLE_MS = 5 * 60_000;
const WARNING_MS = 60_000;
type Warning = { remainingSeconds: number; paused: "draft" | "operation" | null };

export default function useInactivitySignOut(identity: string, unsaved: boolean, busy: boolean, onSignOut: () => void) {
  const [warning, setWarning] = useState<Warning | null>(null);
  const protection = useRef({ unsaved, busy, onSignOut });
  const checkNow = useRef<(() => void) | null>(null);
  const stay = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    protection.current = { unsaved, busy, onSignOut };
    checkNow.current?.();
  }, [unsaved, busy, onSignOut]);

  useEffect(() => {
    setWarning(null);
    if (!identity) return;
    let lastActivity = Date.now();
    let pointer: { x: number; y: number } | null = null;
    let finished = false;
    let timer: ReturnType<typeof setTimeout>;
    function check() {
      clearTimeout(timer);
      if (finished) return;
      const remaining = IDLE_MS - Math.max(0, Date.now() - lastActivity);
      const { unsaved, busy, onSignOut } = protection.current;
      if (remaining <= 0 && !unsaved && !busy) {
        finished = true;
        setWarning(null);
        onSignOut();
        return;
      }
      setWarning(remaining > WARNING_MS ? null : {
        remainingSeconds: Math.max(0, Math.ceil(remaining / 1000)),
        paused: remaining <= 0 ? unsaved ? "draft" : "operation" : null,
      });
      timer = setTimeout(check, remaining > WARNING_MS ? remaining - WARNING_MS
        : remaining > 0 ? Math.min(1000, remaining) : 1000);
    }
    function resume() {
      // A late event after a suspended tab wakes must not revive an expired session.
      if (Date.now() - lastActivity >= IDLE_MS && !protection.current.unsaved && !protection.current.busy) {
        check();
        return;
      }
      lastActivity = Date.now();
      check();
    }
    function activity(event: Event) {
      if (!event.isTrusted) return;
      // Keep warning actions mounted until their click handler renews or ends access.
      if ((event.type.startsWith("pointer") || event.type === "touchstart")
        && event.target instanceof Element
        && event.target.closest('[role="alert"][aria-label="Inactivity warning"]')) return;
      if (event instanceof PointerEvent) {
        const moved = !pointer || pointer.x !== event.clientX || pointer.y !== event.clientY;
        pointer = { x: event.clientX, y: event.clientY };
        // Layout changes can emit a trusted pointermove without the user moving.
        if (event.type === "pointermove" && !moved) return;
      }
      resume();
    }
    const events = ["pointerdown", "pointermove", "keydown", "input", "wheel", "touchstart"] as const;
    for (const event of events) window.addEventListener(event, activity, { passive: true });
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", check);
    checkNow.current = check;
    stay.current = resume;
    check();
    return () => {
      finished = true;
      clearTimeout(timer);
      checkNow.current = null;
      stay.current = null;
      for (const event of events) window.removeEventListener(event, activity);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [identity]);

  return { warning, staySignedIn: useCallback(() => stay.current?.(), []) };
}
