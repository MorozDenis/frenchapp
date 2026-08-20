import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { requireUser } from "@/lib/supabase/server";

/**
 * "The transcription was wrong" (§11).
 *
 * Whisper mangling hesitant or heavily accented French would otherwise show up
 * as the learner's grammar errors and poison the error-category trend. Flagging
 * voids the language scores and their tags but keeps the latency figures,
 * which were measured off the clock and are unaffected by the transcript.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth) return fail("Not signed in", 401);
  const { id } = await context.params;

  const { data, error } = await auth.supabase
    .from("attempt")
    .update({
      transcript_flagged: true,
      grammar_score: null,
      collocation_score: null,
      error_tags: [],
      key_fix: null,
      corrected_text: null,
    })
    .eq("id", id)
    .eq("mode", "voice")
    .select("id")
    .maybeSingle();

  if (error) return fail(error.message, 500);
  if (!data) return fail("Voice attempt not found", 404);

  return NextResponse.json({ ok: true });
}
