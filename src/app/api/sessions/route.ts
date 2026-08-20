import { body, fail, route } from "@/lib/api";
import { loadCandidates } from "@/lib/candidates";
import { planSession } from "@/lib/plan";
import { NEW_SHARE_WARNING } from "@/lib/srs";
import type { DrillMode } from "@/lib/taxonomy";

/**
 * Starts a session and returns its whole plan up front.
 *
 * Planning the session in one shot is what makes FR-6.3's 70/20/10 mix
 * meaningful — composed item by item, a three-expression item can never carry
 * 10% new material, and new expressions would simply never be introduced.
 */

const DEFAULT_ITEMS = 8;
const MAX_ITEMS = 30;

export const POST = route(async ({ supabase, user, request }) => {
  const { mode, itemCount } = await body<{
    mode?: DrillMode;
    itemCount?: number;
  }>(request);

  const resolvedMode: DrillMode = mode === "voice" ? "voice" : "text";
  const size = Math.min(MAX_ITEMS, Math.max(1, Math.round(itemCount ?? DEFAULT_ITEMS)));

  const pool = await loadCandidates(supabase);
  if (pool.candidates.length < 2) {
    return fail(
      "The bank needs at least two expressions before a drill can start. Add some in the bank first.",
      409,
    );
  }

  const items = planSession(pool.candidates, size);
  if (items.length === 0) return fail("Nothing to drill right now", 409);

  const { data, error } = await supabase
    .from("session")
    .insert({ user_id: user.id, mode: resolvedMode, item_count: items.length })
    .select("id, started_at, mode")
    .single();
  if (error) throw new Error(error.message);

  // Cheap enough to do on session start, and it gives FR-8's state chart a
  // daily data point without a separate scheduled job.
  await supabase.rpc("snapshot_states", { p_user_id: user.id });

  const newShare = pool.totalActive ? pool.newCount / pool.totalActive : 0;

  return {
    session: data,
    items,
    // §11 — warn when the bank is growing faster than it is being drilled.
    newShareWarning:
      newShare > NEW_SHARE_WARNING
        ? `${Math.round(newShare * 100)}% of the bank has never been drilled. Stop adding and start drilling.`
        : null,
  };
});
