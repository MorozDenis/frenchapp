"use client";

import {
  CEFR_BANDS,
  EXPRESSION_TYPES,
  EXPRESSION_TYPE_LABEL,
  REGISTERS,
  RHETORICAL_FUNCTIONS,
  RHETORICAL_FUNCTION_LABEL,
  type CefrBand,
  type ExpressionType,
  type Register,
  type RhetoricalFunction,
} from "@/lib/taxonomy";

/**
 * FR-1.2 — enrichment is reviewed before it is saved, and every field can be
 * edited or the whole row rejected. The model is a first draft here, not an
 * authority: a wrong register or a bad model sentence would otherwise be
 * drilled for months.
 */

export interface Candidate {
  text: string;
  type: ExpressionType;
  register: Register;
  cefr: CefrBand;
  gloss_en: string | null;
  model_sentence: string | null;
  error_note: string | null;
  rhetorical_function: RhetoricalFunction | null;
  theme: string | null;
  accepted: boolean;
}

export function CandidateReview({
  candidates,
  onChange,
}: {
  candidates: Candidate[];
  onChange: (next: Candidate[]) => void;
}) {
  const patch = (index: number, changes: Partial<Candidate>) => {
    onChange(candidates.map((c, i) => (i === index ? { ...c, ...changes } : c)));
  };

  return (
    <div className="stack stack--tight">
      {candidates.map((candidate, index) => (
        <div
          key={`${candidate.text}-${index}`}
          className="entry"
          style={{ opacity: candidate.accepted ? 1 : 0.45 }}
        >
          <div className="entry__head">
            <input
              className="input entry__text"
              style={{ border: "none", background: "transparent", padding: 0 }}
              value={candidate.text}
              onChange={(e) => patch(index, { text: e.target.value })}
              spellCheck={false}
            />
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => patch(index, { accepted: !candidate.accepted })}
            >
              {candidate.accepted ? "Reject" : "Keep"}
            </button>
          </div>

          <input
            className="input entry__sentence"
            style={{ border: "none", background: "transparent", padding: 0, marginTop: 6 }}
            value={candidate.model_sentence ?? ""}
            placeholder="Model sentence"
            onChange={(e) => patch(index, { model_sentence: e.target.value })}
            spellCheck={false}
          />

          <div className="fields">
            <select
              className="select"
              value={candidate.type}
              onChange={(e) => patch(index, { type: e.target.value as ExpressionType })}
            >
              {EXPRESSION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {EXPRESSION_TYPE_LABEL[type]}
                </option>
              ))}
            </select>

            <select
              className="select"
              value={candidate.register}
              onChange={(e) => patch(index, { register: e.target.value as Register })}
            >
              {REGISTERS.map((register) => (
                <option key={register} value={register}>
                  {register}
                </option>
              ))}
            </select>

            <select
              className="select"
              value={candidate.cefr}
              onChange={(e) => patch(index, { cefr: e.target.value as CefrBand })}
            >
              {CEFR_BANDS.map((band) => (
                <option key={band} value={band}>
                  {band}
                </option>
              ))}
            </select>

            <select
              className="select"
              value={candidate.rhetorical_function ?? ""}
              onChange={(e) =>
                patch(index, {
                  rhetorical_function: (e.target.value || null) as RhetoricalFunction | null,
                })
              }
            >
              <option value="">No rhetorical function</option>
              {RHETORICAL_FUNCTIONS.map((fn) => (
                <option key={fn} value={fn}>
                  {RHETORICAL_FUNCTION_LABEL[fn]}
                </option>
              ))}
            </select>

            <input
              className="input"
              value={candidate.gloss_en ?? ""}
              placeholder="English gloss"
              onChange={(e) => patch(index, { gloss_en: e.target.value })}
            />

            <input
              className="input"
              value={candidate.theme ?? ""}
              placeholder="Theme"
              onChange={(e) => patch(index, { theme: e.target.value })}
            />
          </div>

          {candidate.error_note && (
            <p className="tiny muted" style={{ marginBottom: 0, marginTop: 8 }}>
              Watch out: {candidate.error_note}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
