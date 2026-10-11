// Erzeugt die Datenbank-Migration des Postfachs (src/mail/rules.js, Handelsregeln aus src/market/). Nicht Teil des Spiels.
//
//   node src/mail/mailSql.mjs > supabase/migrations/20261011150000_postfach.sql
//
// Baut auf dem Auktionshaus auf (20261011090000_auktionshaus.sql): dieselbe Tabelle market_mail, derselbe
// Buchungszähler, Goldrahmen und dasselbe Handelskontingent. market_buyout steht in src/market/marketSql.mjs und wird
// hier unverändert übernommen (Kauf landet im Postfach).
import { KEEP_DAYS, SEND_PER_HOUR, LOOKUP_PER_MINUTE, BOX_MAX, PAIR_MAX, GOLD_MAX, LOOT_MAX, LOOT_ITEMS_MAX, LOOT_GOLD_MAX } from './rules.js';
import { LEVEL_SLACK, FRESH_COST, FRESH_BASE, FRESH_PER_HOUR } from '../market/rules.js';
import { RARITY_ORDER } from '../progression/items.js';
import { marketSql } from '../market/marketSql.mjs';

// Funktion aus der Auktionshaus-Migration (gleicher Text, damit beide Dateien dasselbe festlegen)
function fromMarket(name) {
  const src = marketSql();
  const a = src.indexOf(`create or replace function public.${name}(`);
  if (a < 0) throw new Error(`${name} fehlt in marketSql.mjs`);
  return src.slice(a, src.indexOf('end $$;', a) + 7);
}

export function mailSql() {
  const freshCost = RARITY_ORDER.map((r) => FRESH_COST[r] ?? 1);
  return `-- Emberwrath: Postfach in jeder Stadt. Einmal im Supabase-SQL-Editor ausführen,
-- NACH allen bisherigen Migrationen (zuletzt 20261011120000_dolche_nur_schurke.sql) und NACH der aktuellen
-- 20261011090000_auktionshaus.sql. Mehrfach ausführbar.
-- Erzeugt mit: node src/mail/mailSql.mjs (Regeln: src/mail/rules.js, Handel: src/market/rules.js).
--
-- Was im Postfach landet (Tabelle market_mail, vorher das Abholfach des Auktionshauses):
--  - Auktionshaus: Erlöse, ersteigerte und gekaufte Ware (Sofortkauf jetzt immer per Post), Rückgaben, überbotene Gebote.
--    Diese Post verfällt nie.
--  - Briefe von Spielern (kind 'letter'): Gold und/oder ein Gegenstand. Bewusst ohne Absicherung (keine Nachnahme,
--    kein Zurückholen durch den Absender). Nach ${KEEP_DAYS} Tagen geht ein Brief einmal zurück an den Absender
--    (kind 'returned', verfällt nicht); der Empfänger kann ihn auch selbst zurückschicken (mail_return).
--    Gibt es den Absender nicht mehr, bleibt der Brief beim Empfänger.
--
-- Sicherheitsmodell: Senden ist für die Datenbank dasselbe wie ein Handel im Auktionshaus.
--  - mail_send prüft erst alles und schreibt dann in einer Transaktion: Charakter gesperrt (FOR UPDATE), Gold und
--    Gegenstand aus dem gespeicherten Spielstand, Brief, Buchungszähler (market_chars.seq) wie beim Auktionshaus.
--    Ein Gegenstand kann deshalb nur einmal verschickt werden, ein älterer Spielstand (zweites Fenster) wird abgelehnt.
--  - Gold: nur im Goldrahmen des Kontos (market_can_spend, wie Bieten/Kaufen). Empfangenes Gold kommt nur bis zum
--    Goldrahmen des Empfängers in den Spielstand (wie Erlöse, auch teilweise), der Rest bleibt im Postfach und verfällt
--    nicht.
--  - Gegenstände: nur Handelbares (market_items, nie Shop-Designs). Herkunft wie beim Einstellen: Bestand aus dem Handel
--    (market_owned) ist frei, eigene Beute kostet Handelskontingent und darf höchstens ${LEVEL_SLACK} Stufen über dem
--    Charakter liegen – auch an eigene Charaktere, sonst ließe sich Beute über die Post »waschen«. Abgeholte Briefe
--    zählen beim Empfänger als Bestand.
--  - Senden und Empfangen ab Stufe/Spielzeit wie im Auktionshaus, Senden nicht mit Schummel-Vermerk. Höchstens
--    ${SEND_PER_HOUR} Briefe je Stunde und Konto, ${PAIR_MAX} offene Briefe eines Kontos an denselben Empfänger und
--    ${BOX_MAX} offene Spielerbriefe je Empfänger (gezählt unter Sperre auf den Empfänger; Briefe, die wegen des
--    Goldrahmens beim Empfänger festliegen, zählen nicht).
--  - Empfänger per Charaktername (Groß-/Kleinschreibung egal). Charakternamen ändern sich per Upload nicht mehr
--    (characters_post_check). Heißen mehrere so, gilt der älteste Charakter, der Post empfangen darf: ein später
--    angelegter Doppelgänger fängt keine Briefe ab. mail_lookup liefert eine Empfängerkennung (mail_keys), mail_send
--    verlangt sie und lehnt ab, wenn der Name inzwischen auf jemand anderen zeigt. Konto-IDs verlassen die Datenbank nie.
--  - Post eines gelöschten Charakters wird gelöscht; ein neuer Charakter mit derselben ID erbt nichts (auch keine Post,
--    die älter ist als er).
--  - Bossbeute, die liegen blieb, bewahrt das Spiel im eigenen Spielstand auf (slices.mail.loot), nicht hier: sie
--    entsteht im Browser wie jede Beute (offener Punkt D3) und bekommt deshalb keinen Bestand. characters_post_check
--    begrenzt sie (${LOOT_MAX} Briefe, ${LOOT_ITEMS_MAX} Teile je Brief, Mengen 1–999, Gold bis ${LOOT_GOLD_MAX}), neue
--    Charaktere haben keine, und Gold darin zählt zur Gold-Obergrenze der Spielstandprüfung.

-- Reihenfolge: das Postfach baut auf dem Auktionshaus auf.
do $$
begin
  if to_regclass('public.market_mail') is null then
    raise exception 'Zuerst 20261011090000_auktionshaus.sql ausführen, danach diese Datei (20261011150000_postfach.sql).';
  end if;
end $$;

-- ------------------------------------------------------------------ Tabellen
alter table public.market_mail drop constraint if exists market_mail_kind_check;
alter table public.market_mail add constraint market_mail_kind_check
  check (kind in ('sold', 'won', 'bought', 'outbid', 'expired', 'cancelled', 'letter', 'returned'));
alter table public.market_mail add column if not exists from_user uuid references auth.users (id) on delete set null;
alter table public.market_mail add column if not exists from_char text;
alter table public.market_mail add column if not exists from_name text check (from_name is null or char_length(from_name) <= 40);
-- Verfall nur für Spielerbriefe (null = verfällt nicht)
alter table public.market_mail add column if not exists expires_at timestamptz;
alter table public.market_mail alter column expires_at drop not null;
alter table public.market_mail alter column expires_at drop default;
update public.market_mail set expires_at = null where kind <> 'letter' and expires_at is not null;
drop index if exists public.market_mail_letters;
create index if not exists market_mail_to on public.market_mail (user_id, character_id) where collected_at is null and kind = 'letter';
create index if not exists market_mail_pair on public.market_mail (from_user, user_id, character_id) where collected_at is null and kind = 'letter';
drop index if exists public.market_mail_expiry;
create index if not exists market_mail_due on public.market_mail (expires_at) where collected_at is null and expires_at is not null;

alter table public.market_rate add column if not exists sent int not null default 0;
alter table public.market_rate add column if not exists sent_hour timestamptz;
alter table public.market_rate add column if not exists lookups int not null default 0;
alter table public.market_rate add column if not exists lookup_minute timestamptz;

-- Empfängerkennung: zufällig, je Charakter fest, verschwindet mit dem Charakter.
create table if not exists public.mail_keys (
  key          uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  character_id text not null,
  unique (user_id, character_id),
  foreign key (user_id, character_id) references public.characters (user_id, id) on delete cascade
);
alter table public.mail_keys enable row level security;
revoke all on public.mail_keys from anon, authenticated;
grant select, insert, update, delete on public.mail_keys to service_role;

-- Empfänger nach Namen finden
create index if not exists characters_name_lower on public.characters (lower(name));

-- ------------------------------------------------------------------ Bausteine
-- Empfänger: Charakter mit diesem Namen; bei mehreren zuerst wer Post empfangen darf, dann der älteste.
create or replace function public.mail_recipient(p_name text) returns public.characters
language sql stable set search_path = '' as $$
  select c.* from public.characters c where lower(c.name) = lower(btrim(p_name))
    order by (public.market_eligible(c) is null) desc, c.created_at, c.id limit 1;
$$;

-- Post, die einem Charakter gehört: an ihn gerichtet und nicht älter als er (gleiche ID nach Löschen erbt nichts).
create or replace function public.mail_mine(m public.market_mail, c public.characters) returns boolean
language sql stable set search_path = '' as $$
  select m.user_id = c.user_id and m.character_id = c.id and m.collected_at is null and m.created_at >= c.created_at;
$$;

-- Absender eines Briefs, falls es ihn noch gibt (und er nicht nach dem Brief neu angelegt wurde).
create or replace function public.mail_sender(m public.market_mail) returns public.characters
language sql stable set search_path = '' as $$
  select c.* from public.characters c where c.user_id = m.from_user and c.id = m.from_char and c.created_at <= m.created_at;
$$;

-- Brief zurück an den Absender (Art 'returned', verfällt nicht, geht nie wieder zurück). false = kein Absender mehr.
create or replace function public.mail_bounce(m public.market_mail, p_by text) returns boolean
language plpgsql set search_path = '' as $$
declare s public.characters := public.mail_sender(m);
begin
  if s.id is null then return false; end if;
  insert into public.market_mail (user_id, character_id, kind, item_id, qty, gold, from_name)
    values (s.user_id, s.id, 'returned', m.item_id, m.qty, m.gold, left(p_by, 40));
  update public.market_mail set collected_at = now() where id = m.id;
  return true;
end $$;

-- Abgelaufene Spielerbriefe: einmal zurück an den Absender; gibt es ihn nicht mehr, bleiben sie beim Empfänger.
create or replace function public.mail_expire(p_limit int default 50) returns int
language plpgsql set search_path = '' as $$
declare m public.market_mail; n int := 0;
begin
  for m in select * from public.market_mail where collected_at is null and expires_at is not null and expires_at <= now()
      order by expires_at limit p_limit for update skip locked loop
    if m.kind <> 'letter' or not public.mail_bounce(m, (select c.name from public.characters c
        where c.user_id = m.user_id and c.id = m.character_id)) then
      update public.market_mail set expires_at = null where id = m.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Gelöschter Charakter: seine Post, sein Bestand und sein Buchungszähler gehen mit; Briefe von ihm gelten als ohne
-- Absender (kein Zurückschicken an einen neuen Charakter mit derselben ID).
create or replace function public.characters_mail_cleanup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.market_mail where user_id = old.user_id and character_id = old.id;
  update public.market_mail set from_char = null where from_user = old.user_id and from_char = old.id and collected_at is null;
  delete from public.market_owned where user_id = old.user_id and character_id = old.id;
  delete from public.market_chars where user_id = old.user_id and character_id = old.id;
  return old;
end $$;
drop trigger if exists characters_mail_cleanup on public.characters;
create trigger characters_mail_cleanup after delete on public.characters
  for each row execute function public.characters_mail_cleanup();

-- Spielstand-Prüfung beim Hochladen (läuft nach characters_plausible, gleichartige Trigger alphabetisch):
--  - Charaktername bleibt (Briefe gehen an Namen; umbenennen nur über eine Server-Funktion).
--  - Bossbeute im Postfach (slices.mail.loot): begrenzt, neue Charaktere ohne, Gold darin zählt zur Gold-Obergrenze.
create or replace function public.characters_post_check() returns trigger
language plpgsql set search_path = '' as $$
declare loot jsonb; o_loot jsonb; bad boolean; g numeric; o_g numeric; w numeric; o_w numeric; why text;
begin
  if current_user <> 'authenticated' then return new; end if;
  if tg_op = 'UPDATE' then new.name := old.name; end if;
  loot := new.snapshot #> '{slices,mail,loot}';
  if loot is null or jsonb_typeof(loot) = 'null' then loot := '[]'::jsonb; end if;
  bad := jsonb_typeof(loot) <> 'array' or jsonb_array_length(loot) > ${LOOT_MAX};
  if not bad then
    bad := exists (select 1 from jsonb_array_elements(loot) l where jsonb_typeof(l) <> 'object'
      or jsonb_typeof(coalesce(l -> 'items', '[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(l -> 'items', '[]'::jsonb)) > ${LOOT_ITEMS_MAX}
      or jsonb_typeof(coalesce(l -> 'gold', '0'::jsonb)) <> 'number'
      or (l ->> 'gold')::numeric < 0 or (l ->> 'gold')::numeric > ${LOOT_GOLD_MAX}
      or (l ->> 'gold')::numeric <> floor((l ->> 'gold')::numeric)
      or exists (select 1 from jsonb_array_elements(coalesce(l -> 'items', '[]'::jsonb)) i where jsonb_typeof(i) <> 'object'
        or jsonb_typeof(i -> 'qty') is distinct from 'number' or (i ->> 'qty')::numeric < 1 or (i ->> 'qty')::numeric > 999
        or (i ->> 'qty')::numeric <> floor((i ->> 'qty')::numeric)
        or jsonb_typeof(i -> 'itemId') is distinct from 'string' or char_length(i ->> 'itemId') > 64));
  end if;
  if bad then why := 'postfach';
  elsif tg_op = 'INSERT' then
    -- Neuer Charakter (kein Upsert eines bestehenden): Postfach leer wie das Startpaket.
    if jsonb_array_length(loot) > 0 and not exists (select 1 from public.characters c where c.user_id = new.user_id and c.id = new.id) then
      why := 'startpaket';
    end if;
  else
    -- Gold in Beutebriefen zählt wie Gold in der Börse (characters_plausible: 50000 + 150 × geprüfte Spielzeit + Shop-Gold).
    g := coalesce((select sum((l ->> 'gold')::numeric) from jsonb_array_elements(loot) l), 0);
    o_loot := old.snapshot #> '{slices,mail,loot}';
    o_g := case when jsonb_typeof(o_loot) = 'array' then coalesce((select sum(case when jsonb_typeof(l -> 'gold') = 'number'
      then (l ->> 'gold')::numeric else 0 end) from jsonb_array_elements(o_loot) l), 0) else 0 end;
    begin
      w := coalesce((new.snapshot #>> '{slices,wallet,gold}')::numeric, 0);
      o_w := coalesce((old.snapshot #>> '{slices,wallet,gold}')::numeric, 0);
    exception when others then w := 0; o_w := 0; end;
    if g > 0 and w + g > o_w + o_g
       and w + g > 50000 + coalesce(new.play_verified, 0) * 150 + public.characters_shop_gold(old.user_id, old.id) then
      why := 'gold';
    end if;
  end if;
  if why is null then return new; end if;
  perform public.characters_flag(new.user_id, new.id, why, jsonb_build_object('postfach', true));
  return null; -- Zeile nicht schreiben, das Spiel lädt den letzten gültigen Stand
end $$;
drop trigger if exists characters_post_check on public.characters;
create trigger characters_post_check before insert or update on public.characters
  for each row execute function public.characters_post_check();

-- ------------------------------------------------------------------ Für das Spiel
-- Post dieses Charakters (schließt vorher abgelaufene Auktionen und Briefe ab).
create or replace function public.mail_box(p_character text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e text; c public.characters; out_ jsonb;
begin
  e := public.market_guard(uid, 'look');
  if e is not null then return public.market_err(e); end if;
  select * into c from public.characters where user_id = uid and id = p_character;
  if not found then return public.market_err('character'); end if;
  perform public.market_settle(50, uid);
  perform public.mail_expire(50);
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'itemId', m.item_id, 'qty', m.qty, 'gold', m.gold,
      'learned', m.learned, 'at', m.created_at, 'expiresAt', m.expires_at, 'from', m.from_name,
      'about', l.item_id, 'aboutQty', l.qty) order by m.id desc), '[]'::jsonb)
    into out_ from public.market_mail m left join public.market_listings l on l.id = m.listing_id
    where m.user_id = uid and m.character_id = p_character and public.mail_mine(m, c)
      and (m.expires_at is null or m.expires_at > now());
  return jsonb_build_object('ok', true, 'mail', out_, 'now', now());
end $$;

-- Briefe nehmen (p_ids: diese, null: alle). Gegenstände solange Platz ist, Gold bis zur Grenze (auch teilweise); der
-- Rest bleibt liegen und verfällt nicht mehr. Erlöse und Gold von Spielern bis zum Goldrahmen des Charakters,
-- zurückgegebene Gebote bis zur Gold-Obergrenze.
create or replace function public.mail_take(p_character text, p_ids bigint[] default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e text; c public.characters; m public.market_mail; snap jsonb; d jsonb;
  tot bigint := 0; adds jsonb := '[]'; learns jsonb := '[]'; got int := 0; left_ int := 0; capped int := 0; g0 bigint; frame bigint;
  bound bigint; room bigint; ids jsonb := '[]'; part boolean;
begin
  e := public.market_guard(uid, 'collect');
  if e is not null then return public.market_err(e); end if;
  select * into c from public.characters where user_id = uid and id = p_character for update;
  if not found then return public.market_err('character'); end if;
  perform public.market_settle(50, uid);
  perform public.mail_expire(50);
  snap := c.snapshot;
  g0 := public.market_snap_gold(snap);
  frame := public.market_gold_frame(c);
  bound := 50000 + frame; -- Gold-Obergrenze der Spielstandprüfung (characters_plausible)
  for m in select * from public.market_mail mm where mm.user_id = uid and mm.character_id = p_character and public.mail_mine(mm, c)
      and (mm.expires_at is null or mm.expires_at > now()) and (p_ids is null or mm.id = any (p_ids)) order by mm.id for update loop
    part := false;
    if m.item_id is not null then
      if m.learned and m.item_id like 'mount\\_%' and public.market_snap_learn_mount(snap, substr(m.item_id, 7)) is not null then
        snap := public.market_snap_learn_mount(snap, substr(m.item_id, 7));
        learns := learns || to_jsonb(substr(m.item_id, 7));
        perform public.market_own_add(uid, p_character, m.item_id, 1);
      else
        d := public.market_snap_give(snap, m.item_id, m.qty, coalesce((select stack from public.market_items where id = m.item_id), 1),
          coalesce((select category = 'material' from public.market_items where id = m.item_id), false));
        if d is null then left_ := left_ + 1; continue; end if;
        snap := d;
        adds := adds || jsonb_build_object('itemId', m.item_id, 'qty', m.qty);
        perform public.market_own_add(uid, p_character, m.item_id, m.qty);
      end if;
      part := true;
    end if;
    if m.gold > 0 then
      room := greatest(0, (case when m.kind = 'outbid' then bound else frame end) - g0 - tot);
      if room < m.gold then
        -- Bis zur Grenze nehmen, der Rest bleibt im Brief (und verfällt nicht mehr)
        capped := capped + 1;
        tot := tot + room;
        update public.market_mail set gold = gold - room, expires_at = null,
          item_id = case when part then null else item_id end, qty = case when part then 0 else qty end,
          learned = case when part then false else learned end where id = m.id;
        if part or room > 0 then got := got + 1; end if;
        continue;
      end if;
      tot := tot + m.gold;
    end if;
    update public.market_mail set collected_at = now() where id = m.id;
    ids := ids || to_jsonb(m.id);
    got := got + 1;
  end loop;
  if got = 0 then return jsonb_build_object('ok', true, 'collected', 0, 'left', left_, 'capped', capped, 'ids', ids); end if;
  snap := public.market_snap_set_gold(snap, public.market_snap_gold(snap) + tot);
  return public.market_commit(uid, p_character, snap, tot)
    || jsonb_build_object('collected', jsonb_array_length(ids), 'left', left_, 'capped', capped, 'add', adds, 'learn', learns, 'ids', ids);
end $$;

-- Brief an den Absender zurückschicken (Empfänger; nur Briefe von Spielern, die nicht schon zurückkamen).
create or replace function public.mail_return(p_character text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e text; c public.characters; m public.market_mail;
begin
  e := public.market_guard(uid, 'collect');
  if e is not null then return public.market_err(e); end if;
  select * into c from public.characters where user_id = uid and id = p_character for update;
  if not found then return public.market_err('character'); end if;
  select * into m from public.market_mail mm where mm.id = p_id and mm.kind = 'letter' and public.mail_mine(mm, c) for update;
  if not found then return public.market_err('gone'); end if;
  if not public.mail_bounce(m, c.name) then return public.market_err('sender'); end if;
  return jsonb_build_object('ok', true, 'id', m.id);
end $$;

-- Empfänger prüfen, bevor man schickt: Name, Stufe, Klasse, Empfängerkennung (für mail_send);
-- many = mehrere Charaktere heißen so (es gilt der älteste, der Post empfangen darf).
create or replace function public.mail_lookup(p_character text, p_to text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e text; r public.characters; n int; k uuid; mi timestamptz := date_trunc('minute', now());
begin
  e := public.market_guard(uid, 'look');
  if e is not null then return public.market_err(e); end if;
  update public.market_rate set lookups = case when lookup_minute = mi then lookups + 1 else 1 end, lookup_minute = mi
    where user_id = uid returning lookups into n;
  if n > ${LOOKUP_PER_MINUTE} then return public.market_err('rate'); end if;
  if p_to is null or char_length(btrim(p_to)) not between 1 and 40 then return public.market_err('nobody'); end if;
  r := public.mail_recipient(p_to);
  if r.id is null then return public.market_err('nobody'); end if;
  if r.user_id = uid and r.id = p_character then return public.market_err('self'); end if;
  if public.market_eligible(r) is not null then return public.market_err('unready'); end if;
  insert into public.mail_keys (user_id, character_id) values (r.user_id, r.id) on conflict (user_id, character_id) do nothing;
  select mk.key into k from public.mail_keys mk where mk.user_id = r.user_id and mk.character_id = r.id;
  select count(*) into n from public.characters c where lower(c.name) = lower(btrim(p_to));
  return jsonb_build_object('ok', true, 'name', r.name, 'level', r.level, 'classId', r.class_id, 'many', n > 1, 'key', k);
end $$;

-- Brief schicken: Gold und/oder ein Gegenstand (Tasche oder Materialbeutel) an den Empfänger aus mail_lookup.
-- Erst alle Prüfungen, dann alle Änderungen. Kein Zurückholen, keine Nachnahme.
drop function if exists public.mail_send(text, text, text, int, bigint);
create or replace function public.mail_send(p_character text, p_to text, p_key uuid, p_item text, p_qty int, p_gold bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e text; c public.characters; r public.characters; it public.market_items; snap jsonb;
  g bigint; gold bigint := coalesce(p_gold, 0); acc public.market_accounts; own int := 0; use_ int := 0; cost int := 0; lvl int; n int;
  excl boolean := false; hr timestamptz := date_trunc('hour', now());
begin
  e := public.market_guard(uid, 'send');
  if e is not null then return public.market_err(e); end if;
  if gold < 0 or gold > ${GOLD_MAX} then return public.market_err('price'); end if;
  if p_item is null and gold = 0 then return public.market_err('empty'); end if;
  select * into c from public.characters where user_id = uid and id = p_character for update;
  if not found then return public.market_err('character'); end if;
  e := public.market_eligible(c);
  if e is not null then return public.market_err(e); end if;
  -- Empfänger: Name und Kennung müssen auf denselben Charakter zeigen
  if p_to is null or char_length(btrim(p_to)) not between 1 and 40 then return public.market_err('nobody'); end if;
  r := public.mail_recipient(p_to);
  if r.id is null then return public.market_err('nobody'); end if;
  if r.user_id = uid and r.id = p_character then return public.market_err('self'); end if;
  if not exists (select 1 from public.mail_keys mk where mk.key = p_key and mk.user_id = r.user_id and mk.character_id = r.id) then
    return public.market_err('changed');
  end if;
  if public.market_eligible(r) is not null then return public.market_err('unready'); end if;
  -- Zählen unter Sperre auf den Empfänger (gleichzeitige Briefe an ihn laufen nacheinander)
  perform pg_advisory_xact_lock(hashtextextended('mail:' || r.user_id::text || ':' || r.id, 0));
  -- Briefe ohne Ablauf (Gold über dem Rahmen des Empfängers, Absender weg) liegen beim Empfänger fest und zählen nicht.
  if (select count(*) from public.market_mail m where m.user_id = r.user_id and m.character_id = r.id and m.kind = 'letter'
      and m.collected_at is null and m.expires_at is not null and m.created_at >= r.created_at) >= ${BOX_MAX}
     or (select count(*) from public.market_mail m where m.from_user = uid and m.user_id = r.user_id and m.character_id = r.id
      and m.kind = 'letter' and m.collected_at is null and m.expires_at is not null) >= ${PAIR_MAX} then
    return public.market_err('nodeliver');
  end if;
  snap := c.snapshot;
  if p_item is not null then
    select * into it from public.market_items where id = p_item;
    if not found then return public.market_err('item'); end if;
    if to_regclass('public.shop_exclusive_items') is not null and p_item like 'mount\\_%' then
      execute 'select exists (select 1 from public.shop_exclusive_items where key = $1)' into excl using 'mount:' || substr(p_item, 7);
      if excl then return public.market_err('item'); end if;
    end if;
    if p_qty is null or p_qty < 1 or p_qty > it.stack then return public.market_err('qty'); end if;
    snap := public.market_snap_take(snap, p_item, p_qty, it.category = 'material');
    if snap is null then return public.market_err('missing'); end if;
    -- Herkunft wie beim Einstellen: zuerst Bestand aus dem Handel, sonst eigene Beute (Stufe passt, Kontingent reicht).
    acc := public.market_account(uid);
    own := coalesce((select o.qty from public.market_owned o where o.user_id = uid and o.character_id = p_character
      and o.item_id = p_item for update), 0);
    use_ := least(own, p_qty);
    if use_ < p_qty then
      lvl := coalesce(floor((c.snapshot #>> '{slices,progress,level}')::numeric), 1)::int;
      if it.req_level > lvl + ${LEVEL_SLACK} then return public.market_err('level'); end if;
      cost := (array[${freshCost.join(', ')}])[it.rarity + 1] * greatest(1, ceil((p_qty - use_)::numeric / case when it.rarity >= 2 then 5 else 10 end))::int;
      if acc.fresh + cost > ${FRESH_BASE} + ${FRESH_PER_HOUR} * floor(public.market_trade_time(acc, false) / 3600) then
        return public.market_err('budget');
      end if;
    end if;
  end if;
  if gold > 0 then
    g := public.market_snap_gold(snap);
    if g < gold then return public.market_err('gold'); end if;
    if not public.market_can_spend(uid, gold) then return public.market_err('frame'); end if;
    snap := public.market_snap_set_gold(snap, g - gold);
  end if;
  -- Alles geprüft: Briefe je Stunde zählen (abgelehnte Briefe zählen nicht), dann buchen
  update public.market_rate set sent = case when sent_hour = hr then sent + 1 else 1 end, sent_hour = hr
    where user_id = uid and (sent_hour is distinct from hr or sent < ${SEND_PER_HOUR});
  if not found then return public.market_err('rate'); end if;
  if cost > 0 then update public.market_accounts set fresh = fresh + cost where user_id = uid; end if;
  if use_ > 0 then
    update public.market_owned set qty = qty - use_ where user_id = uid and character_id = p_character and item_id = p_item;
  end if;
  insert into public.market_mail (user_id, character_id, kind, item_id, qty, gold, from_user, from_char, from_name, expires_at)
    values (r.user_id, r.id, 'letter', p_item, case when p_item is null then 0 else p_qty end, gold, uid, p_character, left(c.name, 40),
      now() + interval '${KEEP_DAYS} days');
  return public.market_commit(uid, p_character, snap, -gold) || jsonb_build_object('to', r.name,
    'remove', case when p_item is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('itemId', p_item, 'qty', p_qty)) end);
end $$;

-- ------------------------------------------------------------------ Auktionshaus (aus src/market/marketSql.mjs)
${fromMarket('market_buyout')}

-- Abholen nur noch am Briefkasten (mail_take); die alte Funktion kannte keine Briefe.
drop function if exists public.market_collect(text);

-- ------------------------------------------------------------------ Rechte
revoke execute on function public.mail_recipient(text) from public, anon, authenticated;
revoke execute on function public.mail_mine(public.market_mail, public.characters) from public, anon, authenticated;
revoke execute on function public.mail_sender(public.market_mail) from public, anon, authenticated;
revoke execute on function public.mail_bounce(public.market_mail, text) from public, anon, authenticated;
revoke execute on function public.mail_expire(int) from public, anon, authenticated;
revoke execute on function public.characters_mail_cleanup() from public, anon, authenticated;
revoke execute on function public.characters_post_check() from public, anon, authenticated;
revoke execute on function public.mail_box(text) from public, anon;
revoke execute on function public.mail_take(text, bigint[]) from public, anon;
revoke execute on function public.mail_return(text, bigint) from public, anon;
revoke execute on function public.mail_lookup(text, text) from public, anon;
revoke execute on function public.mail_send(text, text, uuid, text, int, bigint) from public, anon;
grant execute on function public.mail_box(text) to authenticated;
grant execute on function public.mail_take(text, bigint[]) to authenticated;
grant execute on function public.mail_return(text, bigint) to authenticated;
grant execute on function public.mail_lookup(text, text) to authenticated;
grant execute on function public.mail_send(text, text, uuid, text, int, bigint) to authenticated;
revoke execute on function public.market_buyout(text, bigint) from public, anon;
grant execute on function public.market_buyout(text, bigint) to authenticated;

-- PostgREST: neue Funktionen sofort bekannt machen.
notify pgrst, 'reload schema';
`;
}

if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(mailSql());
