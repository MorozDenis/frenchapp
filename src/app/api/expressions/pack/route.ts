import { body, fail, route } from "@/lib/api";
import { generatePack } from "@/lib/llm/enrich";
import { normalizeForDedupe } from "@/lib/parse-list";
import { THEMES, type Theme } from "@/lib/taxonomy";

/**
 * These routes wait on a language model. The platform default cuts a function
 * off long before one returns, and a killed function loses the attempt — so the
 * ceiling is raised to the maximum the plan allows.
 */
export const maxDuration = 60;


/** FR-1.3 — a themed pack of 15–25 candidates to accept or discard. */

// FR-1.3 wants 15-25 candidates to choose from, but that many cannot be
// generated inside one function invocation. The route returns a slice and the
// bank screen asks again, which reaches the same place without a timeout.
const MIN_PACK = 3;
const MAX_PACK = 3;

export const POST = route(async ({ supabase, request }) => {
  const { theme, count, exclude } = await body<{
    theme?: string;
    count?: number;
    exclude?: string[];
  }>(request);
  if (!theme || !THEMES.includes(theme as Theme)) {
    return fail(`Theme must be one of: ${THEMES.join(", ")}`);
  }

  const size = Math.min(MAX_PACK, Math.max(MIN_PACK, Math.round(count ?? 20)));

  const { data: existing, error } = await supabase
    .from("expression")
    .select("text");
  if (error) throw new Error(error.message);

  // The bank, plus whatever the caller already has on screen from an earlier
  // batch of this same pack.
  const owned = [...(existing ?? []).map((e) => e.text), ...(exclude ?? [])];
  const generated = await generatePack(theme as Theme, size, owned);

  // The exclusion list is a request, not a guarantee — filter on the way back
  // so a repeat never reaches the review screen.
  const ownedKeys = new Set(owned.map(normalizeForDedupe));
  const items = generated.filter((i) => !ownedKeys.has(normalizeForDedupe(i.text)));

  return { items, theme, requested: size, filtered: generated.length - items.length };
});
