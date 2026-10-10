-- Emberwrath: Fehlermeldungen aus dem Spiel (Esc-Menü › Fehler melden, worker/bugreport.js).
-- Einmal im Supabase-SQL-Editor ausführen. Ohne diese Tabelle kommen Meldungen trotzdem per Mail an; die Tabelle
-- bewahrt sie zusätzlich auf (auch das Bild) und begrenzt Meldungen je Konto und Tag.
--
-- Sicherheitsmodell wie bei chat_reports: Row Level Security ohne Policies, für Spieler weder lesbar noch schreibbar.
-- Schreiben und Zählen tut nur der Worker mit dem Secret SUPABASE_SERVICE_ROLE_KEY.

create table if not exists public.bug_reports (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  email       text not null default '',
  message     text not null check (char_length(message) between 3 and 2000),
  context     jsonb not null default '{}'::jsonb,   -- Version, Gebiet, Gerät, Browser, letzte Fehler (automatisch)
  screenshot  text check (screenshot is null or char_length(screenshot) <= 400000),  -- data:image/jpeg;base64,…
  status      text not null default 'offen' check (status in ('offen', 'erledigt')),
  created_at  timestamptz not null default now()
);
create index if not exists bug_reports_user on public.bug_reports (user_id, created_at desc);
create index if not exists bug_reports_recent on public.bug_reports (created_at desc);
alter table public.bug_reports enable row level security;
revoke all on public.bug_reports from anon, authenticated;
grant select, insert, update, delete on public.bug_reports to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Datensparsamkeit: Meldungen nach 90 Tagen löschen, Bilder schon nach 30 Tagen.
create or replace function public.cleanup_bug_reports() returns void
language sql security definer set search_path = '' as $$
  update public.bug_reports set screenshot = null where screenshot is not null and created_at < now() - interval '30 days';
  delete from public.bug_reports where created_at < now() - interval '90 days';
$$;
revoke execute on function public.cleanup_bug_reports() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'emberwrath_fehlermeldungen';
  perform cron.schedule('emberwrath_fehlermeldungen', '25 3 * * *', 'select public.cleanup_bug_reports()');
exception when others then
  raise notice 'pg_cron nicht verfügbar (%). Bitte cleanup_bug_reports() regelmäßig von Hand ausführen.', sqlerrm;
end $$;
