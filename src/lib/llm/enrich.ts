import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { parseJson } from "@/lib/llm/client";
import { enrichmentSchema, type EnrichedItem } from "@/lib/llm/schemas";
import {
  EXPRESSION_TYPES,
  RHETORICAL_FUNCTIONS,
  THEMES,
  type Theme,
} from "@/lib/taxonomy";

const TYPE_GUIDE = `Expression types:
- connector: a discourse marker that links or frames an argument (néanmoins, force est de constater que)
- collocation: a fixed noun+verb or noun+adjective pairing (prendre une décision, jouer un rôle essentiel)
- verb_pattern: a verb with the construction it governs (permettre à qqn de faire, s'agir de)
- topical_lexis: subject-matter vocabulary for a TCF theme (le réchauffement climatique, la fracture numérique)`;

const SYSTEM = `You prepare French expressions for a TCF/TEF candidate drilling written and spoken production at the B1→B2 boundary.

For each expression you are given, return its citation form and the fields requested by the schema.

${TYPE_GUIDE}

Rules:
- The model sentence must be one the candidate could plausibly write in a lettre à la rédaction: an argued, formal-neutral register, no dialogue, no first-person anecdote.
- The English gloss is for recognition only. Keep it to a few words.
- The error note names one characteristic mistake, in one clause. If the expression has no characteristic trap, return null rather than inventing one.
- rhetorical_function is which move the expression makes in an argument. Only these values exist: ${RHETORICAL_FUNCTIONS.join(", ")}. Topical vocabulary that performs no rhetorical move takes null.
- type must be one of: ${EXPRESSION_TYPES.join(", ")}.
- Correct obvious spelling or accent slips in the input, but never substitute a different expression for the one given.
- Return exactly one item per input expression, in the order given.`;

export async function enrichExpressions(
  candidates: { text: string; userGloss: string | null }[],
): Promise<EnrichedItem[]> {
  if (candidates.length === 0) return [];

  const list = candidates
    .map((c, i) =>
      c.userGloss
        ? `${i + 1}. ${c.text}   [the candidate's own note: ${c.userGloss}]`
        : `${i + 1}. ${c.text}`,
    )
    .join("\n");

  const result = await parseJson<{ items: EnrichedItem[] }>({
    system: SYSTEM,
    user: `Enrich these ${candidates.length} expressions:\n\n${list}`,
    format: zodOutputFormat(enrichmentSchema),
    effort: "medium",
  });

  return result.items;
}

const PACK_SYSTEM = `You build themed vocabulary packs for a TCF/TEF candidate working at the B1→B2 boundary, aiming for NCLC 7.

Given a theme, propose expressions that would raise the register and precision of an argued written answer on that theme. Favour chunks over single words: connectors, collocations, verb constructions, and topical lexis in roughly equal measure.

${TYPE_GUIDE}

Rules:
- Everything you propose must be usable in a formal or neutral register. No slang, no spoken-only forms.
- Aim at B2 and C1. Skip anything a B1 candidate already produces without effort.
- Do not propose an expression that appears in the exclusion list, nor a trivial variant of one.
- Fill every schema field for each expression, following the same rules as enrichment.
- theme must be exactly the theme you were given.`;

export async function generatePack(
  theme: Theme,
  count: number,
  exclude: string[],
): Promise<EnrichedItem[]> {
  const excluded = exclude.length
    ? `\n\nAlready in the bank — do not propose these or close variants:\n${exclude.join("\n")}`
    : "";

  const result = await parseJson<{ items: EnrichedItem[] }>({
    system: PACK_SYSTEM,
    user: `Theme: ${theme}\nPropose exactly ${count} expressions.${excluded}`,
    format: zodOutputFormat(enrichmentSchema),
    effort: "medium",
  });

  return result.items;
}

export const PACK_THEMES = THEMES;
