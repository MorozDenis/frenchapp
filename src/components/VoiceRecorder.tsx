"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * FR-4.1 / FR-4.3 — capture, and the two clocks that matter.
 *
 * Time-to-start is the retrieval metric: how long between seeing the prompt and
 * daring to open your mouth. Speaking duration is a fluency metric. They are
 * reported separately because they move independently — you can start fast and
 * ramble, or think for thirty seconds and then be fluent.
 *
 * Press and hold to talk, or tap once to start and again to stop; both are
 * needed, because a phone in a coat pocket and a desktop with a mic are not the
 * same gesture.
 */

const HOLD_THRESHOLD_MS = 500;

export type RecorderState = "idle" | "recording" | "processing" | "denied";

export function VoiceRecorder({
  disabled,
  onCaptured,
  onStart,
  onError,
}: {
  disabled?: boolean;
  onStart: () => void;
  onCaptured: (audio: Blob, speakingMs: number) => void;
  onError: (message: string) => void;
}) {
  const [state, setState] = useState<RecorderState>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const pressedAtRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  // `state` lags a tap by a render and by however long getUserMedia takes, so
  // the gesture decisions below read a ref instead.
  const recordingRef = useRef(false);
  const stoppedOnDownRef = useRef(false);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => releaseStream, [releaseStream]);

  const begin = useCallback(async () => {
    if (recordingRef.current || disabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        recordingRef.current = false;
        const speakingMs = Date.now() - startedAtRef.current;
        const audio = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        releaseStream();
        setState("processing");
        onCaptured(audio, speakingMs);
      };

      recorder.start();
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recordingRef.current = true;
      setState("recording");
      // The clock the retrieval metric is measured against stops here.
      onStart();
    } catch {
      recordingRef.current = false;
      setState("denied");
      // FR-4.6 — a refused microphone drops the item to text, never loses it.
      onError("Microphone unavailable. This item falls back to typing.");
    }
  }, [disabled, onCaptured, onError, onStart, releaseStream]);

  const end = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else recordingRef.current = false;
  }, []);

  const onPointerDown = () => {
    // Pressing again while recording is the "second press" of FR-4.1.
    if (recordingRef.current) {
      stoppedOnDownRef.current = true;
      end();
      return;
    }
    pressedAtRef.current = Date.now();
    void begin();
  };

  const onPointerUp = () => {
    if (stoppedOnDownRef.current) {
      stoppedOnDownRef.current = false;
      return;
    }
    // Held long enough to be push-to-talk: release ends it. A quick tap falls
    // through and leaves the recorder running until the next press.
    if (recordingRef.current && Date.now() - pressedAtRef.current > HOLD_THRESHOLD_MS) {
      end();
    }
  };

  const label =
    state === "recording"
      ? "Recording — release or tap to stop"
      : state === "processing"
        ? "Transcribing…"
        : "Hold to speak, or tap to start";

  return (
    <div className="stack stack--tight no-print">
      <button
        type="button"
        className={`btn btn--wide ${state === "recording" ? "btn--danger" : "btn--primary"}`}
        style={{ padding: "18px 16px", fontSize: 16 }}
        disabled={disabled || state === "processing"}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {state === "recording" ? "● " : ""}
        {label}
      </button>
    </div>
  );
}
