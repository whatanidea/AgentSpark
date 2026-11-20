import { useEffect, useState } from "react";

/** Deterministic paths also render in the prerendered document. */
export default function StudioRibbon({ variant = 0 }: { variant?: number }) {
  const [motion, setMotion] = useState(false);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: no-preference)");
    const sync = () => setMotion(preference.matches);
    sync();
    preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, []);
  return <svg className="studio-ribbon" viewBox="0 0 400 240" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path d="M0 80H400M0 160H400M100 0V240M200 0V240M300 0V240" stroke="currentColor" opacity=".16" strokeDasharray="2 6" fill="none"/>
    {Array.from({ length: 34 }, (_, i) => {
      const y = 25 + i * 5.5;
      const curve = (b: number) => [
        `M5 ${y} C100 ${y-47+b},135 ${245-i*4-b},${212+b} ${113+i*.45+b} S320 ${12+i*4-b},395 ${75+i*2.7}`,
        `M5 ${y} C85 ${y+b},105 ${38+i*2},${150+b} ${38+i*2+b} S215 ${203-i*2-b},263 ${203-i*2-b} S330 ${y+b},395 ${y}`,
        `M5 ${110+i*.65} C95 ${113+i-b},135 ${112+i+b},${182+b} ${103+i*.8+b} S270 ${12+i*6-b},395 ${10+i*6.4}`,
      ][variant];
      return <path key={`${variant}-${i}`} d={curve(0)} fill="none" stroke="currentColor">
        {motion && <animate attributeName="d" values={[curve(-24),curve(24),curve(-24)].join(";")} dur="5s" begin={`${-i*.026}s`} calcMode="spline" keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1" repeatCount="indefinite"/>}
      </path>;
    })}
  </svg>;
}
