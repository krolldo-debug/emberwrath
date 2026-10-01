-- Emberwrath: Gold-Shop (Gold für Echtgeld über Stripe). Einmal im Supabase-SQL-Editor ausführen. Siehe docs/SHOP.md.
--
-- Ablauf
--  1. Spiel fragt den Worker nach einem Kauf (/net/shop/checkout). Der Worker legt eine Bestellung 'pending' an
--     (service_role) und leitet zur Bezahlseite von Stripe.
--  2. Stripe meldet die Zahlung per Webhook an den Worker (/net/shop/webhook, Signatur geprüft) → 'paid'.
--  3. Das Spiel holt bezahlte Bestellungen seines Charakters ab (shop_pending_credits), schreibt das Gold gut,
--     speichert und bestätigt (shop_confirm_credits) → 'credited'. Bricht das Spiel dazwischen ab, bleibt die
--     Bestellung 'paid' und wird beim nächsten Mal erneut angeboten; der Spielstand merkt sich gutgeschriebene
--     Bestellungen, damit nichts doppelt ankommt.
--
-- Sicherheit
--  - Spieler können ihre Bestellungen nur lesen. Anlegen und auf 'paid' setzen kann nur der Worker (service_role)
--    nach einer von Stripe signierten Zahlungsbestätigung. Ein Spieler kann sich also kein Gold „kaufen“, ohne zu zahlen.
--  - Bestellungen bleiben bei Kontolöschung erhalten (user_id wird leer): Zahlungsbelege sind aufbewahrungspflichtig.

create table if not exists public.gold_orders (
  id                    uuid        primary key,
  user_id               uuid        references auth.users (id) on delete set null,
  character_id          text        not null check (character_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  product_id            text        not null check (char_length(product_id) <= 32),
  gold                  int         not null check (gold > 0),
  amount_cents          int         not null check (amount_cents > 0),
  currency              text        not null default 'eur' check (char_length(currency) = 3),
  status                text        not null default 'pending'
                          check (status in ('pending', 'paid', 'credited', 'failed', 'expired', 'refunded', 'disputed')),
  stripe_session_id     text        unique,
  stripe_payment_intent text,
  livemode              boolean     not null default false,
  withdrawal_waiver_at  timestamptz not null,   -- Zustimmung: sofortige Gutschrift, Widerrufsrecht erlischt (§ 356 Abs. 5 BGB)
  created_at            timestamptz not null default now(),
  paid_at               timestamptz,
  credited_at           timestamptz,
  updated_at            timestamptz not null default now()
);
create index if not exists gold_orders_user_idx on public.gold_orders (user_id, character_id, status);
create index if not exists gold_orders_pi_idx on public.gold_orders (stripe_payment_intent);

create or replace function public.gold_orders_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists gold_orders_touch on public.gold_orders;
create trigger gold_orders_touch before update on public.gold_orders for each row execute function public.gold_orders_touch();

alter table public.gold_orders enable row level security;
drop policy if exists "eigene Bestellungen lesen" on public.gold_orders;
create policy "eigene Bestellungen lesen" on public.gold_orders for select to authenticated using ((select auth.uid()) = user_id);

-- Neue Tabellen bekommen in diesem Projekt keine automatischen Rechte: hier ausdrücklich vergeben.
revoke all on public.gold_orders from anon, authenticated;
grant select on public.gold_orders to authenticated;
grant select, insert, update on public.gold_orders to service_role;

-- Bezahlte, noch nicht gutgeschriebene Bestellungen des angemeldeten Kontos für einen Charakter.
create or replace function public.shop_pending_credits(p_character text)
returns table (id uuid, gold int, product_id text, paid_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id, o.gold, o.product_id, o.paid_at from public.gold_orders o
  where o.user_id = (select auth.uid()) and o.character_id = p_character and o.status = 'paid'
  order by o.paid_at;
$$;

-- Gutschrift bestätigen (nach dem Speichern im Spiel). Liefert die Anzahl bestätigter Bestellungen.
create or replace function public.shop_confirm_credits(p_ids uuid[])
returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.gold_orders o set status = 'credited', credited_at = now()
  where o.id = any (p_ids) and o.user_id = (select auth.uid()) and o.status = 'paid';
  get diagnostics n = row_count;
  return n;
end $$;

-- Admin: letzte Bestellungen mit Konto (für Auswertung und Support).
create or replace function public.admin_gold_orders(p_limit int default 200)
returns table (id uuid, email text, character_id text, product_id text, gold int, amount_cents int, currency text,
               status text, livemode boolean, created_at timestamptz, paid_at timestamptz, credited_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query
    select o.id, u.email::text, o.character_id, o.product_id, o.gold, o.amount_cents, o.currency, o.status, o.livemode,
           o.created_at, o.paid_at, o.credited_at
    from public.gold_orders o left join auth.users u on u.id = o.user_id
    order by o.created_at desc limit least(greatest(p_limit, 1), 1000);
end $$;

revoke execute on function public.shop_pending_credits(text) from public, anon;
revoke execute on function public.shop_confirm_credits(uuid[]) from public, anon;
revoke execute on function public.admin_gold_orders(int) from public, anon;
grant execute on function public.shop_pending_credits(text) to authenticated;
grant execute on function public.shop_confirm_credits(uuid[]) to authenticated;
grant execute on function public.admin_gold_orders(int) to authenticated;
