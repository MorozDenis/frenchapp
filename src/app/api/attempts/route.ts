import { body, fail, route } from "@/lib/api";
import { gradeAttempt } from "@/lib/grade";
import { latencyBand } from "@/lib/srs";
import type { DrillMode } from "@/lib/taxonomy";

/**
 * These routes wait on a language model. The platform default cuts a function
 * off long before one returns, and a killed function loses the attempt — so the
 * ceiling is raised to the maximum the plan allows.
 */
export const maxDuration = 60;


const AUDIO_RETENTION_DAYS = 30;

interface SubmitBody {
  sessionId?: string | null;
  promptId?: string | null;
  expressionIds?: string[];
  mode?: DrillMode;
  rawInput?: string | null;
  transcript?: string | null;
  audioPath?: string | null;
  latencyMs?: number;
  speakingMs?: number | null;
}

/**
 * Submits one attempt (FR-3.1, FR-4.3, FR-5, FR-6).
 *
 * The attempt row is written before the grader is called, so the response
 * always carries a saved attempt id even when grading fails — that ordering is
 * the whole of FR-5.2.
 */
export const POST = route(async ({ supabase, user, request }) => {
  const payload = await body<SubmitBody>(request);
  const mode: DrillMode = payload.mode === "voice" ? "voice" : "text";
  const production = (mode === "voice" ? payload.transcript : payload.rawInput)?.trim();

  if (!production) {
    return fail(mode === "voice" ? "No transcript to score" : "Write something first");
  }
  if (!payload.expressionIds?.length) return fail("No target expressions given");

  const latencyMs =
    typeof payload.latencyMs === "number" && payload.latencyMs >= 0
      ? Math.round(payload.latencyMs)
      : null;

  const { data: attempt, error } = await supabase
    .from("attempt")
    .insert({
      user_id: user.id,
      session_id: payload.sessionId ?? null,
      prompt_id: payload.promptId ?? null,
      expression_ids: payload.expressionIds,
      mode,
      raw_input: mode === "text" ? production : (payload.rawInput ?? null),
      transcript: mode === "voice" ? production : null,
      audio_url: payload.audioPath ?? null,
      audio_expires_at: payload.audioPath
        ? new Date(Date.now() + AUDIO_RETENTION_DAYS * 86_400_000).toISOString()
        : null,
      latency_ms: latencyMs,
      speaking_ms:
        mode === "voice" && typeof payload.speakingMs === "number"
          ? Math.round(payload.speakingMs)
          : null,
      latency_band: latencyMs === null ? null : latencyBand(latencyMs),
      scoring_status: "pending",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const outcome = await gradeAttempt(supabase, attempt.id);

  // The model sentence and error note are withheld while the user is
  // answering; this is the moment they become useful.
  const { data: targets } = await supabase
    .from("expression")
    .select("id, text, model_sentence, error_note, register")
    .in("id", payload.expressionIds);

  return {
    attemptId: attempt.id,
    status: outcome.status,
    error: outcome.error ?? null,
    latencyMs,
    latencyBand: outcome.latencyBand,
    score: outcome.score ?? null,
    repeatExpressionIds: outcome.repeatExpressionIds,
    targets: targets ?? [],
  };
});

/** Backs the retry queue and the "unscored attempts" notice. */
export const GET = route(async ({ supabase, request }) => {
  const status = new URL(request.url).searchParams.get("status");

  let query = supabase
    .from("attempt")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (status === "failed" || status === "pending" || status === "scored") {
    query = query.eq("scoring_status", status);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { attempts: data ?? [] };
});
