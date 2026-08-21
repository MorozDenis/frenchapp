"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * A magic link is the whole of authentication here. The app is single-user,
 * but the session it establishes is what row-level security keys off, so
 * opening it up later is a policy change rather than a rewrite (§7).
 */
function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const next = params.get("next") ?? "/";

  // Sign-in failures come back here two different ways: on the query string
  // when Supabase redirects to our callback, and in the URL fragment when it
  // falls back to the project's Site URL (which happens when the redirect
  // target is not on the allow-list). The fragment never reaches the server,
  // so it has to be read here.
  useEffect(() => {
    const fromQuery = params.get("error");
    const fromFragment = new URLSearchParams(
      window.location.hash.replace(/^#/, ""),
    ).get("error_description");
    const reported = fromQuery ?? fromFragment;
    if (!reported) return;
    // The fragment is only readable after mount, so this cannot move into
    // render or a lazy initialiser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus("error");
    setMessage(reported.replace(/\+/g, " "));
  }, [params]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("sending");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Must land on the callback route, not on the destination page: the
        // one-time code in the link is only useful to a server that can trade
        // it for a session.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
      setMessage(`Check ${email.trim()} for the sign-in link.`);
    }
  };

  return (
    <main className="shell" style={{ maxWidth: 420, paddingTop: 96 }}>
      <h1 className="topbar__brand" style={{ fontSize: 34, display: "block", marginBottom: 6 }}>
        Débit
      </h1>
      <p className="muted small" style={{ marginTop: 0, marginBottom: 28 }}>
        Timed French production drill.
      </p>

      <form className="card stack" onSubmit={submit}>
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <button
          type="submit"
          className="btn btn--primary btn--wide"
          disabled={status === "sending" || status === "sent"}
        >
          {status === "sending" ? "Sending…" : "Send sign-in link"}
        </button>
        {message && (
          <p className={`notice ${status === "error" ? "notice--error" : "notice--ok"}`}>
            {message}
          </p>
        )}
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
