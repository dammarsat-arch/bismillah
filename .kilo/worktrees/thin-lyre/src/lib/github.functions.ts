import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  appUserReconnectRequired,
  authorizeAppUserOAuth,
  callAsAppUser,
  disconnectAppUser,
  exchangeAppUserOAuthCode,
} from "@/integrations/lovable/appUserConnector";
import {
  deleteConnectionForUser,
  getConnectionKeyForUser,
  saveConnectionKeyForUser,
} from "@/lib/appUserConnections.server";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR = "github";
const GITHUB_SCOPES = ["read:user", "repo"];

class GhError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function gh<T = any>(key: string, path: string, init?: RequestInit): Promise<T> {
  const res = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey: key,
    connectorId: CONNECTOR,
    path,
    requiredScopes: GITHUB_SCOPES,
    init: {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    },
  });
  if (await appUserReconnectRequired(res)) throw new GhError("RECONNECT", 401);
  const text = await res.text();
  if (!res.ok) {
    console.error(`GitHub request failed [${res.status}] ${path}: ${text}`);
    if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
      throw new GhError("GitHub rate limit reached. Try again in a few minutes.", 403);
    }
    let msg = text.slice(0, 300);
    try {
      msg = JSON.parse(text).message ?? msg;
    } catch {}
    throw new GhError(`GitHub [${res.status}]: ${msg}`, res.status);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

async function requireKey(userId: string) {
  const key = await getConnectionKeyForUser(userId, CONNECTOR);
  if (!key) throw new GhError("NOT_CONNECTED", 401);
  return key;
}

/* ---------- Connection ---------- */

export const getGithubStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const key = await getConnectionKeyForUser(context.userId, CONNECTOR);
    if (!key) return { connected: false as const, reconnectRequired: false };
    try {
      const u = await gh<any>(key, "/user");
      return {
        connected: true as const,
        reconnectRequired: false,
        user: {
          login: u.login as string,
          name: (u.name ?? u.login) as string,
          avatar: u.avatar_url as string,
          url: u.html_url as string,
          bio: (u.bio ?? "") as string,
        },
      };
    } catch (e) {
      if (e instanceof GhError && e.message === "RECONNECT") return { connected: false as const, reconnectRequired: true };
      throw e;
    }
  });

export const startGithubConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientKey = process.env["GITHUB_APP_USER_CONNECTOR_CLIENT_API_KEY"];
    if (!clientKey) throw new Error("GitHub sign-in is not configured yet.");
    const request = getRequest();
    if (!request) throw new Error("OAuth must start from an app request.");
    const url = new URL(request.url);
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL("/oauth/github/return", sandboxHost ? `https://${sandboxHost}` : url.origin).toString();
    const existing = await getConnectionKeyForUser(context.userId, CONNECTOR);
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: CONNECTOR,
      appUserId: context.userId,
      clientAPIKey: clientKey,
      returnUrl,
      connectionAPIKey: existing ?? undefined,
      credentialsConfiguration: { scopes: GITHUB_SCOPES },
    });
    return { authorizationUrl };
  });

export const completeGithubConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => z.object({ code: z.string().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY_BASE_URL, data.code);
    if (connectorId !== CONNECTOR) throw new Error("OAuth completion returned the wrong connector");
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey);
    return { ok: true };
  });

export const disconnectGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const key = await getConnectionKeyForUser(context.userId, CONNECTOR);
    if (key) {
      try {
        await disconnectAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey: key, connectorId: CONNECTOR });
      } catch (e) {
        console.error(e);
      }
      await deleteConnectionForUser(context.userId, CONNECTOR);
    }
    return { ok: true };
  });

/* ---------- Data ---------- */

export const getGithubOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const key = await requireKey(context.userId);
    const u = await gh<any>(key, "/user");
    const repos = await gh<any[]>(key, "/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator");
    const recent = await Promise.all(
      repos.slice(0, 4).map(async (r) => {
        try {
          const commits = await gh<any[]>(key, `/repos/${r.full_name}/commits?per_page=3`);
          return commits.map((c) => ({
            sha: c.sha as string,
            message: String(c.commit?.message ?? "").split("\n")[0] ?? "",
            date: c.commit?.author?.date as string,
            repo: r.name as string,
            url: c.html_url as string,
          }));
        } catch {
          return [];
        }
      }),
    );
    return {
      user: { login: u.login as string, name: (u.name ?? u.login) as string, avatar: u.avatar_url as string },
      repos: repos.map((r) => ({
        fullName: r.full_name as string,
        name: r.name as string,
        description: (r.description ?? "") as string,
        private: !!r.private,
        defaultBranch: (r.default_branch ?? "main") as string,
        pushedAt: (r.pushed_at ?? r.created_at) as string,
        url: r.html_url as string,
        language: (r.language ?? "") as string,
        stars: (r.stargazers_count ?? 0) as number,
      })),
      recent: recent
        .flat()
        .sort((a, b) => +new Date(b.date) - +new Date(a.date))
        .slice(0, 6),
    };
  });

const repoName = z.string().regex(/^[\w.-]+\/[\w.-]+$/);

export const listBranches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { repo: string }) => z.object({ repo: repoName }).parse(d))
  .handler(async ({ data, context }) => {
    const key = await requireKey(context.userId);
    try {
      const b = await gh<any[]>(key, `/repos/${data.repo}/branches?per_page=100`);
      return b.map((x) => x.name as string);
    } catch (e) {
      if (e instanceof GhError && (e.status === 404 || e.status === 409)) return [];
      throw e;
    }
  });

export const createRepo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; description?: string; private: boolean }) =>
    z
      .object({
        name: z.string().regex(/^[\w.-]{1,100}$/, "Use letters, numbers, dashes, dots or underscores"),
        description: z.string().max(350).optional(),
        private: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const key = await requireKey(context.userId);
    const r = await gh<any>(key, "/user/repos", {
      method: "POST",
      body: JSON.stringify({ name: data.name, description: data.description ?? "", private: data.private }),
    });
    return { fullName: r.full_name as string, defaultBranch: (r.default_branch ?? "main") as string };
  });

const pushSchema = z.object({
  repo: repoName,
  branch: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  files: z
    .array(z.object({ path: z.string().min(1).max(500), content: z.string() }))
    .min(1)
    .max(1000),
});

export const pushFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof pushSchema>) => pushSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { repo, branch, message, files } = data;
    const record = (row: { commit_url?: string | null; status: string; error?: string | null }) =>
      context.supabase.from("push_history").insert({
        user_id: context.userId,
        repo,
        branch,
        message,
        file_count: files.length,
        ...row,
      });

    try {
      const key = await requireKey(context.userId);
      const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");

      let headSha: string | null = null;
      try {
        const ref = await gh<any>(key, `/repos/${repo}/git/ref/heads/${enc(branch)}`);
        headSha = ref.object.sha;
      } catch (e) {
        if (!(e instanceof GhError) || (e.status !== 404 && e.status !== 409)) throw e;
      }

      let rest = files;
      let url = "";
      let sha = "";
      if (!headSha) {
        const first = files[0]!;
        const r = await gh<any>(key, `/repos/${repo}/contents/${enc(first.path)}`, {
          method: "PUT",
          body: JSON.stringify({ message, content: first.content, branch }),
        });
        headSha = r.commit.sha as string;
        sha = headSha;
        url = r.commit.html_url as string;
        rest = files.slice(1);
      }

      if (rest.length > 0) {
        const headCommit = await gh<any>(key, `/repos/${repo}/git/commits/${headSha}`);
        const tree = [];
        for (const f of rest) {
          const blob = await gh<any>(key, `/repos/${repo}/git/blobs`, {
            method: "POST",
            body: JSON.stringify({ content: f.content, encoding: "base64" }),
          });
          tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
        }
        const newTree = await gh<any>(key, `/repos/${repo}/git/trees`, {
          method: "POST",
          body: JSON.stringify({ base_tree: headCommit.tree.sha, tree }),
        });
        const commit = await gh<any>(key, `/repos/${repo}/git/commits`, {
          method: "POST",
          body: JSON.stringify({ message, tree: newTree.sha, parents: [headSha] }),
        });
        await gh(key, `/repos/${repo}/git/refs/heads/${enc(branch)}`, {
          method: "PATCH",
          body: JSON.stringify({ sha: commit.sha }),
        });
        sha = commit.sha;
        url = `https://github.com/${repo}/commit/${commit.sha}`;
      }

      await record({ commit_url: url, status: "success" });
      return { sha, url, count: files.length };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await record({ status: "failed", error: msg.slice(0, 500) });
      throw e;
    }
  });
