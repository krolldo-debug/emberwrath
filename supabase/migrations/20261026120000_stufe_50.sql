-- Emberwrath: Höchststufe 50 (Erweiterung Sternenglut, Teil 1).
-- Einmal im Supabase-SQL-Editor ausführen, NACH allen bisherigen Migrationen (zuletzt 20261026090000_handelskontingent.sql)
-- und VOR dem Merge des Spiels mit Stufe 50: Das jetzige Spiel (Stufe 40) läuft damit unverändert weiter.
-- Mehrfach ausführbar. Erzeugt mit: node src/ledger/stufenSql.mjs (Stufen und Erfahrung aus src/progression/xp.js).
--
--  - Spielstandprüfung (characters_plausible): Stufe 1–50 statt 1–40. Die übrige Funktion bleibt genau, wie sie ist
--    (sie wird aus der Datenbank gelesen und nur an dieser Stelle geändert).
--  - Fortschrittsbuch: Erfahrung je Stufe bis 50 (bis 40 unverändert), Stufe beim Zählen und Bereinigen bis 50.
--  - Bestehende Charaktere: Stufe, Erfahrung und alles andere bleiben genau, wie sie sind.

-- ------------------------------------------------------------------ Spielstandprüfung
do $stufe$
declare
  src text := pg_get_functiondef('public.characters_plausible()'::regprocedure);
  neu text := regexp_replace(src, 'lvl > [0-9]+ or gold', 'lvl > 50 or gold');
begin
  if neu !~ 'lvl > 50 or gold' then
    raise exception 'characters_plausible: Stufengrenze nicht gefunden – bitte melden, nichts geändert';
  end if;
  if neu <> src then execute neu; end if;
end $stufe$;
revoke execute on function public.characters_plausible() from public, anon, authenticated;

-- ------------------------------------------------------------------ Fortschrittsbuch
delete from public.ledger_levels;
insert into public.ledger_levels (level, xp) values
(1,0),(2,100),(3,370),(4,845),(5,1560),(6,2545),(7,3820),(8,5405),(9,7320),(10,9585),
(11,12215),(12,15225),(13,18635),(14,22455),(15,26695),(16,31375),(17,36500),(18,42090),(19,48150),(20,54695),
(21,96695),(22,142395),(23,191495),(24,244595),(25,301295),(26,362295),(27,427095),(28,496495),(29,569995),(30,648395),
(31,731195),(32,819095),(33,911695),(34,1009695),(35,1112595),(36,1221195),(37,1334995),(38,1454695),(39,1579895),(40,1711295),
(41,1979895),(42,2273995),(43,2592995),(44,2939295),(45,3312095),(46,3713995),(47,4143995),(48,4604995),(49,5095695),(50,5619095);

create or replace function public.ledger_values(p_snap jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  sl  jsonb := public.ledger_obj(p_snap -> 'slices');
  inv jsonb := public.ledger_obj(sl -> 'inventory');
  pr  jsonb := public.ledger_obj(sl -> 'progress');
  w   jsonb := public.ledger_obj(sl -> 'wallet') -> 'gold';
  v_items jsonb;
  v_gold  numeric;
  v_xp    numeric;
  v_lvl   int;
begin
  select coalesce(jsonb_object_agg(x.id, x.n), '{}'::jsonb) into v_items from (
    select r.id, least(sum(r.q), 1e12)::bigint as n from (
      select s ->> 'itemId' as id, public.ledger_qty(s -> 'qty') as q
        from jsonb_array_elements(public.ledger_arr(inv -> 'slots')) s where jsonb_typeof(s -> 'itemId') = 'string'
      union all
      select case when jsonb_typeof(e) = 'string' then e #>> '{}' when jsonb_typeof(e -> 'itemId') = 'string' then e ->> 'itemId' end, 1
        from public.ledger_elems(inv -> 'equipment') e
      union all
      select m.key, public.ledger_qty(m.value) from jsonb_each(public.ledger_obj(inv -> 'mats')) m
      union all
      select s ->> 'itemId', public.ledger_qty(s -> 'qty')
        from jsonb_array_elements(public.ledger_arr(inv -> 'questBag')) s where jsonb_typeof(s -> 'itemId') = 'string'
      union all
      select s ->> 'itemId', public.ledger_qty(s -> 'qty')
        from jsonb_array_elements(public.ledger_arr(public.ledger_obj(sl -> 'bank') -> 'slots')) s where jsonb_typeof(s -> 'itemId') = 'string'
      union all
      select it ->> 'itemId', public.ledger_qty(it -> 'qty')
        from jsonb_array_elements(public.ledger_arr(public.ledger_obj(sl -> 'mail') -> 'loot')) l,
             jsonb_array_elements(public.ledger_arr(l -> 'items')) it
        where jsonb_typeof(it -> 'itemId') = 'string'
      union all
      -- Goldausgaben (wie values.js): Verstärkung je Platz, Verzauberung, Bankausbau
      select '^up:' || u.key, case when jsonb_typeof(u.value) = 'number' then greatest(0, least(15, trunc(u.value::numeric))) else 0 end
        from jsonb_each(public.ledger_obj(inv -> 'upgrades')) u
      union all
      select '^en:' || e.key || ':' || (e.value #>> '{}'), 1
        from jsonb_each(public.ledger_obj(inv -> 'enchants')) e where jsonb_typeof(e.value) = 'string'
      union all
      select '^bank', case when jsonb_typeof(sl #> '{bank,size}') = 'number'
                           then coalesce(array_position(array[16,24,32,40,48]::numeric[], (sl #> '{bank,size}')::numeric), 1) - 1 else 0 end
      union all
      select lm.item_id, 1 from public.ledger_mounts lm
        where exists (select 1 from jsonb_array_elements(public.ledger_arr(public.ledger_obj(public.ledger_obj(sl -> 'character') -> 'mounts') -> 'owned')) o
                      where jsonb_typeof(o) = 'string' and o #>> '{}' = lm.mount_id)
    ) r
    join public.ledger_items li on li.id = r.id
    where r.q > 0
    group by r.id
  ) x;

  v_gold := case when jsonb_typeof(w) = 'number' then least(greatest(floor(w::numeric), -1e9), 1e15) else 0 end
    + (select least(coalesce(sum(public.ledger_qty(l -> 'gold')), 0), 1e15)
                from jsonb_array_elements(public.ledger_arr(public.ledger_obj(sl -> 'mail') -> 'loot')) l);
  v_lvl := case when pr -> 'level' is null or jsonb_typeof(pr -> 'level') = 'null' then 1
                when jsonb_typeof(pr -> 'level') = 'number' then greatest(1, least(50, trunc((pr -> 'level')::numeric)))::int
                else 50 end;
  v_xp := greatest(case when jsonb_typeof(pr -> 'xp') = 'number' and (pr -> 'xp')::numeric > 0 then least(floor((pr -> 'xp')::numeric), 1e15) else 0 end,
                   coalesce((select lv.xp from public.ledger_levels lv where lv.level = v_lvl), 0));
  return jsonb_build_object('xp', v_xp::bigint, 'gold', v_gold::bigint, 'items', v_items);
end $$;

create or replace function public.ledger_normalize(p_snap jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  s jsonb := p_snap;
  a jsonb;
  b jsonb;
  p text[];
begin
  -- Fehlt die Tasche, gäbe das Spiel beim Laden die Startausrüstung (create): leere Tasche einsetzen
  if jsonb_typeof(s) is distinct from 'object' then s := '{}'::jsonb; end if;
  if jsonb_typeof(s -> 'slices') is distinct from 'object' then s := jsonb_set(s, '{slices}', '{}'::jsonb); end if;
  if jsonb_typeof(s #> '{slices,inventory}') is null or jsonb_typeof(s #> '{slices,inventory}') = 'null' then
    s := jsonb_set(s, '{slices,inventory}', '{"slots": [], "equipment": {}, "mats": {}, "questBag": [], "upgrades": {}, "enchants": {}}'::jsonb);
  end if;
  -- Bankgröße: nur genau eine der Stufen (JavaScript liest 48.000000000000000001 als 48), sonst lädt das Spiel 16
  a := s #> '{slices,bank,size}';
  if jsonb_typeof(a) = 'number' and not (a::numeric = any(array[16,24,32,40,48]::numeric[])) then
    s := jsonb_set(s, '{slices,bank,size}', '16'::jsonb);
  end if;
  -- Tasche, Bank: Plätze bleiben an ihrer Stelle; Questbeutel: ungültige Einträge fallen weg
  foreach p slice 1 in array array[array['slices', 'inventory', 'slots'], array['slices', 'bank', 'slots']] loop
    a := s #> p;
    if jsonb_typeof(a) = 'array' and exists (select 1 from jsonb_array_elements(a) e where public.ledger_fix_slot(e) is distinct from e) then
      s := jsonb_set(s, p, (select jsonb_agg(public.ledger_fix_slot(e) order by i) from jsonb_array_elements(a) with ordinality x(e, i)));
    end if;
  end loop;
  a := s #> '{slices,inventory,questBag}';
  if jsonb_typeof(a) = 'array' and exists (select 1 from jsonb_array_elements(a) e where public.ledger_fix_slot(e) is distinct from e) then
    s := jsonb_set(s, '{slices,inventory,questBag}', coalesce((select jsonb_agg(public.ledger_fix_slot(e) order by i)
      from jsonb_array_elements(a) with ordinality x(e, i) where public.ledger_fix_slot(e) <> 'null'::jsonb), '[]'::jsonb));
  end if;
  -- Ausrüstung (Objekt oder alte Liste)
  a := s #> '{slices,inventory,equipment}';
  if jsonb_typeof(a) = 'object' and exists (select 1 from jsonb_each(a) e where public.ledger_fix_gear(e.value) is distinct from e.value) then
    s := jsonb_set(s, '{slices,inventory,equipment}', (select jsonb_object_agg(e.key, public.ledger_fix_gear(e.value)) from jsonb_each(a) e));
  elsif jsonb_typeof(a) = 'array' and exists (select 1 from jsonb_array_elements(a) e where public.ledger_fix_gear(e) is distinct from e) then
    s := jsonb_set(s, '{slices,inventory,equipment}', (select jsonb_agg(public.ledger_fix_gear(e) order by i) from jsonb_array_elements(a) with ordinality x(e, i)));
  end if;
  -- Material
  a := s #> '{slices,inventory,mats}';
  if jsonb_typeof(a) = 'object' and exists (select 1 from jsonb_each(a) m where public.ledger_fix_int(m.value, 0, 1e6, -1) is distinct from m.value) then
    s := jsonb_set(s, '{slices,inventory,mats}', coalesce((select jsonb_object_agg(m.key, public.ledger_fix_int(m.value, 0, 1e6, 0))
      from jsonb_each(a) m where jsonb_typeof(m.value) = 'number'), '{}'::jsonb));
  end if;
  -- Verstärkung, Verzauberung
  a := s #> '{slices,inventory,upgrades}';
  if jsonb_typeof(a) = 'object' and exists (select 1 from jsonb_each(a) u where public.ledger_fix_int(u.value, 0, 15, -1) is distinct from u.value) then
    s := jsonb_set(s, '{slices,inventory,upgrades}', coalesce((select jsonb_object_agg(u.key, public.ledger_fix_int(u.value, 0, 15, 0))
      from jsonb_each(a) u where jsonb_typeof(u.value) = 'number'), '{}'::jsonb));
  end if;
  a := s #> '{slices,inventory,enchants}';
  if jsonb_typeof(a) = 'object' and exists (select 1 from jsonb_each(a) e where jsonb_typeof(e.value) not in ('string', 'null')) then
    s := jsonb_set(s, '{slices,inventory,enchants}', coalesce((select jsonb_object_agg(e.key, e.value)
      from jsonb_each(a) e where jsonb_typeof(e.value) in ('string', 'null')), '{}'::jsonb));
  end if;
  -- Gold, Erfahrung, Stufe
  if jsonb_typeof(s #> '{slices,wallet}') = 'object' then
    a := s #> '{slices,wallet,gold}';
    b := public.ledger_fix_int(a, -1e9, 2147483647, 0);
    if a is not null and b is distinct from a then s := jsonb_set(s, '{slices,wallet,gold}', b); end if;
  end if;
  if jsonb_typeof(s #> '{slices,progress}') = 'object' then
    a := s #> '{slices,progress,xp}';
    b := public.ledger_fix_int(a, 0, 2147483647, 0);
    if a is not null and b is distinct from a then s := jsonb_set(s, '{slices,progress,xp}', b); end if;
    a := s #> '{slices,progress,level}';
    b := public.ledger_fix_int(a, 1, 50, 1);
    if a is not null and b is distinct from a then s := jsonb_set(s, '{slices,progress,level}', b); end if;
  end if;
  return s;
end $$;
revoke execute on function public.ledger_values(jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_normalize(jsonb) from public, anon, authenticated;
