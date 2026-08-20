import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { missingSupabaseVars, supabaseConfig } from "@/lib/config";

/**
 * Refreshes the Supabase session on every request and keeps unauthenticated
 * traffic out of the drill. `/login` and the auth callback are the only open
 * routes.
 */
export async function middleware(request: NextRequest) {
  const config = supabaseConfig();
  // Without config there is no session to read, and constructing a client on
  // `undefined` throws — which surfaces as MIDDLEWARE_INVOCATION_FAILED on
  // every route, the least informative failure available. Say what is missing
  // instead.
  if (!config) return notConfigured();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        for (const { name, value } of items) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of items) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = path.startsWith("/login") || path.startsWith("/auth");

  // API routes answer for themselves. Redirecting them would hand a `fetch`
  // caller an HTML login page where it expects JSON, turning every expired
  // session into an unreadable parse error.
  if (path.startsWith("/api")) return response;

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && path.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

function notConfigured() {
  const missing = missingSupabaseVars();
  const body = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Débit — not configured</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fbfaf7;color:#1d1b17;
       font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif}
  main{max-width:34rem;padding:32px}
  h1{font-size:20px;margin:0 0 12px}
  code{background:#f3f1ec;border-radius:4px;padding:2px 5px;font-size:14px}
  li{margin:4px 0}
  p{color:#5c574d}
  @media (prefers-color-scheme:dark){
    body{background:#14150f;color:#eceade}code{background:#23261d}p{color:#b0ac9c}
  }
</style></head>
<body><main>
<h1>Débit is not configured</h1>
<p>These environment variables are missing from this deployment:</p>
<ul>${missing.map((name) => `<li><code>${name}</code></li>`).join("")}</ul>
<p>Set them in your hosting provider, then <strong>redeploy</strong>. A rebuild is
required, not just a restart: <code>NEXT_PUBLIC_*</code> values are compiled into
the browser bundle, so a deployment built without them keeps the old empty values.</p>
</main></body></html>`;

  return new NextResponse(body, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)"],
};
