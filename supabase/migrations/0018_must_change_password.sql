-- Temporary passwords: Admin sets one when creating a login (or resetting a
-- forgotten one) and the user must replace it with their own before they
-- can use the app. Passwords themselves are never stored here — only
-- Supabase Auth holds them, hashed.

alter table profiles
  add column must_change_password boolean not null default false,
  add column password_changed_at timestamptz;

-- Signs a user out everywhere (deleting a session cascades to its refresh
-- tokens). Used when Admin resets a password so any device still logged in
-- on the old one gets kicked out. Service role only.
create function revoke_user_sessions(target uuid)
returns void
language sql
security definer set search_path = auth, public
as $$
  delete from auth.sessions where user_id = target;
$$;

revoke execute on function revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function revoke_user_sessions(uuid) to service_role;
