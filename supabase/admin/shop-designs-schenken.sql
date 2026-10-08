-- Emberwrath: alle Shop-Designs (Phönixschwinge, Sternenhengst, Seelenwolf samt Färbungen) einem Konto schenken.
-- Voraussetzung: Shop-Migrationen 20261001230000, 20261003140000, 20261005120000 (shop_grants).
-- Konto über die E-Mail-Adresse wählen. Im Spiel erscheinen die Reittiere beim nächsten Betreten der Welt.
insert into public.shop_grants (user_id, item, note)
  select u.id, e.key, 'Admin-Konto'
  from auth.users u cross join public.shop_exclusive_items e
  where lower(u.email) = lower('kroll.do@googlemail.com')
on conflict do nothing;

select u.email, g.item, g.granted_at from public.shop_grants g join auth.users u on u.id = g.user_id
  where lower(u.email) = lower('kroll.do@googlemail.com') order by g.item;
