-- Emberwrath: Meldungen aus dem Gebietschat (DSA Art. 16) und Chatsperren (DSA Art. 17).
-- Einmal im Supabase-SQL-Editor ausführen (nach 20260930120000_konten_und_admin.sql, braucht public.assert_admin()).
--
-- Sicherheitsmodell wie bei newsletter_und_support:
--  - Beide Tabellen haben Row Level Security ohne Policies: für Spieler weder lesbar noch schreibbar.
--  - Schreiben tut nur der Welt-Server (worker/moderation.js) mit dem Secret SUPABASE_SERVICE_ROLE_KEY. Der Server
--    hängt die letzten Chatnachrichten der gemeldeten Person an, so wie er sie selbst verteilt hat (nicht vom Client).
--  - Das Admin-Panel liest und bearbeitet über admin_chat_reports(), admin_chat_report_resolve(), admin_chat_mute();
--    alle prüfen assert_admin().

create table if not exists public.chat_reports (
  id            bigint generated always as identity primary key,
  reporter_id   uuid not null,
  reporter_name text not null default '',
  reported_id   uuid not null,
  reported_name text not null default '',
  zone          text not null default '',
  world         int  not null default 1,
  reason        text not null check (reason in ('beleidigung', 'hass', 'spam', 'betrug', 'name', 'sonstiges')),
  note          text not null default '' check (char_length(note) <= 500),
  messages      jsonb not null default '[]'::jsonb,  -- [{ text, at }] letzte Nachrichten der gemeldeten Person
  good_faith    boolean not null default false,      -- Erklärung nach Art. 16 Abs. 2 lit. d
  status        text not null default 'offen' check (status in ('offen', 'erledigt', 'abgelehnt')),
  decision      text not null default '',            -- Begründung der Entscheidung (Art. 17)
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists chat_reports_open on public.chat_reports (status, created_at desc);
alter table public.chat_reports enable row level security;
revoke all on public.chat_reports from anon, authenticated;

create table if not exists public.chat_mutes (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  until       timestamptz not null,
  reason      text not null default '' check (char_length(reason) <= 300),
  report_id   bigint references public.chat_reports (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists chat_mutes_user on public.chat_mutes (user_id, until desc);
alter table public.chat_mutes enable row level security;
revoke all on public.chat_mutes from anon, authenticated;

grant select, insert, update, delete on public.chat_reports, public.chat_mutes to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Datensparsamkeit: erledigte Meldungen nach 180 Tagen, abgelaufene Sperren nach 365 Tagen löschen.
-- Läuft bei jedem Öffnen der Meldungen in der Verwaltung mit (kein pg_cron nötig).
create or replace function public.cleanup_chat_moderation() returns void
language sql security definer set search_path = '' as $$
  delete from public.chat_reports where status <> 'offen' and created_at < now() - interval '180 days';
  delete from public.chat_mutes where until < now() - interval '365 days';
$$;
revoke execute on function public.cleanup_chat_moderation() from public, anon, authenticated;

-- ---------------------------------------------------------------- Admin
create or replace function public.admin_chat_reports(p_status text default 'offen', p_limit int default 200)
returns table (id bigint, reporter_id uuid, reporter_name text, reporter_email text, reported_id uuid, reported_name text,
  reported_email text, zone text, world int, reason text, note text, messages jsonb, good_faith boolean, status text,
  decision text, decided_at timestamptz, created_at timestamptz, reports_against bigint, muted_until timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  perform public.cleanup_chat_moderation();
  return query
    select r.id, r.reporter_id, r.reporter_name, ru.email::text, r.reported_id, r.reported_name, du.email::text,
      r.zone, r.world, r.reason, r.note, r.messages, r.good_faith, r.status, r.decision, r.decided_at, r.created_at,
      (select count(*) from public.chat_reports x where x.reported_id = r.reported_id),
      (select max(m.until) from public.chat_mutes m where m.user_id = r.reported_id and m.until > now())
    from public.chat_reports r
    left join auth.users ru on ru.id = r.reporter_id
    left join auth.users du on du.id = r.reported_id
    where p_status is null or r.status = p_status
    order by r.created_at desc
    limit least(greatest(p_limit, 1), 500);
end $$;

create or replace function public.admin_chat_report_resolve(p_id bigint, p_status text, p_decision text default '')
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  if p_status not in ('offen', 'erledigt', 'abgelehnt') then raise exception 'Ungültiger Status' using errcode = '22023'; end if;
  update public.chat_reports set status = p_status, decision = left(coalesce(p_decision, ''), 500),
    decided_at = case when p_status = 'offen' then null else now() end
  where id = p_id;
end $$;

-- Chatsperre: p_hours = 0 hebt alle laufenden Sperren auf. Der Welt-Server prüft sie beim Betreten eines Gebiets.
create or replace function public.admin_chat_mute(p_user uuid, p_hours int, p_reason text default '', p_report bigint default null)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_until timestamptz;
begin
  perform public.assert_admin();
  if p_hours <= 0 then
    update public.chat_mutes set until = now() where user_id = p_user and until > now();
    return null;
  end if;
  v_until := now() + make_interval(hours => least(p_hours, 24 * 365 * 10));
  insert into public.chat_mutes (user_id, until, reason, report_id) values (p_user, v_until, left(coalesce(p_reason, ''), 300), p_report);
  return v_until;
end $$;

revoke execute on function public.admin_chat_reports(text, int), public.admin_chat_report_resolve(bigint, text, text),
  public.admin_chat_mute(uuid, int, text, bigint) from public, anon;
grant execute on function public.admin_chat_reports(text, int), public.admin_chat_report_resolve(bigint, text, text),
  public.admin_chat_mute(uuid, int, text, bigint) to authenticated;
