"use client";

import { useEffect } from "react";
import { wordDiff } from "@/lib/diff";
import {
  ERROR_CATEGORY_LABEL,
  type ErrorCategory,
  type LatencyBand,
  type TargetUsage,
} from "@/lib/taxonomy";

/**
 * The correction panel (BRD §5).
 *
 * Design rule from the brief: shown inline, dismissed with one key or tap, and
 * never a lesson. Everything here is either a number the user is tracking or
 * the single most important fix — the place for explanation is a tutor, not
 * this screen.
 */

export interface CorrectionTarget {
  id: string;
  text: string;
  model_sentence: string | null;
  error_note: string | null;
}

export interface CorrectionData {
  attemptId: string;
  status: "scored" | "failed";
  error: string | null;
  latencyMs: number | null;
  latencyBand: LatencyBand | null;
  score: {
    targetUsage: Record<string, TargetUsage>;
    collocationScore: number;
    grammarScore: number;
    errorTags: ErrorCategory[];
    correctedText: string;
    keyFix: string;
    missingAccents: boolean;
    hesitationCount: number;
  } | null;
  targets: CorrectionTarget[];
}

const USAGE_LABEL: Record<TargetUsage, string> = {
  present_correct: "used correctly",
  present_misused: "misused",
  absent: "not used",
};

const USAGE_TAG: Record<TargetUsage, string> = {
  present_correct: "tag--rapide",
  present_misused: "tag--correct",
  absent: "tag--lent",
};

export const formatSeconds = (ms: number | null): string =>
  ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`;

export function Correction({
  data,
  production,
  transcript,
  onDismiss,
  onFlagTranscript,
  flagged,
}: {
  data: CorrectionData;
  production: string;
  transcript: string | null;
  onDismiss: () => void;
  onFlagTranscript?: () => void;
  flagged?: boolean;
}) {
  // One key to move on, so the loop never needs the mouse.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDismiss]);

  const score = data.score;
  const diff = score ? wordDiff(production, score.correctedText) : [];

  return (
    <section className="card stack">
      <div className="verdict">
        <div className="verdict__figure">
          <span className={`verdict__value${data.latencyBand === "lent" ? " drill__clock--lent" : ""}`}>
            {formatSeconds(data.latencyMs)}
          </span>
          <span className="verdict__label">
            {data.latencyBand ? (
              <span className={`tag tag--${data.latencyBand}`}>{data.latencyBand}</span>
            ) : (
              "latency"
            )}
          </span>
        </div>
        {score && (
          <>
            <div className="verdict__figure">
              <span className="verdict__value">{score.grammarScore}/3</span>
              <span className="verdict__label">Grammar</span>
            </div>
            <div className="verdict__figure">
              <span className="verdict__value">{score.collocationScore}/3</span>
              <span className="verdict__label">Collocation &amp; register</span>
            </div>
            {transcript !== null && (
              <div className="verdict__figure">
                <span className="verdict__value">{score.hesitationCount}</span>
                {/* FR-4.5 — reported, never scored. */}
                <span className="verdict__label">Hesitations (not scored)</span>
              </div>
            )}
          </>
        )}
      </div>

      {data.status === "failed" && (
        <p className="notice notice--error">
          {data.error ?? "Scoring failed."} The attempt and its timing are saved; it
          is queued for re-scoring.
        </p>
      )}

      <div className="stack stack--tight">
        {data.targets.map((target) => {
          const verdict = score?.targetUsage[target.id];
          return (
            <div key={target.id} className="row" style={{ gap: 8, alignItems: "baseline" }}>
              <strong style={{ fontFamily: "var(--serif)" }}>{target.text}</strong>
              {verdict && (
                <span className={`tag ${USAGE_TAG[verdict]}`}>{USAGE_LABEL[verdict]}</span>
              )}
              {verdict !== "present_correct" && target.model_sentence && (
                <span className="small muted" style={{ fontFamily: "var(--serif)" }}>
                  {target.model_sentence}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {transcript !== null && (
        <div>
          {/* FR-4.4 — what was actually said, next to what it should have been. */}
          <span className="label">Transcript</span>
          <p className="correction" style={{ margin: 0 }}>
            {transcript}
          </p>
          {onFlagTranscript && (
            <button
              type="button"
              className="btn btn--ghost btn--sm no-print"
              style={{ marginTop: 6 }}
              onClick={onFlagTranscript}
              disabled={flagged}
            >
              {flagged ? "Transcript flagged — language scores voided" : "Transcription was wrong"}
            </button>
          )}
        </div>
      )}

      {score && (
        <div>
          <span className="label">Corrected</span>
          <p className="correction" style={{ margin: 0 }}>
            {diff.map((op, index) =>
              op.type === "same" ? (
                <span key={index}>{op.text}</span>
              ) : op.type === "removed" ? (
                <del key={index}>{op.text}</del>
              ) : (
                <ins key={index}>{op.text}</ins>
              ),
            )}
          </p>
        </div>
      )}

      {score?.keyFix && <p className="keyfix">{score.keyFix}</p>}

      {score && (score.errorTags.length > 0 || score.missingAccents) && (
        <div className="row" style={{ gap: 6 }}>
          {score.errorTags.map((tag, index) => (
            <span key={`${tag}-${index}`} className="tag">
              {ERROR_CATEGORY_LABEL[tag]}
            </span>
          ))}
          {/* FR-3.3 — flagged, but not counted as a grammar error. */}
          {score.missingAccents && <span className="tag">Accents manquants</span>}
        </div>
      )}

      <button type="button" className="btn btn--primary btn--wide no-print" onClick={onDismiss}>
        Next — press Enter
      </button>
    </section>
  );
}
