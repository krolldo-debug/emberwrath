-- Emberwrath: Sicherheits-Nachbesserung Spielstände (Sicherheitsprüfung 05.10.2026, Funde D1, D2, D7, D8, D9).
-- Einmal im Supabase-SQL-Editor ausführen (nach 20261003130000_spielstand_pruefung.sql). Mehrfach ausführbar.
--  D1: Fremde user_id beim Hochladen wird abgewiesen (vorher: gefälschte Schummel-Vermerke für fremde Konten).
--  D2: Upsert sperrt die bestehende Zeile (FOR UPDATE), ein gleichzeitiges DELETE kann die Prüfung nicht mehr umgehen.
--  D9: 20-Charaktere-Grenze mit Sperre je Konto (kein Überholen durch parallele Anfragen).
--  D8: play_verified nie NULL/NaN/unendlich.
--  D7: authenticated verliert TRUNCATE/REFERENCES/TRIGGER auf characters.
--  Vermerke: Charakter-ID gekürzt, höchstens ein Vermerk je Konto und Minute, Vermerke verschwinden mit dem Konto.

create or replace function public.characters_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if current_user = 'authenticated' then
      if new.user_id is distinct from (select auth.uid()) then
        raise exception 'Kein Zugriff' using errcode = '42501';
      end if;
      perform pg_advisory_xact_lock(hashtextextended('characters:' || new.user_id::text, 0));
    end if;
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

create or replace function public.characters_flag(p_user uuid, p_character text, p_reason text, p_detail jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() < 1 then raise exception 'nicht erlaubt' using errcode = '42501'; end if;
  if (select auth.uid()) is not null and p_user is distinct from (select auth.uid()) then
    raise exception 'nicht erlaubt' using errcode = '42501';
  end if;
  if exists (select 1 from public.character_flags f where f.user_id = p_user and f.created_at > now() - interval '1 minute') then
    return;
  end if;
  insert into public.character_flags (user_id, character_id, reason, detail) values (p_user, left(p_character, 64), p_reason, p_detail);
end $$;
revoke execute on function public.characters_flag(uuid, text, text, jsonb) from public, anon;
grant execute on function public.characters_flag(uuid, text, text, jsonb) to authenticated;

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
    perform 1 from public.characters c where c.user_id = new.user_id and c.id = new.id for update;
    if found then return new; end if;
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
    ver := coalesce(old.play_verified, 0) + play;
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

-- play_verified: nie NULL, nie NaN, nie unendlich.
update public.characters set play_verified = 0
  where play_verified is null or play_verified = 'NaN'::numeric or play_verified < 0 or play_verified >= 1e9;
alter table public.characters alter column play_verified set default 0;
alter table public.characters alter column play_verified set not null;
alter table public.characters drop constraint if exists characters_play_verified_ok;
alter table public.characters add constraint characters_play_verified_ok check (play_verified >= 0 and play_verified < 1e9);

-- Vermerke und Chat-Sperren verschwinden mit dem Konto (DSGVO). Bestehende Altzeilen werden nicht geprüft (not valid).
alter table public.character_flags drop constraint if exists character_flags_user_fk;
alter table public.character_flags add constraint character_flags_user_fk
  foreign key (user_id) references auth.users (id) on delete cascade not valid;

revoke truncate, references, trigger on public.characters from authenticated;
