"use client";

import * as React from "react";

export type User = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
};

type AuthResult = { ok: boolean; error?: { code: string; message: string } };

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, displayName?: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, data };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "same-origin" });
      const data = await res.json();
      setUser(data?.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    // Fetch the current session once on mount (standard data-fetch-on-mount pattern).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const signIn = React.useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const { ok, data } = await postJson("/api/auth/signin", { email, password });
    if (ok && data?.user) {
      setUser(data.user);
      return { ok: true };
    }
    return { ok: false, error: data?.error };
  }, []);

  const signUp = React.useCallback(
    async (email: string, password: string, displayName?: string): Promise<AuthResult> => {
      const { ok, data } = await postJson("/api/auth/signup", { email, password, displayName });
      if (ok && data?.user) {
        setUser(data.user);
        return { ok: true };
      }
      return { ok: false, error: data?.error };
    },
    [],
  );

  const signOut = React.useCallback(async () => {
    await fetch("/api/auth/signout", { method: "POST", credentials: "same-origin" });
    setUser(null);
  }, []);

  const value = React.useMemo(
    () => ({ user, loading, signIn, signUp, signOut, refresh }),
    [user, loading, signIn, signUp, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
