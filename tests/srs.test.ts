import { describe, expect, it } from "vitest";
import {
  ACTIVE_MIN_INTERVAL_DAYS,
  composeSession,
  latencyBand,
  nextReview,
  newItemShare,
  type Candidate,
  type ReviewSnapshot,
} from "@/lib/srs";

const NOW = new Date("2026-08-20T10:00:00.000Z");

const snapshot = (over: Partial<ReviewSnapshot> = {}): ReviewSnapshot => ({
  ease: 2.5,
  intervalDays: 0,
  consecutiveFastCorrect: 0,
  state: "new",
  lastFastSessionId: null,
  lastFastPromptId: null,
  ...over,
});

const daysBetween = (from: Date, to: Date) =>
  (to.getTime() - from.getTime()) / 86_400_000;

describe("latencyBand", () => {
  it("splits at the Axis 4 boundaries", () => {
    expect(latencyBand(0)).toBe("rapide");
    expect(latencyBand(19_999)).toBe("rapide");
    expect(latencyBand(20_000)).toBe("correct");
    expect(latencyBand(45_000)).toBe("correct");
    expect(latencyBand(45_001)).toBe("lent");
  });
});

describe("nextReview", () => {
  it("graduates a new card to one day on the first correct answer", () => {
    const r = nextReview(snapshot(), {
      usage: "present_correct",
      band: "rapide",
      sessionId: "s1",
      promptId: "p1",
      now: NOW,
    });
    expect(r.intervalDays).toBe(1);
    expect(daysBetween(NOW, r.dueAt)).toBe(1);
    expect(r.state).toBe("learning");
    expect(r.consecutiveFastCorrect).toBe(1);
  });

  it("multiplies an established interval by ease when rapide", () => {
    const r = nextReview(snapshot({ intervalDays: 4, ease: 2.5, state: "learning" }), {
      usage: "present_correct",
      band: "rapide",
      sessionId: "s1",
      promptId: "p1",
      now: NOW,
    });
    expect(r.intervalDays).toBe(10);
    expect(r.ease).toBe(2.5);
  });

  it("promotes only slowly when the answer lands in the correct band", () => {
    const r = nextReview(snapshot({ intervalDays: 10, state: "learning" }), {
      usage: "present_correct",
      band: "correct",
      sessionId: "s1",
      promptId: "p1",
      now: NOW,
    });
    expect(r.intervalDays).toBe(13);
    expect(r.consecutiveFastCorrect).toBe(0);
  });

  it("treats correct-but-slow as a non-pass: interval held, ease docked", () => {
    const r = nextReview(snapshot({ intervalDays: 10, ease: 2.5, state: "learning" }), {
      usage: "present_correct",
      band: "lent",
      sessionId: "s1",
      promptId: "p1",
      now: NOW,
    });
    expect(r.intervalDays).toBe(10);
    expect(r.ease).toBeCloseTo(2.4, 5);
  });

  it("resets a misused expression to one day and docks ease harder", () => {
    const r = nextReview(
      snapshot({ intervalDays: 30, ease: 2.5, state: "active", consecutiveFastCorrect: 2 }),
      { usage: "present_misused", band: "rapide", sessionId: "s1", promptId: "p1", now: NOW },
    );
    expect(r.intervalDays).toBe(1);
    expect(r.ease).toBeCloseTo(2.3, 5);
    expect(r.state).toBe("learning");
    expect(r.consecutiveFastCorrect).toBe(0);
  });

  it("sends an absent expression back into the same session", () => {
    const r = nextReview(snapshot({ intervalDays: 5, state: "learning" }), {
      usage: "absent",
      band: "rapide",
      sessionId: "s1",
      promptId: "p1",
      now: NOW,
    });
    expect(r.repeatInSession).toBe(true);
    expect(r.intervalDays).toBe(0);
    expect(r.dueAt.getTime()).toBe(NOW.getTime());
  });

  it("never lets ease fall below the floor", () => {
    let s = snapshot({ ease: 1.4, intervalDays: 3, state: "learning" });
    for (let i = 0; i < 5; i += 1) {
      const r = nextReview(s, {
        usage: "present_misused",
        band: "lent",
        sessionId: "s1",
        promptId: "p1",
        now: NOW,
      });
      s = { ...s, ease: r.ease, intervalDays: r.intervalDays, state: r.state };
    }
    expect(s.ease).toBe(1.3);
  });
});

describe("FR-6.1 promotion to active", () => {
  it("needs two fast-correct reps in different sessions and contexts", () => {
    const first = nextReview(snapshot(), {
      usage: "present_correct",
      band: "rapide",
      sessionId: "s1",
      promptId: "p1",
      now: NOW,
    });
    expect(first.state).toBe("learning");

    const second = nextReview(
      {
        ease: first.ease,
        intervalDays: first.intervalDays,
        consecutiveFastCorrect: first.consecutiveFastCorrect,
        state: first.state,
        lastFastSessionId: first.lastFastSessionId,
        lastFastPromptId: first.lastFastPromptId,
      },
      { usage: "present_correct", band: "rapide", sessionId: "s2", promptId: "p2", now: NOW },
    );
    expect(second.state).toBe("active");
    expect(second.intervalDays).toBeGreaterThanOrEqual(ACTIVE_MIN_INTERVAL_DAYS);
  });

  it("does not promote when both reps used the same prompt", () => {
    const r = nextReview(
      snapshot({
        consecutiveFastCorrect: 1,
        state: "learning",
        intervalDays: 1,
        lastFastSessionId: "s1",
        lastFastPromptId: "p1",
      }),
      { usage: "present_correct", band: "rapide", sessionId: "s2", promptId: "p1", now: NOW },
    );
    expect(r.state).toBe("learning");
    expect(r.consecutiveFastCorrect).toBe(2);
  });

  it("does not count a second rep inside the same session", () => {
    const r = nextReview(
      snapshot({
        consecutiveFastCorrect: 1,
        state: "learning",
        intervalDays: 1,
        lastFastSessionId: "s1",
        lastFastPromptId: "p1",
      }),
      { usage: "present_correct", band: "rapide", sessionId: "s1", promptId: "p9", now: NOW },
    );
    expect(r.consecutiveFastCorrect).toBe(1);
    expect(r.state).toBe("learning");
  });

  it("keeps active items resurfacing at 30 days or more", () => {
    const r = nextReview(
      snapshot({ state: "active", intervalDays: 5, consecutiveFastCorrect: 2, lastFastSessionId: "s1", lastFastPromptId: "p1" }),
      { usage: "present_correct", band: "rapide", sessionId: "s2", promptId: "p2", now: NOW },
    );
    expect(r.intervalDays).toBeGreaterThanOrEqual(ACTIVE_MIN_INTERVAL_DAYS);
  });
});

describe("composeSession", () => {
  const cand = (id: string, over: Partial<Candidate> = {}): Candidate => ({
    expressionId: id,
    dueAt: "2026-08-01T00:00:00.000Z",
    state: "learning",
    recentScore: null,
    ...over,
  });

  it("targets 70/20/10 when every bucket can be filled", () => {
    const candidates: Candidate[] = [
      ...Array.from({ length: 20 }, (_, i) => cand(`due${i}`)),
      ...Array.from({ length: 20 }, (_, i) =>
        cand(`weak${i}`, { dueAt: "2027-01-01T00:00:00.000Z", recentScore: 1 }),
      ),
      ...Array.from({ length: 20 }, (_, i) =>
        cand(`new${i}`, { state: "new", dueAt: "2027-01-01T00:00:00.000Z" }),
      ),
    ];
    const c = composeSession(candidates, 10, NOW);
    expect(c.due).toHaveLength(7);
    expect(c.weak).toHaveLength(2);
    expect(c.fresh).toHaveLength(1);
  });

  it("backfills from due work rather than shortening the session", () => {
    const candidates: Candidate[] = Array.from({ length: 12 }, (_, i) => cand(`due${i}`));
    const c = composeSession(candidates, 10, NOW);
    expect(c.due.length + c.weak.length + c.fresh.length).toBe(10);
  });

  it("never returns the same expression twice", () => {
    const candidates: Candidate[] = Array.from({ length: 8 }, (_, i) =>
      cand(`e${i}`, { recentScore: i }),
    );
    const c = composeSession(candidates, 8, NOW);
    const all = [...c.due, ...c.weak, ...c.fresh];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("newItemShare", () => {
  it("reports the proportion of the bank still untouched", () => {
    expect(newItemShare(["new", "new", "learning", "active"])).toBe(0.5);
    expect(newItemShare([])).toBe(0);
  });
});
