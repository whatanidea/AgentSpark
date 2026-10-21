export type IconName = "home" | "finance" | "support" | "claims" | "payroll" | "portfolio";

const paths: Record<IconName, string[]> = {
  home: ["m3 10 9-7 9 7", "M5 9v12h14V9", "M9 21v-8h6v8"],
  finance: ["M6 3h9l4 4v14H6V3Z", "M14 3v5h5", "M9 12h7M9 16h4"],
  support: ["M4 13v-1a8 8 0 0 1 16 0v1", "M4 12H2v6h4v-6H4Zm16 0h2v6h-4v-6h2Z", "M20 18v3h-7"],
  claims: ["m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z", "m8 12 3 3 5-6"],
  payroll: ["M5 3h14v18H5V3Z", "M8 7h8M8 11h1m3 0h1m3 0h.1M8 15h1m3 0h1m3 0h.1M8 18h1m3 0h4"],
  portfolio: ["M3 7h18v14H3V7Z", "M8 7V3h8v4", "M3 12h18M10 12v3h4v-3"],
};

export default function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" focusable="false" className={className} width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {paths[name].map(path => <path key={path} d={path} />)}
  </svg>;
}
