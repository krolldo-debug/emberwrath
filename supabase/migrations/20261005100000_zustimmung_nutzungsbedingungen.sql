-- Emberwrath: Zustimmung zu den Nutzungsbedingungen serverseitig festhalten (Nachweis).
-- Einmal im Supabase-SQL-Editor ausführen (nach 20260930120000_konten_und_admin.sql). Mehrfach ausführbar.
--
-- Das Spiel schreibt die akzeptierte Fassung in die Kontodaten (user_metadata.terms_version): bei der Registrierung
-- (signUp) und nach der ersten Google-Anmeldung (updateUser). Diese Kontodaten kann der Spieler selbst ändern, als
-- Nachweis taugen sie allein nicht. Deshalb schreibt ein Trigger auf auth.users jede neu akzeptierte Fassung mit
-- Serverzeit in public.terms_consents. Spieler können die Tabelle weder lesen noch ändern; Einträge werden nie
-- überschrieben, nur ergänzt. Wird das Konto gelöscht, verschwinden seine Einträge mit (Datensparsamkeit).

create table if not exists public.terms_consents (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  terms_version text not null check (char_length(terms_version) between 1 and 32),
  source        text not null,                       -- 'registrierung' (beim Anlegen) | 'bestaetigung' (später im Spiel)
  accepted_at   timestamptz not null default now()   -- Serverzeit, nicht die Angabe des Geräts
);
create unique index if not exists terms_consents_once on public.terms_consents (user_id, terms_version);
alter table public.terms_consents enable row level security;
revoke all on public.terms_consents from anon, authenticated;
grant select, insert, update, delete on public.terms_consents to service_role;
grant usage, select on all sequences in schema public to service_role;

create or replace function public.terms_consent_record() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v text := left(nullif(trim(new.raw_user_meta_data ->> 'terms_version'), ''), 32);
begin
  if v is null then return new; end if;
  if tg_op = 'UPDATE' and v is not distinct from left(nullif(trim(old.raw_user_meta_data ->> 'terms_version'), ''), 32) then
    return new;
  end if;
  insert into public.terms_consents (user_id, terms_version, source)
    values (new.id, v, case when tg_op = 'INSERT' then 'registrierung' else 'bestaetigung' end)
    on conflict (user_id, terms_version) do nothing;
  return new;
end $$;
revoke execute on function public.terms_consent_record() from public, anon, authenticated;

drop trigger if exists terms_consent_record on auth.users;
create trigger terms_consent_record after insert or update of raw_user_meta_data on auth.users
  for each row execute function public.terms_consent_record();

-- Bestehende Konten, die schon zugestimmt haben (vor dieser Migration), einmalig übernehmen. Zeitpunkt ist dann die
-- Angabe aus den Kontodaten, falls lesbar, sonst der Zeitpunkt der Registrierung.
insert into public.terms_consents (user_id, terms_version, source, accepted_at)
  select u.id, left(u.raw_user_meta_data ->> 'terms_version', 32), 'uebernahme',
    coalesce(case when (u.raw_user_meta_data ->> 'terms_accepted_at') ~ '^\d{4}-\d{2}-\d{2}T'
      then (u.raw_user_meta_data ->> 'terms_accepted_at')::timestamptz end, u.created_at, now())
  from auth.users u
  where nullif(trim(u.raw_user_meta_data ->> 'terms_version'), '') is not null
on conflict (user_id, terms_version) do nothing;

-- Verwaltung: Nachweis für ein Konto abrufen (z. B. bei einer Anfrage). Nur für Admins.
create or replace function public.admin_terms_consents(p_user uuid)
returns table (terms_version text, source text, accepted_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query select c.terms_version, c.source, c.accepted_at from public.terms_consents c
    where c.user_id = p_user order by c.accepted_at;
end $$;
revoke execute on function public.admin_terms_consents(uuid) from public, anon;
grant execute on function public.admin_terms_consents(uuid) to authenticated;
