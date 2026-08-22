# Débit

Timed French production drill for TCF/TEF candidates at the B1→B2 boundary.

The problem it addresses is retrieval speed, not rule knowledge. Anki and
Duolingo train recognition — seeing *néanmoins* and recalling "nevertheless".
The exam requires production: generating a correct, register-appropriate
sentence containing *néanmoins* in under fifteen seconds, unprompted. This app
does timed, constrained production practice with automated correction, so reps
per week are limited by available minutes rather than by tutor availability.

## The loop

A themed situation plus two to four target expressions → type or speak an
answer against a clock → an LLM returns structured scores, a correction, and one
key fix → each expression's review interval moves on **both** correctness and
latency. The drill never asks you to leave it to fix data or read an
explanation.

The scheduling rule that makes this different from ordinary spaced repetition:
**correct but slow is not a pass.** An answer you produced in 50 seconds is
still passive vocabulary, so it buys no interval growth and costs ease.

| Outcome | Interval effect |
|---|---|
| Correct + `rapide` (<20s) | interval × ease |
| Correct + `correct` (20–45s) | interval × 1.3 |
| Correct + `lent` (>45s) | unchanged, ease −0.1 |
| Misused | reset to 1 day, ease −0.2 |
| Absent | repeat in the same session |

An expression reaches `active` after two fast-correct results in different
sessions and in at least one different prompt context.

## Running it

Requires Node 20+, a Supabase project, and an Anthropic API key. Voice mode
additionally needs a Whisper-compatible transcription endpoint.

```bash
npm install
cp .env.example .env.local     # then fill it in
npm run dev
```

### Database

Apply the migrations in `supabase/migrations/` in order, either through the
Supabase SQL editor or with the CLI:

```bash
supabase link --project-ref <ref>
supabase db push
```

`0001_init.sql` creates the schema, the closed error taxonomy as a Postgres
enum, and row-level security on every table. `0002_audio_retention.sql` creates
the private audio bucket and the 30-day purge. `0003_lock_down_functions.sql`
revokes RPC access to the two `SECURITY DEFINER` functions, which PostgREST
would otherwise expose at `/rest/v1/rpc/<name>`.

Sign-in is a magic link, so enable email auth in the Supabase dashboard. The
app is single-user, but every table is keyed to `auth.uid()` — opening it up
later is a policy change, not a migration.

To run the audio purge on a schedule:

```sql
select cron.schedule('purge-audio', '0 4 * * *', 'select purge_expired_audio()');
```

### Environment

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | everything |
| `LLM_API_KEY` | enrichment, prompt generation, scoring |
| `LLM_BASE_URL` | optional; any Anthropic-compatible endpoint. Unset = Anthropic |
| `LLM_MODEL` | optional; defaults to `claude-opus-5` |
| `WHISPER_API_URL`, `WHISPER_API_KEY`, `WHISPER_MODEL` | voice mode |
| `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_AUDIO_BUCKET` | keeping voice recordings for playback |

Model keys are read only inside server routes and never reach the browser.
Without `SUPABASE_SERVICE_ROLE_KEY` voice mode still works; it just cannot store
the audio for reviewing a suspect transcription later.

### Checks

```bash
npm test         # unit tests
npm run typecheck
npm run build
```

## Deploying

Supabase first — Vercel needs its URL and key at build time.

1. **Create the Supabase project**, then apply the three migrations in order
   (SQL editor or `supabase db push`).
2. **Authentication → Providers → Email**: enable it. Sign-in is a magic link,
   so no password settings matter. Free-tier magic links go through shared SMTP
   with a low hourly rate limit — fine for one user, not for a demo to a room.
3. **Import the repo on Vercel.** `vercel.json` pins the framework to
   `nextjs`, so the build works even if the project was created before the app
   existed — a project first linked to an empty repo detects "no framework" and
   keeps that setting, then fails with `STATIC_BUILD_NO_OUT_DIR` looking for a
   `public/` directory. Pinning it in the repo makes the build reproducible
   rather than dependent on what the dashboard happened to infer.
4. **Set the environment variables before the first build.** `NEXT_PUBLIC_*` is
   inlined into the client bundle at build time, so adding those after a deploy
   leaves the browser holding `undefined` until you redeploy. The server-side
   keys are read per request and take effect on save. A deployment missing
   either public variable serves a 503 naming the ones it cannot find, on every
   route, rather than failing obscurely.
5. **Point auth back at the deployed domain.** In Supabase, under
   **Authentication → URL Configuration**, set the Site URL to the deployment
   and add both `https://<domain>/**` and `http://localhost:3000/**` to Redirect
   URLs. The login page sends `emailRedirectTo: window.location.origin + next`;
   if the domain is not allow-listed the magic link bounces to the site root and
   you appear signed out after clicking it. This is the step that bites.
6. **Schedule the audio purge** (optional — voice mode only):

   ```sql
   create extension if not exists pg_cron;
   select cron.schedule('purge-audio', '0 4 * * *', 'select purge_expired_audio()');
   ```

   Without it, recordings accumulate instead of expiring at 30 days. Nothing
   else breaks.

Then sign in, add expressions in the bank, and drill.

## Layout

```
src/lib/          scheduling, planning, parsing, scoring normalisation, analytics
src/lib/llm/      Anthropic calls: enrichment, packs, prompts, grading
src/app/api/      server routes; every model key lives here
src/app/          drill (/), bank, cheat sheet, progress
supabase/         migrations
tests/            unit tests for everything pure
```

The rules worth knowing before changing anything:

- **The error taxonomy is closed** (`src/lib/taxonomy.ts`). The trend charts
  compare month against month, and one invented category puts a phantom bar on
  the axis. The list is enforced as a Postgres enum and filtered again when the
  model's response is parsed.
- **Scoring never blocks.** The attempt row is written before the grader is
  called, so a grader outage costs the correction, never the rep. Failed grades
  queue for retry on the progress page.
- **The rubric in `src/lib/llm/score.ts` is versioned by hand.** Editing it
  changes what the numbers mean, so trend lines across an edit are not
  like-for-like.
- **The grading model is swappable but not interchangeable.** Any
  Anthropic-compatible endpoint works via `LLM_BASE_URL`, but only Anthropic
  enforces the response schema server-side. Elsewhere the closed enums hold
  only as far as the model's care does — with reasoning disabled, Kimi returns
  `register` values outside the allowed set and the whole response is
  rejected. `tests/live-provider.test.ts` exercises all four calls against
  whatever the environment points at; run it after any provider, model or
  prompt change.
- **Latency is a deployment constraint, not just a comfort one.** Measured on
  Kimi, the same scoring call has taken anywhere from 22s to 74s, and the same
  four-expression enrichment took 32s on one run and 65s on the next. Hosted
  functions are capped (60s on Vercel Hobby, 300s on Pro), and the tail
  exceeds the lower cap. Batch sizes here are therefore set for the tail
  rather than the median, and a paste is enriched two expressions at a time —
  which looks absurdly small until you see the variance. FR-5.2 is what makes that survivable: the attempt is
  written before the grader runs, so a timeout costs the correction and not
  the rep, and the progress page re-scores from the queue.
- **The drill input has no spell-check, autocomplete or grammar underlining.**
  Those are crutches the exam does not provide. The accent palette inserts
  characters and nothing more.

## Not in scope

No grammar lessons. No streaks, XP, badges, leaderboards, or notifications as
engagement. No social features. No mobile app — responsive web only. Full essay
mode (a 35-minute *lettre à la rédaction* scored against the exam rubric rather
than per expression) is a later phase and is not built.

> The app has failed if it is being improved more often than it is being used.
