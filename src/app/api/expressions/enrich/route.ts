import { body, fail, route } from "@/lib/api";
import { enrichExpressions } from "@/lib/llm/enrich";

/**
 * FR-1.1, second half — enrich one batch of parsed expressions.
 *
 * Called repeatedly by the bank screen so a long paste becomes many short
 * requests. Each one has to return inside the function's time limit, which is
 * what the batch ceiling below protects; the client decides how many batches
 * to run and reports progress while they land.
 */

export const maxDuration = 60;

/**
 * Sized for the tail, not the median.
 *
 * Enrichment costs roughly 8s per expression, so two is ~17s typical. That
 * looks needlessly small until you measure twice: the same four expressions
 * took 32s on one run and 65s on another. With swings that wide, only a batch
 * this small stays inside a 60s function on a bad run, and a batch that
 * overruns is work thrown away.
 */
const MAX_BATCH = 2;

export const POST = route(async ({ request }) => {
  const { items } = await body<{
    items?: { text: string; userGloss: string | null }[];
  }>(request);

  if (!items?.length) return fail("Nothing to enrich");
  if (items.length > MAX_BATCH) {
    return fail(`Send at most ${MAX_BATCH} expressions per request`);
  }

  return { items: await enrichExpressions(items) };
});
