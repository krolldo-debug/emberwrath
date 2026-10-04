-- Emberwrath: Spielstände serverseitig auf Plausibilität prüfen (Schummelschutz, Release 1.0).
-- Einmal im Supabase-SQL-Editor ausführen (nach 20260930120000_konten_und_admin.sql). Mehrfach ausführbar.
--
-- Das Spiel rechnet im Browser; der Cloud-Abgleich lädt den ganzen Spielstand hoch. Diese Prüfung fängt grobe
-- Manipulationen ab (Konsole, bearbeiteter Browser-Speicher), ohne ehrliche Spieler zu treffen:
--  - feste Grenzen: Stufe 1–40, Gold −1 Mio. (Minusstand nach Shop-Rückbuchung) bis 50 Mio., Spalte level = Stufe im Spielstand
--  - neue Charaktere (auch Löschen und neu Anlegen) nur als Startstand: Stufe ≤ 3, Gold ≤ 5 000
--  - Spielzeit zählt nur so weit, wie seit dem letzten Speichern echte Serverzeit vergangen ist (play_verified, vom Server geführt)
--  - je Upload: Stufe höchstens + 2 + 1 je 2 Minuten
--  - insgesamt (nur wenn der Wert steigt): Stufe höchstens 3 + 1 je 45 Sekunden geprüfter Spielzeit (ehrlich: Stufe 20 nach
--    etwa 30 Minuten), Gold höchstens 50 000 + 150 je Sekunde geprüfter Spielzeit + gekaufte Shop-Pakete dieses Charakters.
--    Wiederhergestellte Speicherplätze liegen darunter; viele schnelle Uploads bringen nichts, weil nur echte Zeit zählt.
--  - Hinweis: Gold, das ein Admin über diese Grenze hinaus schenkt, sperrt weitere Goldzuwächse, bis die Spielzeit aufholt.
-- Verstöße werden NICHT gespeichert (der alte Stand bleibt; das Spiel lädt ihn zurück, legt den abgelehnten Stand in einen
-- Speicherplatz und sagt es dem Spieler) und landen in public.character_flags fürs Admin-Panel.
-- Änderungen über den SQL-Editor, den Server oder Admin-Funktionen (Rolle postgres/service_role) werden nicht geprüft.

-- Vom Server geführte Spielzeit; bestehende Charaktere starten mit ihrer bisherigen Spielzeit.
alter table public.characters add column if not exists play_verified numeric;
update public.characters set play_verified = greatest(0, coalesce((snapshot #>> '{meta,playTime}')::numeric, 0))
  where play_verified is null;

create table if not exists public.character_flags (
  id            bigint generated always as identity primary key,
  user_id       uuid not null,
  character_id  text not null,
  reason        text not null,           -- 'stufe' | 'gold' | 'neu' | 'grenze'
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists character_flags_user on public.character_flags (user_id, created_at desc);
alter table public.character_flags enable row level security;
revoke all on public.character_flags from anon, authenticated;
grant select, insert, update, delete on public.character_flags to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Vermerk schreiben (läuft mit den Rechten des Besitzers, Spieler selbst dürfen die Tabelle nicht sehen).
-- Nur aus dem Trigger heraus aufrufbar (pg_trigger_depth): Ein direkter Aufruf über die API wird abgewiesen.
create or replace function public.characters_flag(p_user uuid, p_character text, p_reason text, p_detail jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() < 1 then raise exception 'nicht erlaubt' using errcode = '42501'; end if;
  insert into public.character_flags (user_id, character_id, reason, detail) values (p_user, p_character, p_reason, p_detail);
end $$;
revoke execute on function public.characters_flag(uuid, text, text, jsonb) from public, anon;
-- Der Trigger läuft mit der Rolle des Spielers und braucht deshalb das Ausführrecht.
grant execute on function public.characters_flag(uuid, text, text, jsonb) to authenticated;

-- Gold aus bezahlten Shop-Käufen dieses Charakters (nur wenn der Gold-Shop eingerichtet ist). Nur aus dem Trigger.
create or replace function public.characters_shop_gold(p_user uuid, p_character text) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare g numeric := 0;
begin
  if pg_trigger_depth() < 1 then raise exception 'nicht erlaubt' using errcode = '42501'; end if;
  if to_regclass('public.gold_orders') is null then return 0; end if;
  execute 'select coalesce(sum(gold), 0) from public.gold_orders where user_id = $1 and character_id = $2
             and status in (''paid'', ''credited'')'
    into g using p_user, p_character;
  return g;
end $$;
revoke execute on function public.characters_shop_gold(uuid, text) from public, anon;
grant execute on function public.characters_shop_gold(uuid, text) to authenticated;

create or replace function public.characters_plausible() returns trigger
language plpgsql set search_path = '' as $$
declare
  lvl    int;
  gold   numeric;
  pt     numeric;
  o_lvl  int;
  o_gold numeric;
  o_pt   numeric;
  real_s numeric;
  play   numeric;
  ver    numeric;
  why    text := null;
  info   jsonb;
begin
  begin
    lvl  := coalesce((new.snapshot #>> '{slices,progress,level}')::int, 1);
    gold := coalesce((new.snapshot #>> '{slices,wallet,gold}')::numeric, 0);
    pt   := coalesce((new.snapshot #>> '{meta,playTime}')::numeric, 0);
  exception when others then
    lvl := -1; gold := -1; pt := 0;
  end;
  new.level := greatest(1, least(100, lvl));

  -- Nur Uploads von Spielern prüfen; SQL-Editor, Server und Admin-Funktionen nicht.
  if current_user <> 'authenticated' then
    if tg_op = 'UPDATE' then new.play_verified := coalesce(new.play_verified, old.play_verified); end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.play_verified := 0;
    -- Upsert eines bestehenden Charakters: Postgres ruft erst den INSERT-Trigger, dann den UPDATE-Trigger, der vergleicht.
    if exists (select 1 from public.characters c where c.user_id = new.user_id and c.id = new.id) then return new; end if;
  else
    new.play_verified := old.play_verified;
  end if;

  if lvl < 1 or lvl > 40 or gold < -1000000 or gold > 50000000 then
    why := 'grenze';
    info := jsonb_build_object('level', lvl, 'gold', gold);
  elsif tg_op = 'INSERT' then
    if lvl > 3 or gold > 5000 then
      why := 'neu';
      info := jsonb_build_object('level', lvl, 'gold', gold, 'playTime', pt);
    end if;
  else
    begin
      o_lvl  := coalesce((old.snapshot #>> '{slices,progress,level}')::int, 1);
      o_gold := coalesce((old.snapshot #>> '{slices,wallet,gold}')::numeric, 0);
      o_pt   := coalesce((old.snapshot #>> '{meta,playTime}')::numeric, 0);
    exception when others then
      return new; -- alter Stand nicht lesbar: nichts zu vergleichen
    end;
    -- Spielzeit nur so weit anrechnen, wie seit dem letzten Speichern echte Zeit vergangen ist.
    real_s := greatest(0, extract(epoch from (now() - old.updated_at)));
    play := greatest(0, least(pt - o_pt, real_s));
    ver := coalesce(old.play_verified, o_pt) + play;
    if lvl > o_lvl and (lvl > o_lvl + 2 + floor(play / 120) or lvl > 3 + floor(ver / 45)) then
      why := 'stufe';
    elsif gold > o_gold and gold > 50000 + ver * 150 + public.characters_shop_gold(old.user_id, old.id) then
      why := 'gold';
    end if;
    info := jsonb_build_object('level', jsonb_build_array(o_lvl, lvl), 'gold', jsonb_build_array(o_gold, gold),
      'playTime', jsonb_build_array(o_pt, pt), 'realSeconds', round(real_s), 'verified', round(ver));
    if why is null then new.play_verified := ver; end if;
  end if;

  if why is null then return new; end if;
  perform public.characters_flag(coalesce(new.user_id, old.user_id), new.id, why, info);
  return null; -- Zeile nicht schreiben
end $$;
revoke execute on function public.characters_plausible() from public, anon;

drop trigger if exists characters_plausible on public.characters;
-- Name nach characters_before_write: Postgres führt gleichartige Trigger alphabetisch aus.
create trigger characters_plausible before insert or update on public.characters
  for each row execute function public.characters_plausible();

-- Höchstens 20 Charaktere pro Konto: beim Hochladen eines bestehenden Charakters (Upsert) nicht mitzählen,
-- sonst kann ein Konto mit 20 Charakteren gar nicht mehr speichern.
create or replace function public.characters_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.characters c where c.user_id = new.user_id and c.id = new.id)
       and (select count(*) from public.characters c where c.user_id = new.user_id) >= 20 then
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

-- Admin-Panel: Vermerke lesen (neueste zuerst).
create or replace function public.admin_character_flags(p_limit int default 100, p_offset int default 0)
returns table (id bigint, user_id uuid, email text, character_id text, character_name text, reason text, detail jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query
    select f.id, f.user_id, u.email::text, f.character_id, c.name, f.reason, f.detail, f.created_at
    from public.character_flags f
    left join auth.users u on u.id = f.user_id
    left join public.characters c on c.user_id = f.user_id and c.id = f.character_id
    order by f.created_at desc
    limit least(greatest(p_limit, 1), 500) offset greatest(p_offset, 0);
end $$;
revoke execute on function public.admin_character_flags(int, int) from public, anon;
grant execute on function public.admin_character_flags(int, int) to authenticated;
