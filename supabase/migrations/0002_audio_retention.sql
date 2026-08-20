-- Voice attempts keep their audio for 30 days (BRD §8) so a suspect
-- transcription can be listened back to; after that the row keeps its metrics
-- and loses the recording.

insert into storage.buckets (id, name, public)
values ('attempt-audio', 'attempt-audio', false)
on conflict (id) do nothing;

-- Objects are stored under "<user_id>/<attempt_id>.webm", so ownership is the
-- first path segment.
create policy "attempt_audio_owner_read" on storage.objects
  for select using (
    bucket_id = 'attempt-audio' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "attempt_audio_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'attempt-audio' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "attempt_audio_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'attempt-audio' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Deletes expired recordings and clears the pointer. Schedule with pg_cron
-- (`select cron.schedule('purge-audio', '0 4 * * *', 'select purge_expired_audio()')`)
-- or call it from a Vercel cron route.
create function purge_expired_audio() returns integer
language plpgsql security definer set search_path = public as $$
declare
  purged integer;
begin
  with expired as (
    select id, audio_url from attempt
    where audio_url is not null and audio_expires_at < now()
  ), gone as (
    delete from storage.objects
    where bucket_id = 'attempt-audio'
      and name in (select audio_url from expired)
    returning 1
  )
  update attempt set audio_url = null, audio_expires_at = null
  where id in (select id from expired);

  get diagnostics purged = row_count;
  return purged;
end;
$$;

-- Maintenance only. It bypasses RLS and is not scoped to a caller, so no
-- end-user role may run it.
revoke execute on function purge_expired_audio() from public, anon, authenticated;
