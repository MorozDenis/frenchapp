/**
 * FR-7 — the reference sheet, derived from drill data rather than
 * hand-maintained. Grouping is by rhetorical function so it reads as "what do
 * I say when I want to concede a point", which is the question you actually
 * have in the exam.
 */

import {
  RHETORICAL_FUNCTIONS,
  type RhetoricalFunction,
  type ReviewStateName,
} from "@/lib/taxonomy";

export interface CheatsheetEntry {
  id: string;
  text: string;
  model_sentence: string | null;
  gloss_en: string | null;
  register: string;
  rhetorical_function: RhetoricalFunction | null;
  state: ReviewStateName;
  ease: number;
  interval_days: number;
}

export interface CheatsheetGroup {
  key: RhetoricalFunction | "autres";
  entries: CheatsheetEntry[];
}

const STATE_RANK: Record<ReviewStateName, number> = {
  new: 0,
  learning: 1,
  active: 2,
};

/**
 * FR-7.4 — least secure first. State dominates, because a `new` expression is
 * less secure than any `learning` one whatever its ease; within a state, the
 * shorter interval and the lower ease are the two things that say "this one is
 * still costing you".
 */
export function securityRank(entry: CheatsheetEntry): number[] {
  return [STATE_RANK[entry.state], entry.interval_days, entry.ease];
}

export function groupForCheatsheet(entries: CheatsheetEntry[]): CheatsheetGroup[] {
  const buckets = new Map<RhetoricalFunction | "autres", CheatsheetEntry[]>();

  for (const entry of entries) {
    const key = entry.rhetorical_function ?? "autres";
    const bucket = buckets.get(key) ?? [];
    bucket.push(entry);
    buckets.set(key, bucket);
  }

  // Fixed group order, with topical vocabulary that performs no rhetorical
  // move collected at the end rather than dropped.
  const order: (RhetoricalFunction | "autres")[] = [...RHETORICAL_FUNCTIONS, "autres"];

  return order
    .filter((key) => buckets.has(key))
    .map((key) => ({
      key,
      entries: [...(buckets.get(key) ?? [])].sort((a, b) => {
        const left = securityRank(a);
        const right = securityRank(b);
        for (let i = 0; i < left.length; i += 1) {
          if (left[i] !== right[i]) return left[i] - right[i];
        }
        return a.text.localeCompare(b.text, "fr");
      }),
    }));
}
