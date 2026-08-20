/**
 * The four charts of FR-8, and nothing else. Anything beyond these is scope
 * creep by the requirement's own words, so this module deliberately exposes no
 * general-purpose reporting.
 *
 * Pure functions over rows, so the shapes can be tested without a database.
 */

import { ERROR_CATEGORIES, type ErrorCategory } from "@/lib/taxonomy";

export interface AttemptFact {
  id: string;
  session_id: string | null;
  mode: "text" | "voice";
  latency_ms: number | null;
  error_tags: ErrorCategory[];
  transcript_flagged: boolean;
  scoring_status: "pending" | "scored" | "failed";
  created_at: string;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/** Chart 1 — median latency per session over time. The headline metric. */
export interface SessionLatencyPoint {
  sessionId: string;
  date: string;
  medianLatencyMs: number;
  itemCount: number;
}

export function sessionLatency(attempts: AttemptFact[]): SessionLatencyPoint[] {
  const bySession = new Map<string, AttemptFact[]>();
  for (const attempt of attempts) {
    if (!attempt.session_id || attempt.latency_ms === null) continue;
    const bucket = bySession.get(attempt.session_id) ?? [];
    bucket.push(attempt);
    bySession.set(attempt.session_id, bucket);
  }

  const points: SessionLatencyPoint[] = [];
  for (const [sessionId, items] of bySession) {
    const value = median(items.map((i) => i.latency_ms as number));
    if (value === null) continue;
    const date = items
      .map((i) => i.created_at)
      .sort()[0]
      .slice(0, 10);
    points.push({ sessionId, date, medianLatencyMs: value, itemCount: items.length });
  }

  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Chart 3 — error-category distribution, current month against the previous
 * one. Flagged transcripts are excluded: their tags were voided precisely
 * because they may be Whisper's errors rather than the learner's.
 */
export interface ErrorComparison {
  category: ErrorCategory;
  current: number;
  previous: number;
}

export function errorComparison(
  attempts: AttemptFact[],
  now: Date = new Date(),
): ErrorComparison[] {
  const startOfCurrent = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const startOfPrevious = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );

  const current = new Map<ErrorCategory, number>();
  const previous = new Map<ErrorCategory, number>();

  for (const attempt of attempts) {
    if (attempt.transcript_flagged || attempt.scoring_status !== "scored") continue;
    const at = new Date(attempt.created_at);
    const target =
      at >= startOfCurrent ? current : at >= startOfPrevious ? previous : null;
    if (!target) continue;
    for (const tag of attempt.error_tags ?? []) {
      target.set(tag, (target.get(tag) ?? 0) + 1);
    }
  }

  return ERROR_CATEGORIES.map((category) => ({
    category,
    current: current.get(category) ?? 0,
    previous: previous.get(category) ?? 0,
  })).filter((row) => row.current > 0 || row.previous > 0);
}

/** Chart 4 — text against voice latency, week by week. */
export interface ModeLatencyPoint {
  week: string;
  textMedianMs: number | null;
  voiceMedianMs: number | null;
}

export function isoWeekStart(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // Monday-anchored weeks; getUTCDay() is 0 on Sunday.
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export function modeLatency(attempts: AttemptFact[]): ModeLatencyPoint[] {
  const weeks = new Map<string, { text: number[]; voice: number[] }>();

  for (const attempt of attempts) {
    if (attempt.latency_ms === null) continue;
    const week = isoWeekStart(new Date(attempt.created_at));
    const bucket = weeks.get(week) ?? { text: [], voice: [] };
    bucket[attempt.mode].push(attempt.latency_ms);
    weeks.set(week, bucket);
  }

  return [...weeks.entries()]
    .map(([week, bucket]) => ({
      week,
      textMedianMs: median(bucket.text),
      voiceMedianMs: median(bucket.voice),
    }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * §9 — has the headline metric actually moved? Compares the median of the
 * first week that has data against the most recent week.
 */
export function latencyImprovement(points: SessionLatencyPoint[]): {
  baselineMs: number | null;
  currentMs: number | null;
  changePct: number | null;
} {
  if (points.length === 0) {
    return { baselineMs: null, currentMs: null, changePct: null };
  }

  const firstWeek = isoWeekStart(new Date(points[0].date));
  const lastWeek = isoWeekStart(new Date(points[points.length - 1].date));

  const inWeek = (week: string) =>
    points
      .filter((p) => isoWeekStart(new Date(p.date)) === week)
      .map((p) => p.medianLatencyMs);

  const baselineMs = median(inWeek(firstWeek));
  const currentMs = median(inWeek(lastWeek));

  if (baselineMs === null || currentMs === null || baselineMs === 0 || firstWeek === lastWeek) {
    return { baselineMs, currentMs, changePct: null };
  }

  return {
    baselineMs,
    currentMs,
    changePct: Math.round(((currentMs - baselineMs) / baselineMs) * 100),
  };
}
