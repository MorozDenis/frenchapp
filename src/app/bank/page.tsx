"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Nav } from "@/components/Nav";
import { CandidateReview, type Candidate } from "@/components/CandidateReview";
import {
  EXPRESSION_TYPE_LABEL,
  THEMES,
  type ExpressionType,
  type ReviewStateName,
  type Theme,
} from "@/lib/taxonomy";

/**
 * The expression bank (BRD §6.1).
 *
 * Two ways in — a raw paste and a generated pack — but one review step, one
 * save, and one list. Everything saved records where it came from (FR-1.4) so
 * "is the generated material actually working?" stays an answerable question.
 */

interface BankRow {
  id: string;
  text: string;
  type: ExpressionType;
  register: string;
  cefr: string;
  gloss_en: string | null;
  model_sentence: string | null;
  theme: string | null;
  source: "user" | "generated";
  archived_at: string | null;
  review_state: { state: ReviewStateName; due_at: string } | null;
}

type Draft = { items: Candidate[]; source: "user" | "generated" } | null;

const toCandidate = (item: Omit<Candidate, "accepted">): Candidate => ({
  ...item,
  accepted: true,
});

export default function BankPage() {
  const [rows, setRows] = useState<BankRow[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [raw, setRaw] = useState("");
  const [theme, setTheme] = useState<Theme>(THEMES[0]);
  const [draft, setDraft] = useState<Draft>(null);
  const [duplicates, setDuplicates] = useState<{ text: string; archived: boolean }[]>([]);
  const [busy, setBusy] = useState<null | "parse" | "pack" | "save">(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/expressions?archived=${showArchived}`);
    const payload = await response.json();
    if (response.ok) setRows(payload.expressions);
  }, [showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  const call = async (
    kind: "parse" | "pack",
    url: string,
    payload: unknown,
    source: "user" | "generated",
  ) => {
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      setDraft({ items: result.items.map(toCandidate), source });
      setDuplicates(result.duplicates ?? []);
      if (result.items.length === 0) {
        setMessage("Nothing new came back — it is all in the bank already.");
      }
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    const items = draft.items.filter((item) => item.accepted);
    if (items.length === 0) {
      setError("Nothing is marked to keep");
      return;
    }
    setBusy("save");
    setError(null);
    try {
      const response = await fetch("/api/expressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, source: draft.source }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Could not save");
        return;
      }
      setMessage(`Saved ${result.saved.length} expression${result.saved.length === 1 ? "" : "s"}.`);
      setDraft(null);
      setDuplicates([]);
      setRaw("");
      await load();
    } finally {
      setBusy(null);
    }
  };

  const setArchived = async (id: string, archived: boolean) => {
    await fetch(`/api/expressions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    });
    await load();
  };

  const counts = useMemo(() => {
    const live = rows.filter((r) => !r.archived_at);
    const byState = { new: 0, learning: 0, active: 0 };
    for (const row of live) byState[row.review_state?.state ?? "new"] += 1;
    return { total: live.length, ...byState };
  }, [rows]);

  const newShare = counts.total ? counts.new / counts.total : 0;

  return (
    <main className="shell shell--wide">
      <Nav />

      <div className="row" style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 24 }}>Bank</h1>
        <span className="topbar__spacer" />
        <span className="small muted">
          {counts.total} live · <span className="tag tag--new">{counts.new} new</span>{" "}
          <span className="tag tag--learning">{counts.learning} learning</span>{" "}
          <span className="tag tag--active">{counts.active} active</span>
        </span>
      </div>

      {newShare > 0.25 && (
        <p className="notice" style={{ marginBottom: 16 }}>
          {Math.round(newShare * 100)}% of the bank has never been drilled. Adding more
          is the failure mode; go and drill.
        </p>
      )}

      {error && <p className="notice notice--error" style={{ marginBottom: 16 }}>{error}</p>}
      {message && <p className="notice notice--ok" style={{ marginBottom: 16 }}>{message}</p>}

      {!draft && (
        <div className="grid grid--2" style={{ marginBottom: 24 }}>
          <section className="card stack">
            <h2 style={{ fontSize: 17 }}>Paste a list</h2>
            <p className="tiny muted" style={{ margin: 0 }}>
              One per line, or comma-separated. Translations after a dash or in
              brackets are picked up as hints.
            </p>
            <textarea
              className="textarea"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              spellCheck={false}
              placeholder={"néanmoins - nevertheless\nprendre une décision\nforce est de constater que"}
            />
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy !== null || !raw.trim()}
              onClick={() => void call("parse", "/api/expressions/parse", { raw }, "user")}
            >
              {busy === "parse" ? "Enriching…" : "Parse and enrich"}
            </button>
          </section>

          <section className="card stack">
            <h2 style={{ fontSize: 17 }}>Generate a pack</h2>
            <p className="tiny muted" style={{ margin: 0 }}>
              15–25 candidates for one TCF theme, filtered against what you already
              own. Accept or discard each one.
            </p>
            <select
              className="select"
              value={theme}
              onChange={(e) => setTheme(e.target.value as Theme)}
            >
              {THEMES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              disabled={busy !== null}
              onClick={() =>
                void call("pack", "/api/expressions/pack", { theme, count: 20 }, "generated")
              }
            >
              {busy === "pack" ? "Generating…" : "Generate"}
            </button>
          </section>
        </div>
      )}

      {draft && (
        <section className="stack" style={{ marginBottom: 24 }}>
          <div className="row">
            <h2 style={{ fontSize: 17 }}>
              Review — {draft.items.filter((i) => i.accepted).length} of {draft.items.length} kept
            </h2>
            <span className="topbar__spacer" />
            <button type="button" className="btn btn--ghost" onClick={() => setDraft(null)}>
              Discard
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void save()}
              disabled={busy !== null}
            >
              {busy === "save" ? "Saving…" : "Save to bank"}
            </button>
          </div>

          {duplicates.length > 0 && (
            <p className="notice">
              Already in the bank, skipped:{" "}
              {duplicates.map((d) => `${d.text}${d.archived ? " (archived)" : ""}`).join(", ")}
            </p>
          )}

          <CandidateReview
            candidates={draft.items}
            onChange={(items) => setDraft({ ...draft, items })}
          />
        </section>
      )}

      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 17 }}>Expressions</h2>
        <span className="topbar__spacer" />
        <label className="small muted row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="empty">Nothing here yet. Paste a list above to start.</p>
      ) : (
        <div className="grid grid--2">
          {rows.map((row) => (
            <article key={row.id} className="entry" style={{ opacity: row.archived_at ? 0.5 : 1 }}>
              <div className="entry__head">
                <span className="entry__text">{row.text}</span>
                <span className={`tag tag--${row.review_state?.state ?? "new"}`}>
                  {row.review_state?.state ?? "new"}
                </span>
              </div>
              {row.model_sentence && <p className="entry__sentence">{row.model_sentence}</p>}
              <div className="row tiny muted" style={{ marginTop: 8, gap: 8 }}>
                <span>{EXPRESSION_TYPE_LABEL[row.type]}</span>
                <span>·</span>
                <span>{row.register}</span>
                <span>·</span>
                <span>{row.cefr}</span>
                {row.theme && (
                  <>
                    <span>·</span>
                    <span>{row.theme}</span>
                  </>
                )}
                <span>·</span>
                <span>{row.source}</span>
                <span className="topbar__spacer" />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => void setArchived(row.id, !row.archived_at)}
                >
                  {row.archived_at ? "Restore" : "Archive"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
