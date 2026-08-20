import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { parseJson } from "@/lib/llm/client";
import { clampScore, scoreSchema, type RawScore } from "@/lib/llm/schemas";
import { normalizeForDedupe } from "@/lib/parse-list";
import {
  ERROR_CATEGORIES,
  TARGET_USAGE_VALUES,
  type DrillMode,
  type ErrorCategory,
  type TargetUsage,
} from "@/lib/taxonomy";

/**
 * Scoring (FR-5). One call, one fixed rubric, one schema.
 *
 * The rubric text below is the contract the trend charts rest on. Editing it
 * changes what the numbers mean, so historical comparisons across an edit are
 * not like-for-like — treat it as versioned.
 */

const RUBRIC = `RUBRIC — apply exactly, and nothing beyond it.

Axis 1 — Target usage, one verdict per target expression:
- present_correct: the expression appears and is used correctly, in a construction and register that work.
- present_misused: the expression appears but is wrong — wrong construction, wrong preposition, wrong register, or a meaning it does not carry.
- absent: the expression does not appear. A near-synonym is not the expression.

Axis 2 — Collocation and register, 0 to 3:
- 3: reads as French written by an educated native. Register is right for a lettre à la rédaction throughout.
- 2: idiomatic, with one register slip or one unidiomatic pairing.
- 1: understandable but visibly translated, or too informal for the task.
- 0: word-by-word from another language.

Axis 3 — Grammar accuracy, 0 to 3:
- 3: no errors.
- 2: one error, and it does not obscure meaning.
- 1: two or three errors, or one that obscures meaning.
- 0: four or more errors, or the sentence does not parse.

Tag every grammar error with exactly one category from this closed list:
${ERROR_CATEGORIES.join(", ")}
This list is closed. If an error does not fit any category, do not report it. Never invent a category name.

Accents:
- Report a missing or wrong accent through missing_accents, not as a grammar error, unless the accent changes the word into a different word that is then grammatically wrong (a/à, ou/où) — those are orthographe.

corrected_text:
- Rewrite the learner's text so it is correct and idiomatic. Keep their argument, their examples, and roughly their length. Do not add content they did not write, and do not insert target expressions they left out.

key_fix:
- One sentence. The single change that would most improve the answer. Not a grammar lesson, not a list, not encouragement.`;

const TEXT_MODE_NOTE = `The learner typed this under time pressure with spell-check disabled. hesitation_count is 0.`;

const VOICE_MODE_NOTE = `This is a Whisper transcript of the learner speaking, so it carries no punctuation the learner chose and may contain transcription artefacts.
- Judge grammar on what was evidently said, not on transcript punctuation or capitalisation.
- Do not report missing accents for speech: set missing_accents to false.
- Count filled pauses and false starts (euh, hmm, restarts, repetitions) in hesitation_count. This figure is reported to the learner but is not scored, so it must not influence any axis.`;

export interface ScoreInput {
  statementFr: string;
  taskType: string;
  targets: { id: string; text: string }[];
  production: string;
  mode: DrillMode;
}

export interface ScoreResult {
  targetUsage: Record<string, TargetUsage>;
  collocationScore: number;
  grammarScore: number;
  errorTags: ErrorCategory[];
  correctedText: string;
  keyFix: string;
  missingAccents: boolean;
  hesitationCount: number;
}

export async function scoreAttempt(input: ScoreInput): Promise<ScoreResult> {
  const system = `You grade timed French production for a TCF/TEF candidate. You are a marker, not a teacher: return the schema and nothing else.

${RUBRIC}`;

  const user = `${input.mode === "voice" ? VOICE_MODE_NOTE : TEXT_MODE_NOTE}

PROMPT SHOWN (${input.taskType}):
${input.statementFr}

TARGET EXPRESSIONS:
${input.targets.map((t) => `- ${t.text}`).join("\n")}

LEARNER'S PRODUCTION:
${input.production}`;

  const raw = await parseJson<RawScore>({
    system,
    user,
    format: zodOutputFormat(scoreSchema),
    effort: "medium",
  });

  return normalizeScore(raw, input.targets, input.mode);
}

/**
 * Turns a model response into storable values.
 *
 * This is where FR-5.1 is actually enforced: a category outside the closed set
 * is dropped rather than stored, because one stray label would put a phantom
 * bar on the month-over-month chart.
 */
export function normalizeScore(
  raw: RawScore,
  targets: { id: string; text: string }[],
  mode: DrillMode,
): ScoreResult {
  const byText = new Map(
    (raw.target_usage ?? []).map((u) => [normalizeForDedupe(u.expression ?? ""), u.verdict]),
  );

  const targetUsage: Record<string, TargetUsage> = {};
  for (const target of targets) {
    const verdict = byText.get(normalizeForDedupe(target.text));
    // An expression the grader failed to mention was not observed in the
    // answer, and `absent` is the honest reading of that.
    targetUsage[target.id] =
      verdict && TARGET_USAGE_VALUES.includes(verdict) ? verdict : "absent";
  }

  const allowed = new Set<string>(ERROR_CATEGORIES);
  const errorTags = (raw.errors ?? [])
    .map((e) => e.category)
    .filter((c): c is ErrorCategory => allowed.has(c));

  return {
    targetUsage,
    collocationScore: clampScore(raw.collocation_score),
    grammarScore: clampScore(raw.grammar_score),
    errorTags,
    correctedText: (raw.corrected_text ?? "").trim(),
    keyFix: (raw.key_fix ?? "").trim(),
    missingAccents: mode === "voice" ? false : Boolean(raw.missing_accents),
    hesitationCount:
      mode === "voice" && Number.isFinite(raw.hesitation_count)
        ? Math.max(0, Math.round(raw.hesitation_count))
        : 0,
  };
}
