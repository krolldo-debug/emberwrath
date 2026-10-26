-- Emberwrath: Auktionshaus und Post – Handelskontingent für eigene Beute (26.10.). Einmal im Supabase-SQL-Editor
-- ausführen, nach allen bisherigen Migrationen (zuletzt 20261020090000_shop_live.sql). Mehrfach ausführbar.
--
-- Spielermeldung 25.10.: Ein Magier der Stufe 40 konnte kaum etwas einstellen („Mit mehr Spielzeit geht wieder mehr“).
-- Ursache: Das Kontingent für eigene Beute wuchs erst ab dem zweiten Handelstag; am ersten Tag reichte es für zwei
-- epische Gegenstände und für keinen legendären, egal wie lange jemand schon spielt. Es stammt aus der Zeit, als Beute
-- nur im Browser entstand. Seit dem Fortschrittsbuch (20261015120000_fortschrittsbuch.sql) zählt der Server jede Beute
-- und kappt jeden Upload darauf. Solange das Buch das tut, kostet eigene Beute kein Kontingent mehr
-- (market_loot_checked); mit Notbremse (ledger_config.enforce = false) gilt das alte Kontingent wieder.
-- Gleiche Fassung wie in 20261011090000_auktionshaus.sql und 20261011150000_postfach.sql (erzeugt mit
-- src/market/marketSql.mjs bzw. src/mail/mailSql.mjs); nur diese Funktionen, damit spätere Migrationen nicht überschrieben werden.

-- Zählt das Fortschrittsbuch (20261015120000_fortschrittsbuch.sql) die Beute dieses Charakters? Dann liegt im
-- gespeicherten Spielstand nichts, was der Server nicht bestätigt hat (Uploads werden aufs Buch gekappt), und eigene
-- Beute braucht kein Handelskontingent. Nicht im Übergang, nicht mit Notbremse (enforce = false), nicht ohne Buch.
create or replace function public.market_loot_checked(p_user uuid, p_char text) returns boolean
language plpgsql stable set search_path = '' as $$
declare r boolean;
begin
  if to_regclass('public.ledger_config') is null or to_regclass('public.character_ledger') is null then return false; end if;
  execute 'select exists (select 1 from public.ledger_config c where c.id = 1 and c.enforce
             and c.strict_after is not null and now() >= c.strict_after)
           and exists (select 1 from public.character_ledger l where l.user_id = $1 and l.character_id = $2)'
    into r using p_user, p_char;
  return coalesce(r, false);
end $$;

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
  if p_hours is null or not (p_hours = any (array[12, 24, 48])) then return public.market_err('hours'); end if;
  if p_start_bid is null and p_buyout is null then return public.market_err('price'); end if;
  if coalesce(p_start_bid, 1) not between 1 and 10000000 or coalesce(p_buyout, 1) not between 1 and 10000000
     or (p_start_bid is not null and p_buyout is not null and p_buyout < p_start_bid) then return public.market_err('price'); end if;
  if p_qty is null or p_qty < 1 or p_qty > it.stack or (p_mount and (p_qty <> 1 or it.category <> 'mount')) then
    return public.market_err('qty');
  end if;
  if (select count(*) from public.market_listings l where l.seller_user = uid and l.status = 'active') >= 30 then
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
    if it.req_level > lvl + 5 then return public.market_err('level'); end if;
    -- Kontingent nach Seltenheit und Menge (Stapel ab selten je angefangene 5 Stück, darunter je angefangene 10)
    -- (entfällt, solange das Fortschrittsbuch die Beute zählt: market_loot_checked)
    cost := case when public.market_loot_checked(uid, p_character) then 0
      else (array[1, 1, 3, 10, 25])[it.rarity + 1] * greatest(1, ceil((p_qty - use_)::numeric / case when it.rarity >= 2 then 5 else 10 end))::int end;
    if cost > 0 and acc.fresh + cost > 20 + 40 * floor(public.market_trade_time(acc, false) / 3600) then
      return public.market_err('budget');
    end if;
    if cost > 0 then update public.market_accounts set fresh = fresh + cost where user_id = uid; end if;
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

create or replace function public.mail_send(p_character text, p_to text, p_key uuid, p_item text, p_qty int, p_gold bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e text; c public.characters; r public.characters; it public.market_items; snap jsonb;
  g bigint; gold bigint := coalesce(p_gold, 0); acc public.market_accounts; own int := 0; use_ int := 0; cost int := 0; lvl int; n int;
  excl boolean := false; hr timestamptz := date_trunc('hour', now());
begin
  e := public.market_guard(uid, 'send');
  if e is not null then return public.market_err(e); end if;
  if gold < 0 or gold > 10000000 then return public.market_err('price'); end if;
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
      and m.collected_at is null and m.expires_at is not null and m.created_at >= r.created_at) >= 60
     or (select count(*) from public.market_mail m where m.from_user = uid and m.user_id = r.user_id and m.character_id = r.id
      and m.kind = 'letter' and m.collected_at is null and m.expires_at is not null) >= 3 then
    return public.market_err('nodeliver');
  end if;
  snap := c.snapshot;
  if p_item is not null then
    select * into it from public.market_items where id = p_item;
    if not found then return public.market_err('item'); end if;
    if to_regclass('public.shop_exclusive_items') is not null and p_item like 'mount\_%' then
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
      if it.req_level > lvl + 5 then return public.market_err('level'); end if;
      cost := case when public.market_loot_checked(uid, p_character) then 0
        else (array[1, 1, 3, 10, 25])[it.rarity + 1] * greatest(1, ceil((p_qty - use_)::numeric / case when it.rarity >= 2 then 5 else 10 end))::int end;
      if cost > 0 and acc.fresh + cost > 20 + 40 * floor(public.market_trade_time(acc, false) / 3600) then
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
    where user_id = uid and (sent_hour is distinct from hr or sent < 30);
  if not found then return public.market_err('rate'); end if;
  if cost > 0 then update public.market_accounts set fresh = fresh + cost where user_id = uid; end if;
  if use_ > 0 then
    update public.market_owned set qty = qty - use_ where user_id = uid and character_id = p_character and item_id = p_item;
  end if;
  insert into public.market_mail (user_id, character_id, kind, item_id, qty, gold, from_user, from_char, from_name, expires_at)
    values (r.user_id, r.id, 'letter', p_item, case when p_item is null then 0 else p_qty end, gold, uid, p_character, left(c.name, 40),
      now() + interval '30 days');
  return public.market_commit(uid, p_character, snap, -gold) || jsonb_build_object('to', r.name,
    'remove', case when p_item is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('itemId', p_item, 'qty', p_qty)) end);
end $$;

revoke execute on function public.market_loot_checked(uuid, text) from public, anon, authenticated;
revoke execute on function public.market_list(text, text, int, bigint, bigint, int, boolean) from public, anon;
grant execute on function public.market_list(text, text, int, bigint, bigint, int, boolean) to authenticated;
revoke execute on function public.mail_send(text, text, uuid, text, int, bigint) from public, anon;
grant execute on function public.mail_send(text, text, uuid, text, int, bigint) to authenticated;

notify pgrst, 'reload schema';
