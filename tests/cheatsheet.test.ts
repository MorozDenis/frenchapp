import { describe, expect, it } from "vitest";
import { groupForCheatsheet, type CheatsheetEntry } from "@/lib/cheatsheet";

const entry = (over: Partial<CheatsheetEntry> = {}): CheatsheetEntry => ({
  id: crypto.randomUUID(),
  text: "néanmoins",
  model_sentence: null,
  gloss_en: null,
  register: "formal",
  rhetorical_function: "nuancer_opposer",
  state: "learning",
  ease: 2.5,
  interval_days: 4,
  ...over,
});

describe("groupForCheatsheet", () => {
  it("keeps the rhetorical groups in a fixed order and parks the rest last", () => {
    const groups = groupForCheatsheet([
      entry({ rhetorical_function: "conclure" }),
      entry({ rhetorical_function: null }),
      entry({ rhetorical_function: "annoncer" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["annoncer", "conclure", "autres"]);
  });

  it("omits groups with no expressions in them", () => {
    const groups = groupForCheatsheet([entry({ rhetorical_function: "illustrer" })]);
    expect(groups.map((g) => g.key)).toEqual(["illustrer"]);
  });

  it("puts the least secure entry first (FR-7.4)", () => {
    const groups = groupForCheatsheet([
      entry({ text: "active-long", state: "active", interval_days: 40 }),
      entry({ text: "learning-short", state: "learning", interval_days: 1 }),
      entry({ text: "never-drilled", state: "new", interval_days: 0 }),
      entry({ text: "learning-long", state: "learning", interval_days: 12 }),
    ]);
    expect(groups[0].entries.map((e) => e.text)).toEqual([
      "never-drilled",
      "learning-short",
      "learning-long",
      "active-long",
    ]);
  });

  it("breaks ties on ease, then alphabetically", () => {
    const groups = groupForCheatsheet([
      entry({ text: "bbb", ease: 2.5 }),
      entry({ text: "aaa", ease: 2.5 }),
      entry({ text: "ccc", ease: 1.8 }),
    ]);
    expect(groups[0].entries.map((e) => e.text)).toEqual(["ccc", "aaa", "bbb"]);
  });
});
