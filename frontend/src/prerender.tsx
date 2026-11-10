import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { AppearanceProvider } from "./Appearance";
import Landing from "./components/Landing";
import { PUBLIC_PAGES } from "./components/publicPages";
import { pageMetadata } from "./publicMetadata";

function requiresBrowser() {
  throw new Error("Interactive public actions require the browser application.");
}

export function renderMetadata(metadata: ReturnType<typeof pageMetadata>) {
  return renderToStaticMarkup(<>
    <title>{metadata.title}</title>
    {Object.entries(metadata.meta).map(([key, content]) => <meta key={key}
      {...(key.startsWith("og:") ? { property: key } : { name: key })} content={content} />)}
    {metadata.canonical && <link rel="canonical" href={metadata.canonical} />}
  </>);
}

export const workspaceHead = renderMetadata(pageMetadata(undefined, true));

export function renderPublicPages() {
  return PUBLIC_PAGES.map(page => ({
    path: page.path,
    head: renderMetadata(pageMetadata(page)),
    body: renderToStaticMarkup(<StaticRouter location={page.path}>
      <AppearanceProvider>
        <Landing onStart={requiresBrowser} onWorkspace={requiresBrowser} onDiscover={requiresBrowser}
          disabled hasSession={false} signedIn={false} message="" />
      </AppearanceProvider>
    </StaticRouter>),
  }));
}
