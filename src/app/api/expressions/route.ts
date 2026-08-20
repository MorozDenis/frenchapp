import { body, fail, route } from "@/lib/api";
import { normalizeForDedupe } from "@/lib/parse-list";
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

/** The shape the review screen sends back after the user has edited it. */
interface IncomingExpression {
  text: string;
  type: string;
  register: string;
  cefr: string;
  gloss_en: string | null;
  model_sentence: string | null;
  error_note: string | null;
  rhetorical_function: string | null;
  theme: string | null;
}

const oneOf = <T extends readonly string[]>(
  list: T,
  value: unknown,
  fallback: T[number],
): T[number] => (list.includes(value as string) ? (value as T[number]) : fallback);

export const GET = route(async ({ supabase, request }) => {
  const url = new URL(request.url);
  const includeArchived = url.searchParams.get("archived") === "true";

  let query = supabase
    .from("expression")
    .select("*")
    .order("created_at", { ascending: false });

  if (!includeArchived) query = query.is("archived_at", null);

  const [{ data, error }, review] = await Promise.all([
    query,
    supabase.from("review_state").select("*"),
  ]);
  if (error) throw new Error(error.message);
  if (review.error) throw new Error(review.error.message);

  // Joined by hand rather than by an embedded select: the relationship graph
  // in the generated types is the one part most likely to drift out of step
  // with the migrations, and this read is not hot.
  const states = new Map((review.data ?? []).map((r) => [r.expression_id, r]));

  return {
    expressions: (data ?? []).map((e) => ({
      ...e,
      review_state: states.get(e.id) ?? null,
    })),
  };
});

/**
 * FR-1.2 / FR-1.4 — saves the reviewed enrichment. Every row records whether it
 * came from a paste or from a generated pack, so the two can be compared later.
 */
export const POST = route(async ({ supabase, user, request }) => {
  const { items, source } = await body<{
    items?: IncomingExpression[];
    source?: string;
  }>(request);

  if (!items?.length) return fail("Nothing to save");

  const resolvedSource = source === "generated" ? "generated" : "user";

  // Collapse duplicates inside the batch itself before the database has to.
  const seen = new Set<string>();
  const rows = items
    .filter((item) => {
      const key = normalizeForDedupe(item.text ?? "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => ({
      user_id: user.id,
      text: item.text.trim(),
      type: oneOf(EXPRESSION_TYPES, item.type, "collocation") as ExpressionType,
      register: oneOf(REGISTERS, item.register, "neutral") as Register,
      cefr: oneOf(CEFR_BANDS, item.cefr, "B2") as CefrBand,
      gloss_en: item.gloss_en?.trim() || null,
      model_sentence: item.model_sentence?.trim() || null,
      error_note: item.error_note?.trim() || null,
      theme: item.theme?.trim() || null,
      rhetorical_function: RHETORICAL_FUNCTIONS.includes(
        item.rhetorical_function as RhetoricalFunction,
      )
        ? (item.rhetorical_function as RhetoricalFunction)
        : null,
      source: resolvedSource as "user" | "generated",
    }));

  if (rows.length === 0) return fail("Nothing to save");

  const { data, error } = await supabase
    .from("expression")
    .insert(rows)
    .select("id, text");

  if (error) {
    if (error.code === "23505") {
      return fail("Some of those expressions are already in the bank", 409);
    }
    throw new Error(error.message);
  }

  return { saved: data ?? [] };
});
