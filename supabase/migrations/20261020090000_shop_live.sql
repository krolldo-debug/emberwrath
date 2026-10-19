-- Emberwrath: Shop vor dem Live-Start (Sicherheitsbericht 2: D5-Rest, D15). Einmal im SQL-Editor ausführen, nach allen
-- bisherigen Migrationen. Mehrfach ausführbar. Der Worker läuft auch ohne diese Datei weiter (dann ohne Konto-Bezug der Sperren).
--
-- 1. Kaufsperren (shop_block_marks) enthalten jetzt Prüfwerte per HMAC mit einem Geheimnis des Workers (worker/shop.js,
--    SHOP_HASH_SECRET bzw. Service-Secret): von der E-Mail-Adresse und neu vom Zahlungsmittel (Kartenfingerabdruck von
--    Stripe, PayPal-Konto). Die Spalte heißt weiter email_hash. Neu: user_id, damit admin_shop_unblock auch die Sperre
--    des Zahlungsmittels findet. Wird das Konto gelöscht, wird user_id leer, die Sperre bleibt (Betrugsabwehr).
-- 2. Löschfrist (D15): Der Prüfwert an der Bestellung (gold_orders.email_hash) wird 180 Tage nach der Zahlung gelöscht,
--    danach sind Rückbuchungen praktisch nicht mehr möglich. Sperrvermerke bleiben drei Jahre bzw. bis ein Admin sie aufhebt.

alter table public.shop_block_marks add column if not exists user_id uuid references auth.users (id) on delete set null;
create index if not exists shop_block_marks_user_idx on public.shop_block_marks (user_id) where user_id is not null;
revoke all on public.shop_block_marks from anon, authenticated;
grant select, insert, update, delete on public.shop_block_marks to service_role;

create or replace function public.admin_shop_unblock(p_user uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int; m int;
begin
  perform public.assert_admin();
  delete from public.shop_blocks where user_id = p_user;
  get diagnostics n = row_count;
  delete from public.shop_block_marks k
    where k.user_id = p_user
       or k.email_hash in (select o.email_hash from public.gold_orders o where o.user_id = p_user and o.email_hash is not null);
  get diagnostics m = row_count;
  return n > 0 or m > 0;
end $$;
revoke execute on function public.admin_shop_unblock(uuid) from public, anon;
grant execute on function public.admin_shop_unblock(uuid) to authenticated;

-- Täglich aus cleanup_personal_data() (pg_cron).
create or replace function public.cleanup_shop() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.shop_block_marks where blocked_at < now() - interval '3 years';
  -- Prüfwert an der Bestellung nach Ablauf der Rückbuchungsfrist; bleibt nur, solange eine Sperre ihn noch braucht
  update public.gold_orders o set email_hash = null
    where o.email_hash is not null and coalesce(o.paid_at, o.created_at) < now() - interval '180 days'
      and not exists (select 1 from public.shop_block_marks k where k.email_hash = o.email_hash);
end $$;
revoke execute on function public.cleanup_shop() from public, anon, authenticated;
