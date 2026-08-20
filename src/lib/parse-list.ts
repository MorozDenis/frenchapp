/**
 * Raw-paste parsing for FR-1.1.
 *
 * The user pastes whatever their notes look like: one expression per line, or
 * a comma-separated run, usually with an English or Russian gloss stuck on the
 * end. This turns that into a clean candidate list before anything is sent to
 * the model.
 *
 * Splitting rule, taken literally from the requirement ("one per line, or
 * comma-separated"): newlines and semicolons always separate items; commas
 * separate items only when the paste has no line breaks to go on. That keeps
 * multi-word chunks like "force est de constater que" intact in a line-per-item
 * paste, which matters more than catching every comma run.
 */

const BULLET = /^\s*(?:[-*•·–—]|\d+[.)])\s+/;
/** " — nevertheless", " : nevertheless", " = nevertheless", a tab, or " - ". */
const GLOSS_SEPARATOR = /\s+(?:[-–—]|:|=|\||\t)\s+/;
const TRAILING_PARENTHETICAL = /\s*[([{][^)\]}]*[)\]}]\s*$/;
const SURROUNDING_QUOTES = /^["'«»“”]+|["'«»“”]+$/g;
/** Anything with no Latin letters at all is a stray bullet or page number. */
const HAS_LETTERS = /\p{L}/u;

export interface ParsedCandidate {
  text: string;
  /** The gloss the user had already written, if any — kept as a hint. */
  userGloss: string | null;
}

export function parseRawList(raw: string): ParsedCandidate[] {
  const hasLineBreaks = /[\r\n]/.test(raw);
  const chunks = hasLineBreaks
    ? raw.split(/[\r\n;]+/)
    : raw.split(/[,;]+/);

  const seen = new Set<string>();
  const out: ParsedCandidate[] = [];

  for (const chunk of chunks) {
    let line = chunk.replace(BULLET, "").trim();
    if (!line) continue;

    let userGloss: string | null = null;

    const parenthetical = line.match(TRAILING_PARENTHETICAL);
    if (parenthetical) {
      userGloss = parenthetical[0].replace(/[()[\]{}]/g, "").trim() || null;
      line = line.replace(TRAILING_PARENTHETICAL, "").trim();
    }

    const separator = line.match(GLOSS_SEPARATOR);
    if (separator?.index !== undefined) {
      const head = line.slice(0, separator.index).trim();
      const tail = line.slice(separator.index + separator[0].length).trim();
      // Only treat the tail as a gloss if a real expression precedes it —
      // "s'agir de — to be about" splits, but "peut-être" must not.
      if (head && tail) {
        line = head;
        userGloss = userGloss ?? tail;
      }
    }

    line = line.replace(SURROUNDING_QUOTES, "").trim();
    if (!line || !HAS_LETTERS.test(line)) continue;

    const key = normalizeForDedupe(line);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: line, userGloss });
  }

  return out;
}

/**
 * Matches the database's uniqueness rule (`lower(btrim(text))`) so a duplicate
 * is caught in the review screen rather than by a constraint violation on save.
 */
export function normalizeForDedupe(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}
