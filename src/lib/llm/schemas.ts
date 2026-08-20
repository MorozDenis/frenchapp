import { z } from "zod";
import {
  CEFR_BANDS,
  ERROR_CATEGORIES,
  EXPRESSION_TYPES,
  REGISTERS,
  RHETORICAL_FUNCTIONS,
  TARGET_USAGE_VALUES,
} from "@/lib/taxonomy";

/**
 * Response schemas for every structured-output call.
 *
 * Scores are plain numbers here rather than bounded integers: the JSON-schema
 * keywords for ranges are not uniformly honoured by structured output, so the
 * range is stated in the field description and enforced by `clampScore` on the
 * way in. A schema the API might reject is worse than a clamp.
 */

export const enrichedItemSchema = z.object({
  text: z.string().describe("The expression, normalised to its citation form."),
  type: z.enum(EXPRESSION_TYPES),
  register: z.enum(REGISTERS),
  cefr: z.enum(CEFR_BANDS),
  gloss_en: z.string().describe("Short English gloss, no more than six words."),
  model_sentence: z
    .string()
    .describe(
      "One model sentence in French using the expression, at the register given, in a tone suitable for a TCF lettre à la rédaction.",
    ),
  error_note: z
    .string()
    .nullable()
    .describe(
      "The single mistake a Russian-speaking B1 learner most often makes with this expression, in one clause. Null when there is no characteristic error.",
    ),
  rhetorical_function: z
    .enum(RHETORICAL_FUNCTIONS)
    .nullable()
    .describe(
      "Which move in an argument this expression performs. Null for topical lexis that performs no rhetorical move.",
    ),
  theme: z
    .string()
    .nullable()
    .describe("TCF theme this expression belongs to, or null if theme-neutral."),
});
export type EnrichedItem = z.infer<typeof enrichedItemSchema>;

export const enrichmentSchema = z.object({
  items: z.array(enrichedItemSchema),
});

export const promptSchema = z.object({
  statement_fr: z
    .string()
    .describe(
      "The situation, written in French, addressed to the candidate. Two sentences at most.",
    ),
});

export const usageVerdictSchema = z.object({
  expression: z.string().describe("The target expression, copied verbatim."),
  verdict: z.enum(TARGET_USAGE_VALUES),
});

export const errorSchema = z.object({
  category: z.enum(ERROR_CATEGORIES),
  quote: z
    .string()
    .describe("The exact fragment of the learner's text that is wrong."),
});

export const scoreSchema = z.object({
  target_usage: z.array(usageVerdictSchema),
  collocation_score: z
    .number()
    .describe(
      "Integer 0-3. Does it sound like French, and is it formal enough for a lettre à la rédaction?",
    ),
  grammar_score: z.number().describe("Integer 0-3 for grammatical accuracy."),
  errors: z.array(errorSchema),
  corrected_text: z
    .string()
    .describe("The learner's text, corrected, keeping their intent and content."),
  key_fix: z
    .string()
    .describe(
      "One sentence naming the single most important fix. Not a lesson, not a list.",
    ),
  missing_accents: z
    .boolean()
    .describe("True if accents are missing that would otherwise be correct."),
  hesitation_count: z
    .number()
    .describe(
      "Count of filled pauses and false starts (euh, hmm, restarts). 0 for typed text.",
    ),
});
export type RawScore = z.infer<typeof scoreSchema>;

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(3, Math.max(0, Math.round(value)));
}
