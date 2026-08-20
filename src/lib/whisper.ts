/**
 * Server-side transcription (FR-4.2).
 *
 * Points at any OpenAI-compatible `/audio/transcriptions` endpoint — hosted
 * Whisper or a self-hosted one — so the transcription provider can move without
 * touching the drill. French is forced rather than detected: a hesitant B1
 * speaker with a Russian accent is exactly the input language ID gets wrong,
 * and one English-guessed transcript would produce a page of phantom grammar
 * errors.
 */

export class TranscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptionError";
  }
}

export async function transcribeFrench(audio: Blob, filename: string): Promise<string> {
  const url = process.env.WHISPER_API_URL;
  const key = process.env.WHISPER_API_KEY;
  if (!url || !key) {
    throw new TranscriptionError("Transcription is not configured");
  }

  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", process.env.WHISPER_MODEL ?? "whisper-1");
  form.append("language", "fr");
  form.append("response_format", "json");
  // Nudges the decoder towards written French conventions without supplying
  // vocabulary that could be echoed back into the transcript.
  form.append("prompt", "Transcription en français, avec ponctuation et accents.");

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } catch (cause) {
    throw new TranscriptionError(
      cause instanceof Error ? cause.message : "Could not reach the transcription service",
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new TranscriptionError(
      `Transcription failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }

  const payload = (await response.json()) as { text?: string };
  const text = payload.text?.trim();
  if (!text) throw new TranscriptionError("Transcription came back empty");
  return text;
}
