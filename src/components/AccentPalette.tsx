"use client";

import { useCallback } from "react";
import { ACCENT_KEYS } from "@/lib/accents";

/**
 * The tap-target half of FR-3.3. The keyboard half, and the cycling rules
 * behind it, live in `@/lib/accents` so they can be tested without a DOM.
 */
export function AccentPalette({
  targetRef,
}: {
  targetRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const insert = useCallback(
    (character: string) => {
      const field = targetRef.current;
      if (!field) return;
      const start = field.selectionStart ?? field.value.length;
      const end = field.selectionEnd ?? start;
      field.setRangeText(character, start, end, "end");
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.focus();
    },
    [targetRef],
  );

  return (
    <div className="accents no-print">
      {ACCENT_KEYS.map((character) => (
        <button
          key={character}
          type="button"
          className="accents__key"
          // Keeps the caret where it was: the field must not lose focus.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert(character)}
          aria-label={`Insert ${character}`}
        >
          {character}
        </button>
      ))}
      <span className="tiny muted" style={{ alignSelf: "center", marginLeft: 6 }}>
        or Alt + letter
      </span>
    </div>
  );
}
