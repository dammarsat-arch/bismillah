import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, LogOut, Unplug } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { disconnectGithub } from "@/lib/github.functions";
import { useGithubStatus, useSettings } from "@/lib/github-hooks";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Project Push" },
      { name: "description", content: "Manage your GitHub connection and push preferences." },
      { property: "og:title", content: "Settings — Project Push" },
      { property: "og:description", content: "Your Project Push profile and preferences." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const status = useGithubStatus();
  const settings = useSettings();
  const session = useSession();
  const qc = useQueryClient();
  const disconnect = useServerFn(disconnectGithub);
  const [branch, setBranch] = useState("");
  const user = status.data?.connected ? status.data.user : null;

  useEffect(() => setBranch(settings.data?.default_branch ?? ""), [settings.data]);

  const save = async () => {
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: session.userId!, default_branch: branch.trim() || null, updated_at: new Date().toISOString() });
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["settings"] });
  };

  const unlink = async () => {
    await disconnect();
    qc.clear();
    toast.success("GitHub disconnected");
  };

  const logout = async () => {
    qc.clear();
    await session.restart();
  };

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="font-display text-2xl font-bold">Settings</h1>
      {user && (
        <section className="card-soft flex items-center gap-4 bg-card p-5">
          <img src={user.avatar} alt={user.login} className="h-16 w-16 rounded-full" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold">{user.name}</p>
            <p className="text-sm text-muted-foreground">@{user.login}</p>
            {user.bio && <p className="mt-1 text-sm">{user.bio}</p>}
          </div>
          <a href={user.url} target="_blank" rel="noreferrer" className="btn-ghost px-3 py-2"><ExternalLink className="h-4 w-4" /></a>
        </section>
      )}
      <section className="card-soft space-y-3 bg-card p-5">
        <h2 className="font-display font-bold">Default branch</h2>
        <p className="text-sm text-muted-foreground">Used in the push wizard when the repo has this branch. Leave empty to use the repo's main branch.</p>
        <div className="flex gap-2">
          <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="e.g. main" className="field" />
          <button onClick={save} className="btn-primary">Save</button>
        </div>
      </section>
      <section className="card-soft flex flex-wrap gap-3 bg-card p-5">
        <button onClick={unlink} className="btn-ghost"><Unplug className="h-4 w-4" /> Disconnect GitHub</button>
        <button onClick={logout} className="btn-ghost text-destructive"><LogOut className="h-4 w-4" /> Sign out</button>
      </section>
    </div>
  );
}
