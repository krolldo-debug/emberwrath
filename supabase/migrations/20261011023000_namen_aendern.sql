-- Emberwrath: Kontonamen ändern, höchstens alle 30 Tage. Einmal im Supabase-SQL-Editor ausführen. Mehrfach ausführbar.
--
-- Der Kontoname steht in den Kontodaten (user_metadata.display_name). Diese Daten kann ein Spieler über die Auth-API
-- selbst ändern, eine Sperre im Browser würde also nichts nützen. Deshalb:
--   * public.change_display_name(p_name) prüft Länge, Zeichen, doppelte Namen und die 30-Tage-Sperre und setzt den Namen.
--   * Ein Trigger auf auth.users hält display_name bei jeder anderen Änderung fest (z. B. updateUser aus dem Browser).
--   * public.display_name_changes merkt sich die letzte Änderung (Serverzeit). Spieler können die Tabelle nicht ändern.
-- Der Kontoname ist nicht der Charaktername, den Mitspieler sehen (der steht im Spielstand).

create table if not exists public.display_name_changes (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  changed_at timestamptz not null default now()
);
alter table public.display_name_changes enable row level security;
revoke all on public.display_name_changes from anon, authenticated;
grant select, insert, update, delete on public.display_name_changes to service_role;

-- Name, wie das Spiel ihn anzeigt (CloudSync.displayNameOf): display_name, sonst Name von Google, sonst E-Mail-Anfang.
create or replace function public.effective_display_name(m jsonb, email text) returns text
language sql immutable set search_path = '' as $$
  select left(btrim(coalesce(nullif(m ->> 'display_name', ''), nullif(m ->> 'full_name', ''), nullif(m ->> 'name', ''),
    split_part(coalesce(email, 'Spieler'), '@', 1))), 24)
$$;
revoke execute on function public.effective_display_name(jsonb, text) from public, anon, authenticated;

-- Sperre gegen Umgehung: display_name ändert sich nur in derselben Transaktion wie ein Eintrag in display_name_changes,
-- und den schreibt allein change_display_name(). (now() = Beginn der Transaktion.)
create or replace function public.display_name_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.raw_user_meta_data ->> 'display_name') is not distinct from (old.raw_user_meta_data ->> 'display_name') then
    return new;
  end if;
  if exists (select 1 from public.display_name_changes c where c.user_id = new.id and c.changed_at = now()) then
    return new;
  end if;
  new.raw_user_meta_data := case
    when old.raw_user_meta_data ? 'display_name'
      then coalesce(new.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('display_name', old.raw_user_meta_data -> 'display_name')
    else coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'display_name'
  end;
  return new;
end $$;
revoke execute on function public.display_name_guard() from public, anon, authenticated;

drop trigger if exists display_name_guard on auth.users;
create trigger display_name_guard before update of raw_user_meta_data on auth.users
  for each row execute function public.display_name_guard();

-- Wann ist die nächste Änderung möglich? { changed_at, next_change_at } (null = jetzt möglich).
create or replace function public.display_name_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  last timestamptz;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select c.changed_at into last from public.display_name_changes c where c.user_id = auth.uid();
  return jsonb_build_object(
    'changed_at', last,
    'next_change_at', case when last is not null and last + interval '30 days' > now() then last + interval '30 days' end);
end $$;
revoke execute on function public.display_name_status() from public, anon;
grant execute on function public.display_name_status() to authenticated;

-- Namen ändern. Regeln wie im Spiel (LoginScene.js NAME_RULE): 2–24 Zeichen, Buchstaben und Ziffern, dazwischen
-- einzelne Leerzeichen, Punkte, Binde- oder Unterstriche. Kein Name, den ein anderes Konto schon trägt (Groß-/Kleinschreibung egal).
-- Fehler (message): name_length | name_chars | name_unchanged | name_taken | name_cooldown
create or replace function public.change_display_name(p_name text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid  uuid := auth.uid();
  n    text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  cur  text;
  last timestamptz;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if char_length(n) < 2 or char_length(n) > 24 then raise exception 'name_length' using errcode = 'P0001'; end if;
  if n !~ '^[0-9A-Za-zÀ-ÖØ-öø-ɏ]+([ ._-][0-9A-Za-zÀ-ÖØ-öø-ɏ]+)*$' then raise exception 'name_chars' using errcode = 'P0001'; end if;

  -- Nacheinander, damit zwei Konten nicht gleichzeitig denselben Namen bekommen
  perform pg_advisory_xact_lock(hashtext('emberwrath:display_name'));

  select public.effective_display_name(u.raw_user_meta_data, u.email) into cur from auth.users u where u.id = uid;
  if cur = n then raise exception 'name_unchanged' using errcode = 'P0001'; end if;

  select c.changed_at into last from public.display_name_changes c where c.user_id = uid for update;
  if last is not null and last + interval '30 days' > now() then raise exception 'name_cooldown' using errcode = 'P0001'; end if;

  -- Nur gewählte Namen vergleichen (nicht den E-Mail-Anfang, sonst verrät die Meldung fremde Adressen)
  if exists (select 1 from auth.users u
             where u.id <> uid and lower(public.effective_display_name(u.raw_user_meta_data, '')) = lower(n)) then
    raise exception 'name_taken' using errcode = 'P0001';
  end if;

  insert into public.display_name_changes (user_id, changed_at) values (uid, now())
    on conflict (user_id) do update set changed_at = excluded.changed_at;
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('display_name', n)
    where id = uid;
  return jsonb_build_object('display_name', n, 'next_change_at', now() + interval '30 days');
end $$;
revoke execute on function public.change_display_name(text) from public, anon;
grant execute on function public.change_display_name(text) to authenticated;
