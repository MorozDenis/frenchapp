"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import type { CheatsheetGroup } from "@/lib/cheatsheet";
import { RHETORICAL_FUNCTION_LABEL, type RhetoricalFunction } from "@/lib/taxonomy";

/**
 * FR-7 — the reference sheet.
 *
 * The point of deriving it from the drill data rather than maintaining it by
 * hand is FR-7.4: the least secure expressions rise to the top of their group
 * on their own, so the sheet you print in October is about October's weak
 * points, not August's.
 */

const GROUP_LABEL: Record<string, string> = {
  ...RHETORICAL_FUNCTION_LABEL,
  autres: "Lexique thématique",
};

export default function CheatsheetPage() {
  const [groups, setGroups] = useState<CheatsheetGroup[] | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/cheatsheet");
      const payload = await response.json();
      if (response.ok) setGroups(payload.groups);
      else setGroups([]);
    })();
  }, []);

  return (
    <main className="shell shell--wide">
      <Nav />

      <div className="row" style={{ marginBottom: 6 }}>
        <h1 style={{ fontSize: 24 }}>Cheat sheet</h1>
        <span className="topbar__spacer" />
        <button
          type="button"
          className="btn no-print"
          onClick={() => window.print()}
        >
          Print / save as PDF
        </button>
      </div>
      <p className="small muted" style={{ marginTop: 0, marginBottom: 24 }}>
        Grouped by what the expression does in an argument. Least secure first
        within each group.
      </p>

      {groups === null && <p className="empty">Loading…</p>}
      {groups?.length === 0 && (
        <p className="empty">The bank is empty, so there is nothing to summarise yet.</p>
      )}

      <div className="stack">
        {groups?.map((group) => (
          <section key={group.key} className="cheat__group">
            <h2
              style={{
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-3)",
                borderBottom: "1px solid var(--border)",
                paddingBottom: 6,
                marginBottom: 10,
              }}
            >
              {GROUP_LABEL[group.key as RhetoricalFunction] ?? group.key}
            </h2>

            <div className="stack stack--tight">
              {group.entries.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(140px, 240px) 1fr auto",
                    gap: 14,
                    alignItems: "baseline",
                    padding: "5px 0",
                  }}
                >
                  <span style={{ fontFamily: "var(--serif)", fontWeight: 600 }}>
                    {entry.text}
                    {entry.gloss_en && (
                      <span className="tiny muted" style={{ marginLeft: 8, fontWeight: 400 }}>
                        {entry.gloss_en}
                      </span>
                    )}
                  </span>
                  <span
                    className="small"
                    style={{ fontFamily: "var(--serif)", color: "var(--text-2)" }}
                  >
                    {entry.model_sentence ?? "—"}
                  </span>
                  {/* FR-7.2 — the colour cue is the state, nothing else. */}
                  <span className={`tag tag--${entry.state}`}>{entry.state}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
