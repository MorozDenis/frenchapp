import { describe, expect, it } from "vitest";
import {
  errorComparison,
  isoWeekStart,
  latencyImprovement,
  median,
  modeLatency,
  sessionLatency,
  type AttemptFact,
} from "@/lib/progress";

const fact = (over: Partial<AttemptFact> = {}): AttemptFact => ({
  id: crypto.randomUUID(),
  session_id: "s1",
  mode: "text",
  latency_ms: 20_000,
  error_tags: [],
  transcript_flagged: false,
  scoring_status: "scored",
  created_at: "2026-08-10T10:00:00.000Z",
  ...over,
});

describe("median", () => {
  it("averages the middle pair on even counts", () => {
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(median([30, 10, 20])).toBe(20);
    expect(median([])).toBeNull();
  });
});

describe("sessionLatency", () => {
  it("reports one median per session, oldest first", () => {
    const points = sessionLatency([
      fact({ session_id: "s2", latency_ms: 40_000, created_at: "2026-08-12T10:00:00Z" }),
      fact({ session_id: "s2", latency_ms: 60_000, created_at: "2026-08-12T10:05:00Z" }),
      fact({ session_id: "s1", latency_ms: 10_000, created_at: "2026-08-10T10:00:00Z" }),
      fact({ session_id: "s1", latency_ms: 20_000, created_at: "2026-08-10T10:05:00Z" }),
    ]);
    expect(points.map((p) => [p.sessionId, p.medianLatencyMs])).toEqual([
      ["s1", 15_000],
      ["s2", 50_000],
    ]);
  });

  it("ignores attempts with no session or no clock reading", () => {
    expect(sessionLatency([fact({ session_id: null }), fact({ latency_ms: null })])).toEqual([]);
  });
});

describe("errorComparison", () => {
  const now = new Date("2026-08-20T00:00:00Z");

  it("splits tags between this month and last", () => {
    const rows = errorComparison(
      [
        fact({ created_at: "2026-08-05T10:00:00Z", error_tags: ["article", "subjonctif"] }),
        fact({ created_at: "2026-08-06T10:00:00Z", error_tags: ["article"] }),
        fact({ created_at: "2026-07-20T10:00:00Z", error_tags: ["article", "negation"] }),
        fact({ created_at: "2026-05-01T10:00:00Z", error_tags: ["que_qui"] }),
      ],
      now,
    );
    const byCategory = Object.fromEntries(rows.map((r) => [r.category, r]));
    expect(byCategory.article).toEqual({ category: "article", current: 2, previous: 1 });
    expect(byCategory.subjonctif.current).toBe(1);
    expect(byCategory.negation.previous).toBe(1);
    // Outside both months, so it does not appear at all.
    expect(byCategory.que_qui).toBeUndefined();
  });

  it("excludes flagged transcripts and unscored attempts", () => {
    const rows = errorComparison(
      [
        fact({ created_at: "2026-08-05T10:00:00Z", error_tags: ["article"], transcript_flagged: true }),
        fact({ created_at: "2026-08-05T10:00:00Z", error_tags: ["article"], scoring_status: "failed" }),
      ],
      now,
    );
    expect(rows).toEqual([]);
  });
});

describe("isoWeekStart", () => {
  it("anchors weeks on Monday", () => {
    expect(isoWeekStart(new Date("2026-08-20T23:00:00Z"))).toBe("2026-08-17");
    expect(isoWeekStart(new Date("2026-08-17T00:00:00Z"))).toBe("2026-08-17");
    // Sunday belongs to the week that started six days earlier.
    expect(isoWeekStart(new Date("2026-08-16T12:00:00Z"))).toBe("2026-08-10");
  });
});

describe("modeLatency", () => {
  it("keeps text and voice on separate series per week", () => {
    const points = modeLatency([
      fact({ mode: "text", latency_ms: 10_000, created_at: "2026-08-17T10:00:00Z" }),
      fact({ mode: "text", latency_ms: 20_000, created_at: "2026-08-18T10:00:00Z" }),
      fact({ mode: "voice", latency_ms: 30_000, created_at: "2026-08-19T10:00:00Z" }),
    ]);
    expect(points).toEqual([
      { week: "2026-08-17", textMedianMs: 15_000, voiceMedianMs: 30_000 },
    ]);
  });
});

describe("latencyImprovement", () => {
  it("compares the first week with data against the latest", () => {
    const result = latencyImprovement([
      { sessionId: "a", date: "2026-07-06", medianLatencyMs: 40_000, itemCount: 8 },
      { sessionId: "b", date: "2026-07-07", medianLatencyMs: 40_000, itemCount: 8 },
      { sessionId: "c", date: "2026-08-17", medianLatencyMs: 24_000, itemCount: 8 },
    ]);
    expect(result.baselineMs).toBe(40_000);
    expect(result.currentMs).toBe(24_000);
    expect(result.changePct).toBe(-40);
  });

  it("gives no percentage until there is a second week", () => {
    expect(
      latencyImprovement([
        { sessionId: "a", date: "2026-08-17", medianLatencyMs: 30_000, itemCount: 5 },
      ]).changePct,
    ).toBeNull();
    expect(latencyImprovement([]).baselineMs).toBeNull();
  });
});
