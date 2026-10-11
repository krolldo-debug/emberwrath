-- Emberwrath: Dolche führt nur noch der Schurke (Waldläufer = nur Fernkampf, 11.10.).
-- Einmal im Supabase-SQL-Editor ausführen, nach 20261011090000_auktionshaus.sql. Mehrfach ausführbar.
-- Wirkt nur auf den Filter „für meine Klasse“ im Auktionshaus.
update public.market_items set classes = '{rogue}' where classes = '{rogue,ranger}';
update public.market_listings set classes = '{rogue}' where classes = '{rogue,ranger}';
