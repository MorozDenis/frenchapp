/**
 * FR-3.3 — accent input assistance.
 *
 * Two ways in, because the two session shapes need different things: the
 * palette for a phone in one hand, and Alt+letter for a desktop session where
 * reaching for the mouse costs more than the accent is worth. Alt+letter cycles
 * through that letter's accented forms, so Alt+E three times gives ê.
 *
 * Note what this deliberately is not: it inserts characters and nothing more.
 * FR-3.2 rules out spell-check, autocomplete and grammar underlining, and an
 * accent helper that corrected accents for you would be the same crutch.
 */

export const ACCENT_KEYS = ["é", "è", "ê", "à", "ç", "ô", "û", "ï"] as const;

const CYCLES: Record<string, string[]> = {
  e: ["é", "è", "ê", "ë"],
  a: ["à", "â", "ä"],
  u: ["ù", "û", "ü"],
  i: ["î", "ï"],
  o: ["ô", "ö"],
  c: ["ç"],
  y: ["ÿ"],
};

/**
 * Given the character before the caret and the pressed letter, returns the
 * replacement character and how many characters it should replace.
 */
export function nextAccent(
  letter: string,
  charBefore: string,
): { insert: string; replaceLength: number } | null {
  const cycle = CYCLES[letter.toLowerCase()];
  if (!cycle) return null;

  const upper = letter === letter.toUpperCase() && letter !== letter.toLowerCase();
  const forms = upper ? cycle.map((c) => c.toUpperCase()) : cycle;

  const index = forms.indexOf(charBefore);
  if (index >= 0) {
    return { insert: forms[(index + 1) % forms.length], replaceLength: 1 };
  }
  // Typing Alt+E straight after a plain "e" upgrades that e rather than
  // appending a second vowel.
  if (charBefore.toLowerCase() === letter.toLowerCase()) {
    return { insert: forms[0], replaceLength: 1 };
  }
  return { insert: forms[0], replaceLength: 0 };
}

export function applyAccentShortcut(
  field: HTMLTextAreaElement | HTMLInputElement,
  letter: string,
): boolean {
  const start = field.selectionStart ?? 0;
  const end = field.selectionEnd ?? start;
  if (start !== end) return false;

  const charBefore = start > 0 ? field.value[start - 1] : "";
  const result = nextAccent(letter, charBefore);
  if (!result) return false;

  const from = start - result.replaceLength;
  field.setRangeText(result.insert, from, start, "end");
  field.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}
