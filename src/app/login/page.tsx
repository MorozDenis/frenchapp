"use client";

import { Suspense, useState } from "react";
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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("sending");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}${next}`,
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
