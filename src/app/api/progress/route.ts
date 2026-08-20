import { route } from "@/lib/api";
import {
  errorComparison,
  latencyImprovement,
  modeLatency,
  sessionLatency,
  type AttemptFact,
} from "@/lib/progress";

/** Feeds the four charts of FR-8. */
export const GET = route(async ({ supabase }) => {
  const [attempts, snapshots, reviews] = await Promise.all([
    supabase
      .from("attempt")
      .select(
        "id, session_id, mode, latency_ms, error_tags, transcript_flagged, scoring_status, created_at",
      )
      .order("created_at", { ascending: true })
      .limit(2000),
    supabase
      .from("state_snapshot")
      .select("*")
      .order("day", { ascending: true })
      .limit(365),
    supabase.from("review_state").select("state"),
  ]);

  if (attempts.error) throw new Error(attempts.error.message);
  if (snapshots.error) throw new Error(snapshots.error.message);
  if (reviews.error) throw new Error(reviews.error.message);

  const facts = (attempts.data ?? []) as AttemptFact[];
  const latency = sessionLatency(facts);

  const counts = { new: 0, learning: 0, active: 0 };
  for (const row of reviews.data ?? []) counts[row.state] += 1;

  return {
    sessionLatency: latency,
    stateHistory: snapshots.data ?? [],
    stateNow: counts,
    errorComparison: errorComparison(facts),
    modeLatency: modeLatency(facts),
    improvement: latencyImprovement(latency),
    unscored: facts.filter((f) => f.scoring_status === "failed").length,
  };
});
