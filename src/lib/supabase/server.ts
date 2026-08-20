import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const url = () => {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  return value;
};

/**
 * Request-scoped client. Every query it makes runs as the signed-in user, so
 * row-level security is what actually enforces ownership — routes never filter
 * by user_id defensively and then trust that filter.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    url(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (items) => {
          try {
            for (const { name, value, options } of items) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The middleware refreshes the session instead.
          }
        },
      },
    },
  );
}

/**
 * Service-role client, used only for writing attempt audio into private
 * storage and for the retention sweep. It bypasses RLS, so every call site
 * must scope the path by user id itself.
 */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient<Database>(url(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { supabase, user: data.user };
}
