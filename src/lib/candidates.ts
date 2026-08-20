import type { Db } from "@/lib/api";
import type { PlanCandidate } from "@/lib/plan";

/**
 * Builds the candidate pool the session planner picks from.
 *
 * "Weak" in FR-6.3 means lowest recent scores, which needs attempt history
 * keyed by expression. That is an array-containment aggregate in SQL; for one
 * user's bank it is cheaper and far easier to read as a scan over the recent
 * attempts in memory.
 */

const RECENT_ATTEMPT_WINDOW = 300;
/** How many recent attempts per expression feed its weakness score. */
const SCORES_PER_EXPRESSION = 3;

export interface CandidatePool {
  candidates: PlanCandidate[];
  totalActive: number;
  newCount: number;
}

export async function loadCandidates(supabase: Db): Promise<CandidatePool> {
  const [expressions, reviews, attempts] = await Promise.all([
    supabase
      .from("expression")
      .select("id, theme")
      .is("archived_at", null),
    supabase.from("review_state").select("*"),
    supabase
      .from("attempt")
      .select("expression_ids, grammar_score, collocation_score, created_at")
      .eq("scoring_status", "scored")
      .order("created_at", { ascending: false })
      .limit(RECENT_ATTEMPT_WINDOW),
  ]);

  if (expressions.error) throw new Error(expressions.error.message);
  if (reviews.error) throw new Error(reviews.error.message);
  if (attempts.error) throw new Error(attempts.error.message);

  const reviewByExpression = new Map(
    (reviews.data ?? []).map((r) => [r.expression_id, r]),
  );

  // Newest first, so taking the first few per expression gives recent scores.
  const scores = new Map<string, number[]>();
  for (const attempt of attempts.data ?? []) {
    const grammar = attempt.grammar_score;
    const collocation = attempt.collocation_score;
    if (grammar === null && collocation === null) continue;
    const mean =
      grammar !== null && collocation !== null
        ? (grammar + collocation) / 2
        : (grammar ?? collocation) ?? 0;
    for (const id of attempt.expression_ids ?? []) {
      const bucket = scores.get(id) ?? [];
      if (bucket.length < SCORES_PER_EXPRESSION) {
        bucket.push(mean);
        scores.set(id, bucket);
      }
    }
  }

  const candidates: PlanCandidate[] = [];
  let newCount = 0;

  for (const expression of expressions.data ?? []) {
    const review = reviewByExpression.get(expression.id);
    const state = review?.state ?? "new";
    if (state === "new") newCount += 1;
    const recent = scores.get(expression.id);
    candidates.push({
      expressionId: expression.id,
      dueAt: review?.due_at ?? new Date(0).toISOString(),
      state,
      recentScore: recent?.length
        ? recent.reduce((a, b) => a + b, 0) / recent.length
        : null,
      theme: expression.theme,
    });
  }

  return {
    candidates,
    totalActive: candidates.length,
    newCount,
  };
}
