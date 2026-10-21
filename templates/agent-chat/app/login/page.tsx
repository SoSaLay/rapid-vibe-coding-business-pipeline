"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

/** Supabase sign-in: an email link (no password to remember). */
export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send() {
    setError(null);
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
    if (error) setError(error.message);
    else setSent(true);
  }
  return (
    <main className="center">
      <div className="card">
        <h1>{process.env.NEXT_PUBLIC_AGENT_TITLE || "Agent"}</h1>
        {sent ? (
          <p>Check your email for a sign-in link.</p>
        ) : (
          <>
            <p className="muted">Sign in with your email.</p>
            <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
            <button onClick={send} disabled={!email.includes("@")}>Send sign-in link</button>
            {error && <p className="error">{error}</p>}
          </>
        )}
      </div>
    </main>
  );
}
