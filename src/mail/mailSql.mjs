// Erzeugt die Datenbank-Migration des Postfachs (src/mail/rules.js, Handelsregeln aus src/market/). Nicht Teil des Spiels.
//
//   node src/mail/mailSql.mjs > supabase/migrations/20261011150000_postfach.sql
//
// Baut auf dem Auktionshaus auf (20261011090000_auktionshaus.sql): dieselbe Tabelle market_mail, derselbe
// Buchungszähler, Goldrahmen und dasselbe Handelskontingent. market_buyout und market_collect stehen in
// src/market/marketSql.mjs und werden hier unverändert übernommen (Kauf landet im Postfach, Abholen = mail_take).
import { KEEP_DAYS, SEND_PER_HOUR, BOX_MAX, GOLD_MAX } from './rules.js';
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
-- NACH allen bisherigen Migrationen (zuletzt 20261011120000_dolche_nur_schurke.sql). Mehrfach ausführbar.
-- Erzeugt mit: node src/mail/mailSql.mjs (Regeln: src/mail/rules.js, Handel: src/market/rules.js).
--
-- Was im Postfach landet (Tabelle market_mail, vorher das Abholfach des Auktionshauses):
--  - Auktionshaus: Erlöse, ersteigerte und gekaufte Ware (Sofortkauf jetzt immer per Post), Rückgaben, überbotene Gebote.
--  - Briefe von Spielern (kind 'letter'): Gold und/oder ein Gegenstand. Bewusst ohne Absicherung (keine Nachnahme,
--    kein Zurückholen).
--  - Post bleibt ${KEEP_DAYS} Tage liegen, danach verfällt sie.
--
-- Sicherheitsmodell: Senden ist für die Datenbank dasselbe wie ein Handel im Auktionshaus.
--  - mail_send sperrt den Charakter (FOR UPDATE), nimmt Gold und Gegenstand aus dem gespeicherten Spielstand und schreibt
--    den Brief in derselben Transaktion; Buchungszähler (market_chars.seq) wie beim Auktionshaus. Ein Gegenstand kann
--    deshalb nur einmal verschickt werden, ein älterer Spielstand (zweites Fenster) wird abgelehnt.
--  - Gold: nur im Goldrahmen des Kontos (market_can_spend, wie Bieten/Kaufen). Empfangenes Gold kommt nur bis zum
--    Goldrahmen des Empfängers in den Spielstand (wie Erlöse), der Rest bleibt im Postfach.
--  - Gegenstände: nur Handelbares (market_items). Herkunft wie beim Einstellen: Bestand aus dem Handel (market_owned) ist
--    frei, eigene Beute kostet Handelskontingent und darf höchstens ${LEVEL_SLACK} Stufen über dem Charakter liegen –
--    auch an eigene Charaktere, sonst ließe sich Beute über die Post »waschen«. Abgeholte Briefe zählen beim Empfänger
--    als Bestand.
--  - Senden ab Stufe/Spielzeit wie im Auktionshaus, nicht mit Schummel-Vermerk, höchstens ${SEND_PER_HOUR} Briefe je
--    Stunde und Konto, höchstens ${BOX_MAX} offene Briefe von Spielern je Empfänger.
--  - Empfänger per Charaktername (Groß-/Kleinschreibung egal). Heißen mehrere so, geht der Brief an den zuletzt
--    gespielten; mail_lookup zeigt vorher Stufe und Klasse. Konto-IDs verlassen die Datenbank nie.
--  - Bossbeute, die liegen blieb, bewahrt das Spiel im eigenen Spielstand auf (slices.mail.loot), nicht hier: sie
--    entsteht im Browser wie jede Beute (offener Punkt D3) und bekommt deshalb keinen Bestand.

-- ------------------------------------------------------------------ Tabellen
alter table public.market_mail drop constraint if exists market_mail_kind_check;
alter table public.market_mail add constraint market_mail_kind_check
  check (kind in ('sold', 'won', 'bought', 'outbid', 'expired', 'cancelled', 'letter'));
alter table public.market_mail add column if not exists from_user uuid references auth.users (id) on delete set null;
alter table public.market_mail add column if not exists from_char text;
alter table public.market_mail add column if not exists from_name text check (from_name is null or char_length(from_name) <= 40);
alter table public.market_mail add column if not exists expires_at timestamptz;
update public.market_mail set expires_at = created_at + interval '${KEEP_DAYS} days' where expires_at is null;
alter table public.market_mail alter column expires_at set default now() + interval '${KEEP_DAYS} days';
alter table public.market_mail alter column expires_at set not null;
create index if not exists market_mail_letters on public.market_mail (user_id, character_id) where collected_at is null and kind = 'letter';
create index if not exists market_mail_expiry on public.market_mail (expires_at) where collected_at is null;

alter table public.market_rate add column if not exists sent int not null default 0;
alter table public.market_rate add column if not exists sent_hour timestamptz;

-- Empfänger nach Namen finden
create index if not exists characters_name_lower on public.characters (lower(name));

-- ------------------------------------------------------------------ Bausteine
-- Empfänger: Charakter mit diesem Namen, bei mehreren der zuletzt gespielte.
create or replace function public.mail_recipient(p_name text) returns public.characters
language sql stable set search_path = '' as $$
  select c.* from public.characters c where lower(c.name) = lower(btrim(p_name))
    order by c.updated_at desc, c.created_at desc limit 1;
$$;

-- ------------------------------------------------------------------ Für das Spiel
-- Post dieses Charakters (schließt vorher abgelaufene Auktionen ab).
create or replace function public.mail_box(p_character text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e text; out_ jsonb;
begin
  e := public.market_guard(uid, 'look');
  if e is not null then return public.market_err(e); end if;
  perform public.market_settle(50, uid);
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'itemId', m.item_id, 'qty', m.qty, 'gold', m.gold,
      'learned', m.learned, 'at', m.created_at, 'expiresAt', m.expires_at, 'from', m.from_name,
      'about', l.item_id, 'aboutQty', l.qty) order by m.id desc), '[]'::jsonb)
    into out_ from public.market_mail m left join public.market_listings l on l.id = m.listing_id
    where m.user_id = uid and m.character_id = p_character and m.collected_at is null and m.expires_at > now();
  -- Aufräumen (selten): verfallene Post.
  if random() < 0.05 then
    delete from public.market_mail where collected_at is null and expires_at < now() - interval '1 day';
  end if;
  return jsonb_build_object('ok', true, 'mail', out_, 'now', now());
end $$;

-- Briefe nehmen (p_ids: diese, null: alle). Gegenstände solange Platz ist, Gold bis zur Grenze; der Rest bleibt liegen.
-- Erlöse und Gold von Spielern bis zum Goldrahmen des Charakters, zurückgegebene Gebote bis zur Gold-Obergrenze.
create or replace function public.mail_take(p_character text, p_ids bigint[] default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e text; c public.characters; m public.market_mail; snap jsonb; d jsonb;
  gold bigint := 0; adds jsonb := '[]'; learns jsonb := '[]'; got int := 0; left_ int := 0; capped int := 0; g0 bigint; frame bigint;
  bound bigint; ids jsonb := '[]'; part boolean;
begin
  e := public.market_guard(uid, 'collect');
  if e is not null then return public.market_err(e); end if;
  select * into c from public.characters where user_id = uid and id = p_character for update;
  if not found then return public.market_err('character'); end if;
  perform public.market_settle(50, uid);
  snap := c.snapshot;
  g0 := public.market_snap_gold(snap);
  frame := public.market_gold_frame(c);
  bound := 50000 + frame; -- Gold-Obergrenze der Spielstandprüfung (characters_plausible)
  for m in select * from public.market_mail where user_id = uid and character_id = p_character and collected_at is null
      and expires_at > now() and (p_ids is null or id = any (p_ids)) order by id for update loop
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
      if g0 + gold + m.gold > (case when m.kind = 'outbid' then bound else frame end) then
        capped := capped + 1;
        -- Gegenstand genommen, Gold bleibt im Brief
        if part then
          update public.market_mail set item_id = null, qty = 0, learned = false where id = m.id;
          got := got + 1;
        end if;
        continue;
      end if;
      gold := gold + m.gold;
    end if;
    update public.market_mail set collected_at = now() where id = m.id;
    ids := ids || to_jsonb(m.id);
    got := got + 1;
  end loop;
  if got = 0 then return jsonb_build_object('ok', true, 'collected', 0, 'left', left_, 'capped', capped, 'ids', ids); end if;
  snap := public.market_snap_set_gold(snap, public.market_snap_gold(snap) + gold);
  return public.market_commit(uid, p_character, snap, gold)
    || jsonb_build_object('collected', got, 'left', left_, 'capped', capped, 'add', adds, 'learn', learns, 'ids', ids);
end $$;

-- Empfänger prüfen, bevor man schickt: Name, Stufe, Klasse (mehrere = es gibt mehrere Charaktere mit diesem Namen).
create or replace function public.mail_lookup(p_character text, p_to text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e text; r public.characters; n int;
begin
  e := public.market_guard(uid, 'look');
  if e is not null then return public.market_err(e); end if;
  if p_to is null or char_length(btrim(p_to)) not between 1 and 40 then return public.market_err('nobody'); end if;
  r := public.mail_recipient(p_to);
  if r.id is null then return public.market_err('nobody'); end if;
  if r.user_id = uid and r.id = p_character then return public.market_err('self'); end if;
  select count(*) into n from public.characters c where lower(c.name) = lower(btrim(p_to));
  return jsonb_build_object('ok', true, 'name', r.name, 'level', r.level, 'classId', r.class_id, 'many', n > 1);
end $$;

-- Brief schicken: Gold und/oder ein Gegenstand (Tasche oder Materialbeutel). Kein Zurückholen, keine Nachnahme.
create or replace function public.mail_send(p_character text, p_to text, p_item text, p_qty int, p_gold bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e text; c public.characters; r public.characters; it public.market_items; snap jsonb;
  g bigint; gold bigint := coalesce(p_gold, 0); acc public.market_accounts; own int; use_ int; cost int; lvl int; n int;
  hr timestamptz := date_trunc('hour', now());
begin
  e := public.market_guard(uid, 'send');
  if e is not null then return public.market_err(e); end if;
  update public.market_rate set sent = case when sent_hour = hr then sent + 1 else 1 end, sent_hour = hr
    where user_id = uid returning sent into n;
  if n > ${SEND_PER_HOUR} then return public.market_err('rate'); end if;
  if gold < 0 or gold > ${GOLD_MAX} then return public.market_err('price'); end if;
  if p_item is null and gold = 0 then return public.market_err('empty'); end if;
  select * into c from public.characters where user_id = uid and id = p_character for update;
  if not found then return public.market_err('character'); end if;
  e := public.market_eligible(c);
  if e is not null then return public.market_err(e); end if;
  if p_to is null or char_length(btrim(p_to)) not between 1 and 40 then return public.market_err('nobody'); end if;
  r := public.mail_recipient(p_to);
  if r.id is null then return public.market_err('nobody'); end if;
  if r.user_id = uid and r.id = p_character then return public.market_err('self'); end if;
  if (select count(*) from public.market_mail m where m.user_id = r.user_id and m.character_id = r.id and m.kind = 'letter'
      and m.collected_at is null and m.expires_at > now()) >= ${BOX_MAX} then
    return public.market_err('full');
  end if;
  snap := c.snapshot;
  if p_item is not null then
    select * into it from public.market_items where id = p_item;
    if not found then return public.market_err('item'); end if;
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
      update public.market_accounts set fresh = fresh + cost where user_id = uid;
    end if;
    if use_ > 0 then
      update public.market_owned set qty = qty - use_ where user_id = uid and character_id = p_character and item_id = p_item;
    end if;
  end if;
  if gold > 0 then
    g := public.market_snap_gold(snap);
    if g < gold then return public.market_err('gold'); end if;
    if not public.market_can_spend(uid, gold) then return public.market_err('frame'); end if;
    snap := public.market_snap_set_gold(snap, g - gold);
  end if;
  insert into public.market_mail (user_id, character_id, kind, item_id, qty, gold, from_user, from_char, from_name)
    values (r.user_id, r.id, 'letter', p_item, case when p_item is null then 0 else p_qty end, gold, uid, p_character, left(c.name, 40));
  return public.market_commit(uid, p_character, snap, -gold) || jsonb_build_object('to', r.name,
    'remove', case when p_item is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('itemId', p_item, 'qty', p_qty)) end);
end $$;

-- ------------------------------------------------------------------ Auktionshaus (aus src/market/marketSql.mjs)
${fromMarket('market_buyout')}

${fromMarket('market_collect')}

-- ------------------------------------------------------------------ Rechte
revoke execute on function public.mail_recipient(text) from public, anon, authenticated;
revoke execute on function public.mail_box(text) from public, anon;
revoke execute on function public.mail_take(text, bigint[]) from public, anon;
revoke execute on function public.mail_lookup(text, text) from public, anon;
revoke execute on function public.mail_send(text, text, text, int, bigint) from public, anon;
grant execute on function public.mail_box(text) to authenticated;
grant execute on function public.mail_take(text, bigint[]) to authenticated;
grant execute on function public.mail_lookup(text, text) to authenticated;
grant execute on function public.mail_send(text, text, text, int, bigint) to authenticated;
revoke execute on function public.market_buyout(text, bigint) from public, anon;
revoke execute on function public.market_collect(text) from public, anon;
grant execute on function public.market_buyout(text, bigint) to authenticated;
grant execute on function public.market_collect(text) to authenticated;

-- PostgREST: neue Funktionen sofort bekannt machen.
notify pgrst, 'reload schema';
`;
}

if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(mailSql());
