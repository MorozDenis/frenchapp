import { route } from "@/lib/api";
import { groupForCheatsheet, type CheatsheetEntry } from "@/lib/cheatsheet";

export const GET = route(async ({ supabase }) => {
  const [expressions, reviews] = await Promise.all([
    supabase
      .from("expression")
      .select("id, text, model_sentence, gloss_en, register, rhetorical_function")
      .is("archived_at", null),
    supabase.from("review_state").select("expression_id, state, ease, interval_days"),
  ]);

  if (expressions.error) throw new Error(expressions.error.message);
  if (reviews.error) throw new Error(reviews.error.message);

  const states = new Map((reviews.data ?? []).map((r) => [r.expression_id, r]));

  const entries: CheatsheetEntry[] = (expressions.data ?? []).map((e) => {
    const review = states.get(e.id);
    return {
      ...e,
      state: review?.state ?? "new",
      ease: review?.ease ?? 2.5,
      interval_days: review?.interval_days ?? 0,
    };
  });

  return { groups: groupForCheatsheet(entries) };
});
