// Erzeugt die Datenbank-Migration des Auktionshauses aus den Spielregeln (src/market/rules.js, Items aus progression/).
// Nicht Teil des Spiels.
//
//   node src/market/marketSql.mjs > supabase/migrations/20261011090000_auktionshaus.sql
//
// Kommen handelbare Gegenstände dazu (neue Items), die Migration neu erzeugen und erneut ausführen (mehrfach ausführbar).
import { readFileSync } from 'node:fs';
import { tradeableCatalog, FEE_RATE, DURATIONS, PRICE_MAX, MAX_ACTIVE, BID_STEP, PAGE, TRADE_MIN_LEVEL, TRADE_MIN_PLAY,
  GOLD_PER_SECOND, LEVEL_SLACK, FRESH_COST, FRESH_BASE, FRESH_PER_HOUR, DAY_CAP, START_DAYS } from './rules.js';
import { ITEMS, RARITY_ORDER } from '../progression/items.js';
import { DESIGN_ITEMS } from '../shop/catalog.js';

// Prüfung beim Erzeugen: nichts aus Erfolgen, Shop oder reinem Aussehen, keine legendären Reittiere im Katalog.
function checkCatalog(rows) {
  const shop = new Set(DESIGN_ITEMS.filter((k) => k.startsWith('mount:')).map((k) => k.slice(6)));
  for (const [id] of rows) {
    const d = ITEMS[id];
    if (!d || d.source === 'achievement' || d.source === 'shop' || d.lookOnly || d.type === 'quest'
        || (d.type === 'mount' && (d.rarity === 'legendary' || shop.has(d.mountId)))) {
      throw new Error(`Nicht handelbar, aber im Katalog: ${id}`);
    }
  }
  return rows;
}

// characters_plausible wie zuletzt definiert (Wiederherstellung, falls die erste Fassung dieser Migration lief)
function plausibleOriginal() {
  const src = readFileSync(new URL('../../supabase/migrations/20261005100200_startpaket_pruefung.sql', import.meta.url), 'utf8');
  const a = src.indexOf('create or replace function public.characters_plausible()');
  return src.slice(a, src.indexOf('end $$;', a) + 7);
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function marketSql() {
  const rows = checkCatalog(tradeableCatalog()).map(([id, cat, rar, lvl, stack, classes]) =>
    `(${q(id)},${q(cat)},${RARITY_ORDER.indexOf(rar)},${lvl},${stack},${classes ? `'{${classes.join(',')}}'` : 'null'})`);
  const freshCost = RARITY_ORDER.map((r) => FRESH_COST[r] ?? 1);
  const plaus = plausibleOriginal();
  if (plaus.includes('$plaus$') || plaus.includes('$restore$')) throw new Error('Trennzeichen kollidiert');
  return `-- Emberwrath: Auktionshaus (Handel zwischen Spielern). Einmal im Supabase-SQL-Editor ausführen,
-- NACH allen bisherigen Migrationen (zuletzt 20261011023000_namen_aendern.sql). Mehrfach ausführbar.
-- Erzeugt mit: node src/market/marketSql.mjs (Regeln: src/market/rules.js).
--
-- Sicherheitsmodell
--  - Angebote, Gebote, Kauf und Abholung laufen nur über die Funktionen market_* (security definer). Sie lesen und ändern
--    den gespeicherten Spielstand (public.characters.snapshot) in derselben Transaktion wie das Angebot; Zeilen werden
--    gesperrt (FOR UPDATE). Ein Gegenstand kann deshalb nur einmal eingestellt, ein Angebot nur einmal verkauft und
--    Gold nur einmal bezahlt werden.
--  - Verkaufen nimmt den Gegenstand aus dem Spielstand, Bieten und Kaufen ziehen das Gold sofort ab (Gebote liegen beim
--    Auktionshaus, Überbotene bekommen ihr Gold zurück). Erlöse, gekaufte, gewonnene und zurückgegebene Gegenstände
--    liegen im Postfach (market_mail, src/mail/mailSql.mjs) und kommen erst beim Abholen in den Spielstand.
--  - Der Buchungszähler steht nur in der Datenbank (market_chars.seq) und wird in den gespeicherten Spielstand
--    geschrieben (slices.market.seq). Ein Upload muss genau diesen Zähler tragen, sonst wird er abgelehnt und als
--    'handel' vermerkt (zweites Fenster, alter Speicherplatz, erfundener Zähler).
--  - Gegenstände und Gold entstehen weiter im Browser (offener Punkt D3). Deshalb bringt das Auktionshaus niemandem mehr,
--    als er ohnehin hochladen könnte:
--      * Handeln erst ab Stufe ${TRADE_MIN_LEVEL} und ${TRADE_MIN_PLAY / 3600} Stunde geprüfter Spielzeit (play_verified).
--      * Handelszeit je KONTO: Summe der geprüften Spielzeit aller Charaktere, höchstens ${DAY_CAP / 3600} Stunden je Tag seit
--        dem ersten Handel (+ ${START_DAYS} Tage Vorschuss für den Goldrahmen, nicht fürs Kontingent). Spielzeit ist nur so gut wie die Uhr des Browsers; der Tagesdeckel
--        begrenzt, was ein offenes Fenster ohne Spielen ansammelt.
--      * Bieten und Kaufen nur, solange alle Ausgaben des Kontos minus alle Einnahmen den Goldrahmen
--        (${GOLD_PER_SECOND} je Sekunde Handelszeit + Shop-Gold) nicht übersteigen; der Freibetrag neuer Charaktere zählt nicht.
--      * Abholen: Erlöse bis ${GOLD_PER_SECOND} × geprüfte Spielzeit des Charakters + Shop-Gold, zurückgegebene Gebote bis zur
--        Gold-Obergrenze der Spielstandprüfung; der Rest bleibt im Postfach. characters_plausible bleibt unverändert.
--      * Was das Auktionshaus geliefert hat, führt der Server als Bestand (market_owned) und lässt es frei wieder
--        einstellen. Eigene Beute kostet Handelskontingent des Kontos nach Seltenheit und Menge (wächst mit der
--        Handelszeit) und darf höchstens ${LEVEL_SLACK} Stufen über dem Charakter liegen. Legendäre Reittiere sind nicht
--        handelbar, bis Beute auf dem Server entsteht.
--  - Ein Upload, den das Auktionshaus ablehnt ('handel'), verbraucht nicht die Vermerk-Sperre für Gold/Stufe/Grenze.
--  - Konten mit Schummel-Vermerk (Stufe/Gold/Grenze, letzte 7 Tage) dürfen nicht handeln.
--  - Handelbar sind nur Gegenstände aus public.market_items (aus dem Spiel erzeugt): keine Questgegenstände, keine
--    Erfolgsbelohnungen, keine Shop-Designs. Tabellen sind für Spieler nicht direkt les- oder schreibbar (RLS ohne Policies).

-- ------------------------------------------------------------------ Tabellen
create table if not exists public.market_items (
  id        text primary key,
  category  text not null,
  rarity    smallint not null,            -- 0 gewöhnlich … 4 legendär
  req_level int not null,
  stack     int not null check (stack >= 1),
  classes   text[]
);

create table if not exists public.market_chars (
  user_id      uuid not null,
  character_id text not null,
  seq          bigint not null default 0,  -- letzte Buchung des Auktionshauses (nur der Server zählt)
  net          bigint not null default 0,  -- Gold durch das Auktionshaus: Einnahmen minus Ausgaben (dieser Charakter)
  primary key (user_id, character_id),
  foreign key (user_id, character_id) references public.characters (user_id, id) on delete cascade
);
alter table public.market_chars drop column if exists fresh;

-- Je Konto: Beginn des Handels (Tagesdeckel), Handelsgewinn aller Charaktere, verbrauchtes Kontingent.
create table if not exists public.market_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  started date not null default current_date,
  net     bigint not null default 0,
  fresh   int not null default 0
);

-- Bestand aus dem Auktionshaus: Gegenstände, die der Server diesem Charakter geliefert hat.
create table if not exists public.market_owned (
  user_id      uuid not null,
  character_id text not null,
  item_id      text not null,
  qty          int not null default 0 check (qty >= 0),
  primary key (user_id, character_id, item_id),
  foreign key (user_id, character_id) references public.characters (user_id, id) on delete cascade
);

create table if not exists public.market_listings (
  id          bigint generated always as identity primary key,
  seller_user uuid references auth.users (id) on delete set null,
  seller_char text not null,
  item_id     text not null,
  qty         int not null check (qty between 1 and 9999),
  learned     boolean not null default false,   -- gelerntes Reittier: kommt zurückgegeben wieder als gelernt an
  category    text not null,
  rarity      smallint not null,
  req_level   int not null,
  classes     text[],
  start_bid   bigint check (start_bid between 1 and ${PRICE_MAX}),
  buyout      bigint check (buyout between 1 and ${PRICE_MAX}),
  bid         bigint,
  bidder_user uuid references auth.users (id) on delete set null,
  bidder_char text,
  bids        int not null default 0,
  price       bigint,                            -- Verkaufspreis
  status      text not null default 'active' check (status in ('active', 'sold', 'expired', 'cancelled')),
  created_at  timestamptz not null default now(),
  ends_at     timestamptz not null,
  closed_at   timestamptz,
  check (start_bid is not null or buyout is not null),
  check (buyout is null or start_bid is null or buyout >= start_bid)
);
create index if not exists market_listings_open on public.market_listings (category, rarity, created_at desc) where status = 'active';
create index if not exists market_listings_end on public.market_listings (ends_at) where status = 'active';
create index if not exists market_listings_seller on public.market_listings (seller_user, status);
create index if not exists market_listings_bidder on public.market_listings (bidder_user, status);
create index if not exists market_listings_closed on public.market_listings (closed_at) where status <> 'active';

create table if not exists public.market_mail (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  character_id text not null,
  kind         text not null check (kind in ('sold', 'won', 'bought', 'outbid', 'expired', 'cancelled')),
  item_id      text,
  qty          int not null default 0,
  learned      boolean not null default false,
  gold         bigint not null default 0 check (gold >= 0),
  listing_id   bigint,
  created_at   timestamptz not null default now(),
  collected_at timestamptz
);
create index if not exists market_mail_open on public.market_mail (user_id, character_id) where collected_at is null;
create index if not exists market_mail_done on public.market_mail (collected_at) where collected_at is not null;

create table if not exists public.market_rate (
  user_id uuid primary key references auth.users (id) on delete cascade,
  minute  timestamptz not null,
  n       int not null,
  hour    timestamptz not null,
  listed  int not null
);
-- Ansehen (Suche, Übersicht) zählt getrennt mit höherem Limit
alter table public.market_rate add column if not exists looks int not null default 0;
alter table public.market_rate add column if not exists look_minute timestamptz;

alter table public.market_items enable row level security;
alter table public.market_chars enable row level security;
alter table public.market_listings enable row level security;
alter table public.market_mail enable row level security;
alter table public.market_rate enable row level security;
alter table public.market_owned enable row level security;
alter table public.market_accounts enable row level security;
-- Neue Tabellen bekommen in diesem Projekt keine automatischen Rechte; Spieler gehen nur über die Funktionen.
revoke all on public.market_items, public.market_chars, public.market_listings, public.market_mail, public.market_rate,
  public.market_owned, public.market_accounts from anon, authenticated;
grant select, insert, update, delete on public.market_items, public.market_chars, public.market_listings, public.market_mail,
  public.market_rate, public.market_owned, public.market_accounts to service_role;

-- Erste Fassung dieser Migration (nie freigegeben): hob die Gold-Obergrenze um Auktionserlöse an. Falls sie lief,
-- characters_plausible wiederherstellen und den Baustein entfernen.
do $restore$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'characters_plausible' and p.prosrc like '%characters_market_gold%') then
    execute $plaus$${plaus}$plaus$;
  end if;
end $restore$;
drop function if exists public.characters_market_gold(uuid, text);
drop function if exists public.market_spendable(public.characters, bigint);
drop function if exists public.market_trade_time(public.market_accounts);
revoke all on all sequences in schema public from anon, authenticated;
grant usage, select on all sequences in schema public to service_role;

-- ------------------------------------------------------------------ Katalog (aus dem Spiel erzeugt)
delete from public.market_items;
insert into public.market_items (id, category, rarity, req_level, stack, classes) values
${rows.join(',\n')};
-- Sicherheitsnetz: Shop-Designs nie handelbar, auch wenn der Katalog einmal einen Gegenstand dafür bekäme.
do $$
begin
  if to_regclass('public.shop_exclusive_items') is not null then
    delete from public.market_items where id in (select 'mount_' || substr(key, 7) from public.shop_exclusive_items where key like 'mount:%');
  end if;
end $$;

-- ------------------------------------------------------------------ Spielstand lesen und ändern (nur intern)
create or replace function public.market_snap_count(p_snap jsonb, p_item text, p_mat boolean) returns int
language plpgsql immutable set search_path = '' as $$
declare n numeric := 0; e jsonb;
begin
  if p_mat then
    return coalesce(floor((p_snap #>> array['slices', 'inventory', 'mats', p_item])::numeric), 0)::int;
  end if;
  if jsonb_typeof(p_snap #> '{slices,inventory,slots}') is distinct from 'array' then return 0; end if;
  for e in select x from jsonb_array_elements(p_snap #> '{slices,inventory,slots}') x loop
    if jsonb_typeof(e) = 'object' and e ->> 'itemId' = p_item then n := n + greatest(0, floor((e ->> 'qty')::numeric)); end if;
  end loop;
  return n::int;
end $$;

-- Nimmt qty Stück heraus (Tasche von hinten wie im Spiel, Materialien aus dem Materialbeutel). null = nicht genug.
create or replace function public.market_snap_take(p_snap jsonb, p_item text, p_qty int, p_mat boolean) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare slots jsonb; e jsonb; i int; k int; q int; left_ int := p_qty; have int;
begin
  if p_qty < 1 then return null; end if;
  if p_mat then
    have := public.market_snap_count(p_snap, p_item, true);
    if have < p_qty then return null; end if;
    if have = p_qty then return p_snap #- array['slices', 'inventory', 'mats', p_item]; end if;
    return jsonb_set(p_snap, array['slices', 'inventory', 'mats', p_item], to_jsonb(have - p_qty));
  end if;
  slots := p_snap #> '{slices,inventory,slots}';
  if jsonb_typeof(slots) is distinct from 'array' then return null; end if;
  for i in reverse jsonb_array_length(slots) - 1 .. 0 loop
    exit when left_ <= 0;
    e := slots -> i;
    if jsonb_typeof(e) = 'object' and e ->> 'itemId' = p_item then
      q := greatest(0, floor((e ->> 'qty')::numeric))::int;
      k := least(left_, q);
      left_ := left_ - k;
      slots := jsonb_set(slots, array[i::text], case when q - k <= 0 then 'null'::jsonb else jsonb_set(e, '{qty}', to_jsonb(q - k)) end);
    end if;
  end loop;
  if left_ > 0 then return null; end if;
  return jsonb_set(p_snap, '{slices,inventory,slots}', slots);
end $$;

-- Legt qty Stück hinein (erst auf passende Stapel, dann freie Plätze). null = kein Platz.
create or replace function public.market_snap_give(p_snap jsonb, p_item text, p_qty int, p_stack int, p_mat boolean) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare slots jsonb; e jsonb; i int; k int; q int; left_ int := p_qty; have int;
begin
  if p_mat then
    have := public.market_snap_count(p_snap, p_item, true);
    if have + p_qty > 9999 then return null; end if;
    if jsonb_typeof(p_snap #> '{slices,inventory,mats}') is distinct from 'object' then
      p_snap := jsonb_set(p_snap, '{slices,inventory,mats}', '{}'::jsonb);
    end if;
    return jsonb_set(p_snap, array['slices', 'inventory', 'mats', p_item], to_jsonb(have + p_qty));
  end if;
  slots := p_snap #> '{slices,inventory,slots}';
  if jsonb_typeof(slots) is distinct from 'array' then return null; end if;
  for i in 0 .. jsonb_array_length(slots) - 1 loop
    exit when left_ <= 0;
    e := slots -> i;
    if jsonb_typeof(e) = 'object' and e ->> 'itemId' = p_item then
      q := greatest(0, floor((e ->> 'qty')::numeric))::int;
      k := least(left_, p_stack - q);
      if k > 0 then slots := jsonb_set(slots, array[i::text], jsonb_set(e, '{qty}', to_jsonb(q + k))); left_ := left_ - k; end if;
    end if;
  end loop;
  for i in 0 .. jsonb_array_length(slots) - 1 loop
    exit when left_ <= 0;
    if jsonb_typeof(slots -> i) = 'null' then
      k := least(left_, p_stack);
      slots := jsonb_set(slots, array[i::text], jsonb_build_object('itemId', p_item, 'qty', k, 'n', true));
      left_ := left_ - k;
    end if;
  end loop;
  if left_ > 0 then return null; end if;
  return jsonb_set(p_snap, '{slices,inventory,slots}', slots);
end $$;

create or replace function public.market_snap_gold(p_snap jsonb) returns bigint
language sql immutable set search_path = '' as $$
  select coalesce(floor((p_snap #>> '{slices,wallet,gold}')::numeric), 0)::bigint;
$$;

create or replace function public.market_snap_set_gold(p_snap jsonb, p_gold bigint) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_set(case when jsonb_typeof(p_snap #> '{slices,wallet}') = 'object' then p_snap
                        else jsonb_set(p_snap, '{slices,wallet}', '{}'::jsonb) end,
                   '{slices,wallet,gold}', to_jsonb(p_gold));
$$;

-- Gelerntes Reittier vergessen (null = nicht im Besitz). Aktiv war es: nächstes nehmen, absitzen.
create or replace function public.market_snap_forget_mount(p_snap jsonb, p_mount text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare m jsonb; owned jsonb;
begin
  m := p_snap #> '{slices,character,mounts}';
  if jsonb_typeof(m) is distinct from 'object' or jsonb_typeof(m -> 'owned') is distinct from 'array'
     or not (m -> 'owned') ? p_mount then return null; end if;
  select coalesce(jsonb_agg(x), '[]'::jsonb) into owned from jsonb_array_elements(m -> 'owned') x where x <> to_jsonb(p_mount);
  m := jsonb_set(m, '{owned}', owned);
  if m ->> 'active' = p_mount or jsonb_typeof(m -> 'active') is distinct from 'string' then
    m := jsonb_set(m, '{active}', coalesce(owned -> 0, 'null'::jsonb));
    m := jsonb_set(m, '{riding}', 'false'::jsonb);
  end if;
  return jsonb_set(p_snap, '{slices,character,mounts}', m);
end $$;

-- Reittier (wieder) lernen. null = schon bekannt oder kein Reittier-Bereich im Spielstand.
create or replace function public.market_snap_learn_mount(p_snap jsonb, p_mount text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare m jsonb;
begin
  m := p_snap #> '{slices,character,mounts}';
  if jsonb_typeof(m) is distinct from 'object' then return null; end if;
  if jsonb_typeof(m -> 'owned') is distinct from 'array' then m := jsonb_set(m, '{owned}', '[]'::jsonb); end if;
  if (m -> 'owned') ? p_mount then return null; end if;
  m := jsonb_set(m, '{owned}', (m -> 'owned') || to_jsonb(p_mount));
  if jsonb_typeof(m -> 'active') is distinct from 'string' then m := jsonb_set(m, '{active}', to_jsonb(p_mount)); end if;
  return jsonb_set(p_snap, '{slices,character,mounts}', m);
end $$;

-- Buchung abschließen: Zähler (nur hier) hoch, Spielstand mit Serverzeit schreiben, Goldbilanz führen.
create or replace function public.market_commit(p_user uuid, p_char text, p_snap jsonb, p_gold bigint) returns jsonb
language plpgsql set search_path = '' as $$
declare
  s   bigint;
  ms  bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  insert into public.market_chars as m (user_id, character_id, seq, net) values (p_user, p_char, 1, p_gold)
    on conflict (user_id, character_id) do update set seq = m.seq + 1, net = m.net + p_gold
    returning m.seq into s;
  insert into public.market_accounts as a (user_id, net) values (p_user, p_gold)
    on conflict (user_id) do update set net = a.net + p_gold;
  p_snap := jsonb_set(p_snap, '{slices,market}', jsonb_build_object('seq', s));
  p_snap := jsonb_set(p_snap, '{meta,savedAt}', to_jsonb(ms));
  -- Markierung für characters_market_check: updated_at bleibt (sonst ginge geprüfte Spielzeit verloren).
  perform set_config('emberwrath.market', '1', true);
  update public.characters set snapshot = p_snap, saved_at = timestamptz 'epoch' + ms * interval '1 millisecond'
    where user_id = p_user and id = p_char;
  perform set_config('emberwrath.market', '', true);
  return jsonb_build_object('ok', true, 'seq', s, 'savedAt', ms, 'gold', p_gold);
end $$;

-- Anmeldung, Schummel-Vermerk, Tempo (40 Aktionen je Minute, 60 neue Angebote je Stunde; Ansehen 'look' 120 je Minute,
-- auch mit Vermerk erlaubt). Liefert Fehlercode oder null.
create or replace function public.market_guard(p_user uuid, p_kind text) returns text
language plpgsql set search_path = '' as $$
declare r public.market_rate; mi timestamptz := date_trunc('minute', now()); hr timestamptz := date_trunc('hour', now());
begin
  if p_user is null then return 'auth'; end if;
  if p_kind = 'look' then
    insert into public.market_rate as m (user_id, minute, n, hour, listed, looks, look_minute) values (p_user, mi, 0, hr, 0, 1, mi)
    on conflict (user_id) do update set looks = case when m.look_minute = mi then m.looks + 1 else 1 end, look_minute = mi
    returning * into r;
    return case when r.looks > 120 then 'rate' end;
  end if;
  if to_regclass('public.character_flags') is not null and exists (select 1 from public.character_flags f
       where f.user_id = p_user and f.reason in ('stufe', 'gold', 'grenze') and f.created_at > now() - interval '7 days') then
    return 'blocked';
  end if;
  insert into public.market_rate as m (user_id, minute, n, hour, listed)
    values (p_user, mi, 1, hr, case when p_kind = 'list' then 1 else 0 end)
  on conflict (user_id) do update set
    n = case when m.minute = mi then m.n + 1 else 1 end, minute = mi,
    listed = case when m.hour = hr then m.listed else 0 end + case when p_kind = 'list' then 1 else 0 end, hour = hr
  returning * into r;
  if r.n > 40 or (p_kind = 'list' and r.listed > 60) then return 'rate'; end if;
  return null;
end $$;

create or replace function public.market_fee(p_price bigint) returns bigint
language sql immutable set search_path = '' as $$ select floor(p_price * ${FEE_RATE})::bigint; $$;

-- Shop-Gold dieses Charakters wie characters_shop_gold (20261010090000_sicherheit_2.sql), für die market_*-Funktionen.
create or replace function public.market_shop_gold(p_user uuid, p_character text) returns bigint
language plpgsql stable set search_path = '' as $$
declare g numeric := 0;
begin
  if to_regclass('public.gold_orders') is null then return 0; end if;
  execute 'select coalesce(sum(case when status in (''paid'', ''credited'') then gold else -gold end), 0)
             from public.gold_orders where user_id = $1 and character_id = $2
              and (status in (''paid'', ''credited'')
                   or (status in (''refunded'', ''disputed'') and (delivered_at is not null or credited_at is not null)))'
    into g using p_user, p_character;
  return greatest(0, floor(g))::bigint;
end $$;

-- Goldrahmen für den Handel: geprüfte Spielzeit + Shop-Gold (ohne Freibetrag neuer Charaktere).
create or replace function public.market_gold_frame(c public.characters) returns bigint
language sql stable set search_path = '' as $$
  select floor(${GOLD_PER_SECOND} * greatest(0, coalesce(c.play_verified, 0)))::bigint + public.market_shop_gold(c.user_id, c.id);
$$;

-- Darf dieser Charakter handeln? null = ja, sonst Fehlercode.
create or replace function public.market_eligible(c public.characters) returns text
language plpgsql stable set search_path = '' as $$
declare lvl int;
begin
  begin lvl := coalesce(floor((c.snapshot #>> '{slices,progress,level}')::numeric), 1)::int;
  exception when others then lvl := 0; end;
  if lvl < ${TRADE_MIN_LEVEL} or coalesce(c.play_verified, 0) < ${TRADE_MIN_PLAY} then return 'young'; end if;
  return null;
end $$;

-- Konto für den Handel anlegen und sperren (gleichzeitige Käufe verschiedener Charaktere laufen nacheinander).
create or replace function public.market_account(p_user uuid) returns public.market_accounts
language plpgsql set search_path = '' as $$
declare a public.market_accounts;
begin
  insert into public.market_accounts (user_id) values (p_user) on conflict do nothing;
  select * into a from public.market_accounts where user_id = p_user for update;
  return a;
end $$;

-- Handelszeit des Kontos in Sekunden: geprüfte Spielzeit aller Charaktere, höchstens ${DAY_CAP} je Tag seit Beginn.
-- p_advance: mit ${START_DAYS} Tagen Vorschuss (Goldrahmen); das Kontingent für eigene Beute wächst erst ab dem ersten
-- vollen Handelstag (Wegwerfkonten mit vielen Charakteren bekommen am ersten Tag nur den Grundbetrag).
create or replace function public.market_trade_time(a public.market_accounts, p_advance boolean default true) returns bigint
language sql stable set search_path = '' as $$
  select least(coalesce((select sum(greatest(0, coalesce(c.play_verified, 0))) from public.characters c where c.user_id = a.user_id), 0),
               ${DAY_CAP}::numeric * (greatest(0, current_date - a.started) + case when p_advance then ${START_DAYS} else 0 end))::bigint;
$$;

-- Goldrahmen des Kontos: Handelszeit + Shop-Gold aller Charaktere (ohne Freibetrag neuer Charaktere).
create or replace function public.market_account_frame(a public.market_accounts) returns bigint
language sql stable set search_path = '' as $$
  select ${GOLD_PER_SECOND} * public.market_trade_time(a)
    + coalesce((select sum(public.market_shop_gold(c.user_id, c.id)) from public.characters c where c.user_id = a.user_id), 0)::bigint;
$$;

-- Darf das Konto noch need Gold ausgeben? Ausgaben minus Einnahmen (net, auch negativ) bleiben im Rahmen.
create or replace function public.market_can_spend(p_user uuid, p_need bigint) returns boolean
language plpgsql set search_path = '' as $$
declare a public.market_accounts := public.market_account(p_user);
begin
  return p_need <= public.market_account_frame(a) + a.net;
end $$;

create or replace function public.market_own_add(p_user uuid, p_char text, p_item text, p_qty int) returns void
language sql set search_path = '' as $$
  insert into public.market_owned as o (user_id, character_id, item_id, qty) values (p_user, p_char, p_item, greatest(0, p_qty))
    on conflict (user_id, character_id, item_id) do update set qty = least(1000000, o.qty + greatest(0, p_qty));
$$;

-- Abgelaufene Angebote abschließen: Höchstbietende gewinnen, Verkäufer bekommen den Erlös (minus Gebühr),
-- ohne Gebot geht der Gegenstand zurück. Alles landet im Postfach. p_user: zuerst die Angebote dieses Kontos.
create or replace function public.market_settle(p_limit int default 50, p_user uuid default null) returns int
language plpgsql set search_path = '' as $$
declare l public.market_listings; n int := 0;
begin
  for l in select * from public.market_listings
      where status = 'active' and ends_at <= now() and (p_user is null or seller_user = p_user or bidder_user = p_user)
      order by ends_at limit p_limit for update skip locked loop
    if l.bid is not null then
      update public.market_listings set status = 'sold', price = l.bid, closed_at = now() where id = l.id;
      if l.bidder_user is not null then
        insert into public.market_mail (user_id, character_id, kind, item_id, qty, listing_id)
          values (l.bidder_user, l.bidder_char, 'won', l.item_id, l.qty, l.id);
      end if;
      if l.seller_user is not null then
        insert into public.market_mail (user_id, character_id, kind, gold, listing_id)
          values (l.seller_user, l.seller_char, 'sold', l.bid - public.market_fee(l.bid), l.id);
      end if;
    else
      update public.market_listings set status = 'expired', closed_at = now() where id = l.id;
      if l.seller_user is not null then
        insert into public.market_mail (user_id, character_id, kind, item_id, qty, learned, listing_id)
          values (l.seller_user, l.seller_char, 'expired', l.item_id, l.qty, l.learned, l.id);
      end if;
    end if;
    n := n + 1;
  end loop;
  -- Aufräumen (selten): abgeholte Post und abgeschlossene Angebote nach 30 Tagen.
  if p_user is null and random() < 0.05 then
    delete from public.market_mail where collected_at < now() - interval '30 days';
    delete from public.market_listings where status <> 'active' and closed_at < now() - interval '30 days';
  end if;
  return n;
end $$;

create or replace function public.market_err(p_code text) returns jsonb
language sql immutable set search_path = '' as $$ select jsonb_build_object('ok', false, 'error', p_code); $$;

-- Gegenstand in den Spielstand oder, wenn kein Platz ist, ins Postfach. -> { snap, add|learn|mailed }
create or replace function public.market_deliver(p_user uuid, p_char text, p_snap jsonb, p_item text, p_qty int, p_learned boolean,
  p_kind text, p_listing bigint) returns jsonb
language plpgsql set search_path = '' as $$
declare it public.market_items; s jsonb;
begin
  select * into it from public.market_items where id = p_item;
  if p_learned and p_item like 'mount\\_%' then
    s := public.market_snap_learn_mount(p_snap, substr(p_item, 7));
    if s is not null then
      perform public.market_own_add(p_user, p_char, p_item, 1);
      return jsonb_build_object('snap', s, 'learn', substr(p_item, 7));
    end if;
  end if;
  if it.id is not null then
    s := public.market_snap_give(p_snap, p_item, p_qty, it.stack, it.category = 'material');
    if s is not null then
      perform public.market_own_add(p_user, p_char, p_item, p_qty);
      return jsonb_build_object('snap', s, 'add', jsonb_build_object('itemId', p_item, 'qty', p_qty));
    end if;
  end if;
  insert into public.market_mail (user_id, character_id, kind, item_id, qty, learned, listing_id)
    values (p_user, p_char, p_kind, p_item, p_qty, p_learned, p_listing);
  return jsonb_build_object('snap', p_snap, 'mailed', true);
end $$;

-- ------------------------------------------------------------------ Für das Spiel
-- Einstellen: aus der Tasche (oder ein gelerntes Reittier, p_mount) mit Startgebot und/oder Sofortkaufpreis.
create or replace function public.market_list(p_character text, p_item text, p_qty int, p_start_bid bigint, p_buyout bigint,
  p_hours int, p_mount boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e text; c public.characters; it public.market_items; snap jsonb; lid bigint; r jsonb;
  acc public.market_accounts; own int; use_ int; cost int; lvl int;
begin
  e := public.market_guard(uid, 'list');
  if e is not null then return public.market_err(e); end if;
  select * into c from public.characters where user_id = uid and id = p_character for update;
  if not found then return public.market_err('character'); end if;
  e := public.market_eligible(c);
  if e is not null then return public.market_err(e); end if;
  select * into it from public.market_items where id = p_item;
  if not found then return public.market_err('item'); end if;
  if p_hours is null or not (p_hours = any (array[${DURATIONS.join(', ')}])) then return public.market_err('hours'); end if;
  if p_start_bid is null and p_buyout is null then return public.market_err('price'); end if;
  if coalesce(p_start_bid, 1) not between 1 and ${PRICE_MAX} or coalesce(p_buyout, 1) not between 1 and ${PRICE_MAX}
     or (p_start_bid is not null and p_buyout is not null and p_buyout < p_start_bid) then return public.market_err('price'); end if;
  if p_qty is null or p_qty < 1 or p_qty > it.stack or (p_mount and (p_qty <> 1 or it.category <> 'mount')) then
    return public.market_err('qty');
  end if;
  if (select count(*) from public.market_listings l where l.seller_user = uid and l.status = 'active') >= ${MAX_ACTIVE} then
    return public.market_err('limit');
  end if;
  if p_mount then snap := public.market_snap_forget_mount(c.snapshot, substr(p_item, 7));
  else snap := public.market_snap_take(c.snapshot, p_item, p_qty, it.category = 'material'); end if;
  if snap is null then return public.market_err('missing'); end if;
  -- Herkunft: zuerst Bestand aus dem Auktionshaus, sonst eigene Beute (Stufe passt, Kontingent reicht).
  acc := public.market_account(uid);
  own := coalesce((select o.qty from public.market_owned o where o.user_id = uid and o.character_id = p_character
    and o.item_id = p_item for update), 0);
  use_ := least(own, p_qty);
  if use_ < p_qty then
    lvl := coalesce(floor((c.snapshot #>> '{slices,progress,level}')::numeric), 1)::int;
    if it.req_level > lvl + ${LEVEL_SLACK} then return public.market_err('level'); end if;
    -- Kontingent nach Seltenheit und Menge (Stapel ab selten je angefangene 5 Stück, darunter je angefangene 10)
    cost := (array[${freshCost.join(', ')}])[it.rarity + 1] * greatest(1, ceil((p_qty - use_)::numeric / case when it.rarity >= 2 then 5 else 10 end))::int;
    if acc.fresh + cost > ${FRESH_BASE} + ${FRESH_PER_HOUR} * floor(public.market_trade_time(acc, false) / 3600) then
      return public.market_err('budget');
    end if;
    update public.market_accounts set fresh = fresh + cost where user_id = uid;
  end if;
  if use_ > 0 then
    update public.market_owned set qty = qty - use_ where user_id = uid and character_id = p_character and item_id = p_item;
  end if;
  insert into public.market_listings (seller_user, seller_char, item_id, qty, learned, category, rarity, req_level, classes,
      start_bid, buyout, ends_at)
    values (uid, p_character, p_item, p_qty, p_mount, it.category, it.rarity, it.req_level, it.classes,
      p_start_bid, p_buyout, now() + p_hours * interval '1 hour')
    returning id into lid;
  r := public.market_commit(uid, p_character, snap, 0);
  return r || jsonb_build_object('listing', lid,
    'remove', case when p_mount then '[]'::jsonb else jsonb_build_array(jsonb_build_object('itemId', p_item, 'qty', p_qty)) end,
    'forgetMount', case when p_mount then to_jsonb(substr(p_item, 7)) else 'null'::jsonb end);
end $$;

-- Bieten: Gold wird sofort abgezogen (bei eigenem Höchstgebot nur die Differenz). Überbotene bekommen ihr Gold ins Postfach.
-- Gebote kurz vor Schluss verlängern auf 2 Minuten Restzeit.
create or replace function public.market_bid(p_character text, p_listing bigint, p_amount bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e text; c public.characters; l public.market_listings; need bigint; snap jsonb; g bigint;
begin
  e := public.market_guard(uid, 'bid');
  if e is not null then return public.market_err(e); end if;
  select * into c from public.characters where user_id = uid and id = p_character for update;
  if not found then return public.market_err('character'); end if;
  e := public.market_eligible(c);
  if e is not null then return public.market_err(e); end if;
  select * into l from public.market_listings where id = p_listing for update;
  if not found or l.status <> 'active' or l.ends_at <= now() then return public.market_err('gone'); end if;
  if l.start_bid is null then return public.market_err('nobid'); end if;
  if l.seller_user = uid then return public.market_err('own'); end if;
  if p_amount is null or p_amount > ${PRICE_MAX} then return public.market_err('price'); end if;
  if l.bid is null and p_amount < l.start_bid then return public.market_err('low'); end if;
  if l.bid is not null and p_amount < l.bid + greatest(1, ceil(l.bid * ${BID_STEP})) then return public.market_err('low'); end if;
  if l.buyout is not null and p_amount >= l.buyout then return public.market_err('buyout'); end if;
  need := case when l.bidder_user = uid and l.bidder_char = p_character then p_amount - l.bid else p_amount end;
  g := public.market_snap_gold(c.snapshot);
  if g < need then return public.market_err('gold'); end if;
  if not public.market_can_spend(uid, need) then return public.market_err('frame'); end if;
  snap := public.market_snap_set_gold(c.snapshot, g - need);
  if l.bid is not null and l.bidder_user is not null and not (l.bidder_user = uid and l.bidder_char = p_character) then
    insert into public.market_mail (user_id, character_id, kind, gold, listing_id) values (l.bidder_user, l.bidder_char, 'outbid', l.bid, l.id);
  end if;
  update public.market_listings set bid = p_amount, bidder_user = uid, bidder_char = p_character, bids = bids + 1,
    ends_at = greatest(ends_at, now() + interval '2 minutes') where id = l.id;
  return public.market_commit(uid, p_character, snap, -need) || jsonb_build_object('listing', l.id);
end $$;

-- Sofort kaufen: Gold ab, Gegenstand ins Postfach des Käufers, Erlös ins Postfach des Verkäufers.
create or replace function public.market_buyout(p_character text, p_listing bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e text; c public.characters; l public.market_listings; need bigint; snap jsonb; g bigint; mine boolean;
begin
  e := public.market_guard(uid, 'buy');
  if e is not null then return public.market_err(e); end if;
  select * into c from public.characters where user_id = uid and id = p_character for update;
  if not found then return public.market_err('character'); end if;
  e := public.market_eligible(c);
  if e is not null then return public.market_err(e); end if;
  select * into l from public.market_listings where id = p_listing for update;
  if not found or l.status <> 'active' or l.ends_at <= now() then return public.market_err('gone'); end if;
  if l.buyout is null then return public.market_err('nobuyout'); end if;
  if l.seller_user = uid then return public.market_err('own'); end if;
  mine := l.bid is not null and l.bidder_user = uid and l.bidder_char = p_character;
  need := l.buyout - case when mine then l.bid else 0 end;
  g := public.market_snap_gold(c.snapshot);
  if g < need then return public.market_err('gold'); end if;
  if not public.market_can_spend(uid, need) then return public.market_err('frame'); end if;
  snap := public.market_snap_set_gold(c.snapshot, g - need);
  if l.bid is not null and l.bidder_user is not null and not mine then
    insert into public.market_mail (user_id, character_id, kind, gold, listing_id) values (l.bidder_user, l.bidder_char, 'outbid', l.bid, l.id);
  end if;
  update public.market_listings set status = 'sold', price = l.buyout, bidder_user = uid, bidder_char = p_character, closed_at = now()
    where id = l.id;
  if l.seller_user is not null then
    insert into public.market_mail (user_id, character_id, kind, gold, listing_id)
      values (l.seller_user, l.seller_char, 'sold', l.buyout - public.market_fee(l.buyout), l.id);
  end if;
  insert into public.market_mail (user_id, character_id, kind, item_id, qty, listing_id)
    values (uid, p_character, 'bought', l.item_id, l.qty, l.id);
  return public.market_commit(uid, p_character, snap, -need) || jsonb_build_object('listing', l.id, 'mailed', true);
end $$;

-- Zurückziehen (nur ohne Gebot): Gegenstand zurück in die Tasche bzw. als gelerntes Reittier, sonst ins Postfach.
create or replace function public.market_cancel(p_character text, p_listing bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e text; c public.characters; l public.market_listings; d jsonb;
begin
  e := public.market_guard(uid, 'cancel');
  if e is not null then return public.market_err(e); end if;
  select * into c from public.characters where user_id = uid and id = p_character for update;
  if not found then return public.market_err('character'); end if;
  select * into l from public.market_listings where id = p_listing for update;
  if not found or l.seller_user is distinct from uid or l.seller_char <> p_character then return public.market_err('gone'); end if;
  if l.status <> 'active' or l.ends_at <= now() then return public.market_err('gone'); end if;
  if l.bid is not null then return public.market_err('bids'); end if;
  update public.market_listings set status = 'cancelled', closed_at = now() where id = l.id;
  d := public.market_deliver(uid, p_character, c.snapshot, l.item_id, l.qty, l.learned, 'cancelled', l.id);
  return public.market_commit(uid, p_character, d -> 'snap', 0) || (d - 'snap') || jsonb_build_object('listing', l.id);
end $$;

-- Abholen: alles aus dem Postfach (src/mail/mailSql.mjs, 20261011150000_postfach.sql legt mail_take an).
create or replace function public.market_collect(p_character text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return public.mail_take(p_character, null);
end $$;

-- Angebote durchsuchen. p_items: nur diese Gegenstände (Namenssuche macht das Spiel), p_class: nur für diese Klasse nutzbar.
-- p_sort: 'new' | 'price' | 'ending'. Liefert höchstens ${PAGE} + 1 Zeilen (eine mehr = es gibt eine weitere Seite).
create or replace function public.market_browse(p_character text, p_category text default null, p_min_rarity int default 0,
  p_max_level int default null, p_class text default null, p_items text[] default null, p_sort text default 'new', p_offset int default 0)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); out_ jsonb; e text;
begin
  e := public.market_guard(uid, 'look');
  if e is not null then return public.market_err(e); end if;
  perform public.market_settle(50);
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'itemId', x.item_id, 'qty', x.qty, 'startBid', x.start_bid,
      'buyout', x.buyout, 'bid', x.bid, 'bids', x.bids, 'endsAt', x.ends_at, 'mine', x.seller_user = uid,
      'top', x.bidder_user = uid and x.bidder_char = p_character) order by x.rn), '[]'::jsonb)
    into out_
    from (select l.*, row_number() over (order by
            case when p_sort = 'price' then coalesce(l.buyout, l.bid, l.start_bid) end asc,
            case when p_sort = 'ending' then l.ends_at end asc,
            l.created_at desc, l.id desc) rn
          from public.market_listings l
          where l.status = 'active' and l.ends_at > now()
            and (p_category is null or l.category = p_category)
            and l.rarity >= coalesce(p_min_rarity, 0)
            and (p_max_level is null or l.req_level <= p_max_level)
            and (p_class is null or l.classes is null or p_class = any (l.classes))
            and (p_items is null or l.item_id = any (p_items))
          order by rn offset greatest(0, coalesce(p_offset, 0)) limit ${PAGE + 1}) x;
  return jsonb_build_object('ok', true, 'rows', out_, 'now', now());
end $$;

-- Eigene Angebote, eigene Höchstgebote und das Postfach dieses Charakters.
create or replace function public.market_overview(p_character text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); mine jsonb; bids jsonb; mail jsonb; e text;
begin
  e := public.market_guard(uid, 'look');
  if e is not null then return public.market_err(e); end if;
  perform public.market_settle(50, uid);
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'itemId', l.item_id, 'qty', l.qty, 'startBid', l.start_bid,
      'buyout', l.buyout, 'bid', l.bid, 'bids', l.bids, 'endsAt', l.ends_at, 'learned', l.learned) order by l.ends_at), '[]'::jsonb)
    into mine from public.market_listings l where l.seller_user = uid and l.seller_char = p_character and l.status = 'active';
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'itemId', l.item_id, 'qty', l.qty, 'startBid', l.start_bid,
      'buyout', l.buyout, 'bid', l.bid, 'bids', l.bids, 'endsAt', l.ends_at, 'top', true) order by l.ends_at), '[]'::jsonb)
    into bids from public.market_listings l where l.bidder_user = uid and l.bidder_char = p_character and l.status = 'active';
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'itemId', m.item_id, 'qty', m.qty, 'gold', m.gold,
      'learned', m.learned, 'at', m.created_at, 'about', l.item_id, 'aboutQty', l.qty) order by m.id), '[]'::jsonb)
    into mail from public.market_mail m left join public.market_listings l on l.id = m.listing_id where m.user_id = uid and m.character_id = p_character and m.collected_at is null;
  return jsonb_build_object('ok', true, 'mine', mine, 'bids', bids, 'mail', mail, 'now', now());
end $$;

-- ------------------------------------------------------------------ Spielstand-Prüfung beim Hochladen
-- Für den Trigger (läuft mit der Rolle des Spielers): Buchungszähler. Direkter Aufruf wird abgewiesen.
create or replace function public.characters_market_seq(p_user uuid, p_character text) returns bigint
language plpgsql stable security definer set search_path = '' as $$
begin
  if pg_trigger_depth() < 1 then raise exception 'nicht erlaubt' using errcode = '42501'; end if;
  return (select m.seq from public.market_chars m where m.user_id = p_user and m.character_id = p_character);
end $$;

-- Spielstand mit anderem Buchungszähler als der Server: nicht schreiben (das Spiel lädt den Cloud-Stand).
-- Gleichheit statt »mindestens«: ein erfundener hoher Zähler hilft nicht.
create or replace function public.characters_market_check() returns trigger
language plpgsql set search_path = '' as $$
declare want bigint; have bigint;
begin
  -- Buchung des Auktionshauses (market_commit): updated_at nicht vorstellen, sonst rechnet characters_plausible beim
  -- nächsten Upload nur die Sekunden seit der Buchung als Spielzeit an.
  if tg_op = 'UPDATE' and current_user <> 'authenticated' and current_setting('emberwrath.market', true) = '1' then
    new.updated_at := old.updated_at;
    return new;
  end if;
  if current_user <> 'authenticated' or tg_op <> 'UPDATE' then return new; end if;
  want := public.characters_market_seq(old.user_id, old.id);
  if want is null then return new; end if;
  begin have := coalesce(floor((new.snapshot #>> '{slices,market,seq}')::numeric), 0)::bigint;
  exception when others then have := -1; end;
  if have = want then return new; end if;
  perform public.characters_flag(old.user_id, old.id, 'handel', jsonb_build_object('seq', jsonb_build_array(want, have)));
  return null;
end $$;
drop trigger if exists characters_market_check on public.characters;
-- Name nach characters_before_write und vor characters_plausible (gleichartige Trigger laufen alphabetisch).
-- characters_plausible bleibt unverändert: Gold aus dem Auktionshaus hebt die Gold-Obergrenze nicht an.
create trigger characters_market_check before update on public.characters
  for each row execute function public.characters_market_check();

-- Vermerke: höchstens einer je Minute und Konto wie bisher (20261005090000_sicherheit_spielstand.sql), aber 'handel'
-- (Auktionshaus) zählt getrennt. Sonst unterdrückte ein absichtlich abgelehnter alter Spielstand den Gold-/Stufen-Vermerk.
create or replace function public.characters_flag(p_user uuid, p_character text, p_reason text, p_detail jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() < 1 then raise exception 'nicht erlaubt' using errcode = '42501'; end if;
  if (select auth.uid()) is not null and p_user is distinct from (select auth.uid()) then
    raise exception 'nicht erlaubt' using errcode = '42501';
  end if;
  if exists (select 1 from public.character_flags f where f.user_id = p_user and f.created_at > now() - interval '1 minute'
             and (f.reason = 'handel') = (p_reason = 'handel')) then
    return;
  end if;
  insert into public.character_flags (user_id, character_id, reason, detail) values (p_user, left(p_character, 64), p_reason, p_detail);
end $$;
revoke execute on function public.characters_flag(uuid, text, text, jsonb) from public, anon;
grant execute on function public.characters_flag(uuid, text, text, jsonb) to authenticated;

-- ------------------------------------------------------------------ Rechte
-- Interne Bausteine: niemand von außen.
revoke execute on function public.market_snap_count(jsonb, text, boolean) from public, anon, authenticated;
revoke execute on function public.market_snap_take(jsonb, text, int, boolean) from public, anon, authenticated;
revoke execute on function public.market_snap_give(jsonb, text, int, int, boolean) from public, anon, authenticated;
revoke execute on function public.market_snap_gold(jsonb) from public, anon, authenticated;
revoke execute on function public.market_snap_set_gold(jsonb, bigint) from public, anon, authenticated;
revoke execute on function public.market_snap_forget_mount(jsonb, text) from public, anon, authenticated;
revoke execute on function public.market_snap_learn_mount(jsonb, text) from public, anon, authenticated;
revoke execute on function public.market_commit(uuid, text, jsonb, bigint) from public, anon, authenticated;
revoke execute on function public.market_guard(uuid, text) from public, anon, authenticated;
revoke execute on function public.market_fee(bigint) from public, anon, authenticated;
revoke execute on function public.market_shop_gold(uuid, text) from public, anon, authenticated;
revoke execute on function public.market_gold_frame(public.characters) from public, anon, authenticated;
revoke execute on function public.market_eligible(public.characters) from public, anon, authenticated;
revoke execute on function public.market_account(uuid) from public, anon, authenticated;
revoke execute on function public.market_trade_time(public.market_accounts, boolean) from public, anon, authenticated;
revoke execute on function public.market_account_frame(public.market_accounts) from public, anon, authenticated;
revoke execute on function public.market_can_spend(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.market_own_add(uuid, text, text, int) from public, anon, authenticated;
revoke execute on function public.market_settle(int, uuid) from public, anon, authenticated;
revoke execute on function public.market_err(text) from public, anon, authenticated;
revoke execute on function public.market_deliver(uuid, text, jsonb, text, int, boolean, text, bigint) from public, anon, authenticated;
revoke execute on function public.characters_market_check() from public, anon, authenticated;
-- Für den Trigger (prüft pg_trigger_depth selbst):
revoke execute on function public.characters_market_seq(uuid, text) from public, anon;
grant execute on function public.characters_market_seq(uuid, text) to authenticated;
-- Für das Spiel (angemeldete Spieler):
revoke execute on function public.market_list(text, text, int, bigint, bigint, int, boolean) from public, anon;
revoke execute on function public.market_bid(text, bigint, bigint) from public, anon;
revoke execute on function public.market_buyout(text, bigint) from public, anon;
revoke execute on function public.market_cancel(text, bigint) from public, anon;
revoke execute on function public.market_collect(text) from public, anon;
revoke execute on function public.market_browse(text, text, int, int, text, text[], text, int) from public, anon;
revoke execute on function public.market_overview(text) from public, anon;
grant execute on function public.market_list(text, text, int, bigint, bigint, int, boolean) to authenticated;
grant execute on function public.market_bid(text, bigint, bigint) to authenticated;
grant execute on function public.market_buyout(text, bigint) to authenticated;
grant execute on function public.market_cancel(text, bigint) to authenticated;
grant execute on function public.market_collect(text) to authenticated;
grant execute on function public.market_browse(text, text, int, int, text, text[], text, int) to authenticated;
grant execute on function public.market_overview(text) to authenticated;

-- PostgREST: neue Funktionen sofort bekannt machen.
notify pgrst, 'reload schema';
`;
}

if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(marketSql());
