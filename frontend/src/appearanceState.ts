export type Appearance = "dark" | "light" | "system";
export const STORAGE_KEY = "agentspark.appearance.v1";

export function isAppearance(value: string | null): value is Appearance {
  return value === "dark" || value === "light" || value === "system";
}

export function readAppearance(): { preference: Appearance; error: string } {
  if (typeof window === "undefined") return { preference: "dark", error: "" };
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) return { preference: "dark", error: "" };
    if (isAppearance(saved)) return { preference: saved, error: "" };
    console.error("The saved appearance preference is invalid.");
    return { preference: "dark", error: "Your saved appearance preference is invalid. Dark is shown; choose an appearance to replace it." };
  } catch (error) {
    console.error("Could not read the appearance preference.", error);
    return { preference: "dark", error: "Appearance storage is unavailable. Changes will apply to this tab, but may not survive a reload." };
  }
}

export function resolvedTheme(preference: Appearance, systemDark: boolean) {
  return preference === "system" ? systemDark ? "dark" : "light" : preference;
}

export function updateDocumentAppearance(preference: Appearance, theme: "dark" | "light") {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.appearance = preference;
  document.documentElement.style.colorScheme = theme;
}

export function initializeAppearance() {
  const { preference } = readAppearance();
  const systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
  updateDocumentAppearance(preference, resolvedTheme(preference, systemDark));
}
