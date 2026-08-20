-- Supabase's security linter flags every SECURITY DEFINER function in the
-- public schema, because PostgREST exposes each one at /rest/v1/rpc/<name>.
-- Neither of ours is meant to be reachable that way.

-- A trigger function has no business being called over the API at all. The
-- trigger itself is unaffected: PostgreSQL checks EXECUTE when the trigger is
-- created, not each time it fires.
revoke execute on function ensure_review_state() from public, anon, authenticated;

-- snapshot_states is called by the app when a session starts, so signed-in
-- users keep it and anonymous callers lose it. Calling it as `anon` was never
-- exploitable — auth.uid() is null there and state_snapshot.user_id is NOT
-- NULL, so the insert simply failed — but an endpoint that can only error is
-- still an endpoint worth removing.
revoke execute on function snapshot_states() from public, anon;
grant execute on function snapshot_states() to authenticated;
