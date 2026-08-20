import { describe, expect, it } from "vitest";
import { MAX_ITEM_SIZE, MIN_ITEM_SIZE, planSession, type PlanCandidate } from "@/lib/plan";

const NOW = new Date("2026-08-20T10:00:00.000Z");
// Deterministic rng so item grouping is reproducible in tests.
const rng = () => 0.5;

const cand = (id: string, over: Partial<PlanCandidate> = {}): PlanCandidate => ({
  expressionId: id,
  dueAt: "2026-08-01T00:00:00.000Z",
  state: "learning",
  recentScore: null,
  theme: "environnement",
  ...over,
});

describe("planSession", () => {
  it("groups every item into 2-4 expressions", () => {
    const candidates = Array.from({ length: 40 }, (_, i) => cand(`e${i}`));
    const items = planSession(candidates, 8, { now: NOW, rng });
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.expressionIds.length).toBeGreaterThanOrEqual(MIN_ITEM_SIZE);
      expect(item.expressionIds.length).toBeLessThanOrEqual(MAX_ITEM_SIZE);
    }
  });

  it("keeps a themed item on a single theme", () => {
    const candidates = [
      ...Array.from({ length: 6 }, (_, i) => cand(`env${i}`, { theme: "environnement" })),
      ...Array.from({ length: 6 }, (_, i) => cand(`tec${i}`, { theme: "technologie" })),
    ];
    const items = planSession(candidates, 4, { now: NOW, rng });
    for (const item of items) {
      if (!item.theme) continue;
      const prefix = item.theme === "environnement" ? "env" : "tec";
      expect(item.expressionIds.every((id) => id.startsWith(prefix))).toBe(true);
    }
  });

  it("never repeats an expression across items", () => {
    const candidates = Array.from({ length: 30 }, (_, i) =>
      cand(`e${i}`, { theme: i % 3 === 0 ? "santé" : "travail" }),
    );
    const items = planSession(candidates, 6, { now: NOW, rng });
    const all = items.flatMap((i) => i.expressionIds);
    expect(new Set(all).size).toBe(all.length);
  });

  it("drops nothing but the impossible when the bank is tiny", () => {
    expect(planSession([], 5, { now: NOW, rng })).toEqual([]);
    expect(planSession([cand("only")], 5, { now: NOW, rng })).toEqual([]);
    const two = planSession([cand("a"), cand("b")], 5, { now: NOW, rng });
    expect(two).toHaveLength(1);
    expect(two[0].expressionIds.sort()).toEqual(["a", "b"]);
  });

  it("never returns more items than asked for", () => {
    const candidates = Array.from({ length: 60 }, (_, i) => cand(`e${i}`));
    expect(planSession(candidates, 3, { now: NOW, rng }).length).toBeLessThanOrEqual(3);
  });
});
