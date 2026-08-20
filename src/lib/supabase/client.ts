"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "@/lib/config";
import type { Database } from "@/lib/database.types";

export function supabaseBrowser() {
  const config = supabaseConfig();
  if (!config) {
    // Reachable only if the bundle was built without the public vars — the
    // middleware serves its own notice for page loads, but a client component
    // should not fail with "invalid URL" either.
    throw new Error(
      "Supabase is not configured in this build. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY and redeploy.",
    );
  }
  return createBrowserClient<Database>(config.url, config.anonKey);
}
