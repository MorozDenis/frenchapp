/**
 * Word-level diff between what was written and what it should have been.
 *
 * The correction is the one thing the user reads under time pressure, so it has
 * to show *what changed* rather than making them compare two paragraphs. Word
 * granularity is the right unit for French: an accent or an agreement changes
 * one word, and a highlighted word is findable at a glance.
 */

export type DiffOp = { type: "same" | "removed" | "added"; text: string };

const tokenize = (text: string): string[] =>
  text.match(/\s+|[^\s]+/g) ?? [];

/**
 * Compares ignoring case and edge punctuation, so a capital at the start of a
 * corrected sentence is not reported as an edit. Accents are deliberately
 * *not* folded: a missing accent is a real correction the user needs to see.
 */
const key = (token: string): string =>
  token.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

export function wordDiff(before: string, after: string): DiffOp[] {
  const a = tokenize(before);
  const b = tokenize(after);

  // Longest common subsequence over tokens. Inputs here are a sentence or a
  // short paragraph, so the quadratic table is a few thousand cells at worst.
  const lengths: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i][j] =
        key(a[i]) === key(b[j])
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  const push = (type: DiffOp["type"], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.text += text;
    else ops.push({ type, text });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (key(a[i]) === key(b[j])) {
      // Same word up to case and punctuation: show the corrected form.
      push("same", b[j]);
      i += 1;
      j += 1;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      push("removed", a[i]);
      i += 1;
    } else {
      push("added", b[j]);
      j += 1;
    }
  }
  while (i < a.length) {
    push("removed", a[i]);
    i += 1;
  }
  while (j < b.length) {
    push("added", b[j]);
    j += 1;
  }

  return ops.filter((op) => op.text.length > 0);
}
