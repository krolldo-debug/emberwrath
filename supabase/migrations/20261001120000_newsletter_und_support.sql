-- Emberwrath: Newsletter (Double-Opt-in) und Support-Anfragen der Website.
-- Einmal im Supabase-SQL-Editor ausführen (nach 20260930120000_konten_und_admin.sql, braucht public.assert_admin()).
--
-- Sicherheitsmodell
--  - Beide Tabellen haben Row Level Security ohne Policies: Für anon und angemeldete Konten weder lesbar noch schreibbar.
--    Schreiben tut nur der Worker (worker/forms.js) mit dem service_role-Schlüssel (Secret SUPABASE_SERVICE_ROLE_KEY).
--  - Das Admin-Panel liest über admin_newsletter_stats() und admin_support_requests(); beide prüfen assert_admin().

-- ---------------------------------------------------------------- Newsletter
create table if not exists public.newsletter_subscribers (
  id                bigint generated always as identity primary key,
  email             text not null unique check (email = lower(email) and length(email) between 5 and 254),
  status            text not null default 'pending' check (status in ('pending', 'confirmed', 'unsubscribed')),
  confirm_token     text unique,
  unsubscribe_token text not null unique,
  source            text,
  requested_at      timestamptz not null default now(),   -- letzte Anmeldung (Beginn der Bestätigungsfrist)
  confirmed_at      timestamptz,                           -- Nachweis der Einwilligung (Double-Opt-in)
  unsubscribed_at   timestamptz,
  created_at        timestamptz not null default now()
);
alter table public.newsletter_subscribers enable row level security;
revoke all on public.newsletter_subscribers from anon, authenticated;

-- ---------------------------------------------------------------- Support-Anfragen (Kopie der Mails an den Support)
create table if not exists public.support_requests (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('kontakt', 'fehler', 'loeschen')),
  email      text not null,
  name       text,
  character  text,
  device     text,
  message    text not null default '',
  done       boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.support_requests enable row level security;
revoke all on public.support_requests from anon, authenticated;

-- Der Worker schreibt mit dem Secret Key (Rolle service_role). Neuere Supabase-Projekte vergeben dafür keine
-- Tabellenrechte mehr automatisch, ohne diese Zeilen antwortet PostgREST mit 403.
grant select, insert, update, delete on public.newsletter_subscribers, public.support_requests to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Unbestätigte Anmeldungen und erledigte Anfragen nicht ewig aufheben (Datensparsamkeit): täglich per pg_cron
-- oder von Hand: select public.cleanup_forms();
create or replace function public.cleanup_forms() returns void
language sql security definer set search_path = '' as $$
  delete from public.newsletter_subscribers where status = 'pending' and requested_at < now() - interval '7 days';
  delete from public.support_requests where done and created_at < now() - interval '180 days';
$$;
revoke execute on function public.cleanup_forms() from public, anon, authenticated;

-- ---------------------------------------------------------------- Admin
create or replace function public.admin_newsletter_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform public.assert_admin();
  select jsonb_build_object(
    'confirmed',    (select count(*) from public.newsletter_subscribers where status = 'confirmed'),
    'pending',      (select count(*) from public.newsletter_subscribers where status = 'pending'),
    'unsubscribed', (select count(*) from public.newsletter_subscribers where status = 'unsubscribed'),
    'confirmed_7d', (select count(*) from public.newsletter_subscribers where status = 'confirmed' and confirmed_at > now() - interval '7 days'),
    'support_open', (select count(*) from public.support_requests where not done)
  ) into r;
  return r;
end $$;

create or replace function public.admin_support_requests(p_limit int default 100, p_offset int default 0)
returns table (id bigint, kind text, email text, name text, "character" text, device text, message text, done boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query select s.id, s.kind, s.email, s.name, s.character, s.device, s.message, s.done, s.created_at
    from public.support_requests s order by s.done, s.created_at desc limit least(p_limit, 500) offset p_offset;
end $$;

create or replace function public.admin_support_done(p_id bigint, p_done boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  update public.support_requests set done = p_done where id = p_id;
end $$;

revoke execute on function public.admin_newsletter_stats() from public, anon;
revoke execute on function public.admin_support_requests(int, int) from public, anon;
revoke execute on function public.admin_support_done(bigint, boolean) from public, anon;
grant execute on function public.admin_newsletter_stats() to authenticated;
grant execute on function public.admin_support_requests(int, int) to authenticated;
grant execute on function public.admin_support_done(bigint, boolean) to authenticated;
