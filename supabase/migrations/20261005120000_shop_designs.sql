-- Emberwrath: Shop mit exklusiven Designs, Rückbuchungen serverseitig, Prüfung der Spielstände.
-- Nach 20261001230000_goldshop.sql, 20261003140000_goldshop_rueckbuchung.sql und 20261003130000_spielstand_pruefung.sql
-- im SQL-Editor ausführen. Mehrfach ausführbar. Siehe docs/SHOP.md.
--
-- 1. Designs: Bestellungen der Art 'design' (gold_orders.kind) schalten Gegenstände frei (items, z. B. 'mount:soul_wolf',
--    'dye:soullight'). Sie gelten für alle Charaktere des Kontos, solange die Bestellung bezahlt ist ('paid'/'credited').
--    Das Spiel fragt shop_designs() ab und trägt sie in den Spielstand ein.
-- 2. Rückbuchungen zieht jetzt der Server ab (shop_server_revoke, vom Worker nach dem Stripe-Webhook aufgerufen):
--    Gold wird direkt im gespeicherten Spielstand abgezogen, Designs werden aus allen Charakteren entfernt. saved_at
--    springt dabei vor, das Spiel übernimmt den Cloud-Stand beim nächsten Abgleich.
-- 3. Trigger characters_shop_check lehnt Spielstände von Spielern ab (wie characters_plausible, Vermerk in character_flags),
--    a) die exklusive Designs enthalten, die nicht bezahlt sind ('design'),
--    b) die eine erstattete Gold-Bestellung noch als gutgeschrieben führen, ohne den Abzug ('rueckbuchung'),
--    c) deren Tasche unmöglich ist: mehr als 36 Plätze, Mengen außerhalb 1–999 ('gegenstaende').
--    Unbekannte Gegenstands-IDs verwirft das Spiel selbst beim Laden (src/progression/logic.js, inventory.deserialize).
-- 4. Sicherheitsprüfung 05.10. (D4, D5): Abholen setzt delivered_at (shop_pending_credits). Ab dann gilt Gold als geliefert,
--    auch wenn das Spiel den Erhalt nie bestätigt; eine Rückbuchung zieht es serverseitig ab. Kaufsperren nach Rückbuchung
--    hängen zusätzlich an einem Hash der E-Mail-Adresse (shop_block_marks) und überleben so das Löschen des Kontos
--    (Betrugsabwehr, Art. 6 Abs. 1 f DSGVO; in der Datenschutzerklärung nennen).

-- ------------------------------------------------------------------ Bestellungen verallgemeinern
alter table public.gold_orders add column if not exists kind text not null default 'gold';
alter table public.gold_orders add column if not exists items text[] not null default '{}';
alter table public.gold_orders alter column character_id drop not null;
alter table public.gold_orders drop constraint if exists gold_orders_gold_check;
alter table public.gold_orders drop constraint if exists gold_orders_kind_check;
alter table public.gold_orders add constraint gold_orders_kind_check check (
  (kind = 'gold' and gold > 0 and character_id is not null and cardinality(items) = 0)
  or (kind = 'design' and gold = 0 and cardinality(items) between 1 and 8));
create index if not exists gold_orders_design_idx on public.gold_orders (user_id) where kind = 'design';
alter table public.gold_orders add column if not exists delivered_at timestamptz;
alter table public.gold_orders add column if not exists email_hash text check (email_hash is null or email_hash ~ '^[0-9a-f]{64}$');
update public.gold_orders set delivered_at = credited_at where delivered_at is null and credited_at is not null;
-- Rechtsprüfung 05.10.: Fassung der Kaufbedingungen, Sprache und Bestellbestätigung per E-Mail (worker/shop-mail.js).
alter table public.gold_orders add column if not exists terms_version text check (terms_version is null or char_length(terms_version) <= 20);
alter table public.gold_orders add column if not exists lang text not null default 'de' check (lang in ('de', 'en'));
alter table public.gold_orders add column if not exists confirmation_sent_at timestamptz;
alter table public.gold_orders add column if not exists confirmation_error text check (confirmation_error is null or char_length(confirmation_error) <= 200);
create index if not exists gold_orders_recent_idx on public.gold_orders (user_id, created_at);

-- ------------------------------------------------------------------ Abholen = geliefert (D4)
create or replace function public.shop_pending_credits(p_character text)
returns table (id uuid, gold int, product_id text, paid_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  return query
    update public.gold_orders o set delivered_at = coalesce(o.delivered_at, now())
    where o.user_id = (select auth.uid()) and o.character_id = p_character and o.status = 'paid' and o.kind = 'gold'
    returning o.id, o.gold, o.product_id, o.paid_at;
end $$;

create or replace function public.shop_pending_revokes(p_character text)
returns table (id uuid, gold int, product_id text, status text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.gold, o.product_id, o.status from public.gold_orders o
  where o.user_id = (select auth.uid()) and o.character_id = p_character and o.kind = 'gold'
    and o.status in ('refunded', 'disputed') and o.delivered_at is not null and o.revoked_at is null
  order by o.updated_at;
$$;

create or replace function public.shop_confirm_revokes(p_ids uuid[])
returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.gold_orders o set revoked_at = now()
  where o.id = any (p_ids) and o.user_id = (select auth.uid())
    and o.status in ('refunded', 'disputed') and o.delivered_at is not null and o.revoked_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- ------------------------------------------------------------------ Kaufsperre über Kontolöschung hinaus (D5)
create table if not exists public.shop_block_marks (
  email_hash text primary key check (email_hash ~ '^[0-9a-f]{64}$'),
  reason     text not null check (char_length(reason) <= 200),
  blocked_at timestamptz not null default now()
);
alter table public.shop_block_marks enable row level security;
revoke all on public.shop_block_marks from anon, authenticated;
grant select, insert, update, delete on public.shop_block_marks to service_role;

create or replace function public.admin_shop_unblock(p_user uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform public.assert_admin();
  delete from public.shop_blocks where user_id = p_user;
  get diagnostics n = row_count;
  delete from public.shop_block_marks m
    where m.email_hash in (select o.email_hash from public.gold_orders o where o.user_id = p_user and o.email_hash is not null);
  return n > 0 or found;
end $$;
-- Löschfrist: Sperrvermerke nach drei Jahren (Datenschutzerklärung). Aufruf aus cleanup_personal_data() (täglich, pg_cron).
create or replace function public.cleanup_shop() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.shop_block_marks where blocked_at < now() - interval '3 years';
end $$;
revoke execute on function public.cleanup_shop() from public, anon, authenticated;

revoke execute on function public.admin_shop_unblock(uuid) from public, anon;
grant execute on function public.admin_shop_unblock(uuid) to authenticated;

-- Schlüssel, die es nur im Shop gibt (src/shop/catalog.js DESIGN_ITEMS). Neue Designs hier ergänzen.
create table if not exists public.shop_exclusive_items (
  key text primary key check (key ~ '^(mount|dye):[a-z0-9_]{1,40}$')
);
insert into public.shop_exclusive_items (key) values
  ('mount:phoenix_wing'), ('dye:phoenix'),
  ('mount:astral_stallion'), ('dye:starnight'),
  ('mount:soul_wolf'), ('dye:soullight')
on conflict do nothing;
alter table public.shop_exclusive_items enable row level security;
revoke all on public.shop_exclusive_items from anon, authenticated;
grant select on public.shop_exclusive_items to service_role;

-- Vom Admin geschenkte Designs (z. B. für das eigene Konto oder als Entschädigung). Nur per SQL-Editor:
--   insert into public.shop_grants (user_id, item, note)
--     select u.id, k, 'Geschenk' from auth.users u, unnest(array['mount:soul_wolf','dye:soullight']) k
--     where u.email = '…' on conflict do nothing;
create table if not exists public.shop_grants (
  user_id    uuid not null references auth.users (id) on delete cascade,
  item       text not null check (item ~ '^(mount|dye):[a-z0-9_]{1,40}$'),
  note       text check (note is null or char_length(note) <= 200),
  granted_at timestamptz not null default now(),
  primary key (user_id, item)
);
alter table public.shop_grants enable row level security;
revoke all on public.shop_grants from anon, authenticated;
grant select, insert, update, delete on public.shop_grants to service_role;

-- Besitz eines Kontos: bezahlte Design-Bestellungen und Geschenke. Nur innerhalb der Shop-Funktionen.
create or replace function public.shop_owned_items(p_user uuid, p_except uuid default null) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct i order by i), '{}') from (
    select unnest(o.items) i from public.gold_orders o
      where o.user_id = p_user and o.kind = 'design' and o.status in ('paid', 'credited') and o.id is distinct from p_except
    union all
    select g.item from public.shop_grants g where g.user_id = p_user
  ) x;
$$;
revoke execute on function public.shop_owned_items(uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ Designs des angemeldeten Kontos
create or replace function public.shop_designs()
returns text[]
language sql stable security definer set search_path = '' as $$
  select public.shop_owned_items((select auth.uid()));
$$;
revoke execute on function public.shop_designs() from public, anon;
grant execute on function public.shop_designs() to authenticated;

-- ------------------------------------------------------------------ Designs aus einem Spielstand entfernen
create or replace function public.shop_strip_designs(p_snap jsonb, p_lost text[]) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  s jsonb := p_snap;
  mounts jsonb;
  owned jsonb;
begin
  if p_lost is null or cardinality(p_lost) = 0 then return s; end if;
  mounts := s #> '{slices,character,mounts}';
  if jsonb_typeof(mounts -> 'owned') = 'array' then
    owned := coalesce((select jsonb_agg(m) from jsonb_array_elements_text(mounts -> 'owned') m
                       where not (('mount:' || m) = any (p_lost))), '[]'::jsonb);
    if owned <> mounts -> 'owned' then
      if ('mount:' || (mounts ->> 'active')) = any (p_lost) then
        mounts := mounts || jsonb_build_object('active', owned -> 0, 'riding', false);
      end if;
      s := jsonb_set(s, '{slices,character,mounts}', jsonb_set(mounts, '{owned}', owned));
    end if;
  end if;
  if ('dye:' || (s #>> '{slices,character,appearance,dye}')) = any (p_lost) then
    s := jsonb_set(s, '{slices,character,appearance,dye}', 'null'::jsonb);
  end if;
  if jsonb_typeof(s #> '{slices,shop,owned}') = 'array' then
    s := jsonb_set(s, '{slices,shop,owned}', coalesce((select jsonb_agg(k) from jsonb_array_elements_text(s #> '{slices,shop,owned}') k
                                                       where not (k = any (p_lost))), '[]'::jsonb));
  end if;
  return s;
end $$;
revoke execute on function public.shop_strip_designs(jsonb, text[]) from public, anon, authenticated;

-- ------------------------------------------------------------------ Rückbuchung serverseitig
-- Für eine erstattete/zurückgebuchte Bestellung: Gold im Spielstand abziehen (auch ins Minus) und im Spielstand vermerken
-- (slices.shop.revoked), bzw. Designs aus allen Charakteren entfernen, die nicht durch eine andere Bestellung gedeckt sind.
-- Liefert die Zahl geänderter Charaktere. Nur für den Worker (service_role). Idempotent über revoked_at.
create or replace function public.shop_server_revoke(p_order uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  o    public.gold_orders;
  c    record;
  n    int := 0;
  snap jsonb;
  had  boolean;
  keep text[];
  lost text[];
  ms   bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  select * into o from public.gold_orders where id = p_order for update;
  if not found or o.status not in ('refunded', 'disputed') or o.revoked_at is not null then return 0; end if;

  if o.kind = 'gold' then
    for c in select * from public.characters where user_id = o.user_id and id = o.character_id for update loop
      snap := c.snapshot;
      if coalesce((snap #> '{slices,shop,revoked}') ? o.id::text, false) then continue; end if;
      had := coalesce((snap #> '{slices,shop,credited}') ? o.id::text, false);
      -- Nie abgeholt und nicht im Spielstand: nichts abzuziehen.
      if not had and o.delivered_at is null and o.credited_at is null then continue; end if;
      -- Abgeholt gilt als geliefert, auch wenn der Spielstand die Gutschrift (angeblich) nicht kennt.
      snap := jsonb_set(snap, '{slices,wallet,gold}',
        to_jsonb(coalesce((snap #>> '{slices,wallet,gold}')::numeric, 0) - o.gold));
      snap := jsonb_set(snap, '{slices,shop}', coalesce(snap #> '{slices,shop}', '{}'::jsonb));
      snap := jsonb_set(snap, '{slices,shop,revoked}',
        (case when jsonb_typeof(snap #> '{slices,shop,revoked}') = 'array' then snap #> '{slices,shop,revoked}' else '[]'::jsonb end)
        || to_jsonb(o.id::text));
      snap := jsonb_set(snap, '{meta,savedAt}', to_jsonb(ms));
      update public.characters set snapshot = snap, saved_at = now() where user_id = c.user_id and id = c.id;
      n := n + 1;
    end loop;
    -- Ohne geänderten Spielstand und ohne Gutschrift bleibt revoked_at leer (sonst verlangte die Prüfung einen Vermerk).
    if n > 0 or o.credited_at is not null or o.delivered_at is not null then
      update public.gold_orders set revoked_at = now(), credited_at = coalesce(credited_at, now()) where id = o.id;
    end if;
  else
    keep := public.shop_owned_items(o.user_id, o.id);
    lost := array(select unnest(o.items) except select unnest(keep));
    for c in select * from public.characters where user_id = o.user_id for update loop
      snap := public.shop_strip_designs(c.snapshot, lost);
      if snap is distinct from c.snapshot then
        snap := jsonb_set(snap, '{meta,savedAt}', to_jsonb(ms));
        update public.characters set snapshot = snap, saved_at = now() where user_id = c.user_id and id = c.id;
        n := n + 1;
      end if;
    end loop;
    update public.gold_orders set revoked_at = now() where id = o.id;
  end if;
  return n;
end $$;
revoke execute on function public.shop_server_revoke(uuid) from public, anon, authenticated;
grant execute on function public.shop_server_revoke(uuid) to service_role;

-- ------------------------------------------------------------------ Prüfung beim Speichern
-- Liefert den Grund, warum ein Spielstand abgelehnt wird, oder null. Nur aus dem Trigger heraus aufrufbar.
create or replace function public.shop_snapshot_problem(p_user uuid, p_character text, p_snap jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  owned text[];
  bad   text[];
  oid   uuid;
  slots jsonb := p_snap #> '{slices,inventory,slots}';
  arr   jsonb;
begin
  if pg_trigger_depth() < 1 then raise exception 'nicht erlaubt' using errcode = '42501'; end if;

  -- a) Exklusive Designs nur, wenn bezahlt oder geschenkt
  owned := public.shop_owned_items(p_user);
  arr := p_snap #> '{slices,character,mounts,owned}';
  select array_agg(distinct u) into bad from (
      select 'mount:' || m as u from jsonb_array_elements_text(case when jsonb_typeof(arr) = 'array' then arr else '[]'::jsonb end) m
      union all select 'mount:' || (p_snap #>> '{slices,character,mounts,active}')
      union all select 'dye:' || (p_snap #>> '{slices,character,appearance,dye}')
      union all select k from jsonb_array_elements_text(case when jsonb_typeof(p_snap #> '{slices,shop,owned}') = 'array'
                                                             then p_snap #> '{slices,shop,owned}' else '[]'::jsonb end) k
    ) used
    where u is not null and u in (select e.key from public.shop_exclusive_items e) and not (u = any (owned));
  if bad is not null then return jsonb_build_object('reason', 'design', 'items', to_jsonb(bad)); end if;

  -- b) Erstattetes Gold: wer es gutgeschrieben hat oder vom Server abgezogen bekam, muss den Abzug im Spielstand führen
  select o.id into oid from public.gold_orders o
    where o.user_id = p_user and o.character_id = p_character and o.kind = 'gold' and o.status in ('refunded', 'disputed')
      and (o.revoked_at is not null or coalesce((p_snap #> '{slices,shop,credited}') ? o.id::text, false))
      and not coalesce((p_snap #> '{slices,shop,revoked}') ? o.id::text, false)
    limit 1;
  if oid is not null then return jsonb_build_object('reason', 'rueckbuchung', 'order', oid); end if;

  -- c) Tasche: höchstens 36 Plätze, Mengen 1–999
  if jsonb_typeof(slots) = 'array' and (jsonb_array_length(slots) > 36 or exists (
       select 1 from jsonb_array_elements(slots) s
       where jsonb_typeof(s) = 'object' and (jsonb_typeof(s -> 'qty') is distinct from 'number'
             or (s ->> 'qty')::numeric < 1 or (s ->> 'qty')::numeric > 999 or char_length(s ->> 'itemId') > 64))) then
    return jsonb_build_object('reason', 'gegenstaende');
  end if;
  return null;
end $$;
revoke execute on function public.shop_snapshot_problem(uuid, text, jsonb) from public, anon;
-- Der Trigger läuft mit der Rolle des Spielers und braucht deshalb das Ausführrecht.
grant execute on function public.shop_snapshot_problem(uuid, text, jsonb) to authenticated;

create or replace function public.characters_shop_check() returns trigger
language plpgsql set search_path = '' as $$
declare p jsonb;
begin
  -- Nur Uploads von Spielern prüfen; SQL-Editor, Server und Admin-Funktionen nicht.
  if current_user <> 'authenticated' then return new; end if;
  p := public.shop_snapshot_problem(new.user_id, new.id, new.snapshot);
  if p is null then return new; end if;
  perform public.characters_flag(new.user_id, new.id, p ->> 'reason', p);
  return null; -- Zeile nicht schreiben, das Spiel lädt den letzten gültigen Stand
end $$;
revoke execute on function public.characters_shop_check() from public, anon;

drop trigger if exists characters_shop_check on public.characters;
-- Läuft nach characters_before_write und characters_plausible (alphabetisch).
create trigger characters_shop_check before insert or update on public.characters
  for each row execute function public.characters_shop_check();
