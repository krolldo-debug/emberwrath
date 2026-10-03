-- Emberwrath: Gold-Shop, Rückbuchungen. Nach 20261001230000_goldshop.sql im SQL-Editor ausführen. Siehe docs/SHOP.md.
--
-- Wird eine schon gutgeschriebene Zahlung erstattet (charge.refunded) oder per Kreditkarte/PayPal zurückgebucht
-- (charge.dispute.created), setzt der Worker die Bestellung auf 'refunded' bzw. 'disputed'. Das Spiel holt solche
-- Bestellungen ab (shop_pending_revokes), zieht das Gold beim Charakter wieder ab (auch ins Minus), speichert und
-- bestätigt (shop_confirm_revokes → revoked_at). Bis dahin nimmt der Worker von diesem Konto keine neuen Käufe an.
-- Nach einer Rückbuchung (disputed) bleibt das Konto für Käufe gesperrt, bis ein Admin sie mit admin_shop_unblock(user_id) aufhebt.

alter table public.gold_orders add column if not exists revoked_at timestamptz;

create table if not exists public.shop_blocks (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  reason     text not null check (char_length(reason) <= 200),
  blocked_at timestamptz not null default now()
);
alter table public.shop_blocks enable row level security;
-- keine Policies: Spieler können ihre Sperre weder lesen noch löschen
revoke all on public.shop_blocks from anon, authenticated;
grant select, insert, update, delete on public.shop_blocks to service_role;

-- Gutgeschriebene, aber erstattete/zurückgebuchte Bestellungen eines Charakters, deren Gold noch abgezogen werden muss.
create or replace function public.shop_pending_revokes(p_character text)
returns table (id uuid, gold int, product_id text, status text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.gold, o.product_id, o.status from public.gold_orders o
  where o.user_id = (select auth.uid()) and o.character_id = p_character
    and o.status in ('refunded', 'disputed') and o.credited_at is not null and o.revoked_at is null
  order by o.updated_at;
$$;

create or replace function public.shop_confirm_revokes(p_ids uuid[])
returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.gold_orders o set revoked_at = now()
  where o.id = any (p_ids) and o.user_id = (select auth.uid())
    and o.status in ('refunded', 'disputed') and o.credited_at is not null and o.revoked_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- Admin-Übersicht jetzt mit revoked_at und Sperre.
drop function if exists public.admin_gold_orders(int);
create function public.admin_gold_orders(p_limit int default 200)
returns table (id uuid, email text, character_id text, product_id text, gold int, amount_cents int, currency text,
               status text, livemode boolean, created_at timestamptz, paid_at timestamptz, credited_at timestamptz,
               revoked_at timestamptz, shop_blocked boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query
    select o.id, u.email::text, o.character_id, o.product_id, o.gold, o.amount_cents, o.currency, o.status, o.livemode,
           o.created_at, o.paid_at, o.credited_at, o.revoked_at,
           exists (select 1 from public.shop_blocks b where b.user_id = o.user_id)
    from public.gold_orders o left join auth.users u on u.id = o.user_id
    order by o.created_at desc limit least(greatest(p_limit, 1), 1000);
end $$;

-- Admin: Kaufsperre eines Kontos aufheben.
create or replace function public.admin_shop_unblock(p_user uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  delete from public.shop_blocks where user_id = p_user;
  return found;
end $$;

revoke execute on function public.shop_pending_revokes(text) from public, anon;
revoke execute on function public.shop_confirm_revokes(uuid[]) from public, anon;
revoke execute on function public.admin_gold_orders(int) from public, anon;
revoke execute on function public.admin_shop_unblock(uuid) from public, anon;
grant execute on function public.shop_pending_revokes(text) to authenticated;
grant execute on function public.shop_confirm_revokes(uuid[]) to authenticated;
grant execute on function public.admin_gold_orders(int) to authenticated;
grant execute on function public.admin_shop_unblock(uuid) to authenticated;
