import type { PublicPage } from "./components/publicPages";

export function pageMetadata(page?: PublicPage, workspace = false) {
  const title = workspace ? "Workspace | AgentSpark" : page?.path === "/"
    ? "AgentSpark | Clarity before commitment" : `${page?.name ?? "Page not found"} | AgentSpark`;
  const description = workspace ? "Sign in to your private AgentSpark workspace." : page?.path === "/"
    ? "The enterprise AI decision workspace. Connect evidence, compare alternatives and review a practical next step before committing to AI."
    : page?.summary ?? "This AgentSpark page could not be found.";
  return {
    title,
    canonical: !workspace && page ? page.path : null,
    meta: {
      description,
      robots: !workspace && page ? "index,follow" : "noindex,nofollow",
      "og:type": "website",
      "og:site_name": "AgentSpark",
      "og:title": title,
      "og:description": description,
      "twitter:card": "summary",
      "twitter:title": title,
      "twitter:description": description,
    },
  };
}

export function applyPageMetadata(metadata: ReturnType<typeof pageMetadata>) {
  document.title = metadata.title;
  for (const [key, content] of Object.entries(metadata.meta)) {
    const attribute = key.startsWith("og:") ? "property" : "name";
    let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
    if (!element) {
      element = document.createElement("meta");
      element.setAttribute(attribute, key);
      document.head.append(element);
    }
    element.content = content;
  }
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (metadata.canonical) {
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.append(canonical);
    }
    canonical.setAttribute("href", metadata.canonical);
  } else canonical?.remove();
}
