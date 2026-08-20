import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { requireUser, supabaseAdmin } from "@/lib/supabase/server";
import { transcribeFrench, TranscriptionError } from "@/lib/whisper";

/**
 * FR-4.2 — audio in, French transcript out.
 *
 * A failure here returns 503 with `code: "transcription_failed"` so the drill
 * can drop the item to text mode (FR-4.6) rather than losing the rep.
 */

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const BUCKET = process.env.SUPABASE_AUDIO_BUCKET ?? "attempt-audio";

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth) return fail("Not signed in", 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Expected multipart form data with an `audio` field");
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob)) return fail("No audio uploaded");
  if (audio.size === 0) return fail("The recording is empty");
  if (audio.size > MAX_AUDIO_BYTES) {
    return fail("That recording is too long for one drill item", 413);
  }

  const extension = (audio.type.split("/")[1] ?? "webm").split(";")[0];
  const objectPath = `${auth.user.id}/${crypto.randomUUID()}.${extension}`;

  let transcript: string;
  try {
    transcript = await transcribeFrench(audio, `attempt.${extension}`);
  } catch (error) {
    const message =
      error instanceof TranscriptionError ? error.message : "Transcription failed";
    console.error("[transcribe]", message);
    return NextResponse.json(
      { error: message, code: "transcription_failed" },
      { status: 503 },
    );
  }

  // Storage is optional: without a service-role key the drill still works, it
  // just cannot replay a suspect recording later.
  let audioPath: string | null = null;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { error } = await supabaseAdmin()
        .storage.from(BUCKET)
        .upload(objectPath, audio, {
          contentType: audio.type || "audio/webm",
          upsert: false,
        });
      if (error) throw new Error(error.message);
      audioPath = objectPath;
    } catch (error) {
      console.error("[transcribe] audio upload failed", error);
    }
  }

  return NextResponse.json({ transcript, audioPath });
}
