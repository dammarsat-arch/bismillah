import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, GitCommitHorizontal, Loader2, Lock, Rocket } from "lucide-react";
import { timeAgo, useGithubOverview, useGithubStatus } from "@/lib/github-hooks";
import { usePushWizard } from "@/components/PushWizard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Project Push — Push to GitHub without the terminal" },
      { name: "description", content: "Sign in with GitHub, pick a folder and push it to your repo in a few friendly clicks." },
      { property: "og:title", content: "Project Push — Push to GitHub without the terminal" },
      { property: "og:description", content: "Pick a folder, choose a repo, write a commit, push. Git made friendly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const status = useGithubStatus();
  const overview = useGithubOverview();
  const wizard = usePushWizard();
  const user = status.data?.connected ? status.data.user : null;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold md:text-3xl">Hi, {user?.name?.split(" ")[0]} 👋</h1>
      <section className="card-soft relative overflow-hidden bg-tangerine p-6 text-tangerine-foreground md:p-8">
        <h2 className="font-display text-2xl font-bold md:text-3xl">Your project is ready to push 🚀</h2>
        <p className="mt-2 max-w-md opacity-80">Pick a folder from your computer and send it to any of your repos.</p>
        <button onClick={() => wizard.open()} className="btn-primary mt-5 bg-ink text-ink-foreground">
          <Rocket className="h-4 w-4" /> Push your project
        </button>
      </section>

      {overview.isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
      ) : overview.isError ? (
        <p className="text-sm text-destructive">{(overview.error as Error).message}</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card-soft bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display font-bold">Recent repositories</h3>
              <Link to="/projects" className="text-sm font-semibold text-primary">See all</Link>
            </div>
            {overview.data?.repos.slice(0, 5).map((r) => (
              <div key={r.fullName} className="flex items-center justify-between gap-2 rounded-xl px-2 py-2 hover:bg-muted">
                <div className="min-w-0">
                  <p className="flex items-center gap-1 truncate text-sm font-semibold">{r.name} {r.private && <Lock className="h-3 w-3" />}</p>
                  <p className="text-xs text-muted-foreground">{r.language || "—"} · {timeAgo(r.pushedAt)}</p>
                </div>
                <button onClick={() => wizard.open(r.fullName)} className="btn-ghost px-3 py-1.5 text-xs">Push</button>
              </div>
            ))}
            {!overview.data?.repos.length && <p className="text-sm text-muted-foreground">No repositories yet.</p>}
          </section>
          <section className="card-soft bg-secondary p-5 text-secondary-foreground">
            <h3 className="mb-3 font-display font-bold">Recent commits</h3>
            {overview.data?.recent.map((c) => (
              <a key={c.sha} href={c.url} target="_blank" rel="noreferrer" className="flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-card/60">
                <GitCommitHorizontal className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.message}</p>
                  <p className="text-xs opacity-70">{c.repo} · {timeAgo(c.date)}</p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 opacity-50" />
              </a>
            ))}
            {!overview.data?.recent.length && <p className="text-sm opacity-70">No commits yet.</p>}
          </section>
        </div>
      )}
    </div>
  );
}
