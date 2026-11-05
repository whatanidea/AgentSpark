import { useEffect, useState } from "react";
import { api, type DirectoryPage, type HomeItem } from "../api";
import { Button, Card, Spinner } from "./ui";

const date = (value: string) => value ? new Date(value).toLocaleString() : "Time unavailable";

export default function HomeDiscovery({ onOpen, onBusyChange }: {
  onOpen: (id: string) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [page, setPage] = useState<DirectoryPage<HomeItem> | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  useEffect(() => {
    let alive = true;
    setBusy(true); setError(""); setPage(null);
    api.engagements().then(result => { if (alive) setPage(result); })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : "Could not load discovery engagements."); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [revision]);

  async function more() {
    if (!page?.next_cursor) return;
    setBusy(true); setError("");
    try {
      const next = await api.engagements(page.next_cursor);
      setPage({ ...next, items: [...page.items, ...next.items] });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load more discovery engagements."); }
    finally { setBusy(false); }
  }

  return <Card title="Discovery engagement library" description="Saved discovery work in this workspace. Open an engagement to continue its scope, evidence and findings.">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <p className="text-xs text-zinc-500">Personal records belong to your signed-in identity; team records follow active membership and team permissions.</p>
      <Button variant="ghost" disabled={busy} onClick={() => setRevision(value => value + 1)}>Refresh engagements</Button>
    </div>
    {error && <p role="alert" className="notice border-rose-200 bg-rose-50 text-rose-800 mb-4">{error} Use Refresh engagements to retry.</p>}
    {busy && <Spinner label="Loading your discovery engagements..." />}
    {!busy && page?.items.length === 0 && <div className="text-center py-12">
      <h2 className="text-base font-semibold text-zinc-800">No discovery engagements in this workspace</h2>
      <p className="text-sm text-zinc-500 mt-2">Use New discovery engagement to start, or select your team under Organizations &amp; teams.</p>
    </div>}
    {page && page.items.length > 0 && <>
      <p className="text-xs text-zinc-500 mb-3">Showing {page.items.length} saved engagements{page.next_cursor ? "; more available." : "."}</p>
      <div className="overflow-x-auto rounded border border-zinc-200">
        <table className="data-table">
          <thead><tr>{["Engagement", "Saved / updated", "Expires", "Actions"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{page.items.map(item => <tr key={item.session_id}>
            <td className="min-w-48 font-semibold">{item.title}</td>
            <td className="whitespace-nowrap">{date(item.updated_at)}</td>
            <td className="whitespace-nowrap">{date(item.expires_at)}</td>
            <td><Button variant="ghost" disabled={busy} aria-label={`Open discovery ${item.title}`}
              onClick={() => onOpen(item.session_id)}>Open engagement</Button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {page.next_cursor && <div className="mt-5"><Button variant="ghost" disabled={busy} onClick={() => void more()}>Load more engagements</Button></div>}
    </>}
    <p className="text-xs text-zinc-500 leading-relaxed mt-5">New engagements retain data for 30 days with explicit renewal. This is separate from the decision archive; expired engagements are not listed. Discovery notes and opportunities remain unverified.</p>
  </Card>;
}
