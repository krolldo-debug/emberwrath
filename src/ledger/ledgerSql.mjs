// Erzeugt die Datenbank-Migration des Fortschrittsbuchs (src/ledger/README.md) aus den Spieldaten. Nicht Teil des Spiels.
//
//   node src/ledger/ledgerSql.mjs > supabase/migrations/20261015120000_fortschrittsbuch.sql
//
// Kommen Gegenstände, Reittiere oder Stufen dazu, die Migration neu erzeugen und erneut ausführen (mehrfach ausführbar).
// Die Zählung (public.ledger_values) entspricht src/ledger/values.js; src/ledger/test/db.test.mjs vergleicht beide.
import { ITEMS } from '../progression/items.js';
import { LEVEL_CAP, totalXpForLevel } from '../progression/xp.js';
import { isCounted, COUNTED_MOUNTS, SINK_IDS } from './values.js';
import { UPGRADE_MAX } from '../progression/smithing.js';
import { BANK_SIZES } from '../progression/endgame.js';

export const GRACE_DAYS = 2;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const rows = (list, per = 8) => list.reduce((out, r, i) => out + (i ? (i % per ? ',' : ',\n') : '') + r, '');

export function ledgerSql() {
  const items = Object.keys(ITEMS).filter(isCounted).sort();
  const sinks = [...SINK_IDS].sort();
  const bankSizes = `array[${BANK_SIZES.join(',')}]`;
  const mounts = Object.entries(COUNTED_MOUNTS).sort(([a], [b]) => a.localeCompare(b));
  for (const [, id] of mounts) if (!items.includes(id)) throw new Error(`Reittier-Gegenstand fehlt: ${id}`);
  const levels = Array.from({ length: LEVEL_CAP }, (_, i) => `(${i + 1},${totalXpForLevel(i + 1)})`);
  return `-- Emberwrath: Fortschrittsbuch (D3 – der Server bestätigt Erfahrung, Gold, Gegenstände und Beute).
-- Einmal im Supabase-SQL-Editor ausführen, NACH allen bisherigen Migrationen (zuletzt 20261015090000_server_liest_charaktere.sql)
-- und erst, wenn das Spiel mit src/ledger live ist. Mehrfach ausführbar.
-- Erzeugt mit: node src/ledger/ledgerSql.mjs (Zählung wie src/ledger/values.js, Regeln in src/ledger/rules.js).
--
-- So funktioniert es
--  - Das Spiel meldet dem Server (Worker /net/buch) jede Änderung an Erfahrung, Gold und Gegenständen. Der Worker prüft
--    sie mit den Spielregeln (Kills mit Tempo-Grenze, Beute mit Würfeln des Servers, Quests, Händlerpreise, Rezepte,
--    Tages- und Wochenbelohnungen) und führt je Charakter ein Buch: public.character_ledger (xp, gold, items).
--  - Jeder hochgeladene Spielstand wird mit dem Buch verglichen (Trigger characters_z_ledger, läuft als letzter).
--    Liegt er darüber, wird er auf das Buch gekappt (überzählige Gegenstände, Gold und Erfahrung entfernt) und als
--    'buch' vermerkt. Die Spalte saved_at ändert sich dann; das Spiel übernimmt den gekappten Cloud-Stand.
--  - Was der Server selbst in Spielstände schreibt (Auktionshaus, Postfach, Rückbuchungen, Admin im SQL-Editor), spiegelt
--    characters_z_ledger_after ins Buch. Neue Charaktere beginnen mit ihrem ersten gespeicherten Stand (Startpaket).
--  - Übergang: Charaktere ohne Sitzung des Buchs (state leer) übernehmen ihren hochgeladenen Stand als Buch, bis
--    ${GRACE_DAYS} Tage nach der ersten Sitzung mit dem neuen Spiel (ledger_config.strict_after). So verliert niemand Fortschritt,
--    der mit einem noch offenen alten Spielfenster entstand.
--  - Notbremse: update public.ledger_config set enforce = false;  → nur noch vermerken, nicht kappen.
--  - Für Spieler nicht lesbar (RLS ohne Policies); nur der Worker (service_role) und die Trigger greifen zu.

-- ------------------------------------------------------------------ Lesen für den Worker
grant select on public.characters to service_role;

-- ------------------------------------------------------------------ Tabellen
create table if not exists public.character_ledger (
  user_id      uuid not null,
  character_id text not null,
  xp           bigint not null default 0,
  gold         bigint not null default 0,
  items        jsonb not null default '{}'::jsonb,   -- { itemId: Anzahl }
  state        jsonb,                                -- Merkzettel des Workers (Sitzungen, Beutescheine, Quests); leer = noch keine Sitzung
  ver          bigint not null default 0,            -- für Schreiben nur bei unverändertem Stand (Worker)
  updated_at   timestamptz not null default now(),
  primary key (user_id, character_id),
  foreign key (user_id, character_id) references public.characters (user_id, id) on delete cascade on update cascade
);
create table if not exists public.ledger_items (id text primary key);                            -- gezählte Gegenstände
create table if not exists public.ledger_mounts (mount_id text primary key, item_id text not null); -- Reittier = Gegenstand
create table if not exists public.ledger_levels (level int primary key, xp bigint not null);      -- Erfahrung je Stufe
create table if not exists public.ledger_config (
  id           int primary key default 1 check (id = 1),
  strict_after timestamptz,                -- leer: Übergang läuft noch (erste Sitzung setzt es auf jetzt + ${GRACE_DAYS} Tage)
  enforce      boolean not null default true
);
insert into public.ledger_config (id) values (1) on conflict (id) do nothing;

alter table public.character_ledger enable row level security;
alter table public.ledger_items enable row level security;
alter table public.ledger_mounts enable row level security;
alter table public.ledger_levels enable row level security;
alter table public.ledger_config enable row level security;
revoke all on public.character_ledger, public.ledger_items, public.ledger_mounts, public.ledger_levels, public.ledger_config
  from anon, authenticated;
grant select, insert, update, delete on public.character_ledger to service_role;
grant select on public.ledger_items, public.ledger_mounts, public.ledger_levels, public.ledger_config to service_role;

-- ------------------------------------------------------------------ Daten (aus dem Spiel erzeugt)
delete from public.ledger_items;
insert into public.ledger_items (id) values
${rows([...items, ...sinks].map((id) => `(${q(id)})`))};
delete from public.ledger_mounts;
insert into public.ledger_mounts (mount_id, item_id) values
${rows(mounts.map(([m, id]) => `(${q(m)},${q(id)})`), 4)};
delete from public.ledger_levels;
insert into public.ledger_levels (level, xp) values
${rows(levels, 10)};

-- ------------------------------------------------------------------ Bausteine
create or replace function public.ledger_arr(j jsonb) returns jsonb
language sql immutable set search_path = '' as $$ select case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end $$;
create or replace function public.ledger_obj(j jsonb) returns jsonb
language sql immutable set search_path = '' as $$ select case when jsonb_typeof(j) = 'object' then j else '{}'::jsonb end $$;
-- Werte eines Objekts oder Elemente eines Arrays (Ausrüstung: { Platz: itemId } oder alte Arrays)
create or replace function public.ledger_elems(j jsonb) returns setof jsonb
language sql immutable set search_path = '' as $$
  select value from jsonb_each(case when jsonb_typeof(j) = 'object' then j else '{}'::jsonb end)
  union all select value from jsonb_array_elements(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end)
$$;
-- Menge: nur echte Zahlen > 0, abgerundet (wie values.js qtyOf)
create or replace function public.ledger_qty(v jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(v) = 'number' and v::numeric > 0 then least(floor(v::numeric), 1e12) else 0 end
$$;

-- Werte eines Spielstands: { xp, gold, items: { itemId: Anzahl } } (wie src/ledger/values.js valuesOf)
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
      select '^up:' || u.key, case when jsonb_typeof(u.value) = 'number' then greatest(0, least(${UPGRADE_MAX}, trunc(u.value::numeric))) else 0 end
        from jsonb_each(public.ledger_obj(inv -> 'upgrades')) u
      union all
      select '^en:' || e.key || ':' || (e.value #>> '{}'), 1
        from jsonb_each(public.ledger_obj(inv -> 'enchants')) e where jsonb_typeof(e.value) = 'string'
      union all
      select '^bank', case when jsonb_typeof(sl #> '{bank,size}') = 'number'
                           then coalesce(array_position(${bankSizes}::numeric[], (sl #> '{bank,size}')::numeric), 1) - 1 else 0 end
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
                when jsonb_typeof(pr -> 'level') = 'number' then greatest(1, least(${LEVEL_CAP}, trunc((pr -> 'level')::numeric)))::int
                else ${LEVEL_CAP} end;
  v_xp := greatest(case when jsonb_typeof(pr -> 'xp') = 'number' and (pr -> 'xp')::numeric > 0 then least(floor((pr -> 'xp')::numeric), 1e15) else 0 end,
                   coalesce((select lv.xp from public.ledger_levels lv where lv.level = v_lvl), 0));
  return jsonb_build_object('xp', v_xp::bigint, 'gold', v_gold::bigint, 'items', v_items);
end $$;

-- Spielstand so bereinigen, dass das Spiel beim Laden genau das sieht, was gezählt wird. Das Spiel liest Werte mit
-- JavaScript-Regeln (Text "50" und Liste [50] wirken als Zahl, ["schwert"] als Schlüssel, |0 rechnet mit 32 Bit); die
-- Datenbank zählt nur echte Zahlen und Texte. Deshalb bleibt nur die Form, die das Spiel selbst speichert:
--   Platz       null oder { itemId: Text, qty: ganze Zahl 1…1e6 }   (Tasche, Bank, Questbeutel)
--   Ausrüstung  Text, null oder { itemId: Text }                  Material  { id: ganze Zahl 0…1e6 }
--   Gold        ganze Zahl -1e9…2^31-1   Erfahrung 0…2^31-1   Stufe 1…${LEVEL_CAP}
--   Verstärkung ganze Zahl 0…${UPGRADE_MAX}   Verzauberung Text   Bankgröße eine der Stufen   Tasche immer vorhanden
-- Ehrliche Spielstände ändert das nie.
create or replace function public.ledger_fix_slot(e jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when e is null or jsonb_typeof(e) <> 'object' then 'null'::jsonb
              when jsonb_typeof(e -> 'itemId') is distinct from 'string' or jsonb_typeof(e -> 'qty') is distinct from 'number' then 'null'::jsonb
              when (e -> 'qty')::numeric < 1 then 'null'::jsonb
              when (e -> 'qty')::numeric <> least(trunc((e -> 'qty')::numeric), 1e6) then jsonb_set(e, '{qty}', to_jsonb(least(trunc((e -> 'qty')::numeric), 1e6)))
              else e end
$$;
create or replace function public.ledger_fix_gear(e jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when e is null or jsonb_typeof(e) in ('string', 'null') then e
              when jsonb_typeof(e) = 'object' and jsonb_typeof(e -> 'itemId') = 'string' then e
              else 'null'::jsonb end
$$;
create or replace function public.ledger_fix_int(v jsonb, lo numeric, hi numeric, dflt numeric) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(v) = 'number' then
                case when v::numeric = greatest(lo, least(hi, trunc(v::numeric))) then v else to_jsonb(greatest(lo, least(hi, trunc(v::numeric)))) end
              else to_jsonb(dflt) end
$$;
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
  if jsonb_typeof(a) = 'number' and not (a::numeric = any(${bankSizes}::numeric[])) then
    s := jsonb_set(s, '{slices,bank,size}', '${BANK_SIZES[0]}'::jsonb);
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
  if jsonb_typeof(a) = 'object' and exists (select 1 from jsonb_each(a) u where public.ledger_fix_int(u.value, 0, ${UPGRADE_MAX}, -1) is distinct from u.value) then
    s := jsonb_set(s, '{slices,inventory,upgrades}', coalesce((select jsonb_object_agg(u.key, public.ledger_fix_int(u.value, 0, ${UPGRADE_MAX}, 0))
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
    b := public.ledger_fix_int(a, 1, ${LEVEL_CAP}, 1);
    if a is not null and b is distinct from a then s := jsonb_set(s, '{slices,progress,level}', b); end if;
  end if;
  return s;
end $$;

-- Liegt der Stand über dem Buch? → { xp: [Buch, Stand], gold: [Buch, Stand], items: { itemId: zu viel } } oder null
create or replace function public.ledger_over(v jsonb, p_xp bigint, p_gold bigint, p_items jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select nullif(jsonb_strip_nulls(jsonb_build_object(
    'xp',    case when (v ->> 'xp')::numeric > p_xp then jsonb_build_array(p_xp, v -> 'xp') end,
    'gold',  case when (v ->> 'gold')::numeric > p_gold then jsonb_build_array(p_gold, v -> 'gold') end,
    'items', (select jsonb_object_agg(t.key, t.n) from (
                select m.key, m.value::numeric - coalesce(case when jsonb_typeof(p_items -> m.key) = 'number' then (p_items -> m.key)::numeric end, 0) as n
                from jsonb_each(v -> 'items') m) t where t.n > 0))), '{}'::jsonb)
$$;

-- Aus einer Liste von Plätzen ({ itemId, qty }) von hinten bis zu n Stück nehmen; leere Plätze werden null
-- (drop: Eintrag fällt weg, Questbeutel). → { a: Liste, left: Rest }
create or replace function public.ledger_take_list(a jsonb, p_item text, p_n numeric, p_drop boolean) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  left_ numeric := p_n;
  e jsonb;
  i int;
  n numeric;
  t numeric;
begin
  if jsonb_typeof(a) is distinct from 'array' then return jsonb_build_object('a', a, 'left', p_n); end if;
  for i in reverse jsonb_array_length(a) - 1 .. 0 loop
    exit when left_ <= 0;
    e := a -> i;
    continue when jsonb_typeof(e -> 'itemId') is distinct from 'string' or e ->> 'itemId' <> p_item;
    n := public.ledger_qty(e -> 'qty');
    continue when n <= 0;
    t := least(n, left_);
    left_ := left_ - t;
    a := case when n - t > 0 then jsonb_set(a, array[i::text], jsonb_set(e, '{qty}', to_jsonb(n - t)))
              when p_drop then a - i else jsonb_set(a, array[i::text], 'null'::jsonb) end;
  end loop;
  return jsonb_build_object('a', a, 'left', left_);
end $$;

-- n Stück eines Gegenstands aus dem Spielstand nehmen: Tasche (von hinten), Questbeutel, Materialbeutel, Bank (von hinten),
-- Beutebriefe, angelegte Ausrüstung, gelernte Reittiere. null = nicht genug gefunden.
create or replace function public.ledger_take(p_snap jsonb, p_item text, p_n numeric) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  s     jsonb := p_snap;
  left_ numeric := p_n;
  r     jsonb;
  a     jsonb;
  b     jsonb;
  e     jsonb;
  i     int;
  n     numeric;
  t     numeric;
  k     text;
  mid   text;
begin
  -- Goldausgaben: Verstärkung senken, Verzauberung entfernen, Bank verkleinern
  if left(p_item, 1) = '^' then
    a := public.ledger_values(s) -> 'items';
    n := coalesce((a ->> p_item)::numeric, 0);
    if n < p_n then return null; end if;
    if left(p_item, 4) = '^up:' then
      s := jsonb_set(s, array['slices', 'inventory', 'upgrades', substr(p_item, 5)], to_jsonb(n - p_n));
    elsif left(p_item, 4) = '^en:' then
      s := jsonb_set(s, '{slices,inventory,enchants}', (s #> '{slices,inventory,enchants}') - split_part(p_item, ':', 2));
    elsif p_item = '^bank' then
      s := jsonb_set(s, '{slices,bank,size}', to_jsonb((${bankSizes})[(n - p_n)::int + 1]));
    else return null;
    end if;
    return s;
  end if;
  -- Tasche, Questbeutel
  if jsonb_typeof(s #> '{slices,inventory,slots}') = 'array' then
    r := public.ledger_take_list(s #> '{slices,inventory,slots}', p_item, left_, false);
    s := jsonb_set(s, '{slices,inventory,slots}', r -> 'a');
    left_ := (r ->> 'left')::numeric;
  end if;
  if left_ > 0 and jsonb_typeof(s #> '{slices,inventory,questBag}') = 'array' then
    r := public.ledger_take_list(s #> '{slices,inventory,questBag}', p_item, left_, true);
    s := jsonb_set(s, '{slices,inventory,questBag}', r -> 'a');
    left_ := (r ->> 'left')::numeric;
  end if;
  -- Materialbeutel
  a := s #> '{slices,inventory,mats}';
  if left_ > 0 and jsonb_typeof(a) = 'object' then
    n := public.ledger_qty(a -> p_item);
    if n > 0 then
      t := least(n, left_);
      left_ := left_ - t;
      s := jsonb_set(s, '{slices,inventory,mats}', case when n - t > 0 then jsonb_set(a, array[p_item], to_jsonb(n - t)) else a - p_item end);
    end if;
  end if;
  -- Bank
  if left_ > 0 and jsonb_typeof(s #> '{slices,bank,slots}') = 'array' then
    r := public.ledger_take_list(s #> '{slices,bank,slots}', p_item, left_, false);
    s := jsonb_set(s, '{slices,bank,slots}', r -> 'a');
    left_ := (r ->> 'left')::numeric;
  end if;
  -- Beutebriefe (von hinten)
  a := s #> '{slices,mail,loot}';
  if left_ > 0 and jsonb_typeof(a) = 'array' then
    for i in reverse jsonb_array_length(a) - 1 .. 0 loop
      exit when left_ <= 0;
      continue when jsonb_typeof(a -> i -> 'items') is distinct from 'array';
      r := public.ledger_take_list(a -> i -> 'items', p_item, left_, true);
      a := jsonb_set(a, array[i::text, 'items'], r -> 'a');
      left_ := (r ->> 'left')::numeric;
    end loop;
    s := jsonb_set(s, '{slices,mail,loot}', a);
  end if;
  -- Angelegte Ausrüstung (Objekt { Platz: itemId } oder altes Array)
  a := s #> '{slices,inventory,equipment}';
  if left_ > 0 and jsonb_typeof(a) in ('object', 'array') then
    for k in select x.key from jsonb_each(case when jsonb_typeof(a) = 'object' then a else '{}'::jsonb end) x
             union all select (o - 1)::text from jsonb_array_elements(case when jsonb_typeof(a) = 'array' then a else '[]'::jsonb end) with ordinality y(x, o) loop
      exit when left_ <= 0;
      e := case when jsonb_typeof(a) = 'array' then a -> k::int else a -> k end;
      if (jsonb_typeof(e) = 'string' and e #>> '{}' = p_item) or (jsonb_typeof(e -> 'itemId') = 'string' and e ->> 'itemId' = p_item) then
        a := jsonb_set(a, array[k], 'null'::jsonb);
        left_ := left_ - 1;
      end if;
    end loop;
    s := jsonb_set(s, '{slices,inventory,equipment}', a);
  end if;
  -- Gelernte Reittiere (Doppelte zählen einmal und fallen gemeinsam weg)
  for mid in select lm.mount_id from public.ledger_mounts lm where lm.item_id = p_item loop
    exit when left_ <= 0;
    a := s #> '{slices,character,mounts}';
    continue when jsonb_typeof(a) is distinct from 'object' or jsonb_typeof(a -> 'owned') is distinct from 'array' or not (a -> 'owned') ? mid;
    b := coalesce((select jsonb_agg(x order by o) from jsonb_array_elements(a -> 'owned') with ordinality y(x, o) where x <> to_jsonb(mid)), '[]'::jsonb);
    a := jsonb_set(a, '{owned}', b);
    if a ->> 'active' = mid then
      a := jsonb_set(jsonb_set(a, '{active}', coalesce(b -> 0, 'null'::jsonb)), '{riding}', 'false'::jsonb);
    end if;
    s := jsonb_set(s, '{slices,character,mounts}', a);
    left_ := left_ - 1;
  end loop;
  if left_ > 0 then return null; end if;
  return s;
end $$;

-- Spielstand auf das Buch kappen. null = ließ sich nicht kappen (dann nicht schreiben).
create or replace function public.ledger_clamp(p_snap jsonb, p_xp bigint, p_gold bigint, p_items jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  s   jsonb := p_snap;
  v   jsonb := public.ledger_values(p_snap);
  ex  numeric;
  w   numeric;
  g   numeric;
  t   numeric;
  a   jsonb;
  i   int;
  lvl int;
  r   record;
begin
  if jsonb_typeof(s -> 'slices') is distinct from 'object' then return null; end if;
  -- Erfahrung: Buch, Stufe passend dazu
  if (v ->> 'xp')::numeric > p_xp then
    select coalesce(max(lv.level), 1) into lvl from public.ledger_levels lv where lv.xp <= p_xp;
    s := jsonb_set(s, '{slices,progress}', public.ledger_obj(s #> '{slices,progress}') || jsonb_build_object('xp', p_xp, 'level', lvl));
  end if;
  -- Gold: erst aus der Börse (bis 0), dann aus Beutebriefen (von hinten), Rest macht die Börse negativ
  ex := (v ->> 'gold')::numeric - p_gold;
  if ex > 0 then
    w := case when jsonb_typeof(s #> '{slices,wallet,gold}') = 'number' then (s #> '{slices,wallet,gold}')::numeric else 0 end;
    t := least(ex, greatest(w, 0));
    w := w - t;
    ex := ex - t;
    a := s #> '{slices,mail,loot}';
    if ex > 0 and jsonb_typeof(a) = 'array' then
      for i in reverse jsonb_array_length(a) - 1 .. 0 loop
        exit when ex <= 0;
        g := public.ledger_qty(a -> i -> 'gold');
        continue when g <= 0;
        t := least(g, ex);
        ex := ex - t;
        a := jsonb_set(a, array[i::text, 'gold'], to_jsonb(g - t));
      end loop;
      s := jsonb_set(s, '{slices,mail,loot}', a);
    end if;
    w := w - ex;
    s := jsonb_set(s, '{slices,wallet}', public.ledger_obj(s #> '{slices,wallet}') || jsonb_build_object('gold', w));
  end if;
  -- Gegenstände
  for r in select m.key as id, m.value::numeric - coalesce(case when jsonb_typeof(p_items -> m.key) = 'number' then (p_items -> m.key)::numeric end, 0) as n
           from jsonb_each(v -> 'items') m loop
    continue when r.n <= 0;
    s := public.ledger_take(s, r.id, r.n);
    if s is null then return null; end if;
  end loop;
  -- Probe: jetzt nicht mehr über dem Buch
  if public.ledger_over(public.ledger_values(s), p_xp, p_gold, p_items) is not null then return null; end if;
  return s;
end $$;

-- ------------------------------------------------------------------ Prüfung beim Hochladen
-- Für den Trigger (läuft mit der Rolle des Spielers): bereinigen, mit dem Buch vergleichen, kappen und vermerken.
-- Liefert den zu schreibenden Spielstand oder null (nicht schreiben). Direkter Aufruf wird abgewiesen.
create or replace function public.ledger_guard(p_user uuid, p_id text, p_snap jsonb, p_insert boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s   jsonb;
  b   public.character_ledger;
  cfg public.ledger_config;
  ov  jsonb;
begin
  if pg_trigger_depth() < 1 then raise exception 'nicht erlaubt' using errcode = '42501'; end if;
  if p_user is distinct from (select auth.uid()) then raise exception 'nicht erlaubt' using errcode = '42501'; end if;
  s := public.ledger_normalize(p_snap);
  if p_insert then return s; end if; -- neuer Charakter: Buch beginnt mit diesem Stand (Startpaket prüft characters_plausible)
  select * into b from public.character_ledger l where l.user_id = p_user and l.character_id = p_id for update;
  if not found then return s; end if; -- Buch entsteht nach dem Schreiben (characters_z_ledger_after)
  select * into cfg from public.ledger_config c where c.id = 1;
  if b.state is null and (cfg.strict_after is null or now() < cfg.strict_after) then return s; end if; -- Übergang
  ov := public.ledger_over(public.ledger_values(s), b.xp, b.gold, b.items);
  if ov is null then return s; end if;
  perform public.characters_flag(p_user, p_id, 'buch', ov);
  if not coalesce(cfg.enforce, true) then return s; end if;
  return public.ledger_clamp(s, b.xp, b.gold, b.items);
end $$;

-- Nach dem Hochladen: Buch für einen Charakter ohne Buch anlegen; im Übergang (noch keine Sitzung) den Stand übernehmen.
-- Liest den gespeicherten Stand selbst (kein Spielstand als Argument). Direkter Aufruf wird abgewiesen.
create or replace function public.ledger_user_sync(p_user uuid, p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  snap jsonb;
  v    jsonb;
begin
  if pg_trigger_depth() < 1 then raise exception 'nicht erlaubt' using errcode = '42501'; end if;
  if p_user is distinct from (select auth.uid()) then raise exception 'nicht erlaubt' using errcode = '42501'; end if;
  select c.snapshot into snap from public.characters c where c.user_id = p_user and c.id = p_id;
  if not found then return; end if;
  v := public.ledger_values(snap);
  insert into public.character_ledger as l (user_id, character_id, xp, gold, items)
    values (p_user, p_id, (v ->> 'xp')::bigint, (v ->> 'gold')::bigint, v -> 'items')
  on conflict (user_id, character_id) do update
    set xp = excluded.xp, gold = excluded.gold, items = excluded.items, ver = l.ver + 1, updated_at = now()
    where l.state is null
      and not exists (select 1 from public.ledger_config c where c.id = 1 and c.strict_after is not null and now() >= c.strict_after)
      and (l.xp, l.gold, l.items) is distinct from (excluded.xp, excluded.gold, excluded.items);
end $$;

-- Buch + (neu − alt) je Gegenstand; nichts unter 0
create or replace function public.ledger_items_add(p_book jsonb, p_old jsonb, p_new jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(t.k, t.n), '{}'::jsonb) from (
    select k, sum(n)::bigint as n from (
      select m.key as k, m.value::numeric as n from jsonb_each(public.ledger_obj(p_book)) m where jsonb_typeof(m.value) = 'number'
      union all select m.key, m.value::numeric from jsonb_each(public.ledger_obj(p_new)) m
      union all select m.key, -m.value::numeric from jsonb_each(public.ledger_obj(p_old)) m
    ) x group by k having sum(n) > 0) t
$$;

-- Läuft als LETZTER der BEFORE-Trigger (gleichartige Trigger laufen alphabetisch: before_write, market_check, plausible,
-- post_check, shop_check, z_ledger): Die anderen Prüfungen haben den Stand dann schon angenommen.
create or replace function public.characters_z_ledger() returns trigger
language plpgsql set search_path = '' as $$
declare
  s  jsonb;
  ms bigint;
begin
  if current_user <> 'authenticated' then return new; end if;
  s := public.ledger_guard(new.user_id, new.id, new.snapshot, tg_op = 'INSERT');
  if s is null then return null; end if; -- ließ sich nicht kappen: nicht schreiben, das Spiel lädt den Cloud-Stand
  if s is distinct from new.snapshot then
    -- Gekappt oder bereinigt: neuer Zeitstempel, damit das Spiel den Cloud-Stand übernimmt (CloudSync vergleicht saved_at)
    ms := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
    if jsonb_typeof(s -> 'meta') = 'object' then s := jsonb_set(s, '{meta,savedAt}', to_jsonb(ms)); end if;
    new.snapshot := s;
    new.saved_at := timestamptz 'epoch' + ms * interval '1 millisecond';
    new.level := case when jsonb_typeof(s #> '{slices,progress,level}') = 'number'
                      then greatest(1, least(100, trunc((s #> '{slices,progress,level}')::numeric)))::int else 1 end;
  end if;
  return new;
end $$;
drop trigger if exists characters_z_ledger on public.characters;
create trigger characters_z_ledger before insert or update on public.characters
  for each row execute function public.characters_z_ledger();

-- Nach dem Schreiben: Spieler → ledger_user_sync. Server, Auktionshaus, Postfach, Rückbuchung, Admin → Änderung ins Buch.
create or replace function public.characters_z_ledger_after() returns trigger
language plpgsql set search_path = '' as $$
declare
  v jsonb;
  o jsonb;
begin
  if current_user = 'authenticated' then
    perform public.ledger_user_sync(new.user_id, new.id);
    return null;
  end if;
  if tg_op = 'UPDATE' and new.snapshot is not distinct from old.snapshot then return null; end if;
  v := public.ledger_values(new.snapshot);
  if tg_op = 'UPDATE' then
    o := public.ledger_values(old.snapshot);
    update public.character_ledger l
      set xp = greatest(0, l.xp + (v ->> 'xp')::bigint - (o ->> 'xp')::bigint),
          gold = l.gold + (v ->> 'gold')::bigint - (o ->> 'gold')::bigint,
          items = public.ledger_items_add(l.items, o -> 'items', v -> 'items'),
          ver = l.ver + 1, updated_at = now()
      where l.user_id = new.user_id and l.character_id = new.id;
    if found then return null; end if;
  end if;
  insert into public.character_ledger (user_id, character_id, xp, gold, items)
    values (new.user_id, new.id, (v ->> 'xp')::bigint, (v ->> 'gold')::bigint, v -> 'items')
    on conflict (user_id, character_id) do nothing;
  return null;
end $$;
drop trigger if exists characters_z_ledger_after on public.characters;
create trigger characters_z_ledger_after after insert or update on public.characters
  for each row execute function public.characters_z_ledger_after();

-- Klasse und Volk stehen mit dem ersten Speichern fest (das Spiel kann sie nicht ändern). Die Regeln des Buchs hängen an
-- der Klasse (Waffen, Händler); ein Upload mit anderer Klasse behält die gespeicherte.
create or replace function public.characters_identity() returns trigger
language plpgsql set search_path = '' as $$
declare
  cls  text;
  race text;
begin
  if current_user <> 'authenticated' or tg_op <> 'UPDATE' then return new; end if;
  cls := coalesce(old.class_id, old.snapshot #>> '{slices,character,classId}');
  race := coalesce(old.race_id, old.snapshot #>> '{slices,character,raceId}');
  new.class_id := cls;
  new.race_id := race;
  if jsonb_typeof(new.snapshot #> '{slices,character}') = 'object' then
    if cls is not null and new.snapshot #>> '{slices,character,classId}' is distinct from cls then
      new.snapshot := jsonb_set(new.snapshot, '{slices,character,classId}', to_jsonb(cls));
    end if;
    if race is not null and new.snapshot #>> '{slices,character,raceId}' is distinct from race then
      new.snapshot := jsonb_set(new.snapshot, '{slices,character,raceId}', to_jsonb(race));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists characters_identity on public.characters;
create trigger characters_identity before update on public.characters
  for each row execute function public.characters_identity();

-- Erste Sitzung mit dem neuen Spiel: Übergang endet ${GRACE_DAYS} Tage später (nur einmal).
create or replace function public.character_ledger_started() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.state is not null and (tg_op = 'INSERT' or old.state is null) then
    update public.ledger_config set strict_after = now() + interval '${GRACE_DAYS} days' where id = 1 and strict_after is null;
  end if;
  return null;
end $$;
drop trigger if exists character_ledger_started on public.character_ledger;
create trigger character_ledger_started after insert or update of state on public.character_ledger
  for each row execute function public.character_ledger_started();

-- Vermerke: höchstens einer je Minute und Konto (20261011090000_auktionshaus.sql), 'handel' und 'buch' zählen getrennt.
-- Sonst verdrängte ein gekappter Stand ('buch') den Gold-/Stufen-Vermerk, der das Handeln sperrt.
create or replace function public.characters_flag(p_user uuid, p_character text, p_reason text, p_detail jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() < 1 then raise exception 'nicht erlaubt' using errcode = '42501'; end if;
  if (select auth.uid()) is not null and p_user is distinct from (select auth.uid()) then
    raise exception 'nicht erlaubt' using errcode = '42501';
  end if;
  if exists (select 1 from public.character_flags f where f.user_id = p_user and f.created_at > now() - interval '1 minute'
             and (case f.reason when 'handel' then 1 when 'buch' then 2 else 0 end)
               = (case p_reason when 'handel' then 1 when 'buch' then 2 else 0 end)) then
    return;
  end if;
  insert into public.character_flags (user_id, character_id, reason, detail) values (p_user, left(p_character, 64), p_reason, p_detail);
end $$;

-- ------------------------------------------------------------------ Bestehende Charaktere: Buch = gespeicherter Stand
insert into public.character_ledger (user_id, character_id, xp, gold, items)
  select c.user_id, c.id, (v ->> 'xp')::bigint, (v ->> 'gold')::bigint, v -> 'items'
  from public.characters c, lateral public.ledger_values(c.snapshot) v
  on conflict (user_id, character_id) do nothing;

-- ------------------------------------------------------------------ Rechte
revoke execute on function public.ledger_arr(jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_obj(jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_elems(jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_qty(jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_values(jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_fix_slot(jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_fix_gear(jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_fix_int(jsonb, numeric, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.ledger_normalize(jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_over(jsonb, bigint, bigint, jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_take_list(jsonb, text, numeric, boolean) from public, anon, authenticated;
revoke execute on function public.ledger_take(jsonb, text, numeric) from public, anon, authenticated;
revoke execute on function public.ledger_clamp(jsonb, bigint, bigint, jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_items_add(jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.characters_z_ledger() from public, anon, authenticated;
revoke execute on function public.characters_z_ledger_after() from public, anon, authenticated;
revoke execute on function public.character_ledger_started() from public, anon, authenticated;
revoke execute on function public.characters_identity() from public, anon, authenticated;
-- Server-Rolle (Worker, Spiegeln bei Server-Buchungen über die Server-Rolle)
grant execute on function public.ledger_arr(jsonb), public.ledger_obj(jsonb), public.ledger_elems(jsonb), public.ledger_qty(jsonb),
  public.ledger_values(jsonb), public.ledger_items_add(jsonb, jsonb, jsonb) to service_role;
-- Die Trigger laufen mit der Rolle des Spielers und brauchen deshalb das Ausführrecht (beide prüfen Aufrufer und Trigger).
revoke execute on function public.ledger_guard(uuid, text, jsonb, boolean) from public, anon;
grant execute on function public.ledger_guard(uuid, text, jsonb, boolean) to authenticated;
revoke execute on function public.ledger_user_sync(uuid, text) from public, anon;
grant execute on function public.ledger_user_sync(uuid, text) to authenticated;
revoke execute on function public.characters_flag(uuid, text, text, jsonb) from public, anon;
grant execute on function public.characters_flag(uuid, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
`;
}

if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(ledgerSql());
