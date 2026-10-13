-- Session timeouts for shared site laptops (the free Supabase plan has no
-- built-in inactivity timeout). The browser signs people out after 20
-- minutes idle; this is the server-side backstop for when the browser can't
-- (a sleeping laptop, a tab reopened later). The proxy calls touch_session()
-- on requests and signs the user out if it returns anything but 'ok'.

create table session_activity (
  session_id uuid primary key references auth.sessions (id) on delete cascade,
  last_active_at timestamptz not null default now()
);

-- No policies: only touch_session() (security definer) reads or writes it.
alter table session_activity enable row level security;

-- Returns 'ok' and records activity, or ends the session and returns why:
--   'idle'    — no activity for 22 minutes (the browser's 20, plus a little
--               grace because the proxy only records activity once a minute)
--   'max'     — signed in for more than 12 hours
--   'revoked' — session already gone (Admin reset the password, deleted…)
-- Limits are fixed here rather than passed in so callers can't extend them.
create function touch_session()
returns text
language plpgsql
security definer set search_path = public, auth
as $$
declare
  sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  started timestamptz;
  last_seen timestamptz;
begin
  if sid is null or auth.uid() is null then
    return 'revoked';
  end if;

  select s.created_at into started
  from auth.sessions s
  where s.id = sid and s.user_id = auth.uid();

  if started is null then
    return 'revoked';
  end if;

  if started < now() - interval '12 hours' then
    delete from auth.sessions where id = sid;
    return 'max';
  end if;

  select a.last_active_at into last_seen
  from session_activity a
  where a.session_id = sid;

  if last_seen is not null and last_seen < now() - interval '22 minutes' then
    delete from auth.sessions where id = sid;
    return 'idle';
  end if;

  insert into session_activity (session_id, last_active_at)
  values (sid, now())
  on conflict (session_id) do update set last_active_at = excluded.last_active_at;

  return 'ok';
end;
$$;

revoke execute on function touch_session() from public, anon;
grant execute on function touch_session() to authenticated;
