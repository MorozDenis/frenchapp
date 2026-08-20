/**
 * Reads the two public Supabase settings, or reports that they are missing.
 *
 * These are `NEXT_PUBLIC_*`, so Next inlines them into the client bundle at
 * build time — a deployment built before they were set holds `undefined` until
 * it is rebuilt, and no amount of setting them afterwards fixes that
 * deployment. Missing config therefore has to produce a message that says so,
 * rather than a stack trace.
 */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function supabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function missingSupabaseVars(): string[] {
  return [
    ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name as string);
}
