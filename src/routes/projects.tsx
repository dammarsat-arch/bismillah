import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2, Lock, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { createRepo } from "@/lib/github.functions";
import { timeAgo, useGithubOverview } from "@/lib/github-hooks";
import { usePushWizard } from "@/components/PushWizard";

export const Route = createFileRoute("/projects")({
  validateSearch: (s) => z.object({ q: z.string().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Projects — Project Push" },
      { name: "description", content: "Browse, search and create your GitHub repositories, then push to any of them." },
      { property: "og:title", content: "Projects — Project Push" },
      { property: "og:description", content: "All your GitHub repositories in one friendly list." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Projects,
});

function Projects() {
  const { q: initial } = Route.useSearch();
  const overview = useGithubOverview();
  const wizard = usePushWizard();
  const qc = useQueryClient();
  const createFn = useServerFn(createRepo);
  const [q, setQ] = useState(initial ?? "");
  const [filter, setFilter] = useState<"all" | "public" | "private">("all");
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [priv, setPriv] = useState(true);
  const [busy, setBusy] = useState(false);

  const repos = (overview.data?.repos ?? []).filter(
    (r) =>
      r.fullName.toLowerCase().includes(q.toLowerCase()) &&
      (filter === "all" || (filter === "private") === r.private),
  );

  const create = async () => {
    setBusy(true);
    try {
      const r = await createFn({ data: { name: name.trim(), description: desc, private: priv } });
      toast.success(`Created ${r.fullName}`);
      setShowNew(false);
      setName("");
      setDesc("");
      await qc.invalidateQueries({ queryKey: ["gh", "overview"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create repo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Projects</h1>
        <button onClick={() => setShowNew((v) => !v)} className="btn-primary"><Plus className="h-4 w-4" /> New repo</button>
      </div>
      {showNew && (
        <div className="card-soft space-y-3 bg-card p-5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Repository name" className="field" />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)" className="field" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Private</label>
          <button disabled={!name.trim() || busy} onClick={create} className="btn-primary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create repository"}</button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter repositories…" className="field max-w-xs" />
        {(["all", "public", "private"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${filter === f ? "bg-ink text-ink-foreground" : "bg-card"}`}>{f}</button>
        ))}
      </div>
      {overview.isLoading && <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {repos.map((r) => (
          <div key={r.fullName} className="card-soft flex flex-col bg-card p-5">
            <p className="flex items-center gap-1.5 truncate font-display font-bold">{r.name} {r.private && <Lock className="h-3.5 w-3.5" />}</p>
            <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">{r.description || "No description"}</p>
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              {r.language || "—"} · <Star className="h-3 w-3" /> {r.stars} · {timeAgo(r.pushedAt)}
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => wizard.open(r.fullName)} className="btn-primary flex-1 px-3 py-2 text-xs">Push here</button>
              <a href={r.url} target="_blank" rel="noreferrer" className="btn-ghost px-3 py-2 text-xs" aria-label="Open on GitHub"><ExternalLink className="h-4 w-4" /></a>
            </div>
          </div>
        ))}
      </div>
      {!overview.isLoading && !repos.length && <p className="text-muted-foreground">No repositories match.</p>}
    </div>
  );
}
