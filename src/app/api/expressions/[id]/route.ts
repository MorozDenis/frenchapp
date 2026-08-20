import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { requireUser } from "@/lib/supabase/server";
import type { ExpressionRow } from "@/lib/database.types";
import {
  CEFR_BANDS,
  EXPRESSION_TYPES,
  REGISTERS,
  RHETORICAL_FUNCTIONS,
  type CefrBand,
  type ExpressionType,
  type Register,
  type RhetoricalFunction,
} from "@/lib/taxonomy";

type Patch = Partial<
  Pick<
    ExpressionRow,
    | "text"
    | "type"
    | "register"
    | "cefr"
    | "gloss_en"
    | "model_sentence"
    | "error_note"
    | "theme"
    | "rhetorical_function"
    | "archived_at"
  >
>;

const nullableText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/**
 * FR-1.5 — expressions are archived, never deleted, so their attempt history
 * survives. Restoring is the same call with `archived: false`.
 *
 * FR-1.2 also lands here: the review screen's edits are saved through this
 * route, so any field the model got wrong can be corrected after the fact.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth) return fail("Not signed in", 401);
  const { id } = await context.params;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("Request body must be JSON");
  }

  const update: Patch = {};

  if ("archived" in payload) {
    update.archived_at = payload.archived ? new Date().toISOString() : null;
  }
  if (typeof payload.text === "string" && payload.text.trim()) {
    update.text = payload.text.trim();
  }
  if (EXPRESSION_TYPES.includes(payload.type as ExpressionType)) {
    update.type = payload.type as ExpressionType;
  }
  if (REGISTERS.includes(payload.register as Register)) {
    update.register = payload.register as Register;
  }
  if (CEFR_BANDS.includes(payload.cefr as CefrBand)) {
    update.cefr = payload.cefr as CefrBand;
  }
  if ("rhetorical_function" in payload) {
    update.rhetorical_function = RHETORICAL_FUNCTIONS.includes(
      payload.rhetorical_function as RhetoricalFunction,
    )
      ? (payload.rhetorical_function as RhetoricalFunction)
      : null;
  }
  if ("gloss_en" in payload) update.gloss_en = nullableText(payload.gloss_en);
  if ("model_sentence" in payload) {
    update.model_sentence = nullableText(payload.model_sentence);
  }
  if ("error_note" in payload) update.error_note = nullableText(payload.error_note);
  if ("theme" in payload) update.theme = nullableText(payload.theme);

  if (Object.keys(update).length === 0) return fail("Nothing to update");

  const { data, error } = await auth.supabase
    .from("expression")
    .update(update)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return fail("Another expression in the bank already has that text", 409);
    }
    return fail(error.message, 500);
  }
  if (!data) return fail("Expression not found", 404);

  return NextResponse.json({ expression: data });
}
