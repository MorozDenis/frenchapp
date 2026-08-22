import { body, fail, route } from "@/lib/api";
import { normalizeForDedupe, parseRawList } from "@/lib/parse-list";

/**
 * FR-1.1, first half — parse a raw paste and deduplicate it against the bank.
 *
 * No model is called here, so this is fast and the paste can be as long as the
 * user likes. Enrichment is the expensive half and lives in its own route,
 * because one request carrying seventy expressions cannot finish inside a
 * hosted function while one carrying eight comfortably can.
 */

/** Purely a sanity bound on request size; nothing here is per-item expensive. */
const MAX_PER_PASTE = 300;

export const POST = route(async ({ supabase, request }) => {
  const { raw } = await body<{ raw?: string }>(request);
  if (!raw?.trim()) return fail("Paste something first");

  const parsed = parseRawList(raw);
  if (parsed.length === 0) return fail("No expressions found in that paste");
  if (parsed.length > MAX_PER_PASTE) {
    return fail(`That paste has ${parsed.length} expressions. Split it up.`);
  }

  const { data: existing, error } = await supabase
    .from("expression")
    .select("id, text, archived_at");
  if (error) throw new Error(error.message);

  const byKey = new Map(
    (existing ?? []).map((e) => [normalizeForDedupe(e.text), e]),
  );

  const duplicates: { text: string; id: string; archived: boolean }[] = [];
  const candidates: { text: string; userGloss: string | null }[] = [];

  for (const candidate of parsed) {
    const match = byKey.get(normalizeForDedupe(candidate.text));
    if (match) {
      duplicates.push({
        text: candidate.text,
        id: match.id,
        archived: match.archived_at !== null,
      });
    } else {
      candidates.push(candidate);
    }
  }

  return { candidates, duplicates, parsedCount: parsed.length };
});
