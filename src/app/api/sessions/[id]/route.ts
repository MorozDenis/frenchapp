import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { requireUser } from "@/lib/supabase/server";

/** Closes a session so the per-session charts have an end time. */
export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth) return fail("Not signed in", 401);
  const { id } = await context.params;

  const { error } = await auth.supabase
    .from("session")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return fail(error.message, 500);
  return NextResponse.json({ ok: true });
}
