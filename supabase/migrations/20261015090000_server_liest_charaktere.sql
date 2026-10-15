-- Der Worker (Glutarena worker/pvp/arena.js, Chat-Moderation worker/moderation.js) liest Name, Stufe, Klasse und Volk
-- eines gespeicherten Charakters mit dem Secret Key (Rolle service_role). Neuere Supabase-Projekte vergeben dieser
-- Rolle auf neuen Tabellen keine Rechte; ohne dieses Recht gelten dort nur die Angaben des Spiels. Nur Lesen.
grant select on public.characters to service_role;
