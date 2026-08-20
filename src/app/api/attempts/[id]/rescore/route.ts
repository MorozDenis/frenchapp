import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { gradeAttempt } from "@/lib/grade";
import { requireUser } from "@/lib/supabase/server";
import type { Db } from "@/lib/api";

/**
 * FR-5.2 — drains the retry queue. Re-grading an attempt that already scored
 * is refused: the schedule has already moved on that result, and applying a
 * second grade would double-count the rep.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth) return fail("Not signed in", 401);
  const { id } = await context.params;
  const supabase = auth.supabase as Db;

  const { data: attempt, error } = await supabase
    .from("attempt")
    .select("id, scoring_status")
    .eq("id", id)
    .maybeSingle();

  if (error) return fail(error.message, 500);
  if (!attempt) return fail("Attempt not found", 404);
  if (attempt.scoring_status === "scored") {
    return fail("That attempt is already scored", 409);
  }

  const outcome = await gradeAttempt(supabase, id);
  return NextResponse.json(outcome);
}
