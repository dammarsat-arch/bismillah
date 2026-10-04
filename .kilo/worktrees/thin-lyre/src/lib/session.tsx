import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type SessionCtx = { ready: boolean; userId: string | null; error: string | null; restart: () => Promise<void> };

const Ctx = createContext<SessionCtx>({ ready: false, userId: null, error: null, restart: async () => {} });

async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return anon.user?.id ?? null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    ensureSession()
      .then((id) => alive && (setUserId(id), setReady(true)))
      .catch((e) => alive && (setError(e instanceof Error ? e.message : String(e)), setReady(true)));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const restart = useCallback(async () => {
    setReady(false);
    await supabase.auth.signOut();
    try {
      setUserId(await ensureSession());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setReady(true);
  }, []);

  return <Ctx.Provider value={{ ready, userId, error, restart }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
