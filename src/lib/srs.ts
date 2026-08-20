/**
 * Modified SM-2 (BRD §6.6).
 *
 * The departure from textbook spaced repetition is the whole point of the app:
 * **correct but slow is not a pass.** An expression you can produce in 50
 * seconds is still passive vocabulary, so a `lent` answer buys no interval
 * growth and costs ease.
 *
 * Everything here is pure so the rules can be tested without a database.
 */

import type { LatencyBand, ReviewStateName, TargetUsage } from "@/lib/taxonomy";

/** Axis 4 boundaries, BRD §6.5. Derived from the clock, never from the LLM. */
export const RAPIDE_MAX_MS = 20_000;
export const CORRECT_MAX_MS = 45_000;

const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
const MAX_INTERVAL_DAYS = 365;
/** FR-6.2 — active items still resurface, but no sooner than this. */
export const ACTIVE_MIN_INTERVAL_DAYS = 30;
/** FR-6.1 — qualifying fast-correct reps needed to graduate. */
export const FAST_CORRECT_TO_ACTIVE = 2;

export function latencyBand(latencyMs: number): LatencyBand {
  if (latencyMs < RAPIDE_MAX_MS) return "rapide";
  if (latencyMs <= CORRECT_MAX_MS) return "correct";
  return "lent";
}

export interface ReviewSnapshot {
  ease: number;
  intervalDays: number;
  consecutiveFastCorrect: number;
  state: ReviewStateName;
  lastFastSessionId: string | null;
  lastFastPromptId: string | null;
}

export interface ReviewOutcome {
  usage: TargetUsage;
  band: LatencyBand;
  sessionId: string | null;
  promptId: string | null;
  now?: Date;
}

export interface ReviewUpdate {
  ease: number;
  intervalDays: number;
  dueAt: Date;
  consecutiveFastCorrect: number;
  state: ReviewStateName;
  lastFastSessionId: string | null;
  lastFastPromptId: string | null;
  /** `absent` sends the item straight back into the current session. */
  repeatInSession: boolean;
}

const clampEase = (e: number) => Math.min(MAX_EASE, Math.max(MIN_EASE, e));
const clampInterval = (d: number) =>
  Math.min(MAX_INTERVAL_DAYS, Math.round(d * 100) / 100);

const addDays = (from: Date, days: number) =>
  new Date(from.getTime() + days * 24 * 60 * 60 * 1000);

export function nextReview(
  prev: ReviewSnapshot,
  outcome: ReviewOutcome,
): ReviewUpdate {
  const now = outcome.now ?? new Date();
  let ease = prev.ease;
  let intervalDays = prev.intervalDays;
  let consecutiveFastCorrect = prev.consecutiveFastCorrect;
  let state: ReviewStateName = prev.state;
  let lastFastSessionId = prev.lastFastSessionId;
  let lastFastPromptId = prev.lastFastPromptId;

  // The expression was not used at all. It is not a memory failure so much as
  // a retrieval no-show — the item comes back before the user leaves.
  if (outcome.usage === "absent") {
    return {
      ease,
      intervalDays: 0,
      dueAt: now,
      consecutiveFastCorrect: 0,
      state: state === "new" ? "new" : "learning",
      lastFastSessionId,
      lastFastPromptId,
      repeatInSession: true,
    };
  }

  if (outcome.usage === "present_misused") {
    return {
      ease: clampEase(ease - 0.2),
      intervalDays: 1,
      dueAt: addDays(now, 1),
      consecutiveFastCorrect: 0,
      state: "learning",
      lastFastSessionId,
      lastFastPromptId,
      repeatInSession: false,
    };
  }

  // present_correct — the interval it earns depends entirely on the clock.
  // A card that has never graduated (interval < 1d) takes the 1-day step
  // first, whatever the band; multipliers only apply to an established
  // interval.
  const graduating = intervalDays < 1;

  if (outcome.band === "rapide") {
    intervalDays = graduating ? 1 : intervalDays * ease;

    // A second rep inside the same sitting is the same retrieval, not a new
    // one, so it holds the count rather than advancing it (FR-6.1).
    const sameSession =
      outcome.sessionId !== null && outcome.sessionId === lastFastSessionId;
    if (!sameSession) {
      consecutiveFastCorrect += 1;
      const differentContext =
        lastFastPromptId === null || lastFastPromptId !== outcome.promptId;
      if (
        consecutiveFastCorrect >= FAST_CORRECT_TO_ACTIVE &&
        differentContext
      ) {
        state = "active";
      } else if (state !== "active") {
        state = "learning";
      }
      lastFastSessionId = outcome.sessionId;
      lastFastPromptId = outcome.promptId;
    }
  } else if (outcome.band === "correct") {
    intervalDays = graduating ? 1 : intervalDays * 1.3;
    consecutiveFastCorrect = 0;
    if (state !== "active") state = "learning";
  } else {
    // lent — right answer, wrong speed. No promotion, and the ease penalty
    // means the next correct answer buys less than it would have.
    ease = clampEase(ease - 0.1);
    intervalDays = graduating ? 1 : intervalDays;
    consecutiveFastCorrect = 0;
    if (state !== "active") state = "learning";
  }

  if (state === "active") {
    intervalDays = Math.max(intervalDays, ACTIVE_MIN_INTERVAL_DAYS);
  }

  intervalDays = clampInterval(intervalDays);

  return {
    ease,
    intervalDays,
    dueAt: addDays(now, intervalDays),
    consecutiveFastCorrect,
    state,
    lastFastSessionId,
    lastFastPromptId,
    // Only `absent` repeats within the session, and that returns above.
    repeatInSession: false,
  };
}

// ---------------------------------------------------------------------------
// Session composition (FR-6.3): ~70% due, 20% weak, 10% new.
// ---------------------------------------------------------------------------

export interface Candidate {
  expressionId: string;
  dueAt: string;
  state: ReviewStateName;
  /** Mean of recent grammar+collocation scores; null when never attempted. */
  recentScore: number | null;
}

export interface Composition {
  due: string[];
  weak: string[];
  fresh: string[];
}

/**
 * Picks the expression ids for a session of `size` items.
 *
 * New items are capped at 10% (§11: the bank must not outrun the drilling).
 * Quotas that cannot be filled spill into the other buckets rather than
 * shortening the session — a drill with three items because nothing is
 * technically "due" would be worse than one that reaches back for weak items.
 */
export function composeSession(
  candidates: Candidate[],
  size: number,
  now: Date = new Date(),
): Composition {
  const nowMs = now.getTime();
  const taken = new Set<string>();
  const take = (pool: Candidate[], n: number) => {
    const picked: string[] = [];
    for (const c of pool) {
      if (picked.length >= n) break;
      if (taken.has(c.expressionId)) continue;
      taken.add(c.expressionId);
      picked.push(c.expressionId);
    }
    return picked;
  };

  const duePool = candidates
    .filter((c) => c.state !== "new" && Date.parse(c.dueAt) <= nowMs)
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));

  const weakPool = candidates
    .filter((c) => c.recentScore !== null)
    .sort((a, b) => (a.recentScore as number) - (b.recentScore as number));

  const freshPool = candidates
    .filter((c) => c.state === "new")
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));

  const dueQuota = Math.round(size * 0.7);
  const weakQuota = Math.round(size * 0.2);
  const freshQuota = Math.max(0, size - dueQuota - weakQuota);

  const due = take(duePool, dueQuota);
  const weak = take(weakPool, weakQuota);
  const fresh = take(freshPool, freshQuota);

  // Backfill in priority order: more due work beats padding with new items.
  const backfill = (bucket: string[], pool: Candidate[]) => {
    const deficit = size - (due.length + weak.length + fresh.length);
    if (deficit > 0) bucket.push(...take(pool, deficit));
  };
  backfill(due, duePool);
  backfill(weak, weakPool);
  backfill(fresh, freshPool);

  return { due, weak, fresh };
}

/** §11 — warn when the bank is growing faster than it is being drilled. */
export function newItemShare(states: ReviewStateName[]): number {
  if (states.length === 0) return 0;
  return states.filter((s) => s === "new").length / states.length;
}
export const NEW_SHARE_WARNING = 0.25;
