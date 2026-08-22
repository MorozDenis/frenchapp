/**
 * Live check against whatever provider the environment points at.
 *
 * Skipped unless LLM_API_KEY is set, so `npm test` stays offline and fast.
 * Run it after changing provider, model, or any prompt:
 *
 *   LLM_API_KEY=... LLM_BASE_URL=... LLM_MODEL=... npx vitest run tests/live-provider.test.ts
 *
 * It exercises the three calls the drill actually depends on. A provider can
 * accept our requests and still return a shape the schema rejects, which is
 * exactly the failure this catches.
 */
import { describe, expect, it } from "vitest";
import { enrichExpressions, generatePack } from "@/lib/llm/enrich";
import { generatePrompt } from "@/lib/llm/prompt";
import { scoreAttempt } from "@/lib/llm/score";
import { ERROR_CATEGORIES, EXPRESSION_TYPES } from "@/lib/taxonomy";

const live = process.env.LLM_API_KEY ? describe : describe.skip;

live("live provider", () => {
  it("enriches expressions (FR-1.1)", { timeout: 120_000 }, async () => {
    const items = await enrichExpressions([
      { text: "néanmoins", userGloss: "nevertheless" },
      { text: "prendre une décision", userGloss: null },
    ]);
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(EXPRESSION_TYPES).toContain(item.type);
      expect(item.model_sentence?.length ?? 0).toBeGreaterThan(5);
      expect(["A1", "A2", "B1", "B2", "C1", "C2"]).toContain(item.cefr);
    }
  });

  it("generates a themed pack (FR-1.3)", { timeout: 120_000 }, async () => {
    // One request's worth, which is what the route asks for. Bigger packs are
    // reached by asking again, not by one long call.
    const started = Date.now();
    const items = await generatePack("environnement", 3, ["le réchauffement climatique"]);
    const elapsed = Date.now() - started;
    expect(items.length).toBeGreaterThanOrEqual(2);
    // Not asserted against the platform's function limit: measured latency on
    // this provider swings between roughly 25s and 75s for identical work, so
    // such an assertion would fail for reasons no code change can fix. It is
    // reported instead, because the tail genuinely does exceed a 60s function
    // and that is a deployment decision, not a bug.
    console.log(`  pack of ${items.length} took ${(elapsed / 1000).toFixed(1)}s`);
    expect(elapsed).toBeLessThan(180_000);
  });

  it("writes a prompt covering the whole set (FR-2)", { timeout: 120_000 }, async () => {
    const statement = await generatePrompt({
      expressions: ["néanmoins", "force est de constater que"],
      taskType: "phrase",
      theme: "environnement",
      avoid: [],
    });
    expect(statement.length).toBeGreaterThan(15);
    // FR-2.2: the prompt must not hand the candidate the expression itself.
    expect(statement.toLowerCase()).not.toContain("néanmoins");
  });

  it("scores an attempt against the closed taxonomy (FR-5)", { timeout: 120_000 }, async () => {
    const result = await scoreAttempt({
      statementFr: "Votre ville envisage d'interdire les voitures en centre-ville.",
      taskType: "phrase",
      targets: [
        { id: "e1", text: "néanmoins" },
        { id: "e2", text: "prendre une décision" },
      ],
      production:
        "Cette mesure est ambitieux. Néanmoins, il faut que la mairie prend une décision rapide.",
      mode: "text",
    });

    expect(Object.keys(result.targetUsage).sort()).toEqual(["e1", "e2"]);
    expect(result.grammarScore).toBeGreaterThanOrEqual(0);
    expect(result.grammarScore).toBeLessThanOrEqual(3);
    expect(result.collocationScore).toBeGreaterThanOrEqual(0);
    expect(result.collocationScore).toBeLessThanOrEqual(3);
    expect(result.correctedText.length).toBeGreaterThan(10);
    expect(result.keyFix.length).toBeGreaterThan(5);
    // FR-5.1 — nothing outside the closed taxonomy may survive.
    for (const tag of result.errorTags) expect(ERROR_CATEGORIES).toContain(tag);

    console.log("  scored:", JSON.stringify({
      usage: result.targetUsage,
      grammar: result.grammarScore,
      collocation: result.collocationScore,
      tags: result.errorTags,
      corrected: result.correctedText,
      keyFix: result.keyFix,
    }, null, 2));
  });
});
