import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Loader2 } from "lucide-react";
import { timeAgo, usePushHistory } from "@/lib/github-hooks";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History — Project Push" },
      { name: "description", content: "Every push you've made with Project Push, with links to the commits." },
      { property: "og:title", content: "History — Project Push" },
      { property: "og:description", content: "Your push history in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const h = usePushHistory();
  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold">History</h1>
      {h.isLoading && <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />}
      {h.data && !h.data.length && <p className="text-muted-foreground">No pushes yet — your pushes will appear here.</p>}
      <div className="space-y-3">
        {h.data?.map((r) => (
          <div key={r.id} className="card-soft flex items-start gap-4 bg-card p-4">
            <span className={`mt-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.status === "success" ? "bg-mint text-mint-foreground" : "bg-destructive text-destructive-foreground"}`}>
              {r.status === "success" ? "Pushed" : "Failed"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{r.message}</p>
              <p className="text-sm text-muted-foreground">{r.repo} · {r.branch} · {r.file_count} files · {timeAgo(r.created_at)}</p>
              {r.error && <p className="mt-1 truncate text-xs text-destructive">{r.error}</p>}
            </div>
            {r.commit_url && (
              <a href={r.commit_url} target="_blank" rel="noreferrer" className="btn-ghost px-3 py-1.5 text-xs">Commit <ExternalLink className="h-3.5 w-3.5" /></a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
