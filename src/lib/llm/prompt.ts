import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { parseJson } from "@/lib/llm/client";
import { promptSchema } from "@/lib/llm/schemas";
import type { TaskType } from "@/lib/taxonomy";

/**
 * Prompt generation (FR-2).
 *
 * The requirement that matters is FR-2.2: the situation has to be one where
 * *all* the target expressions are natural. A prompt that makes three of four
 * expressions feel bolted on trains the candidate to bolt expressions on, which
 * is exactly the habit the exam punishes.
 */

const TASK_INSTRUCTION: Record<TaskType, string> = {
  phrase:
    "The candidate will answer with a single sentence. The situation must be answerable in one sentence.",
  paragraphe:
    "The candidate will answer with three or four sentences. The situation must invite that much and no more.",
  argument:
    "The candidate will answer with one body paragraph of a lettre à la rédaction: a claim, an explanation, and an example. Give them a position to defend or attack.",
};

const SYSTEM = `You write drill prompts for a TCF/TEF candidate practising timed French production.

You are given target expressions and a task type. Write one situation, in French, that the candidate responds to.

Hard requirements:
- Every target expression must be natural in an answer to your situation. If one of them would have to be forced in, change the situation until it fits — never mention or hint at the expressions themselves.
- The situation must not contain any of the target expressions, nor an obvious paraphrase of one. The candidate has to retrieve them unaided.
- Write in French, in the register of a TCF prompt: neutral, impersonal, concrete.
- Two sentences at most. No questions stacked on questions.
- Anchor it in a specific, ordinary situation, not an abstract invitation to discuss a topic.`;

export async function generatePrompt(params: {
  expressions: string[];
  taskType: TaskType;
  theme: string | null;
  avoid: string[];
}): Promise<string> {
  const avoidBlock = params.avoid.length
    ? `\n\nThe candidate has already seen these situations for this same set. Write a clearly different one:\n${params.avoid.map((a) => `- ${a}`).join("\n")}`
    : "";

  const result = await parseJson<{ statement_fr: string }>({
    system: SYSTEM,
    user: `Target expressions:\n${params.expressions.map((e) => `- ${e}`).join("\n")}

Task type: ${params.taskType}. ${TASK_INSTRUCTION[params.taskType]}${
      params.theme ? `\nTheme: ${params.theme}.` : ""
    }${avoidBlock}`,
    format: zodOutputFormat(promptSchema),
    effort: "low",
  });

  return result.statement_fr.trim();
}
