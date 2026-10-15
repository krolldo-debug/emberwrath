-- Emberwrath: Fortschrittsbuch (D3 – der Server bestätigt Erfahrung, Gold, Gegenstände und Beute).
-- Einmal im Supabase-SQL-Editor ausführen, NACH allen bisherigen Migrationen (zuletzt 20261015090000_server_liest_charaktere.sql)
-- und erst, wenn das Spiel mit src/ledger live ist. Mehrfach ausführbar.
-- Erzeugt mit: node src/ledger/ledgerSql.mjs (Zählung wie src/ledger/values.js, Regeln in src/ledger/rules.js).
--
-- So funktioniert es
--  - Das Spiel meldet dem Server (Worker /net/buch) jede Änderung an Erfahrung, Gold und Gegenständen. Der Worker prüft
--    sie mit den Spielregeln (Kills mit Tempo-Grenze, Beute mit Würfeln des Servers, Quests, Händlerpreise, Rezepte,
--    Tages- und Wochenbelohnungen) und führt je Charakter ein Buch: public.character_ledger (xp, gold, items).
--  - Jeder hochgeladene Spielstand wird mit dem Buch verglichen (Trigger characters_z_ledger, läuft als letzter).
--    Liegt er darüber, wird er auf das Buch gekappt (überzählige Gegenstände, Gold und Erfahrung entfernt) und als
--    'buch' vermerkt. Die Spalte saved_at ändert sich dann; das Spiel übernimmt den gekappten Cloud-Stand.
--  - Was der Server selbst in Spielstände schreibt (Auktionshaus, Postfach, Rückbuchungen, Admin im SQL-Editor), spiegelt
--    characters_z_ledger_after ins Buch. Neue Charaktere beginnen mit ihrem ersten gespeicherten Stand (Startpaket).
--  - Übergang: Charaktere ohne Sitzung des Buchs (state leer) übernehmen ihren hochgeladenen Stand als Buch, bis
--    2 Tage nach der ersten Sitzung mit dem neuen Spiel (ledger_config.strict_after). So verliert niemand Fortschritt,
--    der mit einem noch offenen alten Spielfenster entstand.
--  - Notbremse: update public.ledger_config set enforce = false;  → nur noch vermerken, nicht kappen.
--  - Für Spieler nicht lesbar (RLS ohne Policies); nur der Worker (service_role) und die Trigger greifen zu.

-- ------------------------------------------------------------------ Lesen für den Worker
grant select on public.characters to service_role;

-- ------------------------------------------------------------------ Tabellen
create table if not exists public.character_ledger (
  user_id      uuid not null,
  character_id text not null,
  xp           bigint not null default 0,
  gold         bigint not null default 0,
  items        jsonb not null default '{}'::jsonb,   -- { itemId: Anzahl }
  state        jsonb,                                -- Merkzettel des Workers (Sitzungen, Beutescheine, Quests); leer = noch keine Sitzung
  ver          bigint not null default 0,            -- für Schreiben nur bei unverändertem Stand (Worker)
  updated_at   timestamptz not null default now(),
  primary key (user_id, character_id),
  foreign key (user_id, character_id) references public.characters (user_id, id) on delete cascade on update cascade
);
create table if not exists public.ledger_items (id text primary key);                            -- gezählte Gegenstände
create table if not exists public.ledger_mounts (mount_id text primary key, item_id text not null); -- Reittier = Gegenstand
create table if not exists public.ledger_levels (level int primary key, xp bigint not null);      -- Erfahrung je Stufe
create table if not exists public.ledger_config (
  id           int primary key default 1 check (id = 1),
  strict_after timestamptz,                -- leer: Übergang läuft noch (erste Sitzung setzt es auf jetzt + 2 Tage)
  enforce      boolean not null default true
);
insert into public.ledger_config (id) values (1) on conflict (id) do nothing;

alter table public.character_ledger enable row level security;
alter table public.ledger_items enable row level security;
alter table public.ledger_mounts enable row level security;
alter table public.ledger_levels enable row level security;
alter table public.ledger_config enable row level security;
revoke all on public.character_ledger, public.ledger_items, public.ledger_mounts, public.ledger_levels, public.ledger_config
  from anon, authenticated;
grant select, insert, update, delete on public.character_ledger to service_role;
grant select on public.ledger_items, public.ledger_mounts, public.ledger_levels, public.ledger_config to service_role;

-- ------------------------------------------------------------------ Daten (aus dem Spiel erzeugt)
delete from public.ledger_items;
insert into public.ledger_items (id) values
('acolyte_charm'),('adept_sigil'),('adept_staff'),('adept_staff_ember'),('adept_staff_owl'),('amethyst'),('amethyst_seal'),('arcane_robe'),
('ash_charm'),('ashen_greatsword'),('ashen_greatsword_bear'),('ashen_greatsword_guard'),('ashfall'),('ashfang'),('ashguard_hauberk'),('ashguard_hauberk_bear'),
('ashguard_hauberk_hawk'),('ashguard_sabre'),('ashguard_sabre_bear'),('ashguard_sabre_fox'),('ashmaw'),('ashsilk_cowl'),('ashsilk_cowl_ember'),('ashsilk_cowl_owl'),
('ashsilk_slippers'),('ashsilk_slippers_ember'),('ashsilk_slippers_owl'),('ashwood_staff'),('aurora_staff'),('bandit_boots'),('bandit_club'),('bandit_gloves'),
('bandit_hood'),('bandit_sabre'),('barrow_amulet'),('barrow_axe'),('barrow_axe_bear'),('barrow_axe_guard'),('barrow_band'),('barrow_blade'),
('barrow_blade_bear'),('barrow_blade_fox'),('barrow_bone'),('barrow_boots'),('barrow_boots_fox'),('barrow_boots_hawk'),('barrow_bow'),('barrow_bow_fox'),
('barrow_bow_hawk'),('barrow_cap'),('barrow_cap_fox'),('barrow_cap_hawk'),('barrow_claymore'),('barrow_claymore_bear'),('barrow_claymore_guard'),('barrow_coif'),
('barrow_coif_bear'),('barrow_coif_hawk'),('barrow_cuirass'),('barrow_cuirass_bear'),('barrow_cuirass_guard'),('barrow_dagger'),('barrow_dagger_fox'),('barrow_dagger_hawk'),
('barrow_gauntlets'),('barrow_gauntlets_bear'),('barrow_gauntlets_guard'),('barrow_gloves'),('barrow_gloves_ember'),('barrow_gloves_owl'),('barrow_greatsword'),('barrow_greatsword_bear'),
('barrow_greatsword_guard'),('barrow_greaves'),('barrow_greaves_bear'),('barrow_greaves_hawk'),('barrow_grips'),('barrow_grips_fox'),('barrow_grips_hawk'),('barrow_hatchet'),
('barrow_hatchet_bear'),('barrow_hatchet_guard'),('barrow_hauberk'),('barrow_hauberk_bear'),('barrow_hauberk_hawk'),('barrow_helm'),('barrow_helm_bear'),('barrow_helm_guard'),
('barrow_hood'),('barrow_hood_ember'),('barrow_hood_owl'),('barrow_jerkin'),('barrow_jerkin_fox'),('barrow_jerkin_hawk'),('barrow_longbow'),('barrow_longbow_fox'),
('barrow_longbow_hawk'),('barrow_mace'),('barrow_mace_bear'),('barrow_mace_guard'),('barrow_mitts'),('barrow_mitts_bear'),('barrow_mitts_hawk'),('barrow_morningstar'),
('barrow_morningstar_bear'),('barrow_morningstar_guard'),('barrow_pendant'),('barrow_quarterstaff'),('barrow_quarterstaff_ember'),('barrow_quarterstaff_owl'),('barrow_ring'),('barrow_robe'),
('barrow_robe_ember'),('barrow_robe_owl'),('barrow_rod'),('barrow_rod_ember'),('barrow_rod_owl'),('barrow_sabatons'),('barrow_sabatons_bear'),('barrow_sabatons_guard'),
('barrow_sabre'),('barrow_sabre_bear'),('barrow_sabre_fox'),('barrow_scimitar'),('barrow_scimitar_bear'),('barrow_scimitar_fox'),('barrow_signet'),('barrow_slippers'),
('barrow_slippers_ember'),('barrow_slippers_owl'),('barrow_staff'),('barrow_staff_ember'),('barrow_staff_owl'),('barrow_stiletto'),('barrow_stiletto_fox'),('barrow_stiletto_hawk'),
('barrow_sword'),('barrow_sword_bear'),('barrow_sword_fox'),('barrow_talisman'),('barrow_wand'),('barrow_wand_ember'),('barrow_wand_owl'),('bastion_amulet'),
('bastion_axe'),('bastion_axe_bear'),('bastion_axe_guard'),('bastion_blade'),('bastion_blade_bear'),('bastion_blade_fox'),('bastion_boots'),('bastion_boots_fox'),
('bastion_boots_hawk'),('bastion_bow'),('bastion_bow_fox'),('bastion_bow_hawk'),('bastion_cap'),('bastion_cap_fox'),('bastion_cap_hawk'),('bastion_claymore'),
('bastion_claymore_bear'),('bastion_claymore_guard'),('bastion_coif'),('bastion_coif_bear'),('bastion_coif_hawk'),('bastion_cuirass'),('bastion_cuirass_bear'),('bastion_cuirass_guard'),
('bastion_dagger'),('bastion_dagger_fox'),('bastion_dagger_hawk'),('bastion_gauntlets'),('bastion_gauntlets_bear'),('bastion_gauntlets_guard'),('bastion_gloves'),('bastion_gloves_ember'),
('bastion_gloves_owl'),('bastion_greatsword'),('bastion_greatsword_bear'),('bastion_greatsword_guard'),('bastion_greaves'),('bastion_greaves_bear'),('bastion_greaves_hawk'),('bastion_grips'),
('bastion_grips_fox'),('bastion_grips_hawk'),('bastion_hatchet'),('bastion_hatchet_bear'),('bastion_hatchet_guard'),('bastion_hauberk'),('bastion_hauberk_bear'),('bastion_hauberk_hawk'),
('bastion_helm'),('bastion_helm_bear'),('bastion_helm_guard'),('bastion_hood'),('bastion_hood_ember'),('bastion_hood_owl'),('bastion_jerkin'),('bastion_jerkin_fox'),
('bastion_jerkin_hawk'),('bastion_longbow'),('bastion_longbow_fox'),('bastion_longbow_hawk'),('bastion_mace'),('bastion_mace_bear'),('bastion_mace_guard'),('bastion_mitts'),
('bastion_mitts_bear'),('bastion_mitts_hawk'),('bastion_morningstar'),('bastion_morningstar_bear'),('bastion_morningstar_guard'),('bastion_quarterstaff'),('bastion_quarterstaff_ember'),('bastion_quarterstaff_owl'),
('bastion_ring'),('bastion_robe'),('bastion_robe_ember'),('bastion_robe_owl'),('bastion_rod'),('bastion_rod_ember'),('bastion_rod_owl'),('bastion_sabatons'),
('bastion_sabatons_bear'),('bastion_sabatons_guard'),('bastion_sabre'),('bastion_sabre_bear'),('bastion_sabre_fox'),('bastion_scimitar'),('bastion_scimitar_bear'),('bastion_scimitar_fox'),
('bastion_slippers'),('bastion_slippers_ember'),('bastion_slippers_owl'),('bastion_staff'),('bastion_staff_ember'),('bastion_staff_owl'),('bastion_stiletto'),('bastion_stiletto_fox'),
('bastion_stiletto_hawk'),('bastion_sword'),('bastion_sword_bear'),('bastion_sword_fox'),('bastion_wand'),('bastion_wand_ember'),('bastion_wand_owl'),('bastion_warplate'),
('blightbane_amulet'),('blightbane_axe'),('blightbane_axe_bear'),('blightbane_axe_guard'),('blightbane_band'),('blightbane_blade'),('blightbane_blade_bear'),('blightbane_blade_fox'),
('blightbane_boots'),('blightbane_boots_fox'),('blightbane_boots_hawk'),('blightbane_bow'),('blightbane_bow_fox'),('blightbane_bow_hawk'),('blightbane_cap'),('blightbane_cap_fox'),
('blightbane_cap_hawk'),('blightbane_claymore'),('blightbane_claymore_bear'),('blightbane_claymore_guard'),('blightbane_coif'),('blightbane_coif_bear'),('blightbane_coif_hawk'),('blightbane_cuirass'),
('blightbane_cuirass_bear'),('blightbane_cuirass_guard'),('blightbane_dagger'),('blightbane_dagger_fox'),('blightbane_dagger_hawk'),('blightbane_gauntlets'),('blightbane_gauntlets_bear'),('blightbane_gauntlets_guard'),
('blightbane_gloves'),('blightbane_gloves_ember'),('blightbane_gloves_owl'),('blightbane_greatsword'),('blightbane_greatsword_bear'),('blightbane_greatsword_guard'),('blightbane_greaves'),('blightbane_greaves_bear'),
('blightbane_greaves_hawk'),('blightbane_grips'),('blightbane_grips_fox'),('blightbane_grips_hawk'),('blightbane_hatchet'),('blightbane_hatchet_bear'),('blightbane_hatchet_guard'),('blightbane_hauberk'),
('blightbane_hauberk_bear'),('blightbane_hauberk_hawk'),('blightbane_helm'),('blightbane_helm_bear'),('blightbane_helm_guard'),('blightbane_hood'),('blightbane_hood_ember'),('blightbane_hood_owl'),
('blightbane_jerkin'),('blightbane_jerkin_fox'),('blightbane_jerkin_hawk'),('blightbane_longbow'),('blightbane_longbow_fox'),('blightbane_longbow_hawk'),('blightbane_mace'),('blightbane_mace_bear'),
('blightbane_mace_guard'),('blightbane_mitts'),('blightbane_mitts_bear'),('blightbane_mitts_hawk'),('blightbane_morningstar'),('blightbane_morningstar_bear'),('blightbane_morningstar_guard'),('blightbane_pendant'),
('blightbane_quarterstaff'),('blightbane_quarterstaff_ember'),('blightbane_quarterstaff_owl'),('blightbane_ring'),('blightbane_robe'),('blightbane_robe_ember'),('blightbane_robe_owl'),('blightbane_rod'),
('blightbane_rod_ember'),('blightbane_rod_owl'),('blightbane_sabatons'),('blightbane_sabatons_bear'),('blightbane_sabatons_guard'),('blightbane_sabre'),('blightbane_sabre_bear'),('blightbane_sabre_fox'),
('blightbane_scimitar'),('blightbane_scimitar_bear'),('blightbane_scimitar_fox'),('blightbane_signet'),('blightbane_slippers'),('blightbane_slippers_ember'),('blightbane_slippers_owl'),('blightbane_staff'),
('blightbane_staff_ember'),('blightbane_staff_owl'),('blightbane_stiletto'),('blightbane_stiletto_fox'),('blightbane_stiletto_hawk'),('blightbane_sword'),('blightbane_sword_bear'),('blightbane_sword_fox'),
('blightbane_talisman'),('blightbane_wand'),('blightbane_wand_ember'),('blightbane_wand_owl'),('bog_amulet'),('bog_axe'),('bog_blade'),('bog_boots'),
('bog_bow'),('bog_cap'),('bog_claymore'),('bog_coif'),('bog_cuirass'),('bog_dagger'),('bog_gauntlets'),('bog_gloves'),
('bog_greatsword'),('bog_greaves'),('bog_grips'),('bog_hatchet'),('bog_hauberk'),('bog_helm'),('bog_hood'),('bog_iron'),
('bog_jerkin'),('bog_longbow'),('bog_mace'),('bog_mitts'),('bog_morningstar'),('bog_quarterstaff'),('bog_ring'),('bog_robe'),
('bog_rod'),('bog_sabatons'),('bog_sabre'),('bog_scimitar'),('bog_slippers'),('bog_staff'),('bog_stiletto'),('bog_sword'),
('bog_wand'),('bogdread_boots'),('bogdread_grips'),('bogdread_hood'),('bogdread_jerkin'),('bogwitch_wand'),('bone_amulet'),('bone_bow'),
('bone_bow_fox'),('bone_bow_hawk'),('bone_dust'),('bone_mail'),('bone_staff'),('bone_staff_ember'),('bone_staff_owl'),('bone_wand'),
('bone_wand_ember'),('bone_wand_owl'),('bonebreaker_longsword'),('bonebreaker_longsword_bear'),('bonebreaker_longsword_fox'),('bonesplitter'),('bonesplitter_bear'),('bonesplitter_guard'),
('borderlord_greatsword'),('borderlord_greatsword_bear'),('borderlord_greatsword_guard'),('borderwatch_broadsword'),('borderwatch_broadsword_bear'),('borderwatch_broadsword_fox'),('borderwatch_gauntlets'),('borderwatch_gauntlets_bear'),
('borderwatch_gauntlets_guard'),('borka_cleaver'),('brom_ring'),('chain_gloves'),('chain_gloves_bear'),('chain_gloves_hawk'),('chain_greaves'),('chain_greaves_bear'),
('chain_greaves_hawk'),('chain_shirt'),('cinder_axe'),('cinder_axe_bear'),('cinder_axe_guard'),('cinder_band'),('cinder_blade'),('cinder_blade_bear'),
('cinder_blade_fox'),('cinder_boots'),('cinder_boots_bear'),('cinder_boots_hawk'),('cinder_bow'),('cinder_bow_fox'),('cinder_bow_hawk'),('cinder_cowl'),
('cinder_cowl_ember'),('cinder_cowl_owl'),('cinder_gloves'),('cinder_gloves_bear'),('cinder_gloves_hawk'),('cinder_helm'),('cinder_helm_bear'),('cinder_helm_hawk'),
('cinder_knife'),('cinder_knife_fox'),('cinder_knife_hawk'),('cinder_kris'),('cinder_leather'),('cinder_leather_fox'),('cinder_leather_hawk'),('cinder_mail'),
('cinder_mail_bear'),('cinder_mail_hawk'),('cinder_robe'),('cinder_robe_ember'),('cinder_robe_owl'),('cinder_staff'),('cinder_staff_ember'),('cinder_staff_owl'),
('cinder_wand'),('cinder_wand_ember'),('cinder_wand_owl'),('cinder_wraps'),('cinder_wraps_ember'),('cinder_wraps_owl'),('cinderfist_maul'),('cinderstorm_bow'),
('circle_robe'),('circle_robe_ember'),('circle_robe_owl'),('colossus_gloves'),('colossus_hood'),('colossus_robe'),('colossus_slippers'),('copper_ring'),
('crown_of_embers_blade'),('cryptlord_crown'),('cryptlord_plate'),('cryptwarden_star'),('cryptwarden_star_bear'),('cryptwarden_star_guard'),('crystal_silk'),('crystal_staff'),
('crystal_staff_ember'),('crystal_staff_owl'),('crystal_wand'),('crystal_wand_ember'),('crystal_wand_owl'),('cudgel'),('cultist_tome'),('dawnstring'),
('desert_kris'),('desert_kris_fox'),('desert_kris_hawk'),('double_axe'),('double_axe_bear'),('double_axe_guard'),('drifter_sandals'),('drifter_sandals_ember'),
('drifter_sandals_owl'),('drowned_moon_ring'),('dustveil_mantle'),('dustwind_blade'),('ember_blade'),('ember_core'),('ember_elixir'),('ember_grips'),
('ember_heart'),('ember_ore'),('ember_shard'),('ember_silk_robe'),('ember_staff'),('ember_wand'),('emberknight_amulet'),('emberknight_axe'),
('emberknight_axe_bear'),('emberknight_axe_guard'),('emberknight_band'),('emberknight_blade'),('emberknight_blade_bear'),('emberknight_blade_fox'),('emberknight_boots'),('emberknight_boots_fox'),
('emberknight_boots_hawk'),('emberknight_bow'),('emberknight_bow_fox'),('emberknight_bow_hawk'),('emberknight_cap'),('emberknight_cap_fox'),('emberknight_cap_hawk'),('emberknight_claymore'),
('emberknight_claymore_bear'),('emberknight_claymore_guard'),('emberknight_coif'),('emberknight_coif_bear'),('emberknight_coif_hawk'),('emberknight_cuirass'),('emberknight_cuirass_bear'),('emberknight_cuirass_guard'),
('emberknight_dagger'),('emberknight_dagger_fox'),('emberknight_dagger_hawk'),('emberknight_gauntlets'),('emberknight_gauntlets_bear'),('emberknight_gauntlets_guard'),('emberknight_gloves'),('emberknight_gloves_ember'),
('emberknight_gloves_owl'),('emberknight_greatsword'),('emberknight_greatsword_bear'),('emberknight_greatsword_guard'),('emberknight_greaves'),('emberknight_greaves_bear'),('emberknight_greaves_hawk'),('emberknight_grips'),
('emberknight_grips_fox'),('emberknight_grips_hawk'),('emberknight_hatchet'),('emberknight_hatchet_bear'),('emberknight_hatchet_guard'),('emberknight_hauberk'),('emberknight_hauberk_bear'),('emberknight_hauberk_hawk'),
('emberknight_helm'),('emberknight_helm_bear'),('emberknight_helm_guard'),('emberknight_hood'),('emberknight_hood_ember'),('emberknight_hood_owl'),('emberknight_jerkin'),('emberknight_jerkin_fox'),
('emberknight_jerkin_hawk'),('emberknight_longbow'),('emberknight_longbow_fox'),('emberknight_longbow_hawk'),('emberknight_mace'),('emberknight_mace_bear'),('emberknight_mace_guard'),('emberknight_mitts'),
('emberknight_mitts_bear'),('emberknight_mitts_hawk'),('emberknight_morningstar'),('emberknight_morningstar_bear'),('emberknight_morningstar_guard'),('emberknight_pendant'),('emberknight_quarterstaff'),('emberknight_quarterstaff_ember'),
('emberknight_quarterstaff_owl'),('emberknight_ring'),('emberknight_robe'),('emberknight_robe_ember'),('emberknight_robe_owl'),('emberknight_rod'),('emberknight_rod_ember'),('emberknight_rod_owl'),
('emberknight_sabatons'),('emberknight_sabatons_bear'),('emberknight_sabatons_guard'),('emberknight_sabre'),('emberknight_sabre_bear'),('emberknight_sabre_fox'),('emberknight_scimitar'),('emberknight_scimitar_bear'),
('emberknight_scimitar_fox'),('emberknight_signet'),('emberknight_slippers'),('emberknight_slippers_ember'),('emberknight_slippers_owl'),('emberknight_staff'),('emberknight_staff_ember'),('emberknight_staff_owl'),
('emberknight_stiletto'),('emberknight_stiletto_fox'),('emberknight_stiletto_hawk'),('emberknight_sword'),('emberknight_sword_bear'),('emberknight_sword_fox'),('emberknight_talisman'),('emberknight_wand'),
('emberknight_wand_ember'),('emberknight_wand_owl'),('embersilk_gloves'),('embersilk_gloves_ember'),('embersilk_gloves_owl'),('emberwarden_boots'),('emberwarden_gauntlets'),('emberwarden_helm'),
('emberwarden_mail'),('emberweave_robe'),('emberweave_robe_ember'),('emberweave_robe_owl'),('emberwing_scale'),('emberwraith_blade'),('emerald_ring'),('falcon_amulet'),
('fallen_crown'),('fang_charm'),('feather_charm'),('fire_opal_ring'),('forge_axe'),('forge_axe_bear'),('forge_axe_guard'),('forge_gauntlets'),
('forge_gauntlets_bear'),('forge_gauntlets_guard'),('forge_greaves'),('forge_greaves_bear'),('forge_greaves_guard'),('forge_heart_agi'),('forge_heart_int'),('forge_heart_str'),
('forge_helm'),('forge_helm_bear'),('forge_helm_guard'),('forge_longbow'),('forge_longbow_fox'),('forge_longbow_hawk'),('forge_pendant'),('forge_plate'),
('forge_plate_bear'),('forge_plate_guard'),('forge_robe'),('forge_robe_ember'),('forge_robe_owl'),('forge_wand'),('forge_wand_ember'),('forge_wand_owl'),
('forged_longsword'),('forged_longsword_bear'),('forged_longsword_fox'),('frost_pelt'),('frost_staff'),('frostbite'),('frostjarl_hammer'),('frostspire_staff'),
('frostspire_staff_ember'),('frostspire_staff_owl'),('glacier_edge'),('gnarled_staff'),('gnarled_staff_ember'),('gnarled_staff_owl'),('gold_ring'),('gorm_cuirass'),
('gorm_gauntlets'),('gorm_helm'),('gorm_sabatons'),('grave_iron'),('grave_lantern'),('gravewarden_mace'),('gravewarden_mace_bear'),('gravewarden_mace_guard'),
('greater_mana'),('greater_potion'),('greymaw_fang'),('healing_potion'),('hearth_bread'),('hillking_cuirass'),('hillking_gauntlets'),('hillking_helm'),
('hillking_ring'),('horned_helm'),('horned_helm_bear'),('horned_helm_hawk'),('hunter_bow'),('hunter_bow_fox'),('hunter_bow_hawk'),('hunter_leather'),
('hunter_leather_fox'),('hunter_leather_hawk'),('hunters_band'),('hunters_boots'),('hunters_boots_fox'),('hunters_boots_hawk'),('hyena_hide'),('icebound_heart'),
('iron_axe'),('iron_axe_bear'),('iron_axe_guard'),('iron_band'),('iron_cuirass'),('iron_cuirass_bear'),('iron_cuirass_guard'),('iron_dirk'),
('iron_helm'),('iron_helm_bear'),('iron_helm_guard'),('iron_mace'),('iron_mace_bear'),('iron_mace_guard'),('iron_sword'),('iron_sword_bear'),
('iron_sword_fox'),('ironshod_boots'),('ironshod_boots_bear'),('ironshod_boots_guard'),('ironwill_ring'),('jarl_amulet'),('jarl_axe'),('jarl_axe_bear'),
('jarl_axe_guard'),('jarl_band'),('jarl_blade'),('jarl_blade_bear'),('jarl_blade_fox'),('jarl_boots'),('jarl_boots_fox'),('jarl_boots_hawk'),
('jarl_bow'),('jarl_bow_fox'),('jarl_bow_hawk'),('jarl_cap'),('jarl_cap_fox'),('jarl_cap_hawk'),('jarl_claymore'),('jarl_claymore_bear'),
('jarl_claymore_guard'),('jarl_coif'),('jarl_coif_bear'),('jarl_coif_hawk'),('jarl_cuirass'),('jarl_cuirass_bear'),('jarl_cuirass_guard'),('jarl_dagger'),
('jarl_dagger_fox'),('jarl_dagger_hawk'),('jarl_gauntlets'),('jarl_gauntlets_bear'),('jarl_gauntlets_guard'),('jarl_gloves'),('jarl_gloves_ember'),('jarl_gloves_owl'),
('jarl_greatsword'),('jarl_greatsword_bear'),('jarl_greatsword_guard'),('jarl_greaves'),('jarl_greaves_bear'),('jarl_greaves_hawk'),('jarl_grips'),('jarl_grips_fox'),
('jarl_grips_hawk'),('jarl_hatchet'),('jarl_hatchet_bear'),('jarl_hatchet_guard'),('jarl_hauberk'),('jarl_hauberk_bear'),('jarl_hauberk_hawk'),('jarl_helm'),
('jarl_helm_bear'),('jarl_helm_guard'),('jarl_hood'),('jarl_hood_ember'),('jarl_hood_owl'),('jarl_jerkin'),('jarl_jerkin_fox'),('jarl_jerkin_hawk'),
('jarl_longbow'),('jarl_longbow_fox'),('jarl_longbow_hawk'),('jarl_mace'),('jarl_mace_bear'),('jarl_mace_guard'),('jarl_mitts'),('jarl_mitts_bear'),
('jarl_mitts_hawk'),('jarl_morningstar'),('jarl_morningstar_bear'),('jarl_morningstar_guard'),('jarl_pendant'),('jarl_quarterstaff'),('jarl_quarterstaff_ember'),('jarl_quarterstaff_owl'),
('jarl_ring'),('jarl_robe'),('jarl_robe_ember'),('jarl_robe_owl'),('jarl_rod'),('jarl_rod_ember'),('jarl_rod_owl'),('jarl_sabatons'),
('jarl_sabatons_bear'),('jarl_sabatons_guard'),('jarl_sabre'),('jarl_sabre_bear'),('jarl_sabre_fox'),('jarl_scimitar'),('jarl_scimitar_bear'),('jarl_scimitar_fox'),
('jarl_signet'),('jarl_slippers'),('jarl_slippers_ember'),('jarl_slippers_owl'),('jarl_staff'),('jarl_staff_ember'),('jarl_staff_owl'),('jarl_stiletto'),
('jarl_stiletto_fox'),('jarl_stiletto_hawk'),('jarl_sword'),('jarl_sword_bear'),('jarl_sword_fox'),('jarl_talisman'),('jarl_wand'),('jarl_wand_ember'),
('jarl_wand_owl'),('jarlsguard_plate'),('khar_boots'),('khar_grips'),('khar_hauberk'),('khar_helm'),('kingsbane'),('knight_plate'),
('knight_plate_bear'),('knight_plate_guard'),('last_ember_robe'),('last_ember_robe_ember'),('last_ember_robe_owl'),('last_light'),('laughing_fang'),('leather_cap'),
('leather_cap_fox'),('leather_cap_hawk'),('leather_gloves'),('leather_gloves_fox'),('leather_gloves_hawk'),('leather_jerkin'),('leather_jerkin_fox'),('leather_jerkin_hawk'),
('leech_ichor'),('linen'),('linen_gloves'),('linen_gloves_ember'),('linen_gloves_owl'),('linen_shoes'),('linen_shoes_ember'),('linen_shoes_owl'),
('longbow'),('longbow_fox'),('longbow_hawk'),('mage_robe'),('mage_robe_ember'),('mage_robe_owl'),('magma_heart_ring'),('magma_scale'),
('mana_potion'),('militia_sword'),('minor_mana'),('minor_potion'),('mirewarden_amulet'),('mirewarden_axe'),('mirewarden_axe_bear'),('mirewarden_axe_guard'),
('mirewarden_blade'),('mirewarden_blade_bear'),('mirewarden_blade_fox'),('mirewarden_boots'),('mirewarden_boots_fox'),('mirewarden_boots_hawk'),('mirewarden_bow'),('mirewarden_bow_fox'),
('mirewarden_bow_hawk'),('mirewarden_cap'),('mirewarden_cap_fox'),('mirewarden_cap_hawk'),('mirewarden_claymore'),('mirewarden_claymore_bear'),('mirewarden_claymore_guard'),('mirewarden_coif'),
('mirewarden_coif_bear'),('mirewarden_coif_hawk'),('mirewarden_cuirass'),('mirewarden_cuirass_bear'),('mirewarden_cuirass_guard'),('mirewarden_dagger'),('mirewarden_dagger_fox'),('mirewarden_dagger_hawk'),
('mirewarden_gauntlets'),('mirewarden_gauntlets_bear'),('mirewarden_gauntlets_guard'),('mirewarden_gloves'),('mirewarden_gloves_ember'),('mirewarden_gloves_owl'),('mirewarden_greatsword'),('mirewarden_greatsword_bear'),
('mirewarden_greatsword_guard'),('mirewarden_greaves'),('mirewarden_greaves_bear'),('mirewarden_greaves_hawk'),('mirewarden_grips'),('mirewarden_grips_fox'),('mirewarden_grips_hawk'),('mirewarden_hatchet'),
('mirewarden_hatchet_bear'),('mirewarden_hatchet_guard'),('mirewarden_hauberk'),('mirewarden_hauberk_bear'),('mirewarden_hauberk_hawk'),('mirewarden_helm'),('mirewarden_helm_bear'),('mirewarden_helm_guard'),
('mirewarden_hood'),('mirewarden_hood_ember'),('mirewarden_hood_owl'),('mirewarden_jerkin'),('mirewarden_jerkin_fox'),('mirewarden_jerkin_hawk'),('mirewarden_longbow'),('mirewarden_longbow_fox'),
('mirewarden_longbow_hawk'),('mirewarden_mace'),('mirewarden_mace_bear'),('mirewarden_mace_guard'),('mirewarden_mitts'),('mirewarden_mitts_bear'),('mirewarden_mitts_hawk'),('mirewarden_morningstar'),
('mirewarden_morningstar_bear'),('mirewarden_morningstar_guard'),('mirewarden_quarterstaff'),('mirewarden_quarterstaff_ember'),('mirewarden_quarterstaff_owl'),('mirewarden_ring'),('mirewarden_robe'),('mirewarden_robe_ember'),
('mirewarden_robe_owl'),('mirewarden_rod'),('mirewarden_rod_ember'),('mirewarden_rod_owl'),('mirewarden_sabatons'),('mirewarden_sabatons_bear'),('mirewarden_sabatons_guard'),('mirewarden_sabre'),
('mirewarden_sabre_bear'),('mirewarden_sabre_fox'),('mirewarden_scimitar'),('mirewarden_scimitar_bear'),('mirewarden_scimitar_fox'),('mirewarden_slippers'),('mirewarden_slippers_ember'),('mirewarden_slippers_owl'),
('mirewarden_staff'),('mirewarden_staff_ember'),('mirewarden_staff_owl'),('mirewarden_stiletto'),('mirewarden_stiletto_fox'),('mirewarden_stiletto_hawk'),('mirewarden_sword'),('mirewarden_sword_bear'),
('mirewarden_sword_fox'),('mirewarden_wand'),('mirewarden_wand_ember'),('mirewarden_wand_owl'),('mist_thorn'),('moonsong'),('moonstone_ring'),('morningstar'),
('morningstar_bear'),('morningstar_guard'),('mount_ash_wolf'),('mount_bone_stallion'),('mount_cinder_drake'),('mount_ember_charger'),('mount_frost_elk'),('mount_hellhound'),
('mount_marsh_strider'),('mount_nightmare_steed'),('mount_rime_drake'),('mount_spore_beetle'),('mount_steppe_horse'),('nightstalker_boots'),('nightstalker_boots_fox'),('nightstalker_boots_hawk'),
('nightstalker_coat'),('nightstalker_vest'),('nightstalker_vest_fox'),('nightstalker_vest_hawk'),('nightwhisper'),('nomad_amulet'),('nomad_axe'),('nomad_blade'),
('nomad_boots'),('nomad_bow'),('nomad_cap'),('nomad_claymore'),('nomad_coif'),('nomad_cuirass'),('nomad_dagger'),('nomad_gauntlets'),
('nomad_gloves'),('nomad_greatsword'),('nomad_greaves'),('nomad_grips'),('nomad_hatchet'),('nomad_hauberk'),('nomad_helm'),('nomad_hood'),
('nomad_jerkin'),('nomad_longbow'),('nomad_mace'),('nomad_mitts'),('nomad_morningstar'),('nomad_quarterstaff'),('nomad_ring'),('nomad_robe'),
('nomad_rod'),('nomad_sabatons'),('nomad_sabre'),('nomad_scimitar'),('nomad_slippers'),('nomad_staff'),('nomad_stiletto'),('nomad_sword'),
('nomad_wand'),('northman_axe'),('northman_axe_bear'),('northman_axe_guard'),('notched_blade'),('novice_robe'),('oak_wand'),('obsidian_edge'),
('obsidian_greatsword'),('obsidian_shard'),('padded_vest'),('pilgrim_relic'),('priestess_amulet'),('pyre_staff'),('raider_arrowhead'),('ranger_boots'),
('ranger_boots_fox'),('ranger_boots_hawk'),('recruit_mail'),('recurve_bow'),('recurve_bow_fox'),('recurve_bow_hawk'),('rime_crystal'),('rimeforged_amulet'),
('rimeforged_axe'),('rimeforged_blade'),('rimeforged_boots'),('rimeforged_bow'),('rimeforged_cap'),('rimeforged_claymore'),('rimeforged_coif'),('rimeforged_cuirass'),
('rimeforged_dagger'),('rimeforged_gauntlets'),('rimeforged_gloves'),('rimeforged_greatsword'),('rimeforged_greaves'),('rimeforged_grips'),('rimeforged_hatchet'),('rimeforged_hauberk'),
('rimeforged_helm'),('rimeforged_hood'),('rimeforged_jerkin'),('rimeforged_longbow'),('rimeforged_mace'),('rimeforged_mitts'),('rimeforged_morningstar'),('rimeforged_quarterstaff'),
('rimeforged_ring'),('rimeforged_robe'),('rimeforged_rod'),('rimeforged_sabatons'),('rimeforged_sabre'),('rimeforged_scimitar'),('rimeforged_slippers'),('rimeforged_staff'),
('rimeforged_stiletto'),('rimeforged_sword'),('rimeforged_wand'),('rimehunter_amulet'),('rimehunter_axe'),('rimehunter_axe_bear'),('rimehunter_axe_guard'),('rimehunter_blade'),
('rimehunter_blade_bear'),('rimehunter_blade_fox'),('rimehunter_boots'),('rimehunter_boots_fox'),('rimehunter_boots_hawk'),('rimehunter_bow'),('rimehunter_bow_fox'),('rimehunter_bow_hawk'),
('rimehunter_cap'),('rimehunter_cap_fox'),('rimehunter_cap_hawk'),('rimehunter_claymore'),('rimehunter_claymore_bear'),('rimehunter_claymore_guard'),('rimehunter_coif'),('rimehunter_coif_bear'),
('rimehunter_coif_hawk'),('rimehunter_cuirass'),('rimehunter_cuirass_bear'),('rimehunter_cuirass_guard'),('rimehunter_dagger'),('rimehunter_dagger_fox'),('rimehunter_dagger_hawk'),('rimehunter_gauntlets'),
('rimehunter_gauntlets_bear'),('rimehunter_gauntlets_guard'),('rimehunter_gloves'),('rimehunter_gloves_ember'),('rimehunter_gloves_owl'),('rimehunter_greatsword'),('rimehunter_greatsword_bear'),('rimehunter_greatsword_guard'),
('rimehunter_greaves'),('rimehunter_greaves_bear'),('rimehunter_greaves_hawk'),('rimehunter_grips'),('rimehunter_grips_fox'),('rimehunter_grips_hawk'),('rimehunter_hatchet'),('rimehunter_hatchet_bear'),
('rimehunter_hatchet_guard'),('rimehunter_hauberk'),('rimehunter_hauberk_bear'),('rimehunter_hauberk_hawk'),('rimehunter_helm'),('rimehunter_helm_bear'),('rimehunter_helm_guard'),('rimehunter_hood'),
('rimehunter_hood_ember'),('rimehunter_hood_owl'),('rimehunter_jerkin'),('rimehunter_jerkin_fox'),('rimehunter_jerkin_hawk'),('rimehunter_longbow'),('rimehunter_longbow_fox'),('rimehunter_longbow_hawk'),
('rimehunter_mace'),('rimehunter_mace_bear'),('rimehunter_mace_guard'),('rimehunter_mitts'),('rimehunter_mitts_bear'),('rimehunter_mitts_hawk'),('rimehunter_morningstar'),('rimehunter_morningstar_bear'),
('rimehunter_morningstar_guard'),('rimehunter_quarterstaff'),('rimehunter_quarterstaff_ember'),('rimehunter_quarterstaff_owl'),('rimehunter_ring'),('rimehunter_robe'),('rimehunter_robe_ember'),('rimehunter_robe_owl'),
('rimehunter_rod'),('rimehunter_rod_ember'),('rimehunter_rod_owl'),('rimehunter_sabatons'),('rimehunter_sabatons_bear'),('rimehunter_sabatons_guard'),('rimehunter_sabre'),('rimehunter_sabre_bear'),
('rimehunter_sabre_fox'),('rimehunter_scimitar'),('rimehunter_scimitar_bear'),('rimehunter_scimitar_fox'),('rimehunter_slippers'),('rimehunter_slippers_ember'),('rimehunter_slippers_owl'),('rimehunter_staff'),
('rimehunter_staff_ember'),('rimehunter_staff_owl'),('rimehunter_stiletto'),('rimehunter_stiletto_fox'),('rimehunter_stiletto_hawk'),('rimehunter_sword'),('rimehunter_sword_bear'),('rimehunter_sword_fox'),
('rimehunter_wand'),('rimehunter_wand_ember'),('rimehunter_wand_owl'),('rotfang'),('rotmother_amulet'),('rotmother_gloves'),('rotmother_hood'),('rotmother_robe'),
('rotmother_staff'),('ruby'),('ruby_amulet'),('ruby_ring'),('rune_gloves'),('rune_gloves_ember'),('rune_gloves_owl'),('rune_slippers'),
('rune_slippers_ember'),('rune_slippers_owl'),('runeblade'),('runeblade_bear'),('runeblade_fox'),('runeweave_hood'),('runeweave_hood_ember'),('runeweave_hood_owl'),
('rusty_dagger'),('salt_crown_ring'),('sapphire'),('sapphire_ring'),('scale_armor'),('scale_armor_bear'),('scale_armor_hawk'),('scribe_quill'),
('set_glutthron_chest'),('set_glutthron_feet'),('set_glutthron_hands'),('set_glutthron_head'),('set_glutthron_weapon'),('set_hirschkoenig_chest'),('set_hirschkoenig_feet'),('set_hirschkoenig_hands'),
('set_hirschkoenig_head'),('set_hirschkoenig_weapon'),('set_mondsichel_chest'),('set_mondsichel_feet'),('set_mondsichel_hands'),('set_mondsichel_head'),('set_mondsichel_weapon'),('set_sternenfeuer_chest'),
('set_sternenfeuer_feet'),('set_sternenfeuer_hands'),('set_sternenfeuer_head'),('set_sternenfeuer_weapon'),('shadow_essence'),('shadow_grips'),('shadow_grips_fox'),('shadow_grips_hawk'),
('shadow_hood'),('shadow_hood_fox'),('shadow_hood_hawk'),('shadow_leather'),('shadow_leather_fox'),('shadow_leather_hawk'),('shadowstep_boots'),('shadowstrike'),
('short_bow'),('silk_gloves'),('silk_gloves_ember'),('silk_gloves_owl'),('silk_slippers'),('silk_slippers_ember'),('silk_slippers_owl'),('silver_amulet'),
('silver_ring'),('skalvyr_fang'),('skalvyr_rib_bow'),('skull_charm'),('snowstalker_boots'),('soldier_sword'),('sovereign_gauntlets'),('sovereign_helm'),
('sovereign_plate'),('sovereign_sabatons'),('sovereign_signet'),('spore_cap'),('sporeveil_hood'),('staff_of_last_ash'),('stalker_cap'),('stalker_cap_fox'),
('stalker_cap_hawk'),('stalker_grips'),('stalker_grips_fox'),('stalker_grips_hawk'),('starfall'),('steel_blade'),('steel_blade_bear'),('steel_blade_fox'),
('steel_stiletto'),('steel_stiletto_fox'),('steel_stiletto_hawk'),('steppe_amulet'),('steppe_axe'),('steppe_axe_bear'),('steppe_axe_guard'),('steppe_blade'),
('steppe_blade_bear'),('steppe_blade_fox'),('steppe_boots'),('steppe_boots_fox'),('steppe_boots_hawk'),('steppe_bow'),('steppe_bow_fox'),('steppe_bow_hawk'),
('steppe_cap'),('steppe_cap_fox'),('steppe_cap_hawk'),('steppe_claymore'),('steppe_claymore_bear'),('steppe_claymore_guard'),('steppe_coif'),('steppe_coif_bear'),
('steppe_coif_hawk'),('steppe_cuirass'),('steppe_cuirass_bear'),('steppe_cuirass_guard'),('steppe_dagger'),('steppe_dagger_fox'),('steppe_dagger_hawk'),('steppe_gauntlets'),
('steppe_gauntlets_bear'),('steppe_gauntlets_guard'),('steppe_gloves'),('steppe_gloves_ember'),('steppe_gloves_owl'),('steppe_greatsword'),('steppe_greatsword_bear'),('steppe_greatsword_guard'),
('steppe_greaves'),('steppe_greaves_bear'),('steppe_greaves_hawk'),('steppe_grips'),('steppe_grips_fox'),('steppe_grips_hawk'),('steppe_hatchet'),('steppe_hatchet_bear'),
('steppe_hatchet_guard'),('steppe_hauberk'),('steppe_hauberk_bear'),('steppe_hauberk_hawk'),('steppe_helm'),('steppe_helm_bear'),('steppe_helm_guard'),('steppe_hood'),
('steppe_hood_ember'),('steppe_hood_owl'),('steppe_jerkin'),('steppe_jerkin_fox'),('steppe_jerkin_hawk'),('steppe_jerky'),('steppe_longbow'),('steppe_longbow_fox'),
('steppe_longbow_hawk'),('steppe_mace'),('steppe_mace_bear'),('steppe_mace_guard'),('steppe_mitts'),('steppe_mitts_bear'),('steppe_mitts_hawk'),('steppe_morningstar'),
('steppe_morningstar_bear'),('steppe_morningstar_guard'),('steppe_quarterstaff'),('steppe_quarterstaff_ember'),('steppe_quarterstaff_owl'),('steppe_ring'),('steppe_robe'),('steppe_robe_ember'),
('steppe_robe_owl'),('steppe_rod'),('steppe_rod_ember'),('steppe_rod_owl'),('steppe_sabatons'),('steppe_sabatons_bear'),('steppe_sabatons_guard'),('steppe_sabre'),
('steppe_sabre_bear'),('steppe_sabre_fox'),('steppe_scimitar'),('steppe_scimitar_bear'),('steppe_scimitar_fox'),('steppe_slippers'),('steppe_slippers_ember'),('steppe_slippers_owl'),
('steppe_staff'),('steppe_staff_ember'),('steppe_staff_owl'),('steppe_stiletto'),('steppe_stiletto_fox'),('steppe_stiletto_hawk'),('steppe_sun_disc'),('steppe_sword'),
('steppe_sword_bear'),('steppe_sword_fox'),('steppe_wand'),('steppe_wand_ember'),('steppe_wand_owl'),('suede_grips'),('suede_grips_fox'),('suede_grips_hawk'),
('sun_amulet'),('sunhammer'),('superior_potion'),('supreme_mana'),('supreme_potion'),('swampking_scales'),('tempered_longsword'),('tempered_longsword_bear'),
('tempered_longsword_fox'),('temple_relic'),('temple_sandals'),('temple_sandals_ember'),('temple_sandals_owl'),('thorn_sap'),('thornmother_grips'),('tide_circlet'),
('tide_pearl_ring'),('tide_staff'),('tide_staff_ember'),('tide_staff_owl'),('tide_wand'),('tide_wraps'),('tidebound_dagger'),('tidebound_dagger_fox'),
('tidebound_dagger_hawk'),('tidebound_robe'),('tidebound_robe_ember'),('tidebound_robe_owl'),('tidebound_sword'),('tidebound_sword_bear'),('tidebound_sword_fox'),('tidecaller_hood'),
('tidecaller_hood_ember'),('tidecaller_hood_owl'),('toad_gland'),('trackers_hood'),('trackers_hood_fox'),('trackers_hood_hawk'),('traveler_boots'),('traveler_boots_fox'),
('traveler_boots_hawk'),('troll_fat'),('tyrant_gauntlets'),('tyrant_helm'),('tyrant_plate'),('tyrant_sabatons'),('ulgrim_blade'),('varkhul_cleaver'),
('varkhul_greaves'),('varkhul_grips'),('varkhul_helm'),('veilpiercer'),('venomfang'),('venomfang_fox'),('venomfang_hawk'),('vulture_feather'),
('wanderer_hood'),('wanderer_hood_ember'),('wanderer_hood_owl'),('warden_helm'),('warden_helm_bear'),('warden_helm_hawk'),('waste_amulet'),('waste_axe'),
('waste_blade'),('waste_boots'),('waste_bow'),('waste_cap'),('waste_claymore'),('waste_coif'),('waste_cuirass'),('waste_dagger'),
('waste_gauntlets'),('waste_gloves'),('waste_greatsword'),('waste_greaves'),('waste_grips'),('waste_hatchet'),('waste_hauberk'),('waste_helm'),
('waste_hood'),('waste_jerkin'),('waste_longbow'),('waste_mace'),('waste_mitts'),('waste_morningstar'),('waste_quarterstaff'),('waste_ring'),
('waste_robe'),('waste_rod'),('waste_sabatons'),('waste_sabre'),('waste_scimitar'),('waste_slippers'),('waste_staff'),('waste_stiletto'),
('waste_sword'),('waste_wand'),('windrunner'),('winterwhisper'),('wolf_fang'),('wolf_pelt'),('wolf_tooth_charm'),('wolfsbane_amulet'),
('wolfsbane_dagger'),('wolfsbane_dagger_fox'),('wolfsbane_dagger_hawk'),('woodcutter_axe'),('worldstaff'),('worn_boots'),('wyrmscale_boots'),('wyrmscale_cap'),
('wyrmscale_grips'),('wyrmscale_jerkin'),('yew_longbow'),('^bank'),('^en:amulet:ancestor_vigor'),('^en:amulet:grace'),('^en:amulet:insight'),('^en:amulet:marsh_grace'),
('^en:amulet:might'),('^en:amulet:spore_insight'),('^en:amulet:steppe_might'),('^en:amulet:vigor'),('^en:chest:ancestor_vigor'),('^en:chest:bulwark'),('^en:chest:pilgrim_ward'),('^en:chest:troll_hide'),
('^en:chest:vigor'),('^en:chest:warden_ward'),('^en:feet:pilgrim_ward'),('^en:feet:stalker_step'),('^en:feet:swiftness'),('^en:feet:warden_ward'),('^en:hands:grace'),('^en:hands:marsh_grace'),
('^en:hands:might'),('^en:hands:pilgrim_ward'),('^en:hands:precision'),('^en:hands:steppe_might'),('^en:hands:warden_ward'),('^en:head:ancestor_vigor'),('^en:head:bulwark'),('^en:head:insight'),
('^en:head:spore_insight'),('^en:head:troll_hide'),('^en:head:vigor'),('^en:ring:grace'),('^en:ring:insight'),('^en:ring:marsh_grace'),('^en:ring:might'),('^en:ring:precision'),
('^en:ring:spore_insight'),('^en:ring:steppe_might'),('^en:weapon:ember_edge'),('^en:weapon:keen_edge'),('^en:weapon:magma_edge'),('^en:weapon:precision'),('^en:weapon:rime_bite'),('^up:amulet'),
('^up:chest'),('^up:feet'),('^up:hands'),('^up:head'),('^up:ring'),('^up:weapon');
delete from public.ledger_mounts;
insert into public.ledger_mounts (mount_id, item_id) values
('ash_wolf','mount_ash_wolf'),('bone_stallion','mount_bone_stallion'),('cinder_drake','mount_cinder_drake'),('ember_charger','mount_ember_charger'),
('frost_elk','mount_frost_elk'),('hellhound','mount_hellhound'),('marsh_strider','mount_marsh_strider'),('nightmare_steed','mount_nightmare_steed'),
('rime_drake','mount_rime_drake'),('spore_beetle','mount_spore_beetle'),('steppe_horse','mount_steppe_horse');
delete from public.ledger_levels;
insert into public.ledger_levels (level, xp) values
(1,0),(2,100),(3,370),(4,845),(5,1560),(6,2545),(7,3820),(8,5405),(9,7320),(10,9585),
(11,12215),(12,15225),(13,18635),(14,22455),(15,26695),(16,31375),(17,36500),(18,42090),(19,48150),(20,54695),
(21,96695),(22,142395),(23,191495),(24,244595),(25,301295),(26,362295),(27,427095),(28,496495),(29,569995),(30,648395),
(31,731195),(32,819095),(33,911695),(34,1009695),(35,1112595),(36,1221195),(37,1334995),(38,1454695),(39,1579895),(40,1711295);

-- ------------------------------------------------------------------ Bausteine
create or replace function public.ledger_arr(j jsonb) returns jsonb
language sql immutable set search_path = '' as $$ select case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end $$;
create or replace function public.ledger_obj(j jsonb) returns jsonb
language sql immutable set search_path = '' as $$ select case when jsonb_typeof(j) = 'object' then j else '{}'::jsonb end $$;
-- Werte eines Objekts oder Elemente eines Arrays (Ausrüstung: { Platz: itemId } oder alte Arrays)
create or replace function public.ledger_elems(j jsonb) returns setof jsonb
language sql immutable set search_path = '' as $$
  select value from jsonb_each(case when jsonb_typeof(j) = 'object' then j else '{}'::jsonb end)
  union all select value from jsonb_array_elements(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end)
$$;
-- Menge: nur echte Zahlen > 0, abgerundet (wie values.js qtyOf)
create or replace function public.ledger_qty(v jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(v) = 'number' and v::numeric > 0 then least(floor(v::numeric), 1e12) else 0 end
$$;

-- Werte eines Spielstands: { xp, gold, items: { itemId: Anzahl } } (wie src/ledger/values.js valuesOf)
create or replace function public.ledger_values(p_snap jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  sl  jsonb := public.ledger_obj(p_snap -> 'slices');
  inv jsonb := public.ledger_obj(sl -> 'inventory');
  pr  jsonb := public.ledger_obj(sl -> 'progress');
  w   jsonb := public.ledger_obj(sl -> 'wallet') -> 'gold';
  v_items jsonb;
  v_gold  numeric;
  v_xp    numeric;
  v_lvl   int;
begin
  select coalesce(jsonb_object_agg(x.id, x.n), '{}'::jsonb) into v_items from (
    select r.id, least(sum(r.q), 1e12)::bigint as n from (
      select s ->> 'itemId' as id, public.ledger_qty(s -> 'qty') as q
        from jsonb_array_elements(public.ledger_arr(inv -> 'slots')) s where jsonb_typeof(s -> 'itemId') = 'string'
      union all
      select case when jsonb_typeof(e) = 'string' then e #>> '{}' when jsonb_typeof(e -> 'itemId') = 'string' then e ->> 'itemId' end, 1
        from public.ledger_elems(inv -> 'equipment') e
      union all
      select m.key, public.ledger_qty(m.value) from jsonb_each(public.ledger_obj(inv -> 'mats')) m
      union all
      select s ->> 'itemId', public.ledger_qty(s -> 'qty')
        from jsonb_array_elements(public.ledger_arr(inv -> 'questBag')) s where jsonb_typeof(s -> 'itemId') = 'string'
      union all
      select s ->> 'itemId', public.ledger_qty(s -> 'qty')
        from jsonb_array_elements(public.ledger_arr(public.ledger_obj(sl -> 'bank') -> 'slots')) s where jsonb_typeof(s -> 'itemId') = 'string'
      union all
      select it ->> 'itemId', public.ledger_qty(it -> 'qty')
        from jsonb_array_elements(public.ledger_arr(public.ledger_obj(sl -> 'mail') -> 'loot')) l,
             jsonb_array_elements(public.ledger_arr(l -> 'items')) it
        where jsonb_typeof(it -> 'itemId') = 'string'
      union all
      -- Goldausgaben (wie values.js): Verstärkung je Platz, Verzauberung, Bankausbau
      select '^up:' || u.key, case when jsonb_typeof(u.value) = 'number' then greatest(0, least(15, trunc(u.value::numeric))) else 0 end
        from jsonb_each(public.ledger_obj(inv -> 'upgrades')) u
      union all
      select '^en:' || e.key || ':' || (e.value #>> '{}'), 1
        from jsonb_each(public.ledger_obj(inv -> 'enchants')) e where jsonb_typeof(e.value) = 'string'
      union all
      select '^bank', case when jsonb_typeof(sl #> '{bank,size}') = 'number'
                           then coalesce(array_position(array[16,24,32,40,48]::numeric[], (sl #> '{bank,size}')::numeric), 1) - 1 else 0 end
      union all
      select lm.item_id, 1 from public.ledger_mounts lm
        where exists (select 1 from jsonb_array_elements(public.ledger_arr(public.ledger_obj(public.ledger_obj(sl -> 'character') -> 'mounts') -> 'owned')) o
                      where jsonb_typeof(o) = 'string' and o #>> '{}' = lm.mount_id)
    ) r
    join public.ledger_items li on li.id = r.id
    where r.q > 0
    group by r.id
  ) x;

  v_gold := case when jsonb_typeof(w) = 'number' then least(greatest(floor(w::numeric), -1e9), 1e15) else 0 end
    + (select least(coalesce(sum(public.ledger_qty(l -> 'gold')), 0), 1e15)
                from jsonb_array_elements(public.ledger_arr(public.ledger_obj(sl -> 'mail') -> 'loot')) l);
  v_lvl := case when pr -> 'level' is null or jsonb_typeof(pr -> 'level') = 'null' then 1
                when jsonb_typeof(pr -> 'level') = 'number' then greatest(1, least(40, trunc((pr -> 'level')::numeric)))::int
                else 40 end;
  v_xp := greatest(case when jsonb_typeof(pr -> 'xp') = 'number' and (pr -> 'xp')::numeric > 0 then least(floor((pr -> 'xp')::numeric), 1e15) else 0 end,
                   coalesce((select lv.xp from public.ledger_levels lv where lv.level = v_lvl), 0));
  return jsonb_build_object('xp', v_xp::bigint, 'gold', v_gold::bigint, 'items', v_items);
end $$;

-- Spielstand so bereinigen, dass das Spiel beim Laden genau das sieht, was gezählt wird. Das Spiel liest Werte mit
-- JavaScript-Regeln (Text "50" und Liste [50] wirken als Zahl, ["schwert"] als Schlüssel, |0 rechnet mit 32 Bit); die
-- Datenbank zählt nur echte Zahlen und Texte. Deshalb bleibt nur die Form, die das Spiel selbst speichert:
--   Platz       null oder { itemId: Text, qty: ganze Zahl 1…1e6 }   (Tasche, Bank, Questbeutel)
--   Ausrüstung  Text, null oder { itemId: Text }                  Material  { id: ganze Zahl 0…1e6 }
--   Gold        ganze Zahl -1e9…2^31-1   Erfahrung 0…2^31-1   Stufe 1…40
--   Verstärkung ganze Zahl 0…15   Verzauberung Text
-- Ehrliche Spielstände ändert das nie.
create or replace function public.ledger_fix_slot(e jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when e is null or jsonb_typeof(e) <> 'object' then 'null'::jsonb
              when jsonb_typeof(e -> 'itemId') is distinct from 'string' or jsonb_typeof(e -> 'qty') is distinct from 'number' then 'null'::jsonb
              when (e -> 'qty')::numeric < 1 then 'null'::jsonb
              when (e -> 'qty')::numeric <> least(trunc((e -> 'qty')::numeric), 1e6) then jsonb_set(e, '{qty}', to_jsonb(least(trunc((e -> 'qty')::numeric), 1e6)))
              else e end
$$;
create or replace function public.ledger_fix_gear(e jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when e is null or jsonb_typeof(e) in ('string', 'null') then e
              when jsonb_typeof(e) = 'object' and jsonb_typeof(e -> 'itemId') = 'string' then e
              else 'null'::jsonb end
$$;
create or replace function public.ledger_fix_int(v jsonb, lo numeric, hi numeric, dflt numeric) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(v) = 'number' then
                case when v::numeric = greatest(lo, least(hi, trunc(v::numeric))) then v else to_jsonb(greatest(lo, least(hi, trunc(v::numeric)))) end
              else to_jsonb(dflt) end
$$;
create or replace function public.ledger_normalize(p_snap jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  s jsonb := p_snap;
  a jsonb;
  b jsonb;
  p text[];
begin
  if jsonb_typeof(s -> 'slices') is distinct from 'object' then return s; end if;
  -- Tasche, Bank: Plätze bleiben an ihrer Stelle; Questbeutel: ungültige Einträge fallen weg
  foreach p slice 1 in array array[array['slices', 'inventory', 'slots'], array['slices', 'bank', 'slots']] loop
    a := s #> p;
    if jsonb_typeof(a) = 'array' and exists (select 1 from jsonb_array_elements(a) e where public.ledger_fix_slot(e) is distinct from e) then
      s := jsonb_set(s, p, (select jsonb_agg(public.ledger_fix_slot(e) order by i) from jsonb_array_elements(a) with ordinality x(e, i)));
    end if;
  end loop;
  a := s #> '{slices,inventory,questBag}';
  if jsonb_typeof(a) = 'array' and exists (select 1 from jsonb_array_elements(a) e where public.ledger_fix_slot(e) is distinct from e) then
    s := jsonb_set(s, '{slices,inventory,questBag}', coalesce((select jsonb_agg(public.ledger_fix_slot(e) order by i)
      from jsonb_array_elements(a) with ordinality x(e, i) where public.ledger_fix_slot(e) <> 'null'::jsonb), '[]'::jsonb));
  end if;
  -- Ausrüstung (Objekt oder alte Liste)
  a := s #> '{slices,inventory,equipment}';
  if jsonb_typeof(a) = 'object' and exists (select 1 from jsonb_each(a) e where public.ledger_fix_gear(e.value) is distinct from e.value) then
    s := jsonb_set(s, '{slices,inventory,equipment}', (select jsonb_object_agg(e.key, public.ledger_fix_gear(e.value)) from jsonb_each(a) e));
  elsif jsonb_typeof(a) = 'array' and exists (select 1 from jsonb_array_elements(a) e where public.ledger_fix_gear(e) is distinct from e) then
    s := jsonb_set(s, '{slices,inventory,equipment}', (select jsonb_agg(public.ledger_fix_gear(e) order by i) from jsonb_array_elements(a) with ordinality x(e, i)));
  end if;
  -- Material
  a := s #> '{slices,inventory,mats}';
  if jsonb_typeof(a) = 'object' and exists (select 1 from jsonb_each(a) m where public.ledger_fix_int(m.value, 0, 1e6, -1) is distinct from m.value) then
    s := jsonb_set(s, '{slices,inventory,mats}', coalesce((select jsonb_object_agg(m.key, public.ledger_fix_int(m.value, 0, 1e6, 0))
      from jsonb_each(a) m where jsonb_typeof(m.value) = 'number'), '{}'::jsonb));
  end if;
  -- Verstärkung, Verzauberung
  a := s #> '{slices,inventory,upgrades}';
  if jsonb_typeof(a) = 'object' and exists (select 1 from jsonb_each(a) u where public.ledger_fix_int(u.value, 0, 15, -1) is distinct from u.value) then
    s := jsonb_set(s, '{slices,inventory,upgrades}', coalesce((select jsonb_object_agg(u.key, public.ledger_fix_int(u.value, 0, 15, 0))
      from jsonb_each(a) u where jsonb_typeof(u.value) = 'number'), '{}'::jsonb));
  end if;
  a := s #> '{slices,inventory,enchants}';
  if jsonb_typeof(a) = 'object' and exists (select 1 from jsonb_each(a) e where jsonb_typeof(e.value) not in ('string', 'null')) then
    s := jsonb_set(s, '{slices,inventory,enchants}', coalesce((select jsonb_object_agg(e.key, e.value)
      from jsonb_each(a) e where jsonb_typeof(e.value) in ('string', 'null')), '{}'::jsonb));
  end if;
  -- Gold, Erfahrung, Stufe
  if jsonb_typeof(s #> '{slices,wallet}') = 'object' then
    a := s #> '{slices,wallet,gold}';
    b := public.ledger_fix_int(a, -1e9, 2147483647, 0);
    if a is not null and b is distinct from a then s := jsonb_set(s, '{slices,wallet,gold}', b); end if;
  end if;
  if jsonb_typeof(s #> '{slices,progress}') = 'object' then
    a := s #> '{slices,progress,xp}';
    b := public.ledger_fix_int(a, 0, 2147483647, 0);
    if a is not null and b is distinct from a then s := jsonb_set(s, '{slices,progress,xp}', b); end if;
    a := s #> '{slices,progress,level}';
    b := public.ledger_fix_int(a, 1, 40, 1);
    if a is not null and b is distinct from a then s := jsonb_set(s, '{slices,progress,level}', b); end if;
  end if;
  return s;
end $$;

-- Liegt der Stand über dem Buch? → { xp: [Buch, Stand], gold: [Buch, Stand], items: { itemId: zu viel } } oder null
create or replace function public.ledger_over(v jsonb, p_xp bigint, p_gold bigint, p_items jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select nullif(jsonb_strip_nulls(jsonb_build_object(
    'xp',    case when (v ->> 'xp')::numeric > p_xp then jsonb_build_array(p_xp, v -> 'xp') end,
    'gold',  case when (v ->> 'gold')::numeric > p_gold then jsonb_build_array(p_gold, v -> 'gold') end,
    'items', (select jsonb_object_agg(t.key, t.n) from (
                select m.key, m.value::numeric - coalesce(case when jsonb_typeof(p_items -> m.key) = 'number' then (p_items -> m.key)::numeric end, 0) as n
                from jsonb_each(v -> 'items') m) t where t.n > 0))), '{}'::jsonb)
$$;

-- Aus einer Liste von Plätzen ({ itemId, qty }) von hinten bis zu n Stück nehmen; leere Plätze werden null
-- (drop: Eintrag fällt weg, Questbeutel). → { a: Liste, left: Rest }
create or replace function public.ledger_take_list(a jsonb, p_item text, p_n numeric, p_drop boolean) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  left_ numeric := p_n;
  e jsonb;
  i int;
  n numeric;
  t numeric;
begin
  if jsonb_typeof(a) is distinct from 'array' then return jsonb_build_object('a', a, 'left', p_n); end if;
  for i in reverse jsonb_array_length(a) - 1 .. 0 loop
    exit when left_ <= 0;
    e := a -> i;
    continue when jsonb_typeof(e -> 'itemId') is distinct from 'string' or e ->> 'itemId' <> p_item;
    n := public.ledger_qty(e -> 'qty');
    continue when n <= 0;
    t := least(n, left_);
    left_ := left_ - t;
    a := case when n - t > 0 then jsonb_set(a, array[i::text], jsonb_set(e, '{qty}', to_jsonb(n - t)))
              when p_drop then a - i else jsonb_set(a, array[i::text], 'null'::jsonb) end;
  end loop;
  return jsonb_build_object('a', a, 'left', left_);
end $$;

-- n Stück eines Gegenstands aus dem Spielstand nehmen: Tasche (von hinten), Questbeutel, Materialbeutel, Bank (von hinten),
-- Beutebriefe, angelegte Ausrüstung, gelernte Reittiere. null = nicht genug gefunden.
create or replace function public.ledger_take(p_snap jsonb, p_item text, p_n numeric) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  s     jsonb := p_snap;
  left_ numeric := p_n;
  r     jsonb;
  a     jsonb;
  b     jsonb;
  e     jsonb;
  i     int;
  n     numeric;
  t     numeric;
  k     text;
  mid   text;
begin
  -- Goldausgaben: Verstärkung senken, Verzauberung entfernen, Bank verkleinern
  if left(p_item, 1) = '^' then
    a := public.ledger_values(s) -> 'items';
    n := coalesce((a ->> p_item)::numeric, 0);
    if n < p_n then return null; end if;
    if left(p_item, 4) = '^up:' then
      s := jsonb_set(s, array['slices', 'inventory', 'upgrades', substr(p_item, 5)], to_jsonb(n - p_n));
    elsif left(p_item, 4) = '^en:' then
      s := jsonb_set(s, '{slices,inventory,enchants}', (s #> '{slices,inventory,enchants}') - split_part(p_item, ':', 2));
    elsif p_item = '^bank' then
      s := jsonb_set(s, '{slices,bank,size}', to_jsonb((array[16,24,32,40,48])[(n - p_n)::int + 1]));
    else return null;
    end if;
    return s;
  end if;
  -- Tasche, Questbeutel
  if jsonb_typeof(s #> '{slices,inventory,slots}') = 'array' then
    r := public.ledger_take_list(s #> '{slices,inventory,slots}', p_item, left_, false);
    s := jsonb_set(s, '{slices,inventory,slots}', r -> 'a');
    left_ := (r ->> 'left')::numeric;
  end if;
  if left_ > 0 and jsonb_typeof(s #> '{slices,inventory,questBag}') = 'array' then
    r := public.ledger_take_list(s #> '{slices,inventory,questBag}', p_item, left_, true);
    s := jsonb_set(s, '{slices,inventory,questBag}', r -> 'a');
    left_ := (r ->> 'left')::numeric;
  end if;
  -- Materialbeutel
  a := s #> '{slices,inventory,mats}';
  if left_ > 0 and jsonb_typeof(a) = 'object' then
    n := public.ledger_qty(a -> p_item);
    if n > 0 then
      t := least(n, left_);
      left_ := left_ - t;
      s := jsonb_set(s, '{slices,inventory,mats}', case when n - t > 0 then jsonb_set(a, array[p_item], to_jsonb(n - t)) else a - p_item end);
    end if;
  end if;
  -- Bank
  if left_ > 0 and jsonb_typeof(s #> '{slices,bank,slots}') = 'array' then
    r := public.ledger_take_list(s #> '{slices,bank,slots}', p_item, left_, false);
    s := jsonb_set(s, '{slices,bank,slots}', r -> 'a');
    left_ := (r ->> 'left')::numeric;
  end if;
  -- Beutebriefe (von hinten)
  a := s #> '{slices,mail,loot}';
  if left_ > 0 and jsonb_typeof(a) = 'array' then
    for i in reverse jsonb_array_length(a) - 1 .. 0 loop
      exit when left_ <= 0;
      continue when jsonb_typeof(a -> i -> 'items') is distinct from 'array';
      r := public.ledger_take_list(a -> i -> 'items', p_item, left_, true);
      a := jsonb_set(a, array[i::text, 'items'], r -> 'a');
      left_ := (r ->> 'left')::numeric;
    end loop;
    s := jsonb_set(s, '{slices,mail,loot}', a);
  end if;
  -- Angelegte Ausrüstung (Objekt { Platz: itemId } oder altes Array)
  a := s #> '{slices,inventory,equipment}';
  if left_ > 0 and jsonb_typeof(a) in ('object', 'array') then
    for k in select x.key from jsonb_each(case when jsonb_typeof(a) = 'object' then a else '{}'::jsonb end) x
             union all select (o - 1)::text from jsonb_array_elements(case when jsonb_typeof(a) = 'array' then a else '[]'::jsonb end) with ordinality y(x, o) loop
      exit when left_ <= 0;
      e := case when jsonb_typeof(a) = 'array' then a -> k::int else a -> k end;
      if (jsonb_typeof(e) = 'string' and e #>> '{}' = p_item) or (jsonb_typeof(e -> 'itemId') = 'string' and e ->> 'itemId' = p_item) then
        a := jsonb_set(a, array[k], 'null'::jsonb);
        left_ := left_ - 1;
      end if;
    end loop;
    s := jsonb_set(s, '{slices,inventory,equipment}', a);
  end if;
  -- Gelernte Reittiere (Doppelte zählen einmal und fallen gemeinsam weg)
  for mid in select lm.mount_id from public.ledger_mounts lm where lm.item_id = p_item loop
    exit when left_ <= 0;
    a := s #> '{slices,character,mounts}';
    continue when jsonb_typeof(a) is distinct from 'object' or jsonb_typeof(a -> 'owned') is distinct from 'array' or not (a -> 'owned') ? mid;
    b := coalesce((select jsonb_agg(x order by o) from jsonb_array_elements(a -> 'owned') with ordinality y(x, o) where x <> to_jsonb(mid)), '[]'::jsonb);
    a := jsonb_set(a, '{owned}', b);
    if a ->> 'active' = mid then
      a := jsonb_set(jsonb_set(a, '{active}', coalesce(b -> 0, 'null'::jsonb)), '{riding}', 'false'::jsonb);
    end if;
    s := jsonb_set(s, '{slices,character,mounts}', a);
    left_ := left_ - 1;
  end loop;
  if left_ > 0 then return null; end if;
  return s;
end $$;

-- Spielstand auf das Buch kappen. null = ließ sich nicht kappen (dann nicht schreiben).
create or replace function public.ledger_clamp(p_snap jsonb, p_xp bigint, p_gold bigint, p_items jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  s   jsonb := p_snap;
  v   jsonb := public.ledger_values(p_snap);
  ex  numeric;
  w   numeric;
  g   numeric;
  t   numeric;
  a   jsonb;
  i   int;
  lvl int;
  r   record;
begin
  if jsonb_typeof(s -> 'slices') is distinct from 'object' then return null; end if;
  -- Erfahrung: Buch, Stufe passend dazu
  if (v ->> 'xp')::numeric > p_xp then
    select coalesce(max(lv.level), 1) into lvl from public.ledger_levels lv where lv.xp <= p_xp;
    s := jsonb_set(s, '{slices,progress}', public.ledger_obj(s #> '{slices,progress}') || jsonb_build_object('xp', p_xp, 'level', lvl));
  end if;
  -- Gold: erst aus der Börse (bis 0), dann aus Beutebriefen (von hinten), Rest macht die Börse negativ
  ex := (v ->> 'gold')::numeric - p_gold;
  if ex > 0 then
    w := case when jsonb_typeof(s #> '{slices,wallet,gold}') = 'number' then (s #> '{slices,wallet,gold}')::numeric else 0 end;
    t := least(ex, greatest(w, 0));
    w := w - t;
    ex := ex - t;
    a := s #> '{slices,mail,loot}';
    if ex > 0 and jsonb_typeof(a) = 'array' then
      for i in reverse jsonb_array_length(a) - 1 .. 0 loop
        exit when ex <= 0;
        g := public.ledger_qty(a -> i -> 'gold');
        continue when g <= 0;
        t := least(g, ex);
        ex := ex - t;
        a := jsonb_set(a, array[i::text, 'gold'], to_jsonb(g - t));
      end loop;
      s := jsonb_set(s, '{slices,mail,loot}', a);
    end if;
    w := w - ex;
    s := jsonb_set(s, '{slices,wallet}', public.ledger_obj(s #> '{slices,wallet}') || jsonb_build_object('gold', w));
  end if;
  -- Gegenstände
  for r in select m.key as id, m.value::numeric - coalesce(case when jsonb_typeof(p_items -> m.key) = 'number' then (p_items -> m.key)::numeric end, 0) as n
           from jsonb_each(v -> 'items') m loop
    continue when r.n <= 0;
    s := public.ledger_take(s, r.id, r.n);
    if s is null then return null; end if;
  end loop;
  -- Probe: jetzt nicht mehr über dem Buch
  if public.ledger_over(public.ledger_values(s), p_xp, p_gold, p_items) is not null then return null; end if;
  return s;
end $$;

-- ------------------------------------------------------------------ Prüfung beim Hochladen
-- Für den Trigger (läuft mit der Rolle des Spielers): bereinigen, mit dem Buch vergleichen, kappen und vermerken.
-- Liefert den zu schreibenden Spielstand oder null (nicht schreiben). Direkter Aufruf wird abgewiesen.
create or replace function public.ledger_guard(p_user uuid, p_id text, p_snap jsonb, p_insert boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s   jsonb;
  b   public.character_ledger;
  cfg public.ledger_config;
  ov  jsonb;
begin
  if pg_trigger_depth() < 1 then raise exception 'nicht erlaubt' using errcode = '42501'; end if;
  if p_user is distinct from (select auth.uid()) then raise exception 'nicht erlaubt' using errcode = '42501'; end if;
  s := public.ledger_normalize(p_snap);
  if p_insert then return s; end if; -- neuer Charakter: Buch beginnt mit diesem Stand (Startpaket prüft characters_plausible)
  select * into b from public.character_ledger l where l.user_id = p_user and l.character_id = p_id for update;
  if not found then return s; end if; -- Buch entsteht nach dem Schreiben (characters_z_ledger_after)
  select * into cfg from public.ledger_config c where c.id = 1;
  if b.state is null and (cfg.strict_after is null or now() < cfg.strict_after) then return s; end if; -- Übergang
  ov := public.ledger_over(public.ledger_values(s), b.xp, b.gold, b.items);
  if ov is null then return s; end if;
  perform public.characters_flag(p_user, p_id, 'buch', ov);
  if not coalesce(cfg.enforce, true) then return s; end if;
  return public.ledger_clamp(s, b.xp, b.gold, b.items);
end $$;

-- Nach dem Hochladen: Buch für einen Charakter ohne Buch anlegen; im Übergang (noch keine Sitzung) den Stand übernehmen.
-- Liest den gespeicherten Stand selbst (kein Spielstand als Argument). Direkter Aufruf wird abgewiesen.
create or replace function public.ledger_user_sync(p_user uuid, p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  snap jsonb;
  v    jsonb;
begin
  if pg_trigger_depth() < 1 then raise exception 'nicht erlaubt' using errcode = '42501'; end if;
  if p_user is distinct from (select auth.uid()) then raise exception 'nicht erlaubt' using errcode = '42501'; end if;
  select c.snapshot into snap from public.characters c where c.user_id = p_user and c.id = p_id;
  if not found then return; end if;
  v := public.ledger_values(snap);
  insert into public.character_ledger as l (user_id, character_id, xp, gold, items)
    values (p_user, p_id, (v ->> 'xp')::bigint, (v ->> 'gold')::bigint, v -> 'items')
  on conflict (user_id, character_id) do update
    set xp = excluded.xp, gold = excluded.gold, items = excluded.items, ver = l.ver + 1, updated_at = now()
    where l.state is null
      and not exists (select 1 from public.ledger_config c where c.id = 1 and c.strict_after is not null and now() >= c.strict_after)
      and (l.xp, l.gold, l.items) is distinct from (excluded.xp, excluded.gold, excluded.items);
end $$;

-- Buch + (neu − alt) je Gegenstand; nichts unter 0
create or replace function public.ledger_items_add(p_book jsonb, p_old jsonb, p_new jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(t.k, t.n), '{}'::jsonb) from (
    select k, sum(n)::bigint as n from (
      select m.key as k, m.value::numeric as n from jsonb_each(public.ledger_obj(p_book)) m where jsonb_typeof(m.value) = 'number'
      union all select m.key, m.value::numeric from jsonb_each(public.ledger_obj(p_new)) m
      union all select m.key, -m.value::numeric from jsonb_each(public.ledger_obj(p_old)) m
    ) x group by k having sum(n) > 0) t
$$;

-- Läuft als LETZTER der BEFORE-Trigger (gleichartige Trigger laufen alphabetisch: before_write, market_check, plausible,
-- post_check, shop_check, z_ledger): Die anderen Prüfungen haben den Stand dann schon angenommen.
create or replace function public.characters_z_ledger() returns trigger
language plpgsql set search_path = '' as $$
declare
  s  jsonb;
  ms bigint;
begin
  if current_user <> 'authenticated' then return new; end if;
  s := public.ledger_guard(new.user_id, new.id, new.snapshot, tg_op = 'INSERT');
  if s is null then return null; end if; -- ließ sich nicht kappen: nicht schreiben, das Spiel lädt den Cloud-Stand
  if s is distinct from new.snapshot then
    -- Gekappt oder bereinigt: neuer Zeitstempel, damit das Spiel den Cloud-Stand übernimmt (CloudSync vergleicht saved_at)
    ms := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
    if jsonb_typeof(s -> 'meta') = 'object' then s := jsonb_set(s, '{meta,savedAt}', to_jsonb(ms)); end if;
    new.snapshot := s;
    new.saved_at := timestamptz 'epoch' + ms * interval '1 millisecond';
    new.level := case when jsonb_typeof(s #> '{slices,progress,level}') = 'number'
                      then greatest(1, least(100, trunc((s #> '{slices,progress,level}')::numeric)))::int else 1 end;
  end if;
  return new;
end $$;
drop trigger if exists characters_z_ledger on public.characters;
create trigger characters_z_ledger before insert or update on public.characters
  for each row execute function public.characters_z_ledger();

-- Nach dem Schreiben: Spieler → ledger_user_sync. Server, Auktionshaus, Postfach, Rückbuchung, Admin → Änderung ins Buch.
create or replace function public.characters_z_ledger_after() returns trigger
language plpgsql set search_path = '' as $$
declare
  v jsonb;
  o jsonb;
begin
  if current_user = 'authenticated' then
    perform public.ledger_user_sync(new.user_id, new.id);
    return null;
  end if;
  if tg_op = 'UPDATE' and new.snapshot is not distinct from old.snapshot then return null; end if;
  v := public.ledger_values(new.snapshot);
  if tg_op = 'UPDATE' then
    o := public.ledger_values(old.snapshot);
    update public.character_ledger l
      set xp = greatest(0, l.xp + (v ->> 'xp')::bigint - (o ->> 'xp')::bigint),
          gold = l.gold + (v ->> 'gold')::bigint - (o ->> 'gold')::bigint,
          items = public.ledger_items_add(l.items, o -> 'items', v -> 'items'),
          ver = l.ver + 1, updated_at = now()
      where l.user_id = new.user_id and l.character_id = new.id;
    if found then return null; end if;
  end if;
  insert into public.character_ledger (user_id, character_id, xp, gold, items)
    values (new.user_id, new.id, (v ->> 'xp')::bigint, (v ->> 'gold')::bigint, v -> 'items')
    on conflict (user_id, character_id) do nothing;
  return null;
end $$;
drop trigger if exists characters_z_ledger_after on public.characters;
create trigger characters_z_ledger_after after insert or update on public.characters
  for each row execute function public.characters_z_ledger_after();

-- Klasse und Volk stehen mit dem ersten Speichern fest (das Spiel kann sie nicht ändern). Die Regeln des Buchs hängen an
-- der Klasse (Waffen, Händler); ein Upload mit anderer Klasse behält die gespeicherte.
create or replace function public.characters_identity() returns trigger
language plpgsql set search_path = '' as $$
declare
  cls  text;
  race text;
begin
  if current_user <> 'authenticated' or tg_op <> 'UPDATE' then return new; end if;
  cls := coalesce(old.class_id, old.snapshot #>> '{slices,character,classId}');
  race := coalesce(old.race_id, old.snapshot #>> '{slices,character,raceId}');
  new.class_id := cls;
  new.race_id := race;
  if jsonb_typeof(new.snapshot #> '{slices,character}') = 'object' then
    if cls is not null and new.snapshot #>> '{slices,character,classId}' is distinct from cls then
      new.snapshot := jsonb_set(new.snapshot, '{slices,character,classId}', to_jsonb(cls));
    end if;
    if race is not null and new.snapshot #>> '{slices,character,raceId}' is distinct from race then
      new.snapshot := jsonb_set(new.snapshot, '{slices,character,raceId}', to_jsonb(race));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists characters_identity on public.characters;
create trigger characters_identity before update on public.characters
  for each row execute function public.characters_identity();

-- Erste Sitzung mit dem neuen Spiel: Übergang endet 2 Tage später (nur einmal).
create or replace function public.character_ledger_started() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.state is not null and (tg_op = 'INSERT' or old.state is null) then
    update public.ledger_config set strict_after = now() + interval '2 days' where id = 1 and strict_after is null;
  end if;
  return null;
end $$;
drop trigger if exists character_ledger_started on public.character_ledger;
create trigger character_ledger_started after insert or update of state on public.character_ledger
  for each row execute function public.character_ledger_started();

-- Vermerke: höchstens einer je Minute und Konto (20261011090000_auktionshaus.sql), 'handel' und 'buch' zählen getrennt.
-- Sonst verdrängte ein gekappter Stand ('buch') den Gold-/Stufen-Vermerk, der das Handeln sperrt.
create or replace function public.characters_flag(p_user uuid, p_character text, p_reason text, p_detail jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() < 1 then raise exception 'nicht erlaubt' using errcode = '42501'; end if;
  if (select auth.uid()) is not null and p_user is distinct from (select auth.uid()) then
    raise exception 'nicht erlaubt' using errcode = '42501';
  end if;
  if exists (select 1 from public.character_flags f where f.user_id = p_user and f.created_at > now() - interval '1 minute'
             and (case f.reason when 'handel' then 1 when 'buch' then 2 else 0 end)
               = (case p_reason when 'handel' then 1 when 'buch' then 2 else 0 end)) then
    return;
  end if;
  insert into public.character_flags (user_id, character_id, reason, detail) values (p_user, left(p_character, 64), p_reason, p_detail);
end $$;

-- ------------------------------------------------------------------ Bestehende Charaktere: Buch = gespeicherter Stand
insert into public.character_ledger (user_id, character_id, xp, gold, items)
  select c.user_id, c.id, (v ->> 'xp')::bigint, (v ->> 'gold')::bigint, v -> 'items'
  from public.characters c, lateral public.ledger_values(c.snapshot) v
  on conflict (user_id, character_id) do nothing;

-- ------------------------------------------------------------------ Rechte
revoke execute on function public.ledger_arr(jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_obj(jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_elems(jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_qty(jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_values(jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_fix_slot(jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_fix_gear(jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_fix_int(jsonb, numeric, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.ledger_normalize(jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_over(jsonb, bigint, bigint, jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_take_list(jsonb, text, numeric, boolean) from public, anon, authenticated;
revoke execute on function public.ledger_take(jsonb, text, numeric) from public, anon, authenticated;
revoke execute on function public.ledger_clamp(jsonb, bigint, bigint, jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_items_add(jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.characters_z_ledger() from public, anon, authenticated;
revoke execute on function public.characters_z_ledger_after() from public, anon, authenticated;
revoke execute on function public.character_ledger_started() from public, anon, authenticated;
revoke execute on function public.characters_identity() from public, anon, authenticated;
-- Server-Rolle (Worker, Spiegeln bei Server-Buchungen über die Server-Rolle)
grant execute on function public.ledger_arr(jsonb), public.ledger_obj(jsonb), public.ledger_elems(jsonb), public.ledger_qty(jsonb),
  public.ledger_values(jsonb), public.ledger_items_add(jsonb, jsonb, jsonb) to service_role;
-- Die Trigger laufen mit der Rolle des Spielers und brauchen deshalb das Ausführrecht (beide prüfen Aufrufer und Trigger).
revoke execute on function public.ledger_guard(uuid, text, jsonb, boolean) from public, anon;
grant execute on function public.ledger_guard(uuid, text, jsonb, boolean) to authenticated;
revoke execute on function public.ledger_user_sync(uuid, text) from public, anon;
grant execute on function public.ledger_user_sync(uuid, text) to authenticated;
revoke execute on function public.characters_flag(uuid, text, text, jsonb) from public, anon;
grant execute on function public.characters_flag(uuid, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
