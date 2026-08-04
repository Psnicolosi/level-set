"use client";

// Auth gate — email + password via Supabase Auth. No session, no surface:
// the gate renders the sign-in screen instead of children. RLS (migration
// 0003) enforces the same rule at the database, so the gate is UX, not
// the security boundary.

import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// Local-verification escape hatch: the sandbox replica has no GoTrue server,
// so suites run with NEXT_PUBLIC_AUTH_DISABLED=true. NEVER set on Vercel.
export const AUTH_DISABLED = process.env.NEXT_PUBLIC_AUTH_DISABLED === "true";

const SessionContext = createContext<Session | null>(null);
export const useSession = () => useContext(SessionContext);

/** Signed-in user's email — the key for watermarks and triage-mark provenance. */
export async function currentUserEmail(): Promise<string> {
  if (AUTH_DISABLED) return "paul@cs-integrated.com";
  const { data } = await supabase.auth.getSession();
  return data.session?.user.email ?? "";
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (AUTH_DISABLED) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <div className="pt-[60px] text-center font-mono text-[11px] text-ink-muted">
        LEVEL SET
      </div>
    );
  }
  if (!AUTH_DISABLED && !session) return <Login />;
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export async function signOut() {
  await supabase.auth.signOut();
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setPending(false);
    if (err) setError(err.message === "Invalid login credentials" ? "Wrong email or password." : err.message);
    // On success onAuthStateChange flips the gate — nothing else to do.
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center px-[18px] pb-[80px]">
      <div className="font-mono text-[11px] tracking-[3px] text-ink-muted">LEVEL SET</div>
      <h1 className="mt-[6px] font-serif text-[27px] font-semibold">Sign in.</h1>
      <div className="mt-[2px] text-[13px] text-ink-secondary">
        The ledger is private — every surface requires a session.
      </div>
      <form onSubmit={submit} className="mt-[18px] flex flex-col gap-[11px]">
        <label className="flex flex-col gap-[4px]">
          <span className="font-mono text-[10px] tracking-[1px] text-ink-muted">EMAIL</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-line bg-paper-raised px-[12px] py-[10px] text-[14px] outline-none focus:border-ink"
          />
        </label>
        <label className="flex flex-col gap-[4px]">
          <span className="font-mono text-[10px] tracking-[1px] text-ink-muted">PASSWORD</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border border-line bg-paper-raised px-[12px] py-[10px] text-[14px] outline-none focus:border-ink"
          />
        </label>
        {error && (
          <div className="border border-red px-[11px] py-[8px] text-[12px] text-red-text">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={pending}
          className="min-h-[44px] w-full bg-ink py-[10px] text-center font-mono text-[12px] text-paper disabled:opacity-60"
        >
          {pending ? "SIGNING IN…" : "SIGN IN ▸"}
        </button>
      </form>
      <div className="mt-[14px] font-mono text-[10px] text-ink-muted">
        Accounts are created by the operator — no self-signup.
      </div>
    </div>
  );
}
