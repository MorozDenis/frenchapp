import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { requireUser } from "@/lib/supabase/server";
import { LlmUnavailableError } from "@/lib/llm/client";
import type { Database } from "@/lib/database.types";

export type Db = SupabaseClient<Database>;

export const json = <T>(body: T, status = 200) =>
  NextResponse.json(body, { status });

export const fail = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status });

/**
 * Wraps a route in authentication and a single error boundary.
 *
 * LLM failures come back as 503 with a recognisable code so the drill can tell
 * "the grader is down, your answer is saved" apart from "you sent nonsense" —
 * FR-5.2 turns on that distinction.
 */
export function route<T>(
  handler: (ctx: { supabase: Db; user: User; request: Request }) => Promise<T>,
) {
  return async (request: Request) => {
    const auth = await requireUser();
    if (!auth) return fail("Not signed in", 401);

    try {
      const result = await handler({
        supabase: auth.supabase as Db,
        user: auth.user,
        request,
      });
      return result instanceof NextResponse ? result : json(result);
    } catch (error) {
      if (error instanceof LlmUnavailableError) {
        return NextResponse.json(
          { error: error.message, code: "llm_unavailable" },
          { status: 503 },
        );
      }
      const message =
        error instanceof Error ? error.message : "Unexpected server error";
      console.error("[route]", message, error);
      return fail(message, 500);
    }
  };
}

export async function body<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Request body must be JSON");
  }
}
