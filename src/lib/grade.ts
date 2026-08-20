import type { Db } from "@/lib/api";
import { scoreAttempt, type ScoreResult } from "@/lib/llm/score";
import { LlmUnavailableError } from "@/lib/llm/client";
import { latencyBand, nextReview } from "@/lib/srs";
import type { AttemptRow } from "@/lib/database.types";
import type { LatencyBand } from "@/lib/taxonomy";

/**
 * Grades a saved attempt and moves every target expression's schedule.
 *
 * Shared by submission and by the retry queue, because FR-5.2 makes those two
 * the same operation performed at different times: the attempt is written
 * first and graded second, so a grader outage costs the correction, never the
 * rep.
 */

export interface GradeOutcome {
  status: "scored" | "failed";
  error?: string;
  score?: ScoreResult;
  latencyBand: LatencyBand | null;
  /** Expressions that came back `absent` and should repeat this session. */
  repeatExpressionIds: string[];
}

export async function gradeAttempt(
  supabase: Db,
  attemptId: string,
): Promise<GradeOutcome> {
  const { data: attempt, error } = await supabase
    .from("attempt")
    .select("*")
    .eq("id", attemptId)
    .single();
  if (error) throw new Error(error.message);

  const band =
    attempt.latency_ms === null ? null : latencyBand(attempt.latency_ms);

  const production = (attempt.mode === "voice" ? attempt.transcript : attempt.raw_input) ?? "";
  const [{ data: targets }, { data: prompt }] = await Promise.all([
    supabase
      .from("expression")
      .select("id, text")
      .in("id", attempt.expression_ids ?? []),
    attempt.prompt_id
      ? supabase
          .from("prompt")
          .select("statement_fr, task_type")
          .eq("id", attempt.prompt_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const targetList = targets ?? [];

  let score: ScoreResult;
  try {
    score = await scoreAttempt({
      statementFr: prompt?.statement_fr ?? "(prompt unavailable)",
      taskType: prompt?.task_type ?? "phrase",
      targets: targetList,
      production,
      mode: attempt.mode,
    });
  } catch (cause) {
    const message =
      cause instanceof LlmUnavailableError
        ? cause.message
        : cause instanceof Error
          ? cause.message
          : "Scoring failed";

    // The rep still happened, and the latency figure is the headline metric —
    // record what is known and leave the rest for the retry queue.
    await supabase
      .from("attempt")
      .update({
        scoring_status: "failed",
        scoring_error: message,
        latency_band: band,
      })
      .eq("id", attemptId);

    return { status: "failed", error: message, latencyBand: band, repeatExpressionIds: [] };
  }

  await supabase
    .from("attempt")
    .update({
      target_usage: score.targetUsage,
      collocation_score: score.collocationScore,
      grammar_score: score.grammarScore,
      latency_band: band,
      corrected_text: score.correctedText,
      key_fix: score.keyFix,
      error_tags: score.errorTags,
      missing_accents: score.missingAccents,
      hesitation_count: score.hesitationCount,
      scoring_status: "scored",
      scoring_error: null,
    })
    .eq("id", attemptId);

  const repeatExpressionIds = await applyReviewUpdates(supabase, attempt, score, band);

  return { status: "scored", score, latencyBand: band, repeatExpressionIds };
}

async function applyReviewUpdates(
  supabase: Db,
  attempt: AttemptRow,
  score: ScoreResult,
  band: LatencyBand | null,
): Promise<string[]> {
  // Without a clock reading there is no band, and FR-6 keys every promotion
  // off the band. Treat it as the slowest case rather than guessing upward.
  const effectiveBand: LatencyBand = band ?? "lent";
  const ids = attempt.expression_ids ?? [];
  if (ids.length === 0) return [];

  const { data: states, error } = await supabase
    .from("review_state")
    .select("*")
    .in("expression_id", ids);
  if (error) throw new Error(error.message);

  const byId = new Map((states ?? []).map((s) => [s.expression_id, s]));
  const repeats: string[] = [];

  for (const id of ids) {
    const prev = byId.get(id);
    if (!prev) continue;

    const update = nextReview(
      {
        ease: prev.ease,
        intervalDays: prev.interval_days,
        consecutiveFastCorrect: prev.consecutive_fast_correct,
        state: prev.state,
        lastFastSessionId: prev.last_fast_session_id,
        lastFastPromptId: prev.last_fast_prompt_id,
      },
      {
        usage: score.targetUsage[id] ?? "absent",
        band: effectiveBand,
        sessionId: attempt.session_id,
        promptId: attempt.prompt_id,
      },
    );

    if (update.repeatInSession) repeats.push(id);

    await supabase
      .from("review_state")
      .update({
        ease: update.ease,
        interval_days: update.intervalDays,
        due_at: update.dueAt.toISOString(),
        consecutive_fast_correct: update.consecutiveFastCorrect,
        state: update.state,
        last_attempt_id: attempt.id,
        last_fast_session_id: update.lastFastSessionId,
        last_fast_prompt_id: update.lastFastPromptId,
        updated_at: new Date().toISOString(),
      })
      .eq("expression_id", id);
  }

  return repeats;
}
