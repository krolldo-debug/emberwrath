-- Emberwrath: Käufe im App Store (iOS-App ab Version 1.1). Einmal im Supabase-SQL-Editor ausführen, nach allen bisherigen
-- Migrationen. Mehrfach ausführbar. Siehe docs/SHOP.md, Abschnitt „App Store“.
--
-- Ein Kauf in der App wird vom Worker (/net/shop/apple) mit der Signatur von Apple geprüft und als bezahlte Bestellung in
-- public.gold_orders eingetragen (provider 'apple'). Ab da läuft alles wie bei Stripe: Das Spiel holt das Gold ab
-- (shop_pending_credits), Designs zählen über shop_owned_items, Erstattungen meldet Apple an /net/shop/apple/notify und
-- der Worker zieht sie über shop_server_revoke ab. Jede Transaktion von Apple kann nur einmal gutgeschrieben werden.

alter table public.gold_orders add column if not exists provider text not null default 'stripe';
alter table public.gold_orders drop constraint if exists gold_orders_provider_check;
alter table public.gold_orders add constraint gold_orders_provider_check check (provider in ('stripe', 'apple'));
alter table public.gold_orders add column if not exists apple_transaction_id text
  check (apple_transaction_id is null or apple_transaction_id ~ '^[0-9]{1,24}$');
alter table public.gold_orders add column if not exists apple_original_transaction_id text
  check (apple_original_transaction_id is null or apple_original_transaction_id ~ '^[0-9]{1,24}$');
create unique index if not exists gold_orders_apple_tx_idx on public.gold_orders (apple_transaction_id);

-- Im App Store gelten Apples Bedingungen (Widerruf und Erstattung über Apple), es gibt kein eigenes Häkchen.
alter table public.gold_orders alter column withdrawal_waiver_at drop not null;
alter table public.gold_orders drop constraint if exists gold_orders_waiver_check;
alter table public.gold_orders add constraint gold_orders_waiver_check check (provider = 'apple' or withdrawal_waiver_at is not null);

-- Auswertung für Admins: Herkunft je Bestellung.
create or replace function public.admin_apple_orders(p_limit int default 200)
returns table (id uuid, email text, character_id text, product_id text, gold int, amount_cents int, currency text,
               status text, livemode boolean, apple_transaction_id text, paid_at timestamptz, credited_at timestamptz,
               revoked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query
    select o.id, u.email::text, o.character_id, o.product_id, o.gold, o.amount_cents, o.currency, o.status, o.livemode,
           o.apple_transaction_id, o.paid_at, o.credited_at, o.revoked_at
    from public.gold_orders o left join auth.users u on u.id = o.user_id
    where o.provider = 'apple'
    order by o.created_at desc limit least(greatest(p_limit, 1), 1000);
end $$;
revoke execute on function public.admin_apple_orders(int) from public, anon;
grant execute on function public.admin_apple_orders(int) to authenticated;
