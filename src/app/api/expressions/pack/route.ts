import { body, fail, route } from "@/lib/api";
import { generatePack } from "@/lib/llm/enrich";
import { normalizeForDedupe } from "@/lib/parse-list";
import { THEMES, type Theme } from "@/lib/taxonomy";

/** FR-1.3 — a themed pack of 15–25 candidates to accept or discard. */

const MIN_PACK = 15;
const MAX_PACK = 25;

export const POST = route(async ({ supabase, request }) => {
  const { theme, count } = await body<{ theme?: string; count?: number }>(request);
  if (!theme || !THEMES.includes(theme as Theme)) {
    return fail(`Theme must be one of: ${THEMES.join(", ")}`);
  }

  const size = Math.min(MAX_PACK, Math.max(MIN_PACK, Math.round(count ?? 20)));

  const { data: existing, error } = await supabase
    .from("expression")
    .select("text");
  if (error) throw new Error(error.message);

  const owned = (existing ?? []).map((e) => e.text);
  const generated = await generatePack(theme as Theme, size, owned);

  // The exclusion list is a request, not a guarantee — filter on the way back
  // so a repeat never reaches the review screen.
  const ownedKeys = new Set(owned.map(normalizeForDedupe));
  const items = generated.filter((i) => !ownedKeys.has(normalizeForDedupe(i.text)));

  return { items, theme, requested: size, filtered: generated.length - items.length };
});
