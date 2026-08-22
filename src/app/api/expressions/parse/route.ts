import { body, fail, route } from "@/lib/api";
import { enrichExpressions } from "@/lib/llm/enrich";
import { normalizeForDedupe, parseRawList } from "@/lib/parse-list";

/**
 * These routes wait on a language model. The platform default cuts a function
 * off long before one returns, and a killed function loses the attempt — so the
 * ceiling is raised to the maximum the plan allows.
 */
export const maxDuration = 60;


/**
 * FR-1.1 — parse a raw paste, deduplicate against the bank, enrich the rest.
 *
 * Duplicates are reported rather than silently dropped: pasting a list you
 * already own and being told "nothing new" is information, and an archived
 * match is a prompt to restore rather than to create a second history.
 */

// Each expression costs real seconds of model time, and the whole request has
// to return inside the function's limit. Bigger pastes are split by the user
// rather than silently truncated.
const MAX_PER_PASTE = 10;

export const POST = route(async ({ supabase, request }) => {
  const { raw } = await body<{ raw?: string }>(request);
  if (!raw?.trim()) return fail("Paste something first");

  const parsed = parseRawList(raw);
  if (parsed.length === 0) return fail("No expressions found in that paste");
  if (parsed.length > MAX_PER_PASTE) {
    return fail(
      `That paste has ${parsed.length} expressions. Add at most ${MAX_PER_PASTE} at a time — enrichment takes a few seconds each, and a bank that outruns your drilling is the failure mode here anyway.`,
    );
  }

  const { data: existing, error } = await supabase
    .from("expression")
    .select("id, text, archived_at");
  if (error) throw new Error(error.message);

  const byKey = new Map(
    (existing ?? []).map((e) => [normalizeForDedupe(e.text), e]),
  );

  const duplicates: { text: string; id: string; archived: boolean }[] = [];
  const fresh: typeof parsed = [];

  for (const candidate of parsed) {
    const match = byKey.get(normalizeForDedupe(candidate.text));
    if (match) {
      duplicates.push({
        text: candidate.text,
        id: match.id,
        archived: match.archived_at !== null,
      });
    } else {
      fresh.push(candidate);
    }
  }

  const items = await enrichExpressions(fresh);

  return { items, duplicates, parsedCount: parsed.length };
});
