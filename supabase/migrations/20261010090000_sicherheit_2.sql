-- Emberwrath: Sicherheits-Nachbesserung 2 (Sicherheitsprüfung 10.10.2026, Funde D10–D14, D17 und Aufräumen zu D6).
-- Einmal im Supabase-SQL-Editor ausführen, NACH allen bisherigen Migrationen (zuletzt 20261008100000_startpaket_varianten.sql).
-- Mehrfach ausführbar. Ändert nichts am ehrlichen Speichern (Upsert), am Startpaket oder an Gutschriften.
--
--  D10: Rückbuchungen zieht nur noch der Server ab. Ein Vermerk in slices.shop.revoked, den der Spieler selbst in seinen
--       Spielstand schreibt, gilt nicht mehr als Beweis für den Abzug (vorher: Vermerk vorab eintragen, dann Rückbuchung
--       → Gold blieb). shop_pending_revokes zieht offene Rückbuchungen selbst serverseitig ab (falls der Webhook scheiterte).
--  D11: Die Charakter-ID kann ein Spieler nicht mehr ändern (vorher: PATCH id → Rückbuchung fand den Charakter nicht).
--  D12: shop_confirm_revokes setzt revoked_at nicht mehr ohne Abzug (vorher: Wettlauf mit dem Webhook → Gold blieb).
--  D13: Erstattetes, geliefertes Gold senkt die Gold-Obergrenze (vorher: Abzug ließ sich wieder hochladen).
--  D14: Höchstens 20 gespeicherte Zustimmungs-Fassungen je Konto (vorher: beliebig viele Zeilen über user_metadata).
--  D17/D6: Sequenzen und Trigger-Funktionen ohne Rechte für anon/authenticated; Chatsperren gelöschter Konten werden gelöscht.

-- ------------------------------------------------------------------ D11: Charakter-ID unveränderlich
create or replace function public.characters_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if current_user = 'authenticated' then
      if new.user_id is distinct from (select auth.uid()) then
        raise exception 'Kein Zugriff' using errcode = '42501';
      end if;
      perform pg_advisory_xact_lock(hashtextextended('characters:' || new.user_id::text, 0));
    end if;
    if not exists (select 1 from public.characters c where c.user_id = new.user_id and c.id = new.id)
       and (select count(*) from public.characters c where c.user_id = new.user_id) >= 20 then
      raise exception 'Zu viele Charaktere (höchstens 20 pro Konto)' using errcode = 'P0001';
    end if;
    new.created_at := now();
  else
    -- Gold-Bestellungen und Prüfungen hängen an (user_id, id): ein Spieler darf die ID nicht umbenennen.
    if current_user = 'authenticated' and new.id is distinct from old.id then
      raise exception 'Charakter-ID kann nicht geändert werden' using errcode = '42501';
    end if;
    new.created_at := old.created_at;
    new.user_id := old.user_id;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.characters_before_write() from public, anon, authenticated;

-- ------------------------------------------------------------------ D10, D12: Rückbuchung nur serverseitig
-- Wie in 20261005120000_shop_designs.sql, aber: Ist revoked_at leer, hat der Server noch nichts abgezogen. Ein Vermerk
-- slices.shop.revoked im Spielstand stammt dann vom Spieler und ist kein Beweis – das Gold wird trotzdem abgezogen.
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
      had := coalesce((snap #> '{slices,shop,credited}') ? o.id::text, false)
          or coalesce((snap #> '{slices,shop,revoked}') ? o.id::text, false);
      -- Nie abgeholt und nicht im Spielstand: nichts abzuziehen.
      if not had and o.delivered_at is null and o.credited_at is null then continue; end if;
      snap := jsonb_set(snap, '{slices,wallet,gold}',
        to_jsonb(coalesce((snap #>> '{slices,wallet,gold}')::numeric, 0) - o.gold));
      snap := jsonb_set(snap, '{slices,shop}', coalesce(snap #> '{slices,shop}', '{}'::jsonb));
      if not coalesce((snap #> '{slices,shop,revoked}') ? o.id::text, false) then
        snap := jsonb_set(snap, '{slices,shop,revoked}',
          (case when jsonb_typeof(snap #> '{slices,shop,revoked}') = 'array' then snap #> '{slices,shop,revoked}' else '[]'::jsonb end)
          || to_jsonb(o.id::text));
      end if;
      snap := jsonb_set(snap, '{meta,savedAt}', to_jsonb(ms));
      update public.characters set snapshot = snap, saved_at = now() where user_id = c.user_id and id = c.id;
      n := n + 1;
    end loop;
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

-- Das Spiel fragt beim Start offene Rückbuchungen ab. Noch nicht abgezogene zieht jetzt der Server selbst ab (falls der
-- Webhook scheiterte). Geliefert werden die vom Server abgezogenen Bestellungen der letzten 30 Tage: Das Spiel bucht sie
-- lokal nur ab, wenn sein Stand den Vermerk noch nicht hat (gleiche Ausgangslage wie die Cloud, also kein Doppelabzug).
create or replace function public.shop_pending_revokes(p_character text)
returns table (id uuid, gold int, product_id text, status text)
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select o.id from public.gold_orders o
    where o.user_id = (select auth.uid()) and o.character_id = p_character and o.kind = 'gold'
      and o.status in ('refunded', 'disputed') and o.revoked_at is null
      and (o.delivered_at is not null or o.credited_at is not null)
  loop
    perform public.shop_server_revoke(r.id);
  end loop;
  return query
    select o.id, o.gold, o.product_id, o.status from public.gold_orders o
    where o.user_id = (select auth.uid()) and o.character_id = p_character and o.kind = 'gold'
      and o.status in ('refunded', 'disputed') and o.revoked_at > now() - interval '30 days'
    order by o.updated_at;
end $$;
revoke execute on function public.shop_pending_revokes(text) from public, anon;
grant execute on function public.shop_pending_revokes(text) to authenticated;

-- Bestätigung des Spiels: setzt revoked_at nie mehr ohne Abzug, sondern zieht noch offene eigene Rückbuchungen
-- serverseitig ab. Liefert die Zahl der eigenen, jetzt abgezogenen Bestellungen aus p_ids.
create or replace function public.shop_confirm_revokes(p_ids uuid[])
returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int;
begin
  for r in select o.id from public.gold_orders o
    where o.id = any (p_ids) and o.user_id = (select auth.uid()) and o.kind = 'gold'
      and o.status in ('refunded', 'disputed') and o.revoked_at is null
  loop
    perform public.shop_server_revoke(r.id);
  end loop;
  select count(*) into n from public.gold_orders o
    where o.id = any (p_ids) and o.user_id = (select auth.uid()) and o.revoked_at is not null;
  return n;
end $$;
revoke execute on function public.shop_confirm_revokes(uuid[]) from public, anon;
grant execute on function public.shop_confirm_revokes(uuid[]) to authenticated;

-- Übergang: Hat ein Spieler eine Rückbuchung vor dieser Migration selbst im Spiel abgezogen (alter Ablauf, Vermerk im
-- Spielstand, Bestätigung fehlt), gilt sie als erledigt, damit der Server sie nicht ein zweites Mal abzieht.
update public.gold_orders o set revoked_at = now()
where o.kind = 'gold' and o.status in ('refunded', 'disputed') and o.revoked_at is null
  and exists (select 1 from public.characters c where c.user_id = o.user_id and c.id = o.character_id
              and coalesce((c.snapshot #> '{slices,shop,revoked}') ? o.id::text, false));

-- ------------------------------------------------------------------ D13: Erstattetes Gold senkt die Gold-Obergrenze
-- characters_plausible erlaubt Gold bis 50 000 + 150 je Sekunde geprüfter Spielzeit + Shop-Gold dieses Charakters.
-- Bisher zählte nur bezahltes Gold; ein serverseitig abgezogenes Paket ließ sich deshalb einfach wieder hochladen,
-- solange es unter die Gratis-Grenze passte. Jetzt wird gelieferte, aber erstattete/zurückgebuchte Ware abgezogen.
-- Ehrliche Spieler liegen danach weiter darunter (ihr Gold ist um genau diesen Betrag gesunken).
create or replace function public.characters_shop_gold(p_user uuid, p_character text) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare g numeric := 0;
begin
  if pg_trigger_depth() < 1 then raise exception 'nicht erlaubt' using errcode = '42501'; end if;
  if to_regclass('public.gold_orders') is null then return 0; end if;
  execute 'select coalesce(sum(case when status in (''paid'', ''credited'') then gold else -gold end), 0)
             from public.gold_orders where user_id = $1 and character_id = $2
              and (status in (''paid'', ''credited'')
                   or (status in (''refunded'', ''disputed'') and (delivered_at is not null or credited_at is not null)))'
    into g using p_user, p_character;
  return g;
end $$;
revoke execute on function public.characters_shop_gold(uuid, text) from public, anon;
-- Der Trigger läuft mit der Rolle des Spielers und braucht deshalb das Ausführrecht (Aufruf von außen weist die Funktion ab).
grant execute on function public.characters_shop_gold(uuid, text) to authenticated;

-- ------------------------------------------------------------------ D14: Zustimmungen begrenzen
create or replace function public.terms_consent_record() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v text := left(nullif(trim(new.raw_user_meta_data ->> 'terms_version'), ''), 32);
begin
  if v is null then return new; end if;
  if tg_op = 'UPDATE' and v is not distinct from left(nullif(trim(old.raw_user_meta_data ->> 'terms_version'), ''), 32) then
    return new;
  end if;
  -- Die Kontodaten ändert der Spieler selbst: nicht beliebig viele Fassungen speichern (Tabelle fluten).
  if (select count(*) from public.terms_consents c where c.user_id = new.id) >= 20 then return new; end if;
  insert into public.terms_consents (user_id, terms_version, source)
    values (new.id, v, case when tg_op = 'INSERT' then 'registrierung' else 'bestaetigung' end)
    on conflict (user_id, terms_version) do nothing;
  return new;
end $$;
revoke execute on function public.terms_consent_record() from public, anon, authenticated;

-- ------------------------------------------------------------------ D6: Chatsperren gelöschter Konten
create or replace function public.cleanup_personal_data() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if to_regprocedure('public.cleanup_forms()') is not null then
    perform public.cleanup_forms();
  end if;
  if to_regprocedure('public.cleanup_chat_moderation()') is not null then
    perform public.cleanup_chat_moderation();
  end if;
  if to_regclass('public.chat_mutes') is not null then
    -- Sperre eines gelöschten Kontos wirkt nicht mehr (neues Konto = neue Kennung): mit dem Konto löschen.
    delete from public.chat_mutes m where not exists (select 1 from auth.users u where u.id = m.user_id);
  end if;
  if to_regclass('public.character_flags') is not null then
    delete from public.character_flags f
      where f.created_at < now() - interval '365 days'
         or not exists (select 1 from auth.users u where u.id = f.user_id);
  end if;
  if to_regprocedure('public.cleanup_shop()') is not null then
    perform public.cleanup_shop();
  end if;
  if to_regclass('public.gold_orders') is not null then
    delete from public.gold_orders o
      where o.status in ('pending', 'failed', 'expired') and o.created_at < now() - interval '90 days';
  end if;
end $$;
revoke execute on function public.cleanup_personal_data() from public, anon, authenticated;

-- ------------------------------------------------------------------ D17: Rechte aufräumen (Supabase vergibt sie per Default)
revoke all on all sequences in schema public from anon, authenticated;
grant usage, select on all sequences in schema public to service_role;
revoke execute on function public.gold_orders_touch() from public, anon, authenticated;
revoke execute on function public.characters_plausible() from public, anon, authenticated;
revoke execute on function public.characters_shop_check() from public, anon, authenticated;
revoke truncate, references, trigger on public.characters from authenticated;

-- PostgREST: geänderte Funktionen sofort bekannt machen.
notify pgrst, 'reload schema';
