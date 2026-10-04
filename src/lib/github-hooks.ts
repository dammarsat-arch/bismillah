import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { completeGithubConnect, getGithubOverview, getGithubStatus, startGithubConnect } from "@/lib/github.functions";
import { useSession } from "@/lib/session";

export function useGithubStatus() {
  const { ready, userId } = useSession();
  const fn = useServerFn(getGithubStatus);
  return useQuery({ queryKey: ["gh", "status", userId], queryFn: () => fn(), enabled: ready && !!userId, retry: 1 });
}

export function useGithubOverview() {
  const { userId } = useSession();
  const status = useGithubStatus();
  const fn = useServerFn(getGithubOverview);
  return useQuery({
    queryKey: ["gh", "overview", userId],
    queryFn: () => fn(),
    enabled: !!status.data?.connected,
    staleTime: 30_000,
  });
}

export type PushRow = {
  id: string;
  repo: string;
  branch: string;
  message: string;
  file_count: number;
  commit_url: string | null;
  status: string;
  error: string | null;
  created_at: string;
};

export function usePushHistory(limit = 200) {
  const { ready, userId } = useSession();
  return useQuery({
    queryKey: ["history", userId, limit],
    enabled: ready && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("push_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as PushRow[];
    },
  });
}

export function useSettings() {
  const { ready, userId } = useSession();
  return useQuery({
    queryKey: ["settings", userId],
    enabled: ready && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function waitForOAuthCompletion(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        event.data?.connectorId !== "github" ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      )
        return;
      cleanup();
      if (type === "appUserConnectorOAuthComplete") {
        resolve(typeof event.data?.code === "string" ? event.data.code : null);
        return;
      }
      popup.close();
      reject(new Error("GitHub sign-in failed."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("The GitHub window was closed before finishing."));
    }, 500);
  });
}

export function useConnectGithub() {
  const start = useServerFn(startGithubConnect);
  const complete = useServerFn(completeGithubConnect);
  const qc = useQueryClient();
  return useCallback(async () => {
    const popup = window.open("", "github-oauth", "width=600,height=720");
    if (!popup) throw new Error("Popup blocked. Allow popups and try again.");
    let code: string | null;
    try {
      const { authorizationUrl } = await start();
      const completion = waitForOAuthCompletion(popup);
      popup.location.href = authorizationUrl;
      code = await completion;
    } catch (e) {
      popup.close();
      throw e;
    }
    if (code) await complete({ data: { code } });
    await qc.invalidateQueries({ queryKey: ["gh"] });
  }, [start, complete, qc]);
}

export function timeAgo(iso: string) {
  const s = (Date.now() - +new Date(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
