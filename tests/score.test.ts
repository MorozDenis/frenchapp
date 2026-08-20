import { describe, expect, it } from "vitest";
import { normalizeScore } from "@/lib/llm/score";
import type { RawScore } from "@/lib/llm/schemas";

const targets = [
  { id: "e1", text: "néanmoins" },
  { id: "e2", text: "prendre une décision" },
];

const raw = (over: Partial<RawScore> = {}): RawScore => ({
  target_usage: [
    { expression: "néanmoins", verdict: "present_correct" },
    { expression: "prendre une décision", verdict: "present_misused" },
  ],
  collocation_score: 2,
  grammar_score: 3,
  errors: [{ category: "subjonctif", quote: "il faut que je peux" }],
  corrected_text: "  Il faut que je puisse.  ",
  key_fix: "Use the subjunctive after il faut que.",
  missing_accents: true,
  hesitation_count: 4,
  ...over,
});

describe("normalizeScore", () => {
  it("keys verdicts by expression id regardless of case and spacing", () => {
    const r = normalizeScore(
      raw({
        target_usage: [
          { expression: "  NÉANMOINS ", verdict: "present_correct" },
          { expression: "prendre  une décision", verdict: "absent" },
        ],
      }),
      targets,
      "text",
    );
    expect(r.targetUsage).toEqual({ e1: "present_correct", e2: "absent" });
  });

  it("treats an expression the grader never mentioned as absent", () => {
    const r = normalizeScore(raw({ target_usage: [] }), targets, "text");
    expect(r.targetUsage).toEqual({ e1: "absent", e2: "absent" });
  });

  it("drops error categories outside the closed taxonomy (FR-5.1)", () => {
    const r = normalizeScore(
      raw({
        errors: [
          { category: "article", quote: "le eau" },
          { category: "style" as never, quote: "trop familier" },
          { category: "vocabulary" as never, quote: "faux ami" },
          { category: "negation", quote: "je sais pas" },
        ],
      }),
      targets,
      "text",
    );
    expect(r.errorTags).toEqual(["article", "negation"]);
  });

  it("clamps scores into 0-3 and rounds", () => {
    const r = normalizeScore(
      raw({ collocation_score: 7, grammar_score: -2 }),
      targets,
      "text",
    );
    expect(r.collocationScore).toBe(3);
    expect(r.grammarScore).toBe(0);
    expect(normalizeScore(raw({ grammar_score: 2.6 }), targets, "text").grammarScore).toBe(3);
    expect(normalizeScore(raw({ grammar_score: NaN }), targets, "text").grammarScore).toBe(0);
  });

  it("ignores accent and hesitation reports that do not apply to the mode", () => {
    const spoken = normalizeScore(raw(), targets, "voice");
    expect(spoken.missingAccents).toBe(false);
    expect(spoken.hesitationCount).toBe(4);

    const typed = normalizeScore(raw(), targets, "text");
    expect(typed.missingAccents).toBe(true);
    expect(typed.hesitationCount).toBe(0);
  });

  it("trims the correction and key fix", () => {
    expect(normalizeScore(raw(), targets, "text").correctedText).toBe("Il faut que je puisse.");
  });
});
