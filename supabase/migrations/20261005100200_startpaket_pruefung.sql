-- Emberwrath: Neue Charaktere nur mit dem Startpaket ihrer Klasse (Sicherheitsbericht D3 Punkt 3).
-- Einmal im Supabase-SQL-Editor ausführen, NACH 20261005090000_sicherheit_spielstand.sql und 20261005100100_startpaket.sql.
-- Mehrfach ausführbar. Ersetzt characters_plausible: gleich wie in 20261005090000, im INSERT-Zweig zusätzlich
-- public.character_start_kit_problem (Vermerk-Grund 'startpaket', Detail nennt den Teil: quest, gegenstand, reittier …).

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
    else
      -- Nur das Startpaket der Klasse (20261005100100_startpaket.sql, Quelle src/character/startKit.js).
      why := public.character_start_kit_problem(new.snapshot, new.class_id);
      if why is not null then
        info := jsonb_build_object('startpaket', why, 'level', lvl, 'gold', gold);
        why := 'startpaket';
      end if;
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
