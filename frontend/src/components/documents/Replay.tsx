import { useEffect, useRef, useState } from "react";

function animate(figure: HTMLElement) {
  figure.classList.remove("playing");
  void figure.offsetWidth;
  figure.classList.add("playing");
}
export function Replay() {
  const button = useRef<HTMLButtonElement>(null);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const figure = button.current?.closest("figure");
    if (!figure) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setEnabled(!media.matches);
    sync();
    media.addEventListener("change", sync);
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !media.matches) { animate(figure); observer.disconnect(); }
    });
    observer.observe(figure);
    return () => { observer.disconnect(); media.removeEventListener("change", sync); };
  }, []);
  return <button ref={button} hidden={!enabled} onClick={e => {
    const figure = e.currentTarget.closest("figure");
    if (figure) animate(figure);
  }}>Replay walkthrough</button>;
}
