export type IconName = "home" | "finance" | "support" | "claims" | "payroll" | "portfolio" | "chat"
  | "discovery" | "intake" | "diagnose" | "evidence" | "readiness" | "analyze" | "blueprint" | "integrations" | "workspaces";

const paths: Record<IconName, string[]> = {
  discovery: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", "m16 8-2.5 5.5L8 16l2.5-5.5Z"],
  intake: ["M8 5H5v16h14V5h-3", "M9 3h6v4H9z", "M8 12h8m-8 4h5"],
  diagnose: ["M3 4h14v10H8l-5 4Z", "M20 9h1v12l-4-3h-5"],
  evidence: ["M7 17 16 8a3 3 0 0 0-4-4L4 12a5 5 0 0 0 7 7l9-9", "m8 13 5-5"],
  readiness: ["m3 7 2 2 4-5m3 3h9M3 16l2 2 4-5m3 3h9"],
  analyze: ["M4 3v17h17M8 15v-3m5 3V7m5 8v-5"],
  blueprint: ["M9 3h6v5H9zM3 16h6v5H3zm12 0h6v5h-6z", "M12 8v4M6 16v-4h12v4"],
  integrations: ["m4 8 4-4 4 4-4 4zm8 8 4-4 4 4-4 4z", "m10 10 4 4"],
  workspaces: ["M3 5h8v6H3zm10 0h8v6h-8zM3 13h8v6H3zm10 0h8v6h-8z"],
  chat: ["M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0Z", "M7 9h10M7 13h7"],
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
