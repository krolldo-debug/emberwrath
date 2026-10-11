-- Emberwrath: Klassen-Skinsets im Shop (je Klasse ein Set, 7,99 €). Nach 20261005120000_shop_designs.sql und
-- 20261010090000_sicherheit_2.sql im SQL-Editor ausführen. Mehrfach ausführbar.
--
-- Ein Skinset ist ein Design wie die Reittiere: Bestellung der Art 'design' mit items = {'look:<setId>'}
-- (src/shop/catalog.js DESIGNS, src/character/skinSets.js). Es gilt für alle Charaktere des Kontos der passenden Klasse.
-- Die fünf Teile (z. B. set_glutthron_weapon … set_glutthron_feet) liegen nie in Tasche oder Bank, sie werden nur in der
-- Garderobe über die Ausrüstung gelegt (slices.character.wardrobe.shown).
--   1. Schlüssel 'look:' in shop_exclusive_items und shop_grants erlauben, die vier Sets eintragen.
--   2. shop_snapshot_problem: angelegte Set-Teile (wardrobe.shown, wardrobe.looks) nur, wenn das Set bezahlt oder geschenkt ist.
--   3. shop_strip_designs: bei Rückbuchung angelegte Teile des Sets aus der Garderobe nehmen.
-- Geschenk (z. B. eigenes Konto):
--   insert into public.shop_grants (user_id, item, note)
--     select u.id, 'look:set_glutthron', 'Geschenk' from auth.users u where u.email = '…' on conflict do nothing;

-- ------------------------------------------------------------------ 1. Schlüssel
alter table public.shop_exclusive_items drop constraint if exists shop_exclusive_items_key_check;
alter table public.shop_exclusive_items add constraint shop_exclusive_items_key_check
  check (key ~ '^(mount|dye|look):[a-z0-9_]{1,40}$');
alter table public.shop_grants drop constraint if exists shop_grants_item_check;
alter table public.shop_grants add constraint shop_grants_item_check
  check (item ~ '^(mount|dye|look):[a-z0-9_]{1,40}$');

insert into public.shop_exclusive_items (key) values
  ('look:set_glutthron'), ('look:set_mondsichel'), ('look:set_hirschkoenig'), ('look:set_sternenfeuer')
on conflict do nothing;

-- Set-Schlüssel eines Garderoben-Teils ('set_glutthron_weapon' -> 'look:set_glutthron'), sonst null
create or replace function public.shop_set_key(p_item text) returns text
language sql immutable set search_path = '' as $$
  select case when p_item ~ '^set_[a-z0-9]{1,30}_(weapon|chest|head|hands|feet)$'
    then 'look:' || regexp_replace(p_item, '_(weapon|chest|head|hands|feet)$', '') end;
$$;
revoke execute on function public.shop_set_key(text) from public, anon, authenticated;

-- ------------------------------------------------------------------ 2. Prüfung beim Speichern
-- Wie in 20261005120000, dazu die Garderobe (Teile 'set_<name>_<platz>' in shown und looks).
create or replace function public.shop_snapshot_problem(p_user uuid, p_character text, p_snap jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  owned text[];
  bad   text[];
  oid   uuid;
  slots jsonb := p_snap #> '{slices,inventory,slots}';
  arr   jsonb;
  wshown jsonb := p_snap #> '{slices,character,wardrobe,shown}';
  wlooks jsonb := p_snap #> '{slices,character,wardrobe,looks}';
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
      union all select public.shop_set_key(v) from jsonb_each_text(case when jsonb_typeof(wshown) = 'object' then wshown else '{}'::jsonb end) x(k, v)
      union all select public.shop_set_key(v) from jsonb_array_elements_text(case when jsonb_typeof(wlooks) = 'array' then wlooks else '[]'::jsonb end) v
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
grant execute on function public.shop_snapshot_problem(uuid, text, jsonb) to authenticated;

-- ------------------------------------------------------------------ 3. Rückbuchung: Set-Teile aus der Garderobe
create or replace function public.shop_strip_designs(p_snap jsonb, p_lost text[]) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  s jsonb := p_snap;
  mounts jsonb;
  owned jsonb;
  shown jsonb;
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
  shown := s #> '{slices,character,wardrobe,shown}';
  if jsonb_typeof(shown) = 'object' and exists (select 1 from jsonb_each_text(shown) x(k, v) where public.shop_set_key(v) = any (p_lost)) then
    s := jsonb_set(s, '{slices,character,wardrobe,shown}', (select jsonb_object_agg(k, case when public.shop_set_key(v #>> '{}') = any (p_lost) then 'null'::jsonb else v end)
                                                            from jsonb_each(shown) x(k, v)));
  end if;
  if jsonb_typeof(s #> '{slices,shop,owned}') = 'array' then
    s := jsonb_set(s, '{slices,shop,owned}', coalesce((select jsonb_agg(k) from jsonb_array_elements_text(s #> '{slices,shop,owned}') k
                                                       where not (k = any (p_lost))), '[]'::jsonb));
  end if;
  return s;
end $$;
revoke execute on function public.shop_strip_designs(jsonb, text[]) from public, anon, authenticated;
