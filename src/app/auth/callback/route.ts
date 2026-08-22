import { NextResponse } from "next/server";
import { safeNext } from "@/lib/safe-redirect";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Completes a magic-link sign-in.
 *
 * `@supabase/ssr` signs in over PKCE: the emailed link goes to Supabase, which
 * verifies it and redirects here carrying a one-time `code`. That code is
 * worthless until it is traded for a session, and only the server can do the
 * trade — the matching verifier lives in an http-only cookie. Without this
 * route the browser lands on a URL with `?code=` that nothing consumes, and
 * the user bounces straight back to the login page.
 *
 * Supabase's newer email templates send `token_hash` + `type` instead, so both
 * shapes are handled; which one arrives depends on the template, not on us.
 */

function backToLogin(origin: string, reason: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const next = safeNext(params.get("next"));

  // Supabase reports its own failures — expired link, already used — on the
  // query string before we ever see a token.
  const upstreamError = params.get("error_description") ?? params.get("error");
  if (upstreamError) return backToLogin(url.origin, upstreamError);

  const supabase = await supabaseServer();

  const code = params.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return backToLogin(url.origin, error.message);
    return NextResponse.redirect(new URL(next, url.origin));
  }

  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return backToLogin(url.origin, error.message);
    return NextResponse.redirect(new URL(next, url.origin));
  }

  // Nothing on the query string. Supabase reports verification failures in the
  // URL *fragment*, which is never sent to a server — so the only way to learn
  // the real reason is to hand the browser a page that reads it and reports
  // back. Without this, an expired link is misreported as a malformed one.
  return new NextResponse(FRAGMENT_FORWARDER, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

/**
 * Reads `#error_description` and forwards it to /login as a query parameter.
 * The fragment is only ever passed through `URLSearchParams` and assigned to
 * `location`, never written into the DOM, so its contents cannot become markup.
 */
const FRAGMENT_FORWARDER = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Signing in…</title></head>
<body><script>
(function () {
  var hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  var reason =
    hash.get("error_description") ||
    hash.get("error") ||
    "That sign-in link carried no token. Request a new one.";
  var target = new URL("/login", window.location.origin);
  target.searchParams.set("error", reason);
  window.location.replace(target.toString());
})();
</script></body></html>`;
