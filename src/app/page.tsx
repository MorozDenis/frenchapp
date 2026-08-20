"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { AccentPalette } from "@/components/AccentPalette";
import { applyAccentShortcut } from "@/lib/accents";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { Correction, formatSeconds, type CorrectionData } from "@/components/Correction";
import { RAPIDE_MAX_MS, CORRECT_MAX_MS } from "@/lib/srs";
import { TASK_TYPES, TASK_TYPE_LABEL, type DrillMode, type TaskType } from "@/lib/taxonomy";

/**
 * The drill (BRD §5).
 *
 * The app opens straight into this and starts a session on load: §4 says no
 * dashboard first and no configuration required to start, so the settings row
 * exists but nothing waits on it.
 */

interface PlannedItem {
  expressionIds: string[];
  theme: string | null;
}

interface CurrentPrompt {
  promptId: string;
  statementFr: string;
  taskType: TaskType;
  targets: { id: string; text: string; register: string; gloss_en: string | null }[];
}

type Phase =
  | "starting"
  | "loading"
  | "answering"
  | "submitting"
  | "correction"
  | "done"
  | "blocked";

const SETTINGS_KEY = "debit.settings.v1";

interface Settings {
  mode: DrillMode;
  taskType: TaskType;
  itemCount: number;
  showTimer: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  mode: "text",
  taskType: "phrase",
  itemCount: 8,
  showTimer: true,
};

export default function DrillPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [phase, setPhase] = useState<Phase>("starting");
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [queue, setQueue] = useState<PlannedItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [current, setCurrent] = useState<CurrentPrompt | null>(null);

  const [answer, setAnswer] = useState("");
  const [correction, setCorrection] = useState<CorrectionData | null>(null);
  const [submitted, setSubmitted] = useState("");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(false);
  /** Set when voice fails for a single item and it drops to typing (FR-4.6). */
  const [forcedText, setForcedText] = useState(false);

  const startedRef = useRef(false);
  const revealedAtRef = useRef<number>(0);
  const latencyRef = useRef<number | null>(null);
  const answerRef = useRef<HTMLTextAreaElement | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const voiceMode = settings.mode === "voice" && !forcedText;

  // ---- settings persistence -------------------------------------------------

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      // Read after mount rather than in a lazy initialiser: localStorage does
      // not exist when this page is prerendered, and seeding state from it
      // during render would mismatch on hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
    } catch {
      // A corrupt settings blob is not worth a broken drill.
    }
  }, []);

  const updateSettings = (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* private browsing */
      }
      return next;
    });
  };

  // ---- the clock ------------------------------------------------------------

  useEffect(() => {
    if (phase !== "answering") return;
    // The countdown is hideable (§11 — the timer must not create the anxiety it
    // is trying to measure), but the measurement runs either way.
    const id = window.setInterval(() => {
      setElapsed(Date.now() - revealedAtRef.current);
    }, 100);
    return () => window.clearInterval(id);
  }, [phase]);

  // ---- session --------------------------------------------------------------

  const startSession = useCallback(async () => {
    setPhase("starting");
    setMessage(null);
    setCorrection(null);
    // Cleared before the await so the "load the first prompt" effect below
    // cannot fire against the previous session's queue while this one is in
    // flight.
    setQueue([]);
    setCurrent(null);

    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: settings.mode, itemCount: settings.itemCount }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setPhase("blocked");
      setMessage(payload.error ?? "Could not start a session");
      return;
    }

    setSessionId(payload.session.id);
    setQueue(payload.items);
    setCursor(0);
    setNotice(payload.newShareWarning ?? null);
  }, [settings.itemCount, settings.mode]);

  useEffect(() => {
    // Once on mount, and guarded so Strict Mode's double-invoke in development
    // does not open two sessions. Changing the mode mid-session deliberately
    // does not restart: that is what "New session" is for.
    if (startedRef.current) return;
    startedRef.current = true;
    void startSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const endSession = useCallback(async () => {
    if (!sessionId) return;
    await fetch(`/api/sessions/${sessionId}`, { method: "PATCH" });
  }, [sessionId]);

  // ---- prompts --------------------------------------------------------------

  const loadPrompt = useCallback(
    async (item: PlannedItem) => {
      setPhase("loading");
      setAnswer("");
      setTranscript(null);
      setFlagged(false);
      setForcedText(false);
      latencyRef.current = null;

      const response = await fetch("/api/drill/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expressionIds: item.expressionIds,
          taskType: settings.taskType,
          theme: item.theme,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setPhase("blocked");
        setMessage(payload.error ?? "Could not build a prompt");
        return;
      }

      setCurrent(payload);
      // FR-3.1 — the clock starts the instant the prompt becomes visible.
      revealedAtRef.current = Date.now();
      setElapsed(0);
      setPhase("answering");
    },
    [settings.taskType],
  );

  useEffect(() => {
    if (phase !== "starting" || queue.length === 0) return;
    // The state update happens after an await, which the rule cannot see through.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPrompt(queue[0]);
  }, [phase, queue, loadPrompt]);

  useEffect(() => {
    if (phase === "answering" && !voiceMode) answerRef.current?.focus();
  }, [phase, voiceMode]);

  // ---- submission -----------------------------------------------------------

  const submit = useCallback(
    async (payload: {
      rawInput?: string;
      transcript?: string;
      audioPath?: string | null;
      speakingMs?: number;
      latencyMs: number;
      mode: DrillMode;
      shown: string;
    }) => {
      if (!current) return;
      setPhase("submitting");

      const response = await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          promptId: current.promptId,
          expressionIds: current.targets.map((t) => t.id),
          mode: payload.mode,
          rawInput: payload.rawInput ?? null,
          transcript: payload.transcript ?? null,
          audioPath: payload.audioPath ?? null,
          latencyMs: payload.latencyMs,
          speakingMs: payload.speakingMs ?? null,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        setPhase("answering");
        setMessage(result.error ?? "Could not save that attempt");
        return;
      }

      setSubmitted(payload.shown);
      setCorrection(result);

      // `absent` sends an expression back into this session (FR-6).
      if (result.repeatExpressionIds?.length) {
        setQueue((prev) => [
          ...prev,
          { expressionIds: result.repeatExpressionIds, theme: null },
        ]);
      }

      setPhase("correction");
    },
    [current, sessionId],
  );

  const submitText = useCallback(() => {
    if (phase !== "answering" || !answer.trim()) return;
    void submit({
      rawInput: answer,
      latencyMs: Date.now() - revealedAtRef.current,
      mode: "text",
      shown: answer,
    });
  }, [answer, phase, submit]);

  const handleAudio = useCallback(
    async (audio: Blob, speakingMs: number) => {
      const latencyMs = latencyRef.current ?? Date.now() - revealedAtRef.current;
      const form = new FormData();
      form.append("audio", audio, "attempt.webm");

      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      const payload = await response.json();

      if (!response.ok) {
        // FR-4.6 — the item degrades to typing rather than being lost. The
        // latency already measured stands; only the medium changes.
        setForcedText(true);
        setPhase("answering");
        setMessage(
          `${payload.error ?? "Transcription failed"} — type this one instead.`,
        );
        return;
      }

      setTranscript(payload.transcript);
      void submit({
        transcript: payload.transcript,
        audioPath: payload.audioPath,
        latencyMs,
        speakingMs,
        mode: "voice",
        shown: payload.transcript,
      });
    },
    [submit],
  );

  // ---- moving on ------------------------------------------------------------

  const next = useCallback(() => {
    setCorrection(null);
    setMessage(null);
    const upcoming = cursor + 1;
    if (upcoming >= queue.length) {
      void endSession();
      setPhase("done");
      return;
    }
    setCursor(upcoming);
    void loadPrompt(queue[upcoming]);
  }, [cursor, endSession, loadPrompt, queue]);

  const flagTranscript = useCallback(async () => {
    if (!correction) return;
    await fetch(`/api/attempts/${correction.attemptId}/flag`, { method: "POST" });
    setFlagged(true);
  }, [correction]);

  const onAnswerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // FR-3.4
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      submitText();
      return;
    }
    // FR-3.3 — Alt+letter cycles that letter's accents.
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.length === 1) {
      if (applyAccentShortcut(event.currentTarget, event.key)) event.preventDefault();
    }
  };

  const band = useMemo(() => {
    if (elapsed < RAPIDE_MAX_MS) return "rapide";
    if (elapsed <= CORRECT_MAX_MS) return "correct";
    return "lent";
  }, [elapsed]);

  // ---- render ---------------------------------------------------------------

  return (
    <>
      <main className="shell">
        <Nav />

        <SettingsRow
          settings={settings}
          onChange={updateSettings}
          onRestart={() => {
            void endSession();
            void startSession();
          }}
          busy={phase === "starting" || phase === "loading" || phase === "submitting"}
        />

        {notice && (
          <p className="notice no-print" style={{ marginBottom: 16 }}>
            {notice}
          </p>
        )}

        {phase === "blocked" && (
          <section className="card stack">
            <p className="notice notice--error" style={{ margin: 0 }}>
              {message}
            </p>
            <div className="row">
              <Link href="/bank" className="btn">
                Go to the bank
              </Link>
              <button type="button" className="btn btn--ghost" onClick={() => void startSession()}>
                Try again
              </button>
            </div>
          </section>
        )}

        {phase === "done" && (
          <section className="card stack">
            <h2>Session finished</h2>
            <p className="muted small" style={{ margin: 0 }}>
              {queue.length} item{queue.length === 1 ? "" : "s"}. The numbers are on
              the progress page; there is nothing to collect here.
            </p>
            <div className="row">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void startSession()}
              >
                Another session
              </button>
              <Link href="/progress" className="btn">
                Progress
              </Link>
            </div>
          </section>
        )}

        {(phase === "starting" || phase === "loading") && (
          <section className="card">
            <p className="empty" style={{ padding: 24 }}>
              {phase === "starting" ? "Building the session…" : "Writing the prompt…"}
            </p>
          </section>
        )}

        {current && (phase === "answering" || phase === "submitting") && (
          <section className="card">
            <div className="drill__meta">
              <span>
                {cursor + 1} / {queue.length}
              </span>
              <span>{TASK_TYPE_LABEL[current.taskType]}</span>
              <span className="topbar__spacer" />
              {settings.showTimer && (
                <span className={`drill__clock${band === "lent" ? " drill__clock--lent" : ""}`}>
                  {formatSeconds(elapsed)}
                </span>
              )}
            </div>

            <p className="prompt">{current.statementFr}</p>

            <div className="targets">
              {current.targets.map((target) => (
                <span key={target.id} className="target">
                  {target.text}
                  <span className="target__register">{target.register}</span>
                </span>
              ))}
            </div>

            {message && (
              <p className="notice notice--error" style={{ marginBottom: 14 }}>
                {message}
              </p>
            )}

            {voiceMode ? (
              <VoiceRecorder
                disabled={phase === "submitting"}
                onStart={() => {
                  // FR-4.3 — time-to-start is the retrieval metric and stops
                  // the moment the microphone opens, not when speech ends.
                  latencyRef.current = Date.now() - revealedAtRef.current;
                }}
                onCaptured={(audio, speakingMs) => void handleAudio(audio, speakingMs)}
                onError={(text) => {
                  setForcedText(true);
                  setMessage(text);
                }}
              />
            ) : (
              <>
                <textarea
                  ref={answerRef}
                  className="textarea answer"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={onAnswerKeyDown}
                  disabled={phase === "submitting"}
                  placeholder="Écrivez ici…"
                  /* FR-3.2 — none of these crutches exist in the exam. */
                  spellCheck={false}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  data-gramm="false"
                />
                <AccentPalette targetRef={answerRef} />
                <div className="row no-print" style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={submitText}
                    disabled={phase === "submitting" || !answer.trim()}
                  >
                    {phase === "submitting" ? "Scoring…" : "Submit"}
                  </button>
                  <span className="tiny muted">⌘/Ctrl + Enter</span>
                </div>
              </>
            )}
          </section>
        )}

        {phase === "correction" && correction && (
          <Correction
            data={correction}
            production={submitted}
            transcript={transcript}
            flagged={flagged}
            onFlagTranscript={transcript ? () => void flagTranscript() : undefined}
            onDismiss={next}
          />
        )}
      </main>
    </>
  );
}

function SettingsRow({
  settings,
  onChange,
  onRestart,
  busy,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onRestart: () => void;
  busy: boolean;
}) {
  return (
    <div className="row no-print" style={{ marginBottom: 16, gap: 8 }}>
      <div className="row" style={{ gap: 0, border: "1px solid var(--border-strong)", borderRadius: 8, overflow: "hidden" }}>
        {(["text", "voice"] as DrillMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            className="btn btn--sm"
            style={{
              border: "none",
              borderRadius: 0,
              background: settings.mode === mode ? "var(--surface-2)" : "transparent",
              fontWeight: settings.mode === mode ? 600 : 400,
            }}
            onClick={() => onChange({ mode })}
          >
            {mode === "text" ? "Text" : "Voice"}
          </button>
        ))}
      </div>

      <select
        className="select"
        style={{ width: "auto" }}
        value={settings.taskType}
        onChange={(e) => onChange({ taskType: e.target.value as TaskType })}
      >
        {TASK_TYPES.map((task) => (
          <option key={task} value={task}>
            {TASK_TYPE_LABEL[task]}
          </option>
        ))}
      </select>

      <select
        className="select"
        style={{ width: "auto" }}
        value={settings.itemCount}
        onChange={(e) => onChange({ itemCount: Number(e.target.value) })}
      >
        {[5, 8, 12, 20].map((count) => (
          <option key={count} value={count}>
            {count} items
          </option>
        ))}
      </select>

      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={() => onChange({ showTimer: !settings.showTimer })}
        title="The clock is recorded either way"
      >
        {settings.showTimer ? "Hide timer" : "Show timer"}
      </button>

      <span className="topbar__spacer" />

      <button type="button" className="btn btn--ghost btn--sm" onClick={onRestart} disabled={busy}>
        New session
      </button>
    </div>
  );
}
