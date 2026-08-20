"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { StateChart, type StateSnapshot } from "@/components/charts/StateChart";
import { ErrorChart, type ErrorRow } from "@/components/charts/ErrorChart";
import { formatDay, seconds } from "@/components/charts/primitives";
import { CORRECT_MAX_MS, RAPIDE_MAX_MS } from "@/lib/srs";

/**
 * FR-8 — four charts, and nothing else. The requirement names the four and
 * calls anything beyond them scope creep, so this page adds no fifth.
 *
 * The one thing above the charts is the headline metric from §9, because a
 * page of trend lines does not answer "is this working" as directly as a
 * single number and a percentage does.
 */

interface ProgressPayload {
  sessionLatency: {
    sessionId: string;
    date: string;
    medianLatencyMs: number;
    itemCount: number;
  }[];
  stateHistory: StateSnapshot[];
  stateNow: { new: number; learning: number; active: number };
  errorComparison: ErrorRow[];
  modeLatency: { week: string; textMedianMs: number | null; voiceMedianMs: number | null }[];
  improvement: { baselineMs: number | null; currentMs: number | null; changePct: number | null };
  unscored: number;
}

export default function ProgressPage() {
  const [data, setData] = useState<ProgressPayload | null>(null);
  const [retrying, setRetrying] = useState(false);

  const load = async () => {
    const response = await fetch("/api/progress");
    if (response.ok) setData(await response.json());
  };

  useEffect(() => {
    // The state update happens after an await, which the rule cannot see through.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  /** FR-5.2's queue, drained on demand. */
  const retryUnscored = async () => {
    setRetrying(true);
    try {
      const response = await fetch("/api/attempts?status=failed");
      const payload = await response.json();
      for (const attempt of payload.attempts ?? []) {
        await fetch(`/api/attempts/${attempt.id}/rescore`, { method: "POST" });
      }
      await load();
    } finally {
      setRetrying(false);
    }
  };

  if (!data) {
    return (
      <main className="shell shell--wide">
        <Nav />
        <p className="empty">Loading…</p>
      </main>
    );
  }

  const { improvement } = data;
  const totalBank = data.stateNow.new + data.stateNow.learning + data.stateNow.active;
  const activeShare = totalBank ? Math.round((data.stateNow.active / totalBank) * 100) : 0;

  return (
    <main className="shell shell--wide">
      <Nav />

      <h1 style={{ fontSize: 24, marginBottom: 18 }}>Progress</h1>

      {data.unscored > 0 && (
        <p className="notice no-print row" style={{ marginBottom: 18 }}>
          <span>
            {data.unscored} attempt{data.unscored === 1 ? "" : "s"} saved but not scored.
          </span>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => void retryUnscored()}
            disabled={retrying}
          >
            {retrying ? "Re-scoring…" : "Re-score them"}
          </button>
        </p>
      )}

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="row" style={{ gap: 40, alignItems: "flex-end" }}>
          <div>
            <span className="verdict__label">Median latency, latest week</span>
            <div className="hero">
              {improvement.currentMs === null ? "—" : seconds(improvement.currentMs)}
            </div>
          </div>
          <div>
            <span className="verdict__label">Against week one</span>
            <p style={{ margin: "4px 0 0", fontSize: 15 }}>
              {improvement.changePct === null ? (
                <span className="muted">Not enough weeks yet</span>
              ) : (
                <>
                  <strong>
                    {improvement.changePct > 0 ? "+" : ""}
                    {improvement.changePct}%
                  </strong>{" "}
                  <span className="muted">
                    from {seconds(improvement.baselineMs as number)}
                    {improvement.changePct <= -30 ? " — target met" : ""}
                  </span>
                </>
              )}
            </p>
          </div>
          <div>
            <span className="verdict__label">Bank active</span>
            <p style={{ margin: "4px 0 0", fontSize: 15 }}>
              <strong>{activeShare}%</strong>{" "}
              <span className="muted">
                of {totalBank} expression{totalBank === 1 ? "" : "s"}
              </span>
            </p>
          </div>
        </div>
      </section>

      <div className="stack">
        <TimeSeriesChart
          title="Median latency per session"
          note="The headline metric. The two lines are the band boundaries: below 20s is rapide, above 45s is lent."
          labels={data.sessionLatency.map((p) => formatDay(p.date))}
          series={[
            {
              key: "median",
              label: "Median latency",
              color: "var(--series-1)",
              values: data.sessionLatency.map((p) => p.medianLatencyMs),
            },
          ]}
          format={seconds}
          axisFormat={(v) => `${Math.round(v / 1000)}s`}
          references={[
            { value: RAPIDE_MAX_MS, label: "rapide", place: "below" },
            { value: CORRECT_MAX_MS, label: "lent", place: "above" },
          ]}
        />

        <StateChart snapshots={data.stateHistory} />

        <ErrorChart rows={data.errorComparison} />

        <TimeSeriesChart
          title="Text against voice"
          note="Weekly medians. For voice this is time-to-start — how long before you began speaking, not how long you spoke."
          labels={data.modeLatency.map((p) => formatDay(p.week))}
          series={[
            {
              key: "text",
              label: "Text",
              color: "var(--series-1)",
              values: data.modeLatency.map((p) => p.textMedianMs),
            },
            {
              key: "voice",
              label: "Voice",
              color: "var(--series-2)",
              values: data.modeLatency.map((p) => p.voiceMedianMs),
            },
          ]}
          format={seconds}
          axisFormat={(v) => `${Math.round(v / 1000)}s`}
        />
      </div>

      <p className="small muted" style={{ marginTop: 24 }}>
        The app has failed if it is being improved more often than it is being
        used. <Link href="/">Go and drill.</Link>
      </p>
    </main>
  );
}
