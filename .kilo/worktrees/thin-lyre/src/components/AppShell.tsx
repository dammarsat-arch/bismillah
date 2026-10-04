import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Bell, FolderGit2, Github, History, Home, Loader2, Rocket, Search, Settings } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/lib/session";
import { timeAgo, useConnectGithub, useGithubOverview, useGithubStatus, usePushHistory } from "@/lib/github-hooks";
import { PushWizardProvider } from "@/components/PushWizard";

const nav = [
  { to: "/", label: "Home", icon: Home },
  { to: "/projects", label: "Projects", icon: FolderGit2 },
  { to: "/history", label: "History", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const session = useSession();
  const status = useGithubStatus();

  if (path.startsWith("/oauth")) return <>{children}</>;
  if (!session.ready || (status.isLoading && !status.data)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (session.error || status.isError) {
    return <Welcome error={session.error ?? (status.error as Error)?.message} />;
  }
  if (!status.data?.connected) return <Welcome reconnect={status.data?.reconnectRequired} />;

  return (
    <PushWizardProvider>
      <div className="flex min-h-screen bg-background font-body text-foreground">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-ink p-5 text-ink-foreground md:flex">
          <div className="mb-8 flex items-center gap-2 font-display text-lg font-bold">
            <Rocket className="h-5 w-5 text-tangerine" /> Project Push
          </div>
          <nav className="space-y-1">
            {nav.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/" }}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium opacity-70 hover:opacity-100"
                activeProps={{ className: "bg-ink-foreground/10 !opacity-100" }}
              >
                <Icon className="h-4 w-4" /> {label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
          <TopBar />
          <main className="flex-1 px-4 pb-8 md:px-8">{children}</main>
        </div>
        <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around bg-ink py-2 text-ink-foreground md:hidden">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] opacity-60"
              activeProps={{ className: "!opacity-100 text-tangerine" }}
            >
              <Icon className="h-5 w-5" /> {label}
            </Link>
          ))}
        </nav>
      </div>
    </PushWizardProvider>
  );
}

function TopBar() {
  const status = useGithubStatus();
  const overview = useGithubOverview();
  const history = usePushHistory(5);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [bell, setBell] = useState(false);
  const user = status.data?.connected ? status.data.user : null;
  const matches = q.trim()
    ? (overview.data?.repos ?? []).filter((r) => r.fullName.toLowerCase().includes(q.toLowerCase())).slice(0, 6)
    : [];

  return (
    <header className="flex items-center gap-3 px-4 py-4 md:px-8">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              navigate({ to: "/projects", search: { q } });
              setQ("");
            }
          }}
          placeholder="Search repositories…"
          className="w-full rounded-full border border-border bg-card py-2.5 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {matches.length > 0 && (
          <div className="absolute z-30 mt-2 w-full rounded-2xl bg-card p-2 shadow-xl">
            {matches.map((r) => (
              <a key={r.fullName} href={r.url} target="_blank" rel="noreferrer" onClick={() => setQ("")} className="block rounded-xl px-3 py-2 text-sm hover:bg-muted">
                {r.fullName}
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="relative">
        <button onClick={() => setBell((b) => !b)} className="relative rounded-full bg-card p-2.5 hover:bg-muted" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {history.data?.some((h) => h.status !== "success") && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />}
        </button>
        {bell && (
          <div className="absolute right-0 z-30 mt-2 w-72 rounded-2xl bg-card p-3 shadow-xl">
            <p className="mb-2 px-1 text-sm font-semibold">Recent pushes</p>
            {!history.data?.length && <p className="px-1 text-sm text-muted-foreground">No pushes yet.</p>}
            {history.data?.map((h) => (
              <div key={h.id} className="rounded-xl px-2 py-2 text-sm hover:bg-muted">
                <p className="truncate font-medium">{h.status === "success" ? "✅" : "❌"} {h.message}</p>
                <p className="text-xs text-muted-foreground">{h.repo} · {timeAgo(h.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      {user && <img src={user.avatar} alt={user.login} className="h-10 w-10 rounded-full" />}
    </header>
  );
}

function Welcome({ reconnect, error }: { reconnect?: boolean | undefined; error?: string | undefined }) {
  const connect = useConnectGithub();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await connect();
      toast.success(reconnect ? "Reconnected to GitHub" : "Signed in with GitHub");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "GitHub sign-in failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 font-body">
      <div className="card-soft w-full max-w-md bg-card p-8 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-tangerine">
          <Rocket className="h-8 w-8 text-tangerine-foreground" />
        </div>
        <h1 className="font-display text-2xl font-bold">Project Push</h1>
        <p className="mt-2 text-muted-foreground">
          {reconnect ? "Your GitHub access needs to be renewed." : "Push your projects to GitHub without the terminal."}
        </p>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <button onClick={go} disabled={busy} className="btn-primary mt-6 w-full bg-ink text-ink-foreground">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
          {reconnect ? "Reconnect GitHub" : "Sign in with GitHub"}
        </button>
      </div>
    </div>
  );
}
