-- Emberwrath: Online-Konten, Charaktere in der Cloud, Admin-Übersicht.
-- Einmal im Supabase-SQL-Editor ausführen (oder per `supabase db push`). Siehe docs/ONLINE.md.
--
-- Sicherheitsmodell
--  - Anmeldung übernimmt Supabase Auth (E-Mail + Passwort, Google). Passwörter sieht das Spiel nie im Klartext gespeichert.
--  - Tabelle characters: jede Zeile gehört genau einem Konto (user_id). Row Level Security erlaubt nur dem Besitzer
--    Lesen, Anlegen, Ändern und Löschen seiner eigenen Zeilen.
--  - Tabelle admins: ohne Policies, also für normale Konten weder lesbar noch schreibbar. Wer Admin ist, trägt der
--    Projektbesitzer von Hand im SQL-Editor ein (docs/ONLINE.md, Schritt 5). Es gibt keinen Weg aus dem Spiel heraus,
--    sich selbst zum Admin zu machen – auch nicht, indem man sich als Erster registriert.
--  - Admin-Daten liefern nur die Funktionen admin_*; sie prüfen serverseitig is_admin() und verweigern sonst.

-- ---------------------------------------------------------------- Charaktere
create table if not exists public.characters (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  name       text        not null check (char_length(name) between 1 and 40),
  race_id    text        check (race_id is null or char_length(race_id) <= 32),
  class_id   text        check (class_id is null or char_length(class_id) <= 32),
  level      int         not null default 1 check (level between 1 and 100),
  zone_id    text        check (zone_id is null or char_length(zone_id) <= 48),
  snapshot   jsonb       not null check (pg_column_size(snapshot) <= 1000000),
  saved_at   timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists characters_level_idx on public.characters (level);

-- Höchstens 20 Charaktere pro Konto, updated_at pflegen, created_at nicht vom Client überschreiben lassen.
create or replace function public.characters_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.characters c where c.user_id = new.user_id) >= 20 then
      raise exception 'Zu viele Charaktere (höchstens 20 pro Konto)' using errcode = 'P0001';
    end if;
    new.created_at := now();
  else
    new.created_at := old.created_at;
    new.user_id := old.user_id;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists characters_before_write on public.characters;
create trigger characters_before_write before insert or update on public.characters
  for each row execute function public.characters_before_write();

alter table public.characters enable row level security;

drop policy if exists "eigene Charaktere lesen" on public.characters;
drop policy if exists "eigene Charaktere anlegen" on public.characters;
drop policy if exists "eigene Charaktere ändern" on public.characters;
drop policy if exists "eigene Charaktere löschen" on public.characters;
create policy "eigene Charaktere lesen"   on public.characters for select to authenticated using ((select auth.uid()) = user_id);
create policy "eigene Charaktere anlegen" on public.characters for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "eigene Charaktere ändern"  on public.characters for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "eigene Charaktere löschen" on public.characters for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.characters from anon;
grant select, insert, update, delete on public.characters to authenticated;

-- ---------------------------------------------------------------- Admins
create table if not exists public.admins (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;
-- absichtlich keine Policies: nur der Projektbesitzer (SQL-Editor, service_role) kann hier schreiben
revoke all on public.admins from anon, authenticated;

-- Ist das angemeldete Konto Admin? Liefert für alle anderen false (verrät nichts weiter).
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

create or replace function public.assert_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Kein Zugriff' using errcode = '42501';
  end if;
end $$;

-- Kennzahlen für die Übersicht.
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform public.assert_admin();
  select jsonb_build_object(
    'users',            (select count(*) from auth.users),
    'users_confirmed',  (select count(*) from auth.users u where u.email_confirmed_at is not null or u.confirmed_at is not null),
    'users_7d',         (select count(*) from auth.users u where u.created_at > now() - interval '7 days'),
    'users_active_7d',  (select count(*) from auth.users u where u.last_sign_in_at > now() - interval '7 days'),
    'characters',       (select count(*) from public.characters),
    'avg_level',        (select round(avg(level)::numeric, 1) from public.characters),
    'max_level',        (select max(level) from public.characters),
    'levels',           coalesce((select jsonb_object_agg(level, n order by level) from (select level, count(*) n from public.characters group by level) l), '{}'::jsonb),
    'classes',          coalesce((select jsonb_object_agg(coalesce(class_id, '?'), n) from (select class_id, count(*) n from public.characters group by class_id) k), '{}'::jsonb),
    'signups_by_day',   coalesce((select jsonb_object_agg(d, n order by d) from (
                          select to_char(date_trunc('day', created_at at time zone 'Europe/Berlin'), 'YYYY-MM-DD') d, count(*) n
                          from auth.users where created_at > now() - interval '30 days' group by 1) s), '{}'::jsonb)
  ) into r;
  return r;
end $$;

-- Registrierte Konten, neueste zuerst.
create or replace function public.admin_users(p_limit int default 200, p_offset int default 0)
returns table (
  user_id uuid, email text, display_name text, providers text[], registered_at timestamptz,
  confirmed boolean, last_sign_in_at timestamptz, characters bigint, max_level int, is_admin boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query
    select u.id, u.email::text,
      coalesce(u.raw_user_meta_data ->> 'display_name', u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
      coalesce(array(select jsonb_array_elements_text(u.raw_app_meta_data -> 'providers')), array[]::text[]),
      u.created_at, (u.email_confirmed_at is not null or u.confirmed_at is not null), u.last_sign_in_at,
      (select count(*) from public.characters c where c.user_id = u.id),
      (select max(c.level) from public.characters c where c.user_id = u.id),
      exists (select 1 from public.admins a where a.user_id = u.id)
    from auth.users u
    order by u.created_at desc
    limit least(greatest(p_limit, 1), 1000) offset greatest(p_offset, 0);
end $$;

-- Charaktere aller Konten, höchste Stufe zuerst.
create or replace function public.admin_characters(p_limit int default 500, p_offset int default 0)
returns table (
  user_id uuid, email text, character_id text, name text, race_id text, class_id text, level int,
  zone_id text, created_at timestamptz, saved_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query
    select c.user_id, u.email::text, c.id, c.name, c.race_id, c.class_id, c.level, c.zone_id, c.created_at, c.saved_at
    from public.characters c join auth.users u on u.id = c.user_id
    order by c.level desc, c.saved_at desc
    limit least(greatest(p_limit, 1), 2000) offset greatest(p_offset, 0);
end $$;

-- Nur angemeldete Konten dürfen diese Funktionen aufrufen (Admin-Prüfung steckt zusätzlich darin).
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.assert_admin() from public, anon, authenticated;
revoke execute on function public.admin_stats() from public, anon;
revoke execute on function public.admin_users(int, int) from public, anon;
revoke execute on function public.admin_characters(int, int) from public, anon;
revoke execute on function public.characters_before_write() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_users(int, int) to authenticated;
grant execute on function public.admin_characters(int, int) to authenticated;

-- ---------------------------------------------------------------- Eigenes Konto löschen (DSGVO)
-- Löscht das angemeldete Konto samt aller Charaktere (on delete cascade). Nur für sich selbst.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  delete from auth.users where id = uid;
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
