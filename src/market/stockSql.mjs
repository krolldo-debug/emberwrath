// Erzeugt die Datenbank-Migration für das Warenangebot der Gilde der Glutwaage (src/market/README.md, „Angebote der Gilde“).
// Nicht Teil des Spiels.
//
//   node src/market/stockSql.mjs > supabase/migrations/20261030090000_auktionshaus_angebote.sql
//
// Faire Preise: so viel Gold, wie man auf der Stufe des Gegenstands in einigen Minuten verdient (vorsichtig geschätzt,
// rund die Hälfte von test/pacing.mjs), nie weniger als ein Vielfaches des Händlerwerts (sonst lohnte Kaufen und beim
// Händler Verkaufen). Kommen handelbare Gegenstände dazu, neu erzeugen und erneut ausführen (mehrfach ausführbar).
import { tradeableCatalog } from './rules.js';
import { ITEMS } from '../progression/items.js';
import { OTHER_50 } from '../progression/items50.js';

export const STOCK_TARGET = 48;          // so viele Angebote der Gilde sollen gleichzeitig laufen
export const STOCK_MAX_LEVEL = 40;       // Sternenglut (41–50) ist noch nicht für alle offen
export const SELLER = 'glutwaage';       // seller_char der Gilde (seller_user bleibt leer)

// Gold je Spielstunde auf einer Stufe, vorsichtig (Simulation verkauft jede Beute, echte Spieler nicht)
const GOLD_PER_HOUR = [[1, 1500], [10, 3000], [20, 9000], [30, 13000], [40, 20000]];
export function goldPerHour(level) {
  const pts = GOLD_PER_HOUR;
  if (level <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [l1, g1] = pts[i], [l0, g0] = pts[i - 1];
    if (level <= l1) return g0 + (g1 - g0) * (level - l0) / (l1 - l0);
  }
  return pts.at(-1)[1];
}
// Ausrüstung: Minuten Spielzeit je Seltenheit, Mindestfaktor auf den Händlerwert
const GEAR_MINUTES = { uncommon: 1.5, rare: 4, epic: 12 };
const GEAR_FLOOR = { uncommon: 3, rare: 4, epic: 8 };
// Tränke und Materialien: Faktor auf den Händlerwert (Händler verkaufen zum Vierfachen)
const GOODS_MULT = { consumable: { common: 3, uncommon: 3, rare: 5 }, material: { common: 3.5, uncommon: 4, rare: 5 } };
// Mengen, wie Spieler sie einstellen
const GOODS_QTY = { common: [5, 10, 10, 20], uncommon: [5, 5, 10, 20], rare: [1, 2, 3, 5] };
// Anteil am Angebot je Gruppe (innerhalb der Gruppe gleich wahrscheinlich; unter Stufe 10 seltener)
const SHARES = {
  'weapon/uncommon': 10, 'weapon/rare': 10, 'weapon/epic': 2.5,
  'armor/uncommon': 13, 'armor/rare': 13, 'armor/epic': 2.5,
  'jewelry/uncommon': 4, 'jewelry/rare': 5, 'jewelry/epic': 1.5,
  consumable: 12, material: 18,
};

const niceRound = (n) => { const step = n < 100 ? 1 : n < 1000 ? 5 : n < 10000 ? 50 : 100; return Math.max(1, Math.ceil(n / step) * step); };

// Stückpreis (fair) eines Gegenstands
export function fairPrice(def) {
  if (def.slot) {
    const byTime = goldPerHour(def.reqLevel ?? 1) / 60 * GEAR_MINUTES[def.rarity];
    return niceRound(Math.max(def.value * GEAR_FLOOR[def.rarity], byTime));
  }
  return Math.max(2, Math.round(def.value * GOODS_MULT[def.type][def.rarity]));
}

// Was die Gilde anbietet: Ausrüstung aus der Welt (ab ungewöhnlich, bis episch, ohne Bossbeute, Sets, Prüfungs- oder
// Questbelohnungen), Tränke und Materialien. Keine Reittiere, nichts Legendäres, nichts aus Sternenglut.
export function stockRows() {
  const stars = new Set(Object.keys(OTHER_50));
  const rows = [];
  for (const [id, cat, rarity, lvl] of tradeableCatalog()) {
    const d = ITEMS[id];
    if (stars.has(id) || d.source || d.set || !d.value || cat === 'mount' || rarity === 'legendary') continue;
    if ((d.ilvl ?? 1) > STOCK_MAX_LEVEL || lvl > STOCK_MAX_LEVEL) continue;
    const gear = !!d.slot;
    if (gear && (rarity === 'common' || lvl < 6)) continue;
    if (!gear && rarity === 'epic') continue;
    const group = gear ? `${cat}/${rarity}` : cat;
    if (!(group in SHARES)) continue;
    rows.push({ id, group, gear, lvl: gear ? lvl : d.ilvl ?? 1, value: d.value, price: fairPrice(d),
      qtys: gear ? [1] : GOODS_QTY[rarity].map((q) => Math.min(q, d.stack ?? 1)), low: gear && lvl < 10 });
  }
  const size = {};
  for (const r of rows) size[r.group] = (size[r.group] ?? 0) + (r.low ? 0.3 : 1);
  for (const r of rows) r.weight = SHARES[r.group] / size[r.group] * (r.low ? 0.3 : 1);
  return rows;
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function stockSql() {
  const rows = stockRows();
  const values = rows.map((r) => `(${q(r.id)},${r.gear},${r.lvl},${r.value},${r.price},'{${r.qtys.join(',')}}',${r.weight.toPrecision(4)})`);
  return `-- Emberwrath: Auktionshaus – Angebote der Gilde der Glutwaage (29.10.). Einmal im Supabase-SQL-Editor ausführen,
-- nach allen bisherigen Migrationen (Auktionshaus, Postfach). Mehrfach ausführbar.
-- Erzeugt mit: node src/market/stockSql.mjs (Preise und Auswahl dort).
--
-- Damit das Auktionshaus nie leer wirkt, stellt die Gilde selbst Ware ein: Ausrüstung der Stufen 6–${STOCK_MAX_LEVEL} (ungewöhnlich bis
-- episch, keine Bossbeute, Sets, Reittiere oder legendären Gegenstände), Tränke und Materialien zu fairen Preisen.
--  - Angebote der Gilde sind gewöhnliche Zeilen in market_listings mit seller_user = null und seller_char = '${SELLER}'.
--    Kaufen, Bieten, Ablauf und Postfach laufen über die bestehenden Funktionen (market_bid/buyout/settle, mail_take);
--    der Gegenstand kommt aus public.market_items (gültiger Katalog), das Fortschrittsbuch zählt ihn beim Abholen.
--  - Das bezahlte Gold geht an die Gilde und damit aus dem Spiel (wie die Verkaufsgebühr). Abgelaufene Angebote der Gilde
--    verschwinden ohne Post.
--  - market_restock() hält etwa ${STOCK_TARGET} Angebote: höchstens ein Angebot je Gegenstand, nichts, was gerade ein Spieler
--    anbietet (Spieler werden nicht unterboten), ein Teil passend zu Stufe und Klasse aktiver Charaktere. pg_cron ruft sie
--    alle 10 Minuten auf und stellt jeweils 1–3 Angebote nach (nachts seltener), damit es wie Spielerhandel aussieht.
--  - Notbremse: update public.market_stock_config set target = 0;  (stellt nichts mehr ein; laufende Angebote laufen aus)
--    Alles sofort entfernen (nur ohne Gebot): select public.market_stock_clear();

-- ------------------------------------------------------------------ Tabellen
create table if not exists public.market_stock (
  item_id text primary key,
  gear    boolean not null,
  lvl     int not null,        -- Stufe für die Preisrechnung (Ausrüstung: benötigte Stufe)
  value   int not null,        -- Händlerwert je Stück
  price   bigint not null,     -- fairer Preis je Stück
  qtys    int[] not null,      -- übliche Mengen
  weight  real not null
);
create table if not exists public.market_stock_config (
  id     int primary key default 1 check (id = 1),
  target int not null default ${STOCK_TARGET}
);
insert into public.market_stock_config (id) values (1) on conflict do nothing;
alter table public.market_stock enable row level security;
alter table public.market_stock_config enable row level security;
revoke all on public.market_stock, public.market_stock_config from anon, authenticated;
grant select, insert, update, delete on public.market_stock, public.market_stock_config to service_role;

delete from public.market_stock;
insert into public.market_stock (item_id, gear, lvl, value, price, qtys, weight) values
${values.join(',\n')};

-- ------------------------------------------------------------------ Preise wie von Spielern
-- Rundet auf übliche Beträge (5, 50, 100 …), manchmal knapp darunter (1.499).
create or replace function public.market_stock_round(p numeric) returns bigint
language plpgsql volatile set search_path = '' as $$
declare step int := case when p < 40 then 1 when p < 200 then 5 when p < 1000 then 10 when p < 5000 then 50 else 100 end;
  r bigint;
begin
  if p >= 200 and random() < 0.3 then step := step * 5; end if;
  r := greatest(1, round(p / step) * step)::bigint;
  if r >= 100 and random() < 0.25 then r := r - 1; end if;
  return r;
end $$;

-- ------------------------------------------------------------------ Nachfüllen
-- p_fill: auf einmal bis zum Ziel (erste Befüllung, Laufzeiten verteilt), sonst wenige Angebote je Aufruf.
create or replace function public.market_restock(p_fill boolean default false) returns int
language plpgsql set search_path = '' as $$
declare
  target int := coalesce((select c.target from public.market_stock_config c where c.id = 1), 0);
  have int; want int; n int := 0; i int;
  s public.market_stock; it public.market_items; v_lvl int; v_cls text;
  hrs int; qty int; fair numeric; floor_ bigint; buy bigint; start_ bigint; r float8; age interval; hour int;
begin
  if not pg_try_advisory_xact_lock(hashtext('market_restock')) then return 0; end if;
  select count(*) into have from public.market_listings
    where status = 'active' and seller_user is null and seller_char = '${SELLER}';
  want := target - have;
  if want <= 0 then return 0; end if;
  if not p_fill then
    hour := extract(hour from now() at time zone 'Europe/Berlin')::int;
    if hour between 2 and 6 and random() < 0.7 then return 0; end if;
    want := least(want, 1 + floor(random() * 3)::int);
  end if;
  for i in 1 .. want loop
    s := null;
    -- Gut ein Drittel passend zu einem Charakter, der in den letzten 7 Tagen gespielt hat
    if random() < 0.35 then
      select c.level, c.class_id into v_lvl, v_cls from public.characters c
        where c.updated_at > now() - interval '7 days' and c.level >= 10 order by random() limit 1;
      if found then
        select st.* into s from public.market_stock st join public.market_items mi on mi.id = st.item_id
          where st.gear and mi.req_level between v_lvl - 5 and least(${STOCK_MAX_LEVEL}, v_lvl + 1)
            and (mi.classes is null or v_cls is null or v_cls = any (mi.classes))
            and not exists (select 1 from public.market_listings l where l.status = 'active' and l.item_id = st.item_id)
          order by -ln(1 - random()) / st.weight limit 1;
      end if;
    end if;
    if s.item_id is null then
      select st.* into s from public.market_stock st join public.market_items mi on mi.id = st.item_id
        where not exists (select 1 from public.market_listings l where l.status = 'active' and l.item_id = st.item_id)
        order by -ln(1 - random()) / st.weight limit 1;
    end if;
    exit when s.item_id is null;
    select * into it from public.market_items where id = s.item_id;
    qty := least(it.stack, s.qtys[1 + floor(random() * array_length(s.qtys, 1))::int]);
    fair := s.price * qty * (0.9 + random() * 0.25)::numeric;
    floor_ := ceil(s.value * qty * 2);   -- nie so billig, dass sich der Weiterverkauf beim Händler lohnt
    r := random();
    if r < 0.5 then         -- nur Sofortkauf
      buy := greatest(floor_, public.market_stock_round(fair)); start_ := null;
    elsif r < 0.88 then     -- Startgebot und Sofortkauf
      buy := greatest(floor_, public.market_stock_round(fair));
      start_ := least(buy, greatest(floor_, public.market_stock_round(buy * (0.65 + random() * 0.2)::numeric)));
    else                    -- nur Gebote
      buy := null; start_ := greatest(floor_, public.market_stock_round(fair * (0.7 + random() * 0.15)::numeric));
    end if;
    r := random();
    hrs := case when r < 0.25 then 12 when r < 0.7 then 24 else 48 end;
    age := case when p_fill then random() * hrs * 0.85 * interval '1 hour' else random() * interval '9 minutes' end;
    insert into public.market_listings (seller_user, seller_char, item_id, qty, category, rarity, req_level, classes,
        start_bid, buyout, created_at, ends_at)
      values (null, '${SELLER}', it.id, qty, it.category, it.rarity, it.req_level, it.classes,
        start_, buy, now() - age, now() - age + hrs * interval '1 hour');
    n := n + 1;
  end loop;
  return n;
end $$;

-- Laufende Angebote der Gilde ohne Gebot sofort beenden (Gegenstände gehen an niemanden zurück).
create or replace function public.market_stock_clear() returns int
language sql set search_path = '' as $$
  with x as (update public.market_listings set status = 'cancelled', closed_at = now()
    where status = 'active' and seller_user is null and seller_char = '${SELLER}' and bid is null returning 1)
  select count(*)::int from x;
$$;

revoke execute on function public.market_stock_round(numeric) from public, anon, authenticated;
revoke execute on function public.market_restock(boolean) from public, anon, authenticated;
revoke execute on function public.market_stock_clear() from public, anon, authenticated;

-- ------------------------------------------------------------------ Alle 10 Minuten nachfüllen (pg_cron)
do $cron$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    raise notice 'pg_cron ließ sich nicht einschalten (%). Supabase: Database → Extensions → pg_cron einschalten und diese Datei erneut ausführen.', sqlerrm;
    return;
  end;
  perform cron.schedule('auktionshaus-angebote', '*/10 * * * *', 'select public.market_restock()');
end $cron$;

-- Erste Befüllung (verteilt über die Laufzeiten, als wären sie nach und nach eingestellt worden)
select public.market_restock(true);

-- Ergebnis (im SQL-Editor sichtbar)
select (select count(*) from public.market_listings where status = 'active' and seller_user is null and seller_char = '${SELLER}') as angebote_der_gilde,
  (select count(*) from public.market_listings where status = 'active' and seller_user is not null) as angebote_von_spielern,
  case when exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron')
       then 'alle 10 Minuten' else 'AUS – pg_cron fehlt' end as nachfuellen;
`;
}

if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(stockSql());
