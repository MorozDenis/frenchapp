import Anthropic from "@anthropic-ai/sdk";

/**
 * Anthropic client for grading and generation.
 *
 * BRD §8: every model key lives in a server route and never reaches the
 * browser. Nothing in this file may be imported from a client component.
 */

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

let cached: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!cached) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new LlmUnavailableError("ANTHROPIC_API_KEY is not configured");
    }
    cached = new Anthropic();
  }
  return cached;
}

export class LlmUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

/**
 * BRD §6.5 asks for "temperature low". `temperature` was removed from this
 * model family and is rejected with a 400, so run-to-run stability comes from
 * the other three levers the requirement is really after: a fixed rubric in
 * the system prompt, a schema-enforced response, and a bounded effort level.
 */
export type Effort = "low" | "medium" | "high";

/**
 * Runs a structured-output call and returns the parsed object.
 *
 * FR-5.2 and FR-1.1 both want a single retry on a malformed response rather
 * than a hard failure, so one retry is built in here instead of at each call
 * site.
 */
export async function parseJson<T>(params: {
  system: string;
  user: string;
  format: unknown;
  effort?: Effort;
  maxTokens?: number;
}): Promise<T> {
  const client = anthropic();
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response;
    try {
      response = await client.messages.parse({
        model: MODEL,
        max_tokens: params.maxTokens ?? 16000,
        system: params.system,
        messages: [{ role: "user", content: params.user }],
        output_config: {
          effort: params.effort ?? "medium",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          format: params.format as any,
        },
      });
    } catch (error) {
      // Network and 5xx failures are already retried by the SDK; anything
      // surfacing here is worth one more try before giving up.
      lastError = error;
      continue;
    }

    // A policy decline stops the turn with no content. There is no useful
    // retry for it, and FR-5.2 says a failed grade must not block the drill.
    if (response.stop_reason === "refusal") {
      throw new LlmUnavailableError(
        "The model declined to answer this request.",
      );
    }

    if (response.parsed_output) return response.parsed_output as T;
    lastError = new Error("Response did not match the expected schema");
  }

  throw new LlmUnavailableError(
    lastError instanceof Error ? lastError.message : "LLM call failed",
    lastError,
  );
}
