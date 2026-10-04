import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/oauth/github/return")({
  head: () => ({
    meta: [
      { title: "Connecting GitHub — Project Push" },
      { name: "description", content: "Finishing your GitHub sign-in for Project Push." },
      { property: "og:title", content: "Connecting GitHub — Project Push" },
      { property: "og:description", content: "Finishing your GitHub sign-in for Project Push." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OAuthReturn,
});

function OAuthReturn() {
  const [message, setMessage] = useState("Finishing connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notify = (type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed", code?: string) => {
      window.opener?.postMessage({ type, connectorId: "github", code: code ?? null }, window.location.origin);
      window.close();
    };
    if (params.get("success") !== "true") {
      setMessage(params.get("error") ?? "Sign-in did not complete.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    const code = params.get("code");
    if (!code) {
      if (params.get("offline_access_allowed") === "false") return notify("appUserConnectorOAuthComplete");
      setMessage("Sign-in completed without a code.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    notify("appUserConnectorOAuthComplete", code);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 font-display text-lg font-bold">
      {message}
    </div>
  );
}
