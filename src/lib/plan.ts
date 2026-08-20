/**
 * Turns a session's expression selection into drill items.
 *
 * FR-2.1 pairs each prompt with two to four expressions, and FR-2.2 requires
 * the prompt to make all of them natural. Those two pull in the same
 * direction: expressions that share a theme are far easier to write one honest
 * situation around than four unrelated chunks, so items are grouped by theme
 * before they are chunked.
 */

import { composeSession, type Candidate } from "@/lib/srs";

export const MIN_ITEM_SIZE = 2;
export const MAX_ITEM_SIZE = 4;
const TARGET_ITEM_SIZE = 3;

export interface PlanCandidate extends Candidate {
  theme: string | null;
}

export interface PlannedItem {
  expressionIds: string[];
  theme: string | null;
}

export type Rng = () => number;

function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function planSession(
  candidates: PlanCandidate[],
  itemCount: number,
  options: { now?: Date; rng?: Rng } = {},
): PlannedItem[] {
  const rng = options.rng ?? Math.random;
  const size = itemCount * TARGET_ITEM_SIZE;

  const composition = composeSession(candidates, size, options.now ?? new Date());
  const selected = new Set([
    ...composition.due,
    ...composition.weak,
    ...composition.fresh,
  ]);
  if (selected.size === 0) return [];

  const byId = new Map(candidates.map((c) => [c.expressionId, c]));

  // Bucket by theme so a prompt has a chance of covering its whole set.
  const buckets = new Map<string, string[]>();
  for (const id of selected) {
    const theme = byId.get(id)?.theme ?? "";
    const bucket = buckets.get(theme) ?? [];
    bucket.push(id);
    buckets.set(theme, bucket);
  }

  const items: PlannedItem[] = [];
  const orphans: string[] = [];

  for (const [theme, ids] of buckets) {
    const shuffled = shuffle(ids, rng);
    while (shuffled.length >= MIN_ITEM_SIZE) {
      const take = Math.min(TARGET_ITEM_SIZE, shuffled.length);
      // Taking three from four would strand a single expression, so absorb it.
      const chunk =
        shuffled.length - take === 1 && take < MAX_ITEM_SIZE
          ? shuffled.splice(0, take + 1)
          : shuffled.splice(0, take);
      items.push({ expressionIds: chunk, theme: theme || null });
    }
    orphans.push(...shuffled);
  }

  // Single leftovers from different themes are drilled together; the prompt for
  // a mixed item has no theme to anchor on, which is a fair reflection of it.
  const leftovers = shuffle(orphans, rng);
  while (leftovers.length >= MIN_ITEM_SIZE) {
    items.push({
      expressionIds: leftovers.splice(0, Math.min(TARGET_ITEM_SIZE, leftovers.length)),
      theme: null,
    });
  }
  // A lone survivor joins the smallest item rather than being dropped.
  if (leftovers.length === 1) {
    const smallest = items
      .filter((i) => i.expressionIds.length < MAX_ITEM_SIZE)
      .sort((a, b) => a.expressionIds.length - b.expressionIds.length)[0];
    if (smallest) smallest.expressionIds.push(leftovers[0]);
  }

  return shuffle(items, rng).slice(0, itemCount);
}
