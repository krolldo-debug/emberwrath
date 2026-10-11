-- Emberwrath: Auktionshaus (Handel zwischen Spielern). Einmal im Supabase-SQL-Editor ausführen,
-- NACH allen bisherigen Migrationen (zuletzt 20261011023000_namen_aendern.sql). Mehrfach ausführbar.
-- Erzeugt mit: node src/market/marketSql.mjs (Regeln: src/market/rules.js).
--
-- Sicherheitsmodell
--  - Angebote, Gebote, Kauf und Abholung laufen nur über die Funktionen market_* (security definer). Sie lesen und ändern
--    den gespeicherten Spielstand (public.characters.snapshot) in derselben Transaktion wie das Angebot; Zeilen werden
--    gesperrt (FOR UPDATE). Ein Gegenstand kann deshalb nur einmal eingestellt, ein Angebot nur einmal verkauft und
--    Gold nur einmal bezahlt werden.
--  - Verkaufen nimmt den Gegenstand aus dem Spielstand, Bieten und Kaufen ziehen das Gold sofort ab (Gebote liegen beim
--    Auktionshaus, Überbotene bekommen ihr Gold zurück). Erlöse, gewonnene und zurückgegebene Gegenstände liegen im
--    Abholfach (market_mail) und kommen erst beim Abholen in den Spielstand.
--  - Der Buchungszähler steht nur in der Datenbank (market_chars.seq) und wird in den gespeicherten Spielstand
--    geschrieben (slices.market.seq). Ein Upload muss genau diesen Zähler tragen, sonst wird er abgelehnt und als
--    'handel' vermerkt (zweites Fenster, alter Speicherplatz, erfundener Zähler).
--  - Gegenstände und Gold entstehen weiter im Browser (offener Punkt D3). Deshalb bringt das Auktionshaus niemandem mehr,
--    als er ohnehin hochladen könnte:
--      * Handeln erst ab Stufe 10 und 1 Stunde geprüfter Spielzeit (play_verified).
--      * Handelszeit je KONTO: Summe der geprüften Spielzeit aller Charaktere, höchstens 4 Stunden je Tag seit
--        dem ersten Handel (+ 2 Tage Vorschuss). Spielzeit ist nur so gut wie die Uhr des Browsers; der Tagesdeckel
--        begrenzt, was ein offenes Fenster ohne Spielen ansammelt.
--      * Bieten und Kaufen nur, solange alle Ausgaben des Kontos minus alle Einnahmen den Goldrahmen
--        (150 je Sekunde Handelszeit + Shop-Gold) nicht übersteigen; der Freibetrag neuer Charaktere zählt nicht.
--      * Abholen: Erlöse bis 150 × geprüfte Spielzeit des Charakters + Shop-Gold, zurückgegebene Gebote bis zur
--        Gold-Obergrenze der Spielstandprüfung; der Rest bleibt im Abholfach. characters_plausible bleibt unverändert.
--      * Was das Auktionshaus geliefert hat, führt der Server als Bestand (market_owned) und lässt es frei wieder
--        einstellen. Eigene Beute kostet Handelskontingent des Kontos nach Seltenheit und Menge (wächst mit der
--        Handelszeit) und darf höchstens 5 Stufen über dem Charakter liegen. Legendäre Reittiere sind nicht
--        handelbar, bis Beute auf dem Server entsteht.
--  - Ein Upload, den das Auktionshaus ablehnt ('handel'), verbraucht nicht die Vermerk-Sperre für Gold/Stufe/Grenze.
--  - Konten mit Schummel-Vermerk (Stufe/Gold/Grenze, letzte 7 Tage) dürfen nicht handeln.
--  - Handelbar sind nur Gegenstände aus public.market_items (aus dem Spiel erzeugt): keine Questgegenstände, keine
--    Erfolgsbelohnungen, keine Shop-Designs. Tabellen sind für Spieler nicht direkt les- oder schreibbar (RLS ohne Policies).

-- ------------------------------------------------------------------ Tabellen
create table if not exists public.market_items (
  id        text primary key,
  category  text not null,
  rarity    smallint not null,            -- 0 gewöhnlich … 4 legendär
  req_level int not null,
  stack     int not null check (stack >= 1),
  classes   text[]
);

create table if not exists public.market_chars (
  user_id      uuid not null,
  character_id text not null,
  seq          bigint not null default 0,  -- letzte Buchung des Auktionshauses (nur der Server zählt)
  net          bigint not null default 0,  -- Gold durch das Auktionshaus: Einnahmen minus Ausgaben (dieser Charakter)
  primary key (user_id, character_id),
  foreign key (user_id, character_id) references public.characters (user_id, id) on delete cascade
);
alter table public.market_chars drop column if exists fresh;

-- Je Konto: Beginn des Handels (Tagesdeckel), Handelsgewinn aller Charaktere, verbrauchtes Kontingent.
create table if not exists public.market_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  started date not null default current_date,
  net     bigint not null default 0,
  fresh   int not null default 0
);

-- Bestand aus dem Auktionshaus: Gegenstände, die der Server diesem Charakter geliefert hat.
create table if not exists public.market_owned (
  user_id      uuid not null,
  character_id text not null,
  item_id      text not null,
  qty          int not null default 0 check (qty >= 0),
  primary key (user_id, character_id, item_id),
  foreign key (user_id, character_id) references public.characters (user_id, id) on delete cascade
);

create table if not exists public.market_listings (
  id          bigint generated always as identity primary key,
  seller_user uuid references auth.users (id) on delete set null,
  seller_char text not null,
  item_id     text not null,
  qty         int not null check (qty between 1 and 9999),
  learned     boolean not null default false,   -- gelerntes Reittier: kommt zurückgegeben wieder als gelernt an
  category    text not null,
  rarity      smallint not null,
  req_level   int not null,
  classes     text[],
  start_bid   bigint check (start_bid between 1 and 10000000),
  buyout      bigint check (buyout between 1 and 10000000),
  bid         bigint,
  bidder_user uuid references auth.users (id) on delete set null,
  bidder_char text,
  bids        int not null default 0,
  price       bigint,                            -- Verkaufspreis
  status      text not null default 'active' check (status in ('active', 'sold', 'expired', 'cancelled')),
  created_at  timestamptz not null default now(),
  ends_at     timestamptz not null,
  closed_at   timestamptz,
  check (start_bid is not null or buyout is not null),
  check (buyout is null or start_bid is null or buyout >= start_bid)
);
create index if not exists market_listings_open on public.market_listings (category, rarity, created_at desc) where status = 'active';
create index if not exists market_listings_end on public.market_listings (ends_at) where status = 'active';
create index if not exists market_listings_seller on public.market_listings (seller_user, status);
create index if not exists market_listings_bidder on public.market_listings (bidder_user, status);
create index if not exists market_listings_closed on public.market_listings (closed_at) where status <> 'active';

create table if not exists public.market_mail (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  character_id text not null,
  kind         text not null check (kind in ('sold', 'won', 'bought', 'outbid', 'expired', 'cancelled')),
  item_id      text,
  qty          int not null default 0,
  learned      boolean not null default false,
  gold         bigint not null default 0 check (gold >= 0),
  listing_id   bigint,
  created_at   timestamptz not null default now(),
  collected_at timestamptz
);
create index if not exists market_mail_open on public.market_mail (user_id, character_id) where collected_at is null;
create index if not exists market_mail_done on public.market_mail (collected_at) where collected_at is not null;

create table if not exists public.market_rate (
  user_id uuid primary key references auth.users (id) on delete cascade,
  minute  timestamptz not null,
  n       int not null,
  hour    timestamptz not null,
  listed  int not null
);

alter table public.market_items enable row level security;
alter table public.market_chars enable row level security;
alter table public.market_listings enable row level security;
alter table public.market_mail enable row level security;
alter table public.market_rate enable row level security;
alter table public.market_owned enable row level security;
alter table public.market_accounts enable row level security;
-- Neue Tabellen bekommen in diesem Projekt keine automatischen Rechte; Spieler gehen nur über die Funktionen.
revoke all on public.market_items, public.market_chars, public.market_listings, public.market_mail, public.market_rate,
  public.market_owned, public.market_accounts from anon, authenticated;
grant select, insert, update, delete on public.market_items, public.market_chars, public.market_listings, public.market_mail,
  public.market_rate, public.market_owned, public.market_accounts to service_role;

-- Erste Fassung dieser Migration (nie freigegeben): hob die Gold-Obergrenze um Auktionserlöse an. Falls sie lief,
-- characters_plausible wiederherstellen und den Baustein entfernen.
do $restore$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'characters_plausible' and p.prosrc like '%characters_market_gold%') then
    execute $plaus$create or replace function public.characters_plausible() returns trigger
language plpgsql set search_path = '' as $$
declare
  lvl    int;
  gold   numeric;
  pt     numeric;
  o_lvl  int;
  o_gold numeric;
  o_pt   numeric;
  real_s numeric;
  play   numeric;
  ver    numeric;
  why    text := null;
  info   jsonb;
begin
  begin
    lvl  := coalesce((new.snapshot #>> '{slices,progress,level}')::int, 1);
    gold := coalesce((new.snapshot #>> '{slices,wallet,gold}')::numeric, 0);
    pt   := coalesce((new.snapshot #>> '{meta,playTime}')::numeric, 0);
  exception when others then
    lvl := -1; gold := -1; pt := 0;
  end;
  new.level := greatest(1, least(100, lvl));

  -- Nur Uploads von Spielern prüfen; SQL-Editor, Server und Admin-Funktionen nicht.
  if current_user <> 'authenticated' then
    if tg_op = 'UPDATE' then new.play_verified := coalesce(new.play_verified, old.play_verified); end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.play_verified := 0;
    -- Upsert eines bestehenden Charakters: Postgres ruft erst den INSERT-Trigger, dann den UPDATE-Trigger, der vergleicht.
    perform 1 from public.characters c where c.user_id = new.user_id and c.id = new.id for update;
    if found then return new; end if;
  else
    new.play_verified := old.play_verified;
  end if;

  if lvl < 1 or lvl > 40 or gold < -1000000 or gold > 50000000 then
    why := 'grenze';
    info := jsonb_build_object('level', lvl, 'gold', gold);
  elsif tg_op = 'INSERT' then
    if lvl > 3 or gold > 5000 then
      why := 'neu';
      info := jsonb_build_object('level', lvl, 'gold', gold, 'playTime', pt);
    else
      -- Nur das Startpaket der Klasse (20261005100100_startpaket.sql, Quelle src/character/startKit.js).
      why := public.character_start_kit_problem(new.snapshot, new.class_id);
      if why is not null then
        info := jsonb_build_object('startpaket', why, 'level', lvl, 'gold', gold);
        why := 'startpaket';
      end if;
    end if;
  else
    begin
      o_lvl  := coalesce((old.snapshot #>> '{slices,progress,level}')::int, 1);
      o_gold := coalesce((old.snapshot #>> '{slices,wallet,gold}')::numeric, 0);
      o_pt   := coalesce((old.snapshot #>> '{meta,playTime}')::numeric, 0);
    exception when others then
      return new; -- alter Stand nicht lesbar: nichts zu vergleichen
    end;
    -- Spielzeit nur so weit anrechnen, wie seit dem letzten Speichern echte Zeit vergangen ist.
    real_s := greatest(0, extract(epoch from (now() - old.updated_at)));
    play := greatest(0, least(pt - o_pt, real_s));
    ver := coalesce(old.play_verified, 0) + play;
    if lvl > o_lvl and (lvl > o_lvl + 2 + floor(play / 120) or lvl > 3 + floor(ver / 45)) then
      why := 'stufe';
    elsif gold > o_gold and gold > 50000 + ver * 150 + public.characters_shop_gold(old.user_id, old.id) then
      why := 'gold';
    end if;
    info := jsonb_build_object('level', jsonb_build_array(o_lvl, lvl), 'gold', jsonb_build_array(o_gold, gold),
      'playTime', jsonb_build_array(o_pt, pt), 'realSeconds', round(real_s), 'verified', round(ver));
    if why is null then new.play_verified := ver; end if;
  end if;

  if why is null then return new; end if;
  perform public.characters_flag(coalesce(new.user_id, old.user_id), new.id, why, info);
  return null; -- Zeile nicht schreiben
end $$;$plaus$;
  end if;
end $restore$;
drop function if exists public.characters_market_gold(uuid, text);
drop function if exists public.market_spendable(public.characters, bigint);
revoke all on all sequences in schema public from anon, authenticated;
grant usage, select on all sequences in schema public to service_role;

-- ------------------------------------------------------------------ Katalog (aus dem Spiel erzeugt)
delete from public.market_items;
insert into public.market_items (id, category, rarity, req_level, stack, classes) values
('iron_sword','weapon',1,2,1,'{warrior,rogue}'),
('ashguard_sabre','weapon',2,5,1,'{warrior,rogue}'),
('steel_blade','weapon',1,7,1,'{warrior,rogue}'),
('tidebound_sword','weapon',2,10,1,'{warrior,rogue}'),
('borderwatch_broadsword','weapon',2,9,1,'{warrior,rogue}'),
('tempered_longsword','weapon',1,11,1,'{warrior,rogue}'),
('runeblade','weapon',2,12,1,'{warrior,rogue}'),
('ember_blade','weapon',3,13,1,'{warrior,rogue}'),
('cinder_blade','weapon',1,14,1,'{warrior,rogue}'),
('bonebreaker_longsword','weapon',2,15,1,'{warrior,rogue}'),
('forged_longsword','weapon',1,17,1,'{warrior,rogue}'),
('frostbite','weapon',3,16,1,'{warrior,rogue}'),
('obsidian_edge','weapon',3,18,1,'{warrior,rogue}'),
('crown_of_embers_blade','weapon',4,19,1,'{warrior,rogue}'),
('steppe_sword','weapon',1,20,1,'{warrior,rogue}'),
('steppe_blade','weapon',1,23,1,'{warrior,rogue}'),
('steppe_sabre','weapon',1,21,1,'{warrior,rogue}'),
('steppe_scimitar','weapon',1,24,1,'{warrior,rogue}'),
('barrow_sword','weapon',2,20,1,'{warrior,rogue}'),
('barrow_blade','weapon',2,23,1,'{warrior,rogue}'),
('barrow_sabre','weapon',2,21,1,'{warrior,rogue}'),
('barrow_scimitar','weapon',2,24,1,'{warrior,rogue}'),
('mirewarden_sword','weapon',1,25,1,'{warrior,rogue}'),
('mirewarden_blade','weapon',1,28,1,'{warrior,rogue}'),
('mirewarden_sabre','weapon',1,26,1,'{warrior,rogue}'),
('mirewarden_scimitar','weapon',1,29,1,'{warrior,rogue}'),
('blightbane_sword','weapon',2,25,1,'{warrior,rogue}'),
('blightbane_blade','weapon',2,28,1,'{warrior,rogue}'),
('blightbane_sabre','weapon',2,26,1,'{warrior,rogue}'),
('blightbane_scimitar','weapon',2,29,1,'{warrior,rogue}'),
('rimehunter_sword','weapon',1,30,1,'{warrior,rogue}'),
('rimehunter_blade','weapon',1,33,1,'{warrior,rogue}'),
('rimehunter_sabre','weapon',1,31,1,'{warrior,rogue}'),
('rimehunter_scimitar','weapon',1,34,1,'{warrior,rogue}'),
('jarl_sword','weapon',2,30,1,'{warrior,rogue}'),
('jarl_blade','weapon',2,33,1,'{warrior,rogue}'),
('jarl_sabre','weapon',2,31,1,'{warrior,rogue}'),
('jarl_scimitar','weapon',2,34,1,'{warrior,rogue}'),
('bastion_sword','weapon',1,35,1,'{warrior,rogue}'),
('bastion_blade','weapon',1,38,1,'{warrior,rogue}'),
('bastion_sabre','weapon',1,36,1,'{warrior,rogue}'),
('bastion_scimitar','weapon',1,39,1,'{warrior,rogue}'),
('emberknight_sword','weapon',2,35,1,'{warrior,rogue}'),
('emberknight_blade','weapon',2,38,1,'{warrior,rogue}'),
('emberknight_sabre','weapon',2,36,1,'{warrior,rogue}'),
('emberknight_scimitar','weapon',2,39,1,'{warrior,rogue}'),
('dustwind_blade','weapon',3,23,1,'{warrior,rogue}'),
('emberwraith_blade','weapon',3,37,1,'{warrior,rogue}'),
('ulgrim_blade','weapon',2,25,1,'{warrior,rogue}'),
('ashen_greatsword','weapon',1,6,1,'{warrior}'),
('borderlord_greatsword','weapon',2,11,1,'{warrior}'),
('obsidian_greatsword','weapon',3,17,1,'{warrior}'),
('steppe_greatsword','weapon',1,20,1,'{warrior}'),
('steppe_claymore','weapon',1,23,1,'{warrior}'),
('barrow_greatsword','weapon',2,20,1,'{warrior}'),
('barrow_claymore','weapon',2,23,1,'{warrior}'),
('mirewarden_greatsword','weapon',1,25,1,'{warrior}'),
('mirewarden_claymore','weapon',1,28,1,'{warrior}'),
('blightbane_greatsword','weapon',2,25,1,'{warrior}'),
('blightbane_claymore','weapon',2,28,1,'{warrior}'),
('rimehunter_greatsword','weapon',1,30,1,'{warrior}'),
('rimehunter_claymore','weapon',1,33,1,'{warrior}'),
('jarl_greatsword','weapon',2,30,1,'{warrior}'),
('jarl_claymore','weapon',2,33,1,'{warrior}'),
('bastion_greatsword','weapon',1,35,1,'{warrior}'),
('bastion_claymore','weapon',1,38,1,'{warrior}'),
('emberknight_greatsword','weapon',2,35,1,'{warrior}'),
('emberknight_claymore','weapon',2,38,1,'{warrior}'),
('glacier_edge','weapon',3,33,1,'{warrior}'),
('ashfall','weapon',3,38,1,'{warrior}'),
('kingsbane','weapon',4,39,1,'{warrior}'),
('iron_axe','weapon',1,3,1,'{warrior}'),
('varkhul_cleaver','weapon',2,5,1,'{warrior}'),
('northman_axe','weapon',2,7,1,'{warrior}'),
('double_axe','weapon',1,10,1,'{warrior}'),
('cinder_axe','weapon',1,15,1,'{warrior}'),
('forge_axe','weapon',2,18,1,'{warrior}'),
('bonesplitter','weapon',2,12,1,'{warrior}'),
('ashmaw','weapon',3,17,1,'{warrior}'),
('borka_cleaver','weapon',2,8,1,'{warrior}'),
('steppe_axe','weapon',1,21,1,'{warrior}'),
('steppe_hatchet','weapon',1,24,1,'{warrior}'),
('barrow_axe','weapon',2,21,1,'{warrior}'),
('barrow_hatchet','weapon',2,24,1,'{warrior}'),
('mirewarden_axe','weapon',1,26,1,'{warrior}'),
('mirewarden_hatchet','weapon',1,29,1,'{warrior}'),
('blightbane_axe','weapon',2,26,1,'{warrior}'),
('blightbane_hatchet','weapon',2,29,1,'{warrior}'),
('rimehunter_axe','weapon',1,31,1,'{warrior}'),
('rimehunter_hatchet','weapon',1,34,1,'{warrior}'),
('jarl_axe','weapon',2,31,1,'{warrior}'),
('jarl_hatchet','weapon',2,34,1,'{warrior}'),
('bastion_axe','weapon',1,36,1,'{warrior}'),
('bastion_hatchet','weapon',1,39,1,'{warrior}'),
('emberknight_axe','weapon',2,36,1,'{warrior}'),
('emberknight_hatchet','weapon',2,39,1,'{warrior}'),
('rotfang','weapon',3,27,1,'{warrior}'),
('iron_mace','weapon',1,4,1,'{warrior}'),
('gravewarden_mace','weapon',2,8,1,'{warrior}'),
('morningstar','weapon',1,11,1,'{warrior}'),
('cryptwarden_star','weapon',2,14,1,'{warrior}'),
('sunhammer','weapon',3,17,1,'{warrior}'),
('cinderfist_maul','weapon',2,14,1,'{warrior}'),
('steppe_mace','weapon',1,20,1,'{warrior}'),
('steppe_morningstar','weapon',1,23,1,'{warrior}'),
('barrow_mace','weapon',2,20,1,'{warrior}'),
('barrow_morningstar','weapon',2,23,1,'{warrior}'),
('mirewarden_mace','weapon',1,25,1,'{warrior}'),
('mirewarden_morningstar','weapon',1,28,1,'{warrior}'),
('blightbane_mace','weapon',2,25,1,'{warrior}'),
('blightbane_morningstar','weapon',2,28,1,'{warrior}'),
('rimehunter_mace','weapon',1,30,1,'{warrior}'),
('rimehunter_morningstar','weapon',1,33,1,'{warrior}'),
('jarl_mace','weapon',2,30,1,'{warrior}'),
('jarl_morningstar','weapon',2,33,1,'{warrior}'),
('bastion_mace','weapon',1,35,1,'{warrior}'),
('bastion_morningstar','weapon',1,38,1,'{warrior}'),
('emberknight_mace','weapon',2,35,1,'{warrior}'),
('emberknight_morningstar','weapon',2,38,1,'{warrior}'),
('frostjarl_hammer','weapon',3,34,1,'{warrior}'),
('wolfsbane_dagger','weapon',1,2,1,'{rogue,ranger}'),
('tidebound_dagger','weapon',1,10,1,'{rogue,ranger}'),
('cinder_knife','weapon',2,16,1,'{rogue,ranger}'),
('desert_kris','weapon',2,7,1,'{rogue,ranger}'),
('venomfang','weapon',2,10,1,'{rogue,ranger}'),
('steel_stiletto','weapon',1,13,1,'{rogue,ranger}'),
('shadowstrike','weapon',3,15,1,'{rogue,ranger}'),
('ashfang','weapon',3,18,1,'{rogue,ranger}'),
('nightwhisper','weapon',4,19,1,'{rogue,ranger}'),
('steppe_dagger','weapon',1,21,1,'{rogue,ranger}'),
('steppe_stiletto','weapon',1,24,1,'{rogue,ranger}'),
('barrow_dagger','weapon',2,21,1,'{rogue,ranger}'),
('barrow_stiletto','weapon',2,24,1,'{rogue,ranger}'),
('mirewarden_dagger','weapon',1,26,1,'{rogue,ranger}'),
('mirewarden_stiletto','weapon',1,29,1,'{rogue,ranger}'),
('blightbane_dagger','weapon',2,26,1,'{rogue,ranger}'),
('blightbane_stiletto','weapon',2,29,1,'{rogue,ranger}'),
('rimehunter_dagger','weapon',1,31,1,'{rogue,ranger}'),
('rimehunter_stiletto','weapon',1,34,1,'{rogue,ranger}'),
('jarl_dagger','weapon',2,31,1,'{rogue,ranger}'),
('jarl_stiletto','weapon',2,34,1,'{rogue,ranger}'),
('bastion_dagger','weapon',1,36,1,'{rogue,ranger}'),
('bastion_stiletto','weapon',1,39,1,'{rogue,ranger}'),
('emberknight_dagger','weapon',2,36,1,'{rogue,ranger}'),
('emberknight_stiletto','weapon',2,39,1,'{rogue,ranger}'),
('laughing_fang','weapon',3,22,1,'{rogue,ranger}'),
('mist_thorn','weapon',3,28,1,'{rogue,ranger}'),
('winterwhisper','weapon',3,32,1,'{rogue,ranger}'),
('cinder_kris','weapon',3,38,1,'{rogue,ranger}'),
('skalvyr_fang','weapon',2,36,1,'{rogue,ranger}'),
('veilpiercer','weapon',4,39,1,'{rogue,ranger}'),
('hunter_bow','weapon',1,3,1,'{ranger}'),
('longbow','weapon',1,6,1,'{ranger}'),
('recurve_bow','weapon',2,8,1,'{ranger}'),
('cinder_bow','weapon',1,14,1,'{ranger}'),
('forge_longbow','weapon',2,18,1,'{ranger}'),
('bone_bow','weapon',2,12,1,'{ranger}'),
('moonsong','weapon',3,16,1,'{ranger}'),
('cinderstorm_bow','weapon',3,18,1,'{ranger}'),
('starfall','weapon',4,19,1,'{ranger}'),
('steppe_bow','weapon',1,20,1,'{ranger}'),
('steppe_longbow','weapon',1,23,1,'{ranger}'),
('barrow_bow','weapon',2,20,1,'{ranger}'),
('barrow_longbow','weapon',2,23,1,'{ranger}'),
('mirewarden_bow','weapon',1,25,1,'{ranger}'),
('mirewarden_longbow','weapon',1,28,1,'{ranger}'),
('blightbane_bow','weapon',2,25,1,'{ranger}'),
('blightbane_longbow','weapon',2,28,1,'{ranger}'),
('rimehunter_bow','weapon',1,30,1,'{ranger}'),
('rimehunter_longbow','weapon',1,33,1,'{ranger}'),
('jarl_bow','weapon',2,30,1,'{ranger}'),
('jarl_longbow','weapon',2,33,1,'{ranger}'),
('bastion_bow','weapon',1,35,1,'{ranger}'),
('bastion_longbow','weapon',1,38,1,'{ranger}'),
('emberknight_bow','weapon',2,35,1,'{ranger}'),
('emberknight_longbow','weapon',2,38,1,'{ranger}'),
('windrunner','weapon',3,24,1,'{ranger}'),
('last_light','weapon',3,39,1,'{ranger}'),
('skalvyr_rib_bow','weapon',2,36,1,'{ranger}'),
('dawnstring','weapon',4,39,1,'{ranger}'),
('gnarled_staff','weapon',1,3,1,'{mage}'),
('crystal_staff','weapon',2,6,1,'{mage}'),
('adept_staff','weapon',1,9,1,'{mage}'),
('tide_staff','weapon',2,10,1,'{mage}'),
('cinder_staff','weapon',1,13,1,'{mage}'),
('bone_staff','weapon',2,11,1,'{mage}'),
('frostspire_staff','weapon',2,14,1,'{mage}'),
('ember_staff','weapon',3,14,1,'{mage}'),
('frost_staff','weapon',3,17,1,'{mage}'),
('worldstaff','weapon',4,19,1,'{mage}'),
('steppe_staff','weapon',1,21,1,'{mage}'),
('steppe_quarterstaff','weapon',1,24,1,'{mage}'),
('barrow_staff','weapon',2,21,1,'{mage}'),
('barrow_quarterstaff','weapon',2,24,1,'{mage}'),
('mirewarden_staff','weapon',1,26,1,'{mage}'),
('mirewarden_quarterstaff','weapon',1,29,1,'{mage}'),
('blightbane_staff','weapon',2,26,1,'{mage}'),
('blightbane_quarterstaff','weapon',2,29,1,'{mage}'),
('rimehunter_staff','weapon',1,31,1,'{mage}'),
('rimehunter_quarterstaff','weapon',1,34,1,'{mage}'),
('jarl_staff','weapon',2,31,1,'{mage}'),
('jarl_quarterstaff','weapon',2,34,1,'{mage}'),
('bastion_staff','weapon',1,36,1,'{mage}'),
('bastion_quarterstaff','weapon',1,39,1,'{mage}'),
('emberknight_staff','weapon',2,36,1,'{mage}'),
('emberknight_quarterstaff','weapon',2,39,1,'{mage}'),
('grave_lantern','weapon',3,24,1,'{mage}'),
('aurora_staff','weapon',3,34,1,'{mage}'),
('pyre_staff','weapon',3,38,1,'{mage}'),
('rotmother_staff','weapon',2,31,1,'{mage}'),
('staff_of_last_ash','weapon',4,39,1,'{mage}'),
('cinder_wand','weapon',1,13,1,'{mage}'),
('forge_wand','weapon',2,18,1,'{mage}'),
('bone_wand','weapon',1,5,1,'{mage}'),
('crystal_wand','weapon',2,10,1,'{mage}'),
('ember_wand','weapon',3,15,1,'{mage}'),
('scribe_quill','weapon',2,4,1,'{mage}'),
('steppe_wand','weapon',1,20,1,'{mage}'),
('steppe_rod','weapon',1,23,1,'{mage}'),
('barrow_wand','weapon',2,20,1,'{mage}'),
('barrow_rod','weapon',2,23,1,'{mage}'),
('mirewarden_wand','weapon',1,25,1,'{mage}'),
('mirewarden_rod','weapon',1,28,1,'{mage}'),
('blightbane_wand','weapon',2,25,1,'{mage}'),
('blightbane_rod','weapon',2,28,1,'{mage}'),
('rimehunter_wand','weapon',1,30,1,'{mage}'),
('rimehunter_rod','weapon',1,33,1,'{mage}'),
('jarl_wand','weapon',2,30,1,'{mage}'),
('jarl_rod','weapon',2,33,1,'{mage}'),
('bastion_wand','weapon',1,35,1,'{mage}'),
('bastion_rod','weapon',1,38,1,'{mage}'),
('emberknight_wand','weapon',2,35,1,'{mage}'),
('emberknight_rod','weapon',2,38,1,'{mage}'),
('bogwitch_wand','weapon',3,28,1,'{mage}'),
('leather_jerkin','armor',1,2,1,null),
('mage_robe','armor',1,5,1,null),
('ashguard_hauberk','armor',2,5,1,null),
('emberweave_robe','armor',2,6,1,null),
('nightstalker_vest','armor',2,6,1,null),
('bone_mail','armor',2,5,1,null),
('scale_armor','armor',1,6,1,null),
('hunter_leather','armor',1,7,1,null),
('iron_cuirass','armor',2,9,1,null),
('circle_robe','armor',2,10,1,null),
('shadow_leather','armor',2,12,1,null),
('knight_plate','armor',2,13,1,null),
('tidebound_robe','armor',1,11,1,null),
('cinder_leather','armor',1,14,1,null),
('cinder_mail','armor',1,15,1,null),
('forge_plate','armor',2,17,1,null),
('forge_robe','armor',2,18,1,null),
('arcane_robe','armor',3,16,1,null),
('nightstalker_coat','armor',3,17,1,null),
('cryptlord_plate','armor',3,18,1,null),
('tyrant_plate','armor',4,19,1,null),
('emberwarden_mail','armor',3,19,1,null),
('emberwing_scale','armor',2,18,1,null),
('cinder_robe','armor',1,17,1,null),
('last_ember_robe','armor',2,39,1,null),
('steppe_robe','armor',1,23,1,null),
('steppe_jerkin','armor',1,21,1,null),
('steppe_hauberk','armor',1,24,1,null),
('steppe_cuirass','armor',1,22,1,null),
('barrow_robe','armor',2,20,1,null),
('barrow_jerkin','armor',2,23,1,null),
('barrow_hauberk','armor',2,21,1,null),
('barrow_cuirass','armor',2,24,1,null),
('mirewarden_robe','armor',1,28,1,null),
('mirewarden_jerkin','armor',1,26,1,null),
('mirewarden_hauberk','armor',1,29,1,null),
('mirewarden_cuirass','armor',1,27,1,null),
('blightbane_robe','armor',2,25,1,null),
('blightbane_jerkin','armor',2,28,1,null),
('blightbane_hauberk','armor',2,26,1,null),
('blightbane_cuirass','armor',2,29,1,null),
('rimehunter_robe','armor',1,33,1,null),
('rimehunter_jerkin','armor',1,31,1,null),
('rimehunter_hauberk','armor',1,34,1,null),
('rimehunter_cuirass','armor',1,32,1,null),
('jarl_robe','armor',2,30,1,null),
('jarl_jerkin','armor',2,33,1,null),
('jarl_hauberk','armor',2,31,1,null),
('jarl_cuirass','armor',2,34,1,null),
('bastion_robe','armor',1,38,1,null),
('bastion_jerkin','armor',1,36,1,null),
('bastion_hauberk','armor',1,39,1,null),
('bastion_cuirass','armor',1,37,1,null),
('emberknight_robe','armor',2,35,1,null),
('emberknight_jerkin','armor',2,38,1,null),
('emberknight_hauberk','armor',2,36,1,null),
('emberknight_cuirass','armor',2,39,1,null),
('dustveil_mantle','armor',3,23,1,null),
('swampking_scales','armor',3,28,1,null),
('jarlsguard_plate','armor',3,33,1,null),
('bastion_warplate','armor',3,38,1,null),
('ember_silk_robe','armor',3,37,1,null),
('khar_hauberk','armor',2,23,1,null),
('hillking_cuirass','armor',2,25,1,null),
('bogdread_jerkin','armor',2,28,1,null),
('rotmother_robe','armor',2,31,1,null),
('gorm_cuirass','armor',2,33,1,null),
('wyrmscale_jerkin','armor',2,36,1,null),
('colossus_robe','armor',2,38,1,null),
('sovereign_plate','armor',4,39,1,null),
('varkhul_helm','armor',2,5,1,null),
('tide_circlet','armor',2,11,1,null),
('tyrant_helm','armor',3,19,1,null),
('emberwarden_helm','armor',3,19,1,null),
('leather_cap','armor',1,6,1,null),
('wanderer_hood','armor',1,4,1,null),
('iron_helm','armor',1,6,1,null),
('cinder_helm','armor',1,13,1,null),
('forge_helm','armor',2,18,1,null),
('horned_helm','armor',2,10,1,null),
('warden_helm','armor',1,9,1,null),
('tidecaller_hood','armor',1,10,1,null),
('shadow_hood','armor',2,14,1,null),
('cryptlord_crown','armor',3,17,1,null),
('stalker_cap','armor',1,12,1,null),
('trackers_hood','armor',2,8,1,null),
('runeweave_hood','armor',2,8,1,null),
('ashsilk_cowl','armor',2,14,1,null),
('cinder_cowl','armor',1,17,1,null),
('steppe_hood','armor',1,20,1,null),
('steppe_cap','armor',1,23,1,null),
('steppe_coif','armor',1,21,1,null),
('steppe_helm','armor',1,24,1,null),
('barrow_hood','armor',2,22,1,null),
('barrow_cap','armor',2,20,1,null),
('barrow_coif','armor',2,23,1,null),
('barrow_helm','armor',2,21,1,null),
('mirewarden_hood','armor',1,25,1,null),
('mirewarden_cap','armor',1,28,1,null),
('mirewarden_coif','armor',1,26,1,null),
('mirewarden_helm','armor',1,29,1,null),
('blightbane_hood','armor',2,27,1,null),
('blightbane_cap','armor',2,25,1,null),
('blightbane_coif','armor',2,28,1,null),
('blightbane_helm','armor',2,26,1,null),
('rimehunter_hood','armor',1,30,1,null),
('rimehunter_cap','armor',1,33,1,null),
('rimehunter_coif','armor',1,31,1,null),
('rimehunter_helm','armor',1,34,1,null),
('jarl_hood','armor',2,32,1,null),
('jarl_cap','armor',2,30,1,null),
('jarl_coif','armor',2,33,1,null),
('jarl_helm','armor',2,31,1,null),
('bastion_hood','armor',1,35,1,null),
('bastion_cap','armor',1,38,1,null),
('bastion_coif','armor',1,36,1,null),
('bastion_helm','armor',1,39,1,null),
('emberknight_hood','armor',2,37,1,null),
('emberknight_cap','armor',2,35,1,null),
('emberknight_coif','armor',2,38,1,null),
('emberknight_helm','armor',2,36,1,null),
('sporeveil_hood','armor',3,27,1,null),
('khar_helm','armor',2,23,1,null),
('hillking_helm','armor',2,25,1,null),
('bogdread_hood','armor',2,28,1,null),
('rotmother_hood','armor',2,31,1,null),
('gorm_helm','armor',2,33,1,null),
('wyrmscale_cap','armor',2,36,1,null),
('colossus_hood','armor',2,38,1,null),
('sovereign_helm','armor',3,39,1,null),
('varkhul_grips','armor',2,5,1,null),
('tide_wraps','armor',2,11,1,null),
('tyrant_gauntlets','armor',3,19,1,null),
('emberwarden_gauntlets','armor',3,19,1,null),
('leather_gloves','armor',1,4,1,null),
('chain_gloves','armor',1,5,1,null),
('cinder_gloves','armor',1,15,1,null),
('forge_gauntlets','armor',2,18,1,null),
('borderwatch_gauntlets','armor',2,9,1,null),
('silk_gloves','armor',1,13,1,null),
('ember_grips','armor',3,16,1,null),
('thornmother_grips','armor',2,9,1,null),
('suede_grips','armor',2,6,1,null),
('linen_gloves','armor',1,5,1,null),
('shadow_grips','armor',1,11,1,null),
('stalker_grips','armor',2,14,1,null),
('rune_gloves','armor',2,8,1,null),
('embersilk_gloves','armor',2,15,1,null),
('cinder_wraps','armor',1,17,1,null),
('steppe_gloves','armor',1,22,1,null),
('steppe_grips','armor',1,20,1,null),
('steppe_mitts','armor',1,23,1,null),
('steppe_gauntlets','armor',1,21,1,null),
('barrow_gloves','armor',2,24,1,null),
('barrow_grips','armor',2,22,1,null),
('barrow_mitts','armor',2,20,1,null),
('barrow_gauntlets','armor',2,23,1,null),
('mirewarden_gloves','armor',1,27,1,null),
('mirewarden_grips','armor',1,25,1,null),
('mirewarden_mitts','armor',1,28,1,null),
('mirewarden_gauntlets','armor',1,26,1,null),
('blightbane_gloves','armor',2,29,1,null),
('blightbane_grips','armor',2,27,1,null),
('blightbane_mitts','armor',2,25,1,null),
('blightbane_gauntlets','armor',2,28,1,null),
('rimehunter_gloves','armor',1,32,1,null),
('rimehunter_grips','armor',1,30,1,null),
('rimehunter_mitts','armor',1,33,1,null),
('rimehunter_gauntlets','armor',1,31,1,null),
('jarl_gloves','armor',2,34,1,null),
('jarl_grips','armor',2,32,1,null),
('jarl_mitts','armor',2,30,1,null),
('jarl_gauntlets','armor',2,33,1,null),
('bastion_gloves','armor',1,37,1,null),
('bastion_grips','armor',1,35,1,null),
('bastion_mitts','armor',1,38,1,null),
('bastion_gauntlets','armor',1,36,1,null),
('emberknight_gloves','armor',2,39,1,null),
('emberknight_grips','armor',2,37,1,null),
('emberknight_mitts','armor',2,35,1,null),
('emberknight_gauntlets','armor',2,38,1,null),
('khar_grips','armor',2,23,1,null),
('hillking_gauntlets','armor',2,25,1,null),
('bogdread_grips','armor',2,28,1,null),
('rotmother_gloves','armor',2,31,1,null),
('gorm_gauntlets','armor',2,33,1,null),
('wyrmscale_grips','armor',2,36,1,null),
('colossus_gloves','armor',2,38,1,null),
('sovereign_gauntlets','armor',3,39,1,null),
('varkhul_greaves','armor',2,5,1,null),
('tyrant_sabatons','armor',3,19,1,null),
('emberwarden_boots','armor',3,19,1,null),
('traveler_boots','armor',1,4,1,null),
('ironshod_boots','armor',2,8,1,null),
('cinder_boots','armor',1,14,1,null),
('forge_greaves','armor',2,18,1,null),
('ranger_boots','armor',1,12,1,null),
('shadowstep_boots','armor',3,15,1,null),
('chain_greaves','armor',1,4,1,null),
('linen_shoes','armor',1,4,1,null),
('temple_sandals','armor',1,10,1,null),
('silk_slippers','armor',1,16,1,null),
('hunters_boots','armor',2,7,1,null),
('rune_slippers','armor',2,8,1,null),
('nightstalker_boots','armor',2,14,1,null),
('ashsilk_slippers','armor',2,14,1,null),
('drifter_sandals','armor',1,20,1,null),
('steppe_slippers','armor',1,24,1,null),
('steppe_boots','armor',1,22,1,null),
('steppe_greaves','armor',1,20,1,null),
('steppe_sabatons','armor',1,23,1,null),
('barrow_slippers','armor',2,21,1,null),
('barrow_boots','armor',2,24,1,null),
('barrow_greaves','armor',2,22,1,null),
('barrow_sabatons','armor',2,20,1,null),
('mirewarden_slippers','armor',1,29,1,null),
('mirewarden_boots','armor',1,27,1,null),
('mirewarden_greaves','armor',1,25,1,null),
('mirewarden_sabatons','armor',1,28,1,null),
('blightbane_slippers','armor',2,26,1,null),
('blightbane_boots','armor',2,29,1,null),
('blightbane_greaves','armor',2,27,1,null),
('blightbane_sabatons','armor',2,25,1,null),
('rimehunter_slippers','armor',1,34,1,null),
('rimehunter_boots','armor',1,32,1,null),
('rimehunter_greaves','armor',1,30,1,null),
('rimehunter_sabatons','armor',1,33,1,null),
('jarl_slippers','armor',2,31,1,null),
('jarl_boots','armor',2,34,1,null),
('jarl_greaves','armor',2,32,1,null),
('jarl_sabatons','armor',2,30,1,null),
('bastion_slippers','armor',1,39,1,null),
('bastion_boots','armor',1,37,1,null),
('bastion_greaves','armor',1,35,1,null),
('bastion_sabatons','armor',1,38,1,null),
('emberknight_slippers','armor',2,36,1,null),
('emberknight_boots','armor',2,39,1,null),
('emberknight_greaves','armor',2,37,1,null),
('emberknight_sabatons','armor',2,35,1,null),
('snowstalker_boots','armor',3,32,1,null),
('khar_boots','armor',2,23,1,null),
('bogdread_boots','armor',2,28,1,null),
('gorm_sabatons','armor',2,33,1,null),
('wyrmscale_boots','armor',2,36,1,null),
('colossus_slippers','armor',2,38,1,null),
('sovereign_sabatons','armor',3,39,1,null),
('brom_ring','jewelry',2,3,1,null),
('silver_ring','jewelry',1,5,1,null),
('ruby_ring','jewelry',2,8,1,null),
('gold_ring','jewelry',1,11,1,null),
('tide_pearl_ring','jewelry',2,11,1,null),
('cinder_band','jewelry',1,16,1,null),
('sapphire_ring','jewelry',2,13,1,null),
('emerald_ring','jewelry',2,15,1,null),
('amethyst_seal','jewelry',3,18,1,null),
('salt_crown_ring','jewelry',2,11,1,null),
('hunters_band','jewelry',2,6,1,null),
('moonstone_ring','jewelry',2,7,1,null),
('ironwill_ring','jewelry',2,16,1,null),
('fire_opal_ring','jewelry',2,17,1,null),
('steppe_ring','jewelry',1,23,1,null),
('barrow_ring','jewelry',2,24,1,null),
('barrow_band','jewelry',2,24,1,null),
('barrow_signet','jewelry',2,24,1,null),
('mirewarden_ring','jewelry',1,28,1,null),
('blightbane_ring','jewelry',2,29,1,null),
('blightbane_band','jewelry',2,29,1,null),
('blightbane_signet','jewelry',2,29,1,null),
('rimehunter_ring','jewelry',1,33,1,null),
('jarl_ring','jewelry',2,34,1,null),
('jarl_band','jewelry',2,34,1,null),
('jarl_signet','jewelry',2,34,1,null),
('bastion_ring','jewelry',1,38,1,null),
('emberknight_ring','jewelry',2,39,1,null),
('emberknight_band','jewelry',2,39,1,null),
('emberknight_signet','jewelry',2,39,1,null),
('drowned_moon_ring','jewelry',3,29,1,null),
('magma_heart_ring','jewelry',3,39,1,null),
('hillking_ring','jewelry',2,25,1,null),
('sovereign_signet','jewelry',4,39,1,null),
('silver_amulet','jewelry',1,4,1,null),
('ash_charm','jewelry',1,7,1,null),
('ruby_amulet','jewelry',2,9,1,null),
('feather_charm','jewelry',2,12,1,null),
('skull_charm','jewelry',1,14,1,null),
('wolf_tooth_charm','jewelry',1,3,1,null),
('greymaw_fang','jewelry',2,3,1,null),
('priestess_amulet','jewelry',3,11,1,null),
('forge_pendant','jewelry',2,18,1,null),
('sun_amulet','jewelry',3,16,1,null),
('ember_heart','jewelry',4,19,1,null),
('acolyte_charm','jewelry',2,8,1,null),
('fang_charm','jewelry',2,5,1,null),
('wolfsbane_amulet','jewelry',2,16,1,null),
('falcon_amulet','jewelry',2,16,1,null),
('steppe_amulet','jewelry',1,24,1,null),
('barrow_amulet','jewelry',2,23,1,null),
('barrow_pendant','jewelry',2,23,1,null),
('barrow_talisman','jewelry',2,23,1,null),
('mirewarden_amulet','jewelry',1,29,1,null),
('blightbane_amulet','jewelry',2,28,1,null),
('blightbane_pendant','jewelry',2,28,1,null),
('blightbane_talisman','jewelry',2,28,1,null),
('rimehunter_amulet','jewelry',1,34,1,null),
('jarl_amulet','jewelry',2,33,1,null),
('jarl_pendant','jewelry',2,33,1,null),
('jarl_talisman','jewelry',2,33,1,null),
('bastion_amulet','jewelry',1,39,1,null),
('emberknight_amulet','jewelry',2,38,1,null),
('emberknight_pendant','jewelry',2,38,1,null),
('emberknight_talisman','jewelry',2,38,1,null),
('steppe_sun_disc','jewelry',3,24,1,null),
('icebound_heart','jewelry',3,34,1,null),
('rotmother_amulet','jewelry',2,31,1,null),
('iron_sword_bear','weapon',1,2,1,'{warrior,rogue}'),
('iron_sword_fox','weapon',1,2,1,'{warrior,rogue}'),
('ashguard_sabre_bear','weapon',2,5,1,'{warrior,rogue}'),
('ashguard_sabre_fox','weapon',2,5,1,'{warrior,rogue}'),
('steel_blade_bear','weapon',1,7,1,'{warrior,rogue}'),
('steel_blade_fox','weapon',1,7,1,'{warrior,rogue}'),
('tidebound_sword_bear','weapon',2,10,1,'{warrior,rogue}'),
('tidebound_sword_fox','weapon',2,10,1,'{warrior,rogue}'),
('borderwatch_broadsword_bear','weapon',2,9,1,'{warrior,rogue}'),
('borderwatch_broadsword_fox','weapon',2,9,1,'{warrior,rogue}'),
('tempered_longsword_bear','weapon',1,11,1,'{warrior,rogue}'),
('tempered_longsword_fox','weapon',1,11,1,'{warrior,rogue}'),
('runeblade_bear','weapon',2,12,1,'{warrior,rogue}'),
('runeblade_fox','weapon',2,12,1,'{warrior,rogue}'),
('cinder_blade_bear','weapon',1,14,1,'{warrior,rogue}'),
('cinder_blade_fox','weapon',1,14,1,'{warrior,rogue}'),
('bonebreaker_longsword_bear','weapon',2,15,1,'{warrior,rogue}'),
('bonebreaker_longsword_fox','weapon',2,15,1,'{warrior,rogue}'),
('forged_longsword_bear','weapon',1,17,1,'{warrior,rogue}'),
('forged_longsword_fox','weapon',1,17,1,'{warrior,rogue}'),
('steppe_sword_bear','weapon',1,20,1,'{warrior,rogue}'),
('steppe_sword_fox','weapon',1,20,1,'{warrior,rogue}'),
('steppe_blade_bear','weapon',1,23,1,'{warrior,rogue}'),
('steppe_blade_fox','weapon',1,23,1,'{warrior,rogue}'),
('steppe_sabre_bear','weapon',1,21,1,'{warrior,rogue}'),
('steppe_sabre_fox','weapon',1,21,1,'{warrior,rogue}'),
('steppe_scimitar_bear','weapon',1,24,1,'{warrior,rogue}'),
('steppe_scimitar_fox','weapon',1,24,1,'{warrior,rogue}'),
('barrow_sword_bear','weapon',2,20,1,'{warrior,rogue}'),
('barrow_sword_fox','weapon',2,20,1,'{warrior,rogue}'),
('barrow_blade_bear','weapon',2,23,1,'{warrior,rogue}'),
('barrow_blade_fox','weapon',2,23,1,'{warrior,rogue}'),
('barrow_sabre_bear','weapon',2,21,1,'{warrior,rogue}'),
('barrow_sabre_fox','weapon',2,21,1,'{warrior,rogue}'),
('barrow_scimitar_bear','weapon',2,24,1,'{warrior,rogue}'),
('barrow_scimitar_fox','weapon',2,24,1,'{warrior,rogue}'),
('mirewarden_sword_bear','weapon',1,25,1,'{warrior,rogue}'),
('mirewarden_sword_fox','weapon',1,25,1,'{warrior,rogue}'),
('mirewarden_blade_bear','weapon',1,28,1,'{warrior,rogue}'),
('mirewarden_blade_fox','weapon',1,28,1,'{warrior,rogue}'),
('mirewarden_sabre_bear','weapon',1,26,1,'{warrior,rogue}'),
('mirewarden_sabre_fox','weapon',1,26,1,'{warrior,rogue}'),
('mirewarden_scimitar_bear','weapon',1,29,1,'{warrior,rogue}'),
('mirewarden_scimitar_fox','weapon',1,29,1,'{warrior,rogue}'),
('blightbane_sword_bear','weapon',2,25,1,'{warrior,rogue}'),
('blightbane_sword_fox','weapon',2,25,1,'{warrior,rogue}'),
('blightbane_blade_bear','weapon',2,28,1,'{warrior,rogue}'),
('blightbane_blade_fox','weapon',2,28,1,'{warrior,rogue}'),
('blightbane_sabre_bear','weapon',2,26,1,'{warrior,rogue}'),
('blightbane_sabre_fox','weapon',2,26,1,'{warrior,rogue}'),
('blightbane_scimitar_bear','weapon',2,29,1,'{warrior,rogue}'),
('blightbane_scimitar_fox','weapon',2,29,1,'{warrior,rogue}'),
('rimehunter_sword_bear','weapon',1,30,1,'{warrior,rogue}'),
('rimehunter_sword_fox','weapon',1,30,1,'{warrior,rogue}'),
('rimehunter_blade_bear','weapon',1,33,1,'{warrior,rogue}'),
('rimehunter_blade_fox','weapon',1,33,1,'{warrior,rogue}'),
('rimehunter_sabre_bear','weapon',1,31,1,'{warrior,rogue}'),
('rimehunter_sabre_fox','weapon',1,31,1,'{warrior,rogue}'),
('rimehunter_scimitar_bear','weapon',1,34,1,'{warrior,rogue}'),
('rimehunter_scimitar_fox','weapon',1,34,1,'{warrior,rogue}'),
('jarl_sword_bear','weapon',2,30,1,'{warrior,rogue}'),
('jarl_sword_fox','weapon',2,30,1,'{warrior,rogue}'),
('jarl_blade_bear','weapon',2,33,1,'{warrior,rogue}'),
('jarl_blade_fox','weapon',2,33,1,'{warrior,rogue}'),
('jarl_sabre_bear','weapon',2,31,1,'{warrior,rogue}'),
('jarl_sabre_fox','weapon',2,31,1,'{warrior,rogue}'),
('jarl_scimitar_bear','weapon',2,34,1,'{warrior,rogue}'),
('jarl_scimitar_fox','weapon',2,34,1,'{warrior,rogue}'),
('bastion_sword_bear','weapon',1,35,1,'{warrior,rogue}'),
('bastion_sword_fox','weapon',1,35,1,'{warrior,rogue}'),
('bastion_blade_bear','weapon',1,38,1,'{warrior,rogue}'),
('bastion_blade_fox','weapon',1,38,1,'{warrior,rogue}'),
('bastion_sabre_bear','weapon',1,36,1,'{warrior,rogue}'),
('bastion_sabre_fox','weapon',1,36,1,'{warrior,rogue}'),
('bastion_scimitar_bear','weapon',1,39,1,'{warrior,rogue}'),
('bastion_scimitar_fox','weapon',1,39,1,'{warrior,rogue}'),
('emberknight_sword_bear','weapon',2,35,1,'{warrior,rogue}'),
('emberknight_sword_fox','weapon',2,35,1,'{warrior,rogue}'),
('emberknight_blade_bear','weapon',2,38,1,'{warrior,rogue}'),
('emberknight_blade_fox','weapon',2,38,1,'{warrior,rogue}'),
('emberknight_sabre_bear','weapon',2,36,1,'{warrior,rogue}'),
('emberknight_sabre_fox','weapon',2,36,1,'{warrior,rogue}'),
('emberknight_scimitar_bear','weapon',2,39,1,'{warrior,rogue}'),
('emberknight_scimitar_fox','weapon',2,39,1,'{warrior,rogue}'),
('ashen_greatsword_bear','weapon',1,6,1,'{warrior}'),
('ashen_greatsword_guard','weapon',1,6,1,'{warrior}'),
('borderlord_greatsword_bear','weapon',2,11,1,'{warrior}'),
('borderlord_greatsword_guard','weapon',2,11,1,'{warrior}'),
('steppe_greatsword_bear','weapon',1,20,1,'{warrior}'),
('steppe_greatsword_guard','weapon',1,20,1,'{warrior}'),
('steppe_claymore_bear','weapon',1,23,1,'{warrior}'),
('steppe_claymore_guard','weapon',1,23,1,'{warrior}'),
('barrow_greatsword_bear','weapon',2,20,1,'{warrior}'),
('barrow_greatsword_guard','weapon',2,20,1,'{warrior}'),
('barrow_claymore_bear','weapon',2,23,1,'{warrior}'),
('barrow_claymore_guard','weapon',2,23,1,'{warrior}'),
('mirewarden_greatsword_bear','weapon',1,25,1,'{warrior}'),
('mirewarden_greatsword_guard','weapon',1,25,1,'{warrior}'),
('mirewarden_claymore_bear','weapon',1,28,1,'{warrior}'),
('mirewarden_claymore_guard','weapon',1,28,1,'{warrior}'),
('blightbane_greatsword_bear','weapon',2,25,1,'{warrior}'),
('blightbane_greatsword_guard','weapon',2,25,1,'{warrior}'),
('blightbane_claymore_bear','weapon',2,28,1,'{warrior}'),
('blightbane_claymore_guard','weapon',2,28,1,'{warrior}'),
('rimehunter_greatsword_bear','weapon',1,30,1,'{warrior}'),
('rimehunter_greatsword_guard','weapon',1,30,1,'{warrior}'),
('rimehunter_claymore_bear','weapon',1,33,1,'{warrior}'),
('rimehunter_claymore_guard','weapon',1,33,1,'{warrior}'),
('jarl_greatsword_bear','weapon',2,30,1,'{warrior}'),
('jarl_greatsword_guard','weapon',2,30,1,'{warrior}'),
('jarl_claymore_bear','weapon',2,33,1,'{warrior}'),
('jarl_claymore_guard','weapon',2,33,1,'{warrior}'),
('bastion_greatsword_bear','weapon',1,35,1,'{warrior}'),
('bastion_greatsword_guard','weapon',1,35,1,'{warrior}'),
('bastion_claymore_bear','weapon',1,38,1,'{warrior}'),
('bastion_claymore_guard','weapon',1,38,1,'{warrior}'),
('emberknight_greatsword_bear','weapon',2,35,1,'{warrior}'),
('emberknight_greatsword_guard','weapon',2,35,1,'{warrior}'),
('emberknight_claymore_bear','weapon',2,38,1,'{warrior}'),
('emberknight_claymore_guard','weapon',2,38,1,'{warrior}'),
('iron_axe_bear','weapon',1,3,1,'{warrior}'),
('iron_axe_guard','weapon',1,3,1,'{warrior}'),
('northman_axe_bear','weapon',2,7,1,'{warrior}'),
('northman_axe_guard','weapon',2,7,1,'{warrior}'),
('double_axe_bear','weapon',1,10,1,'{warrior}'),
('double_axe_guard','weapon',1,10,1,'{warrior}'),
('cinder_axe_bear','weapon',1,15,1,'{warrior}'),
('cinder_axe_guard','weapon',1,15,1,'{warrior}'),
('forge_axe_bear','weapon',2,18,1,'{warrior}'),
('forge_axe_guard','weapon',2,18,1,'{warrior}'),
('bonesplitter_bear','weapon',2,12,1,'{warrior}'),
('bonesplitter_guard','weapon',2,12,1,'{warrior}'),
('steppe_axe_bear','weapon',1,21,1,'{warrior}'),
('steppe_axe_guard','weapon',1,21,1,'{warrior}'),
('steppe_hatchet_bear','weapon',1,24,1,'{warrior}'),
('steppe_hatchet_guard','weapon',1,24,1,'{warrior}'),
('barrow_axe_bear','weapon',2,21,1,'{warrior}'),
('barrow_axe_guard','weapon',2,21,1,'{warrior}'),
('barrow_hatchet_bear','weapon',2,24,1,'{warrior}'),
('barrow_hatchet_guard','weapon',2,24,1,'{warrior}'),
('mirewarden_axe_bear','weapon',1,26,1,'{warrior}'),
('mirewarden_axe_guard','weapon',1,26,1,'{warrior}'),
('mirewarden_hatchet_bear','weapon',1,29,1,'{warrior}'),
('mirewarden_hatchet_guard','weapon',1,29,1,'{warrior}'),
('blightbane_axe_bear','weapon',2,26,1,'{warrior}'),
('blightbane_axe_guard','weapon',2,26,1,'{warrior}'),
('blightbane_hatchet_bear','weapon',2,29,1,'{warrior}'),
('blightbane_hatchet_guard','weapon',2,29,1,'{warrior}'),
('rimehunter_axe_bear','weapon',1,31,1,'{warrior}'),
('rimehunter_axe_guard','weapon',1,31,1,'{warrior}'),
('rimehunter_hatchet_bear','weapon',1,34,1,'{warrior}'),
('rimehunter_hatchet_guard','weapon',1,34,1,'{warrior}'),
('jarl_axe_bear','weapon',2,31,1,'{warrior}'),
('jarl_axe_guard','weapon',2,31,1,'{warrior}'),
('jarl_hatchet_bear','weapon',2,34,1,'{warrior}'),
('jarl_hatchet_guard','weapon',2,34,1,'{warrior}'),
('bastion_axe_bear','weapon',1,36,1,'{warrior}'),
('bastion_axe_guard','weapon',1,36,1,'{warrior}'),
('bastion_hatchet_bear','weapon',1,39,1,'{warrior}'),
('bastion_hatchet_guard','weapon',1,39,1,'{warrior}'),
('emberknight_axe_bear','weapon',2,36,1,'{warrior}'),
('emberknight_axe_guard','weapon',2,36,1,'{warrior}'),
('emberknight_hatchet_bear','weapon',2,39,1,'{warrior}'),
('emberknight_hatchet_guard','weapon',2,39,1,'{warrior}'),
('iron_mace_bear','weapon',1,4,1,'{warrior}'),
('iron_mace_guard','weapon',1,4,1,'{warrior}'),
('gravewarden_mace_bear','weapon',2,8,1,'{warrior}'),
('gravewarden_mace_guard','weapon',2,8,1,'{warrior}'),
('morningstar_bear','weapon',1,11,1,'{warrior}'),
('morningstar_guard','weapon',1,11,1,'{warrior}'),
('cryptwarden_star_bear','weapon',2,14,1,'{warrior}'),
('cryptwarden_star_guard','weapon',2,14,1,'{warrior}'),
('steppe_mace_bear','weapon',1,20,1,'{warrior}'),
('steppe_mace_guard','weapon',1,20,1,'{warrior}'),
('steppe_morningstar_bear','weapon',1,23,1,'{warrior}'),
('steppe_morningstar_guard','weapon',1,23,1,'{warrior}'),
('barrow_mace_bear','weapon',2,20,1,'{warrior}'),
('barrow_mace_guard','weapon',2,20,1,'{warrior}'),
('barrow_morningstar_bear','weapon',2,23,1,'{warrior}'),
('barrow_morningstar_guard','weapon',2,23,1,'{warrior}'),
('mirewarden_mace_bear','weapon',1,25,1,'{warrior}'),
('mirewarden_mace_guard','weapon',1,25,1,'{warrior}'),
('mirewarden_morningstar_bear','weapon',1,28,1,'{warrior}'),
('mirewarden_morningstar_guard','weapon',1,28,1,'{warrior}'),
('blightbane_mace_bear','weapon',2,25,1,'{warrior}'),
('blightbane_mace_guard','weapon',2,25,1,'{warrior}'),
('blightbane_morningstar_bear','weapon',2,28,1,'{warrior}'),
('blightbane_morningstar_guard','weapon',2,28,1,'{warrior}'),
('rimehunter_mace_bear','weapon',1,30,1,'{warrior}'),
('rimehunter_mace_guard','weapon',1,30,1,'{warrior}'),
('rimehunter_morningstar_bear','weapon',1,33,1,'{warrior}'),
('rimehunter_morningstar_guard','weapon',1,33,1,'{warrior}'),
('jarl_mace_bear','weapon',2,30,1,'{warrior}'),
('jarl_mace_guard','weapon',2,30,1,'{warrior}'),
('jarl_morningstar_bear','weapon',2,33,1,'{warrior}'),
('jarl_morningstar_guard','weapon',2,33,1,'{warrior}'),
('bastion_mace_bear','weapon',1,35,1,'{warrior}'),
('bastion_mace_guard','weapon',1,35,1,'{warrior}'),
('bastion_morningstar_bear','weapon',1,38,1,'{warrior}'),
('bastion_morningstar_guard','weapon',1,38,1,'{warrior}'),
('emberknight_mace_bear','weapon',2,35,1,'{warrior}'),
('emberknight_mace_guard','weapon',2,35,1,'{warrior}'),
('emberknight_morningstar_bear','weapon',2,38,1,'{warrior}'),
('emberknight_morningstar_guard','weapon',2,38,1,'{warrior}'),
('wolfsbane_dagger_fox','weapon',1,2,1,'{rogue,ranger}'),
('wolfsbane_dagger_hawk','weapon',1,2,1,'{rogue,ranger}'),
('tidebound_dagger_fox','weapon',1,10,1,'{rogue,ranger}'),
('tidebound_dagger_hawk','weapon',1,10,1,'{rogue,ranger}'),
('cinder_knife_fox','weapon',2,16,1,'{rogue,ranger}'),
('cinder_knife_hawk','weapon',2,16,1,'{rogue,ranger}'),
('desert_kris_fox','weapon',2,7,1,'{rogue,ranger}'),
('desert_kris_hawk','weapon',2,7,1,'{rogue,ranger}'),
('venomfang_fox','weapon',2,10,1,'{rogue,ranger}'),
('venomfang_hawk','weapon',2,10,1,'{rogue,ranger}'),
('steel_stiletto_fox','weapon',1,13,1,'{rogue,ranger}'),
('steel_stiletto_hawk','weapon',1,13,1,'{rogue,ranger}'),
('steppe_dagger_fox','weapon',1,21,1,'{rogue,ranger}'),
('steppe_dagger_hawk','weapon',1,21,1,'{rogue,ranger}'),
('steppe_stiletto_fox','weapon',1,24,1,'{rogue,ranger}'),
('steppe_stiletto_hawk','weapon',1,24,1,'{rogue,ranger}'),
('barrow_dagger_fox','weapon',2,21,1,'{rogue,ranger}'),
('barrow_dagger_hawk','weapon',2,21,1,'{rogue,ranger}'),
('barrow_stiletto_fox','weapon',2,24,1,'{rogue,ranger}'),
('barrow_stiletto_hawk','weapon',2,24,1,'{rogue,ranger}'),
('mirewarden_dagger_fox','weapon',1,26,1,'{rogue,ranger}'),
('mirewarden_dagger_hawk','weapon',1,26,1,'{rogue,ranger}'),
('mirewarden_stiletto_fox','weapon',1,29,1,'{rogue,ranger}'),
('mirewarden_stiletto_hawk','weapon',1,29,1,'{rogue,ranger}'),
('blightbane_dagger_fox','weapon',2,26,1,'{rogue,ranger}'),
('blightbane_dagger_hawk','weapon',2,26,1,'{rogue,ranger}'),
('blightbane_stiletto_fox','weapon',2,29,1,'{rogue,ranger}'),
('blightbane_stiletto_hawk','weapon',2,29,1,'{rogue,ranger}'),
('rimehunter_dagger_fox','weapon',1,31,1,'{rogue,ranger}'),
('rimehunter_dagger_hawk','weapon',1,31,1,'{rogue,ranger}'),
('rimehunter_stiletto_fox','weapon',1,34,1,'{rogue,ranger}'),
('rimehunter_stiletto_hawk','weapon',1,34,1,'{rogue,ranger}'),
('jarl_dagger_fox','weapon',2,31,1,'{rogue,ranger}'),
('jarl_dagger_hawk','weapon',2,31,1,'{rogue,ranger}'),
('jarl_stiletto_fox','weapon',2,34,1,'{rogue,ranger}'),
('jarl_stiletto_hawk','weapon',2,34,1,'{rogue,ranger}'),
('bastion_dagger_fox','weapon',1,36,1,'{rogue,ranger}'),
('bastion_dagger_hawk','weapon',1,36,1,'{rogue,ranger}'),
('bastion_stiletto_fox','weapon',1,39,1,'{rogue,ranger}'),
('bastion_stiletto_hawk','weapon',1,39,1,'{rogue,ranger}'),
('emberknight_dagger_fox','weapon',2,36,1,'{rogue,ranger}'),
('emberknight_dagger_hawk','weapon',2,36,1,'{rogue,ranger}'),
('emberknight_stiletto_fox','weapon',2,39,1,'{rogue,ranger}'),
('emberknight_stiletto_hawk','weapon',2,39,1,'{rogue,ranger}'),
('hunter_bow_hawk','weapon',1,3,1,'{ranger}'),
('hunter_bow_fox','weapon',1,3,1,'{ranger}'),
('longbow_hawk','weapon',1,6,1,'{ranger}'),
('longbow_fox','weapon',1,6,1,'{ranger}'),
('recurve_bow_hawk','weapon',2,8,1,'{ranger}'),
('recurve_bow_fox','weapon',2,8,1,'{ranger}'),
('cinder_bow_hawk','weapon',1,14,1,'{ranger}'),
('cinder_bow_fox','weapon',1,14,1,'{ranger}'),
('forge_longbow_hawk','weapon',2,18,1,'{ranger}'),
('forge_longbow_fox','weapon',2,18,1,'{ranger}'),
('bone_bow_hawk','weapon',2,12,1,'{ranger}'),
('bone_bow_fox','weapon',2,12,1,'{ranger}'),
('steppe_bow_hawk','weapon',1,20,1,'{ranger}'),
('steppe_bow_fox','weapon',1,20,1,'{ranger}'),
('steppe_longbow_hawk','weapon',1,23,1,'{ranger}'),
('steppe_longbow_fox','weapon',1,23,1,'{ranger}'),
('barrow_bow_hawk','weapon',2,20,1,'{ranger}'),
('barrow_bow_fox','weapon',2,20,1,'{ranger}'),
('barrow_longbow_hawk','weapon',2,23,1,'{ranger}'),
('barrow_longbow_fox','weapon',2,23,1,'{ranger}'),
('mirewarden_bow_hawk','weapon',1,25,1,'{ranger}'),
('mirewarden_bow_fox','weapon',1,25,1,'{ranger}'),
('mirewarden_longbow_hawk','weapon',1,28,1,'{ranger}'),
('mirewarden_longbow_fox','weapon',1,28,1,'{ranger}'),
('blightbane_bow_hawk','weapon',2,25,1,'{ranger}'),
('blightbane_bow_fox','weapon',2,25,1,'{ranger}'),
('blightbane_longbow_hawk','weapon',2,28,1,'{ranger}'),
('blightbane_longbow_fox','weapon',2,28,1,'{ranger}'),
('rimehunter_bow_hawk','weapon',1,30,1,'{ranger}'),
('rimehunter_bow_fox','weapon',1,30,1,'{ranger}'),
('rimehunter_longbow_hawk','weapon',1,33,1,'{ranger}'),
('rimehunter_longbow_fox','weapon',1,33,1,'{ranger}'),
('jarl_bow_hawk','weapon',2,30,1,'{ranger}'),
('jarl_bow_fox','weapon',2,30,1,'{ranger}'),
('jarl_longbow_hawk','weapon',2,33,1,'{ranger}'),
('jarl_longbow_fox','weapon',2,33,1,'{ranger}'),
('bastion_bow_hawk','weapon',1,35,1,'{ranger}'),
('bastion_bow_fox','weapon',1,35,1,'{ranger}'),
('bastion_longbow_hawk','weapon',1,38,1,'{ranger}'),
('bastion_longbow_fox','weapon',1,38,1,'{ranger}'),
('emberknight_bow_hawk','weapon',2,35,1,'{ranger}'),
('emberknight_bow_fox','weapon',2,35,1,'{ranger}'),
('emberknight_longbow_hawk','weapon',2,38,1,'{ranger}'),
('emberknight_longbow_fox','weapon',2,38,1,'{ranger}'),
('gnarled_staff_owl','weapon',1,3,1,'{mage}'),
('gnarled_staff_ember','weapon',1,3,1,'{mage}'),
('crystal_staff_owl','weapon',2,6,1,'{mage}'),
('crystal_staff_ember','weapon',2,6,1,'{mage}'),
('adept_staff_owl','weapon',1,9,1,'{mage}'),
('adept_staff_ember','weapon',1,9,1,'{mage}'),
('tide_staff_owl','weapon',2,10,1,'{mage}'),
('tide_staff_ember','weapon',2,10,1,'{mage}'),
('cinder_staff_owl','weapon',1,13,1,'{mage}'),
('cinder_staff_ember','weapon',1,13,1,'{mage}'),
('bone_staff_owl','weapon',2,11,1,'{mage}'),
('bone_staff_ember','weapon',2,11,1,'{mage}'),
('frostspire_staff_owl','weapon',2,14,1,'{mage}'),
('frostspire_staff_ember','weapon',2,14,1,'{mage}'),
('steppe_staff_owl','weapon',1,21,1,'{mage}'),
('steppe_staff_ember','weapon',1,21,1,'{mage}'),
('steppe_quarterstaff_owl','weapon',1,24,1,'{mage}'),
('steppe_quarterstaff_ember','weapon',1,24,1,'{mage}'),
('barrow_staff_owl','weapon',2,21,1,'{mage}'),
('barrow_staff_ember','weapon',2,21,1,'{mage}'),
('barrow_quarterstaff_owl','weapon',2,24,1,'{mage}'),
('barrow_quarterstaff_ember','weapon',2,24,1,'{mage}'),
('mirewarden_staff_owl','weapon',1,26,1,'{mage}'),
('mirewarden_staff_ember','weapon',1,26,1,'{mage}'),
('mirewarden_quarterstaff_owl','weapon',1,29,1,'{mage}'),
('mirewarden_quarterstaff_ember','weapon',1,29,1,'{mage}'),
('blightbane_staff_owl','weapon',2,26,1,'{mage}'),
('blightbane_staff_ember','weapon',2,26,1,'{mage}'),
('blightbane_quarterstaff_owl','weapon',2,29,1,'{mage}'),
('blightbane_quarterstaff_ember','weapon',2,29,1,'{mage}'),
('rimehunter_staff_owl','weapon',1,31,1,'{mage}'),
('rimehunter_staff_ember','weapon',1,31,1,'{mage}'),
('rimehunter_quarterstaff_owl','weapon',1,34,1,'{mage}'),
('rimehunter_quarterstaff_ember','weapon',1,34,1,'{mage}'),
('jarl_staff_owl','weapon',2,31,1,'{mage}'),
('jarl_staff_ember','weapon',2,31,1,'{mage}'),
('jarl_quarterstaff_owl','weapon',2,34,1,'{mage}'),
('jarl_quarterstaff_ember','weapon',2,34,1,'{mage}'),
('bastion_staff_owl','weapon',1,36,1,'{mage}'),
('bastion_staff_ember','weapon',1,36,1,'{mage}'),
('bastion_quarterstaff_owl','weapon',1,39,1,'{mage}'),
('bastion_quarterstaff_ember','weapon',1,39,1,'{mage}'),
('emberknight_staff_owl','weapon',2,36,1,'{mage}'),
('emberknight_staff_ember','weapon',2,36,1,'{mage}'),
('emberknight_quarterstaff_owl','weapon',2,39,1,'{mage}'),
('emberknight_quarterstaff_ember','weapon',2,39,1,'{mage}'),
('cinder_wand_owl','weapon',1,13,1,'{mage}'),
('cinder_wand_ember','weapon',1,13,1,'{mage}'),
('forge_wand_owl','weapon',2,18,1,'{mage}'),
('forge_wand_ember','weapon',2,18,1,'{mage}'),
('bone_wand_owl','weapon',1,5,1,'{mage}'),
('bone_wand_ember','weapon',1,5,1,'{mage}'),
('crystal_wand_owl','weapon',2,10,1,'{mage}'),
('crystal_wand_ember','weapon',2,10,1,'{mage}'),
('steppe_wand_owl','weapon',1,20,1,'{mage}'),
('steppe_wand_ember','weapon',1,20,1,'{mage}'),
('steppe_rod_owl','weapon',1,23,1,'{mage}'),
('steppe_rod_ember','weapon',1,23,1,'{mage}'),
('barrow_wand_owl','weapon',2,20,1,'{mage}'),
('barrow_wand_ember','weapon',2,20,1,'{mage}'),
('barrow_rod_owl','weapon',2,23,1,'{mage}'),
('barrow_rod_ember','weapon',2,23,1,'{mage}'),
('mirewarden_wand_owl','weapon',1,25,1,'{mage}'),
('mirewarden_wand_ember','weapon',1,25,1,'{mage}'),
('mirewarden_rod_owl','weapon',1,28,1,'{mage}'),
('mirewarden_rod_ember','weapon',1,28,1,'{mage}'),
('blightbane_wand_owl','weapon',2,25,1,'{mage}'),
('blightbane_wand_ember','weapon',2,25,1,'{mage}'),
('blightbane_rod_owl','weapon',2,28,1,'{mage}'),
('blightbane_rod_ember','weapon',2,28,1,'{mage}'),
('rimehunter_wand_owl','weapon',1,30,1,'{mage}'),
('rimehunter_wand_ember','weapon',1,30,1,'{mage}'),
('rimehunter_rod_owl','weapon',1,33,1,'{mage}'),
('rimehunter_rod_ember','weapon',1,33,1,'{mage}'),
('jarl_wand_owl','weapon',2,30,1,'{mage}'),
('jarl_wand_ember','weapon',2,30,1,'{mage}'),
('jarl_rod_owl','weapon',2,33,1,'{mage}'),
('jarl_rod_ember','weapon',2,33,1,'{mage}'),
('bastion_wand_owl','weapon',1,35,1,'{mage}'),
('bastion_wand_ember','weapon',1,35,1,'{mage}'),
('bastion_rod_owl','weapon',1,38,1,'{mage}'),
('bastion_rod_ember','weapon',1,38,1,'{mage}'),
('emberknight_wand_owl','weapon',2,35,1,'{mage}'),
('emberknight_wand_ember','weapon',2,35,1,'{mage}'),
('emberknight_rod_owl','weapon',2,38,1,'{mage}'),
('emberknight_rod_ember','weapon',2,38,1,'{mage}'),
('leather_jerkin_fox','armor',1,2,1,null),
('leather_jerkin_hawk','armor',1,2,1,null),
('mage_robe_owl','armor',1,5,1,null),
('mage_robe_ember','armor',1,5,1,null),
('ashguard_hauberk_bear','armor',2,5,1,null),
('ashguard_hauberk_hawk','armor',2,5,1,null),
('emberweave_robe_owl','armor',2,6,1,null),
('emberweave_robe_ember','armor',2,6,1,null),
('nightstalker_vest_fox','armor',2,6,1,null),
('nightstalker_vest_hawk','armor',2,6,1,null),
('scale_armor_bear','armor',1,6,1,null),
('scale_armor_hawk','armor',1,6,1,null),
('hunter_leather_fox','armor',1,7,1,null),
('hunter_leather_hawk','armor',1,7,1,null),
('iron_cuirass_bear','armor',2,9,1,null),
('iron_cuirass_guard','armor',2,9,1,null),
('circle_robe_owl','armor',2,10,1,null),
('circle_robe_ember','armor',2,10,1,null),
('shadow_leather_fox','armor',2,12,1,null),
('shadow_leather_hawk','armor',2,12,1,null),
('knight_plate_bear','armor',2,13,1,null),
('knight_plate_guard','armor',2,13,1,null),
('tidebound_robe_owl','armor',1,11,1,null),
('tidebound_robe_ember','armor',1,11,1,null),
('cinder_leather_fox','armor',1,14,1,null),
('cinder_leather_hawk','armor',1,14,1,null),
('cinder_mail_bear','armor',1,15,1,null),
('cinder_mail_hawk','armor',1,15,1,null),
('forge_plate_bear','armor',2,17,1,null),
('forge_plate_guard','armor',2,17,1,null),
('forge_robe_owl','armor',2,18,1,null),
('forge_robe_ember','armor',2,18,1,null),
('cinder_robe_owl','armor',1,17,1,null),
('cinder_robe_ember','armor',1,17,1,null),
('last_ember_robe_owl','armor',2,39,1,null),
('last_ember_robe_ember','armor',2,39,1,null),
('steppe_robe_owl','armor',1,23,1,null),
('steppe_robe_ember','armor',1,23,1,null),
('steppe_jerkin_fox','armor',1,21,1,null),
('steppe_jerkin_hawk','armor',1,21,1,null),
('steppe_hauberk_bear','armor',1,24,1,null),
('steppe_hauberk_hawk','armor',1,24,1,null),
('steppe_cuirass_bear','armor',1,22,1,null),
('steppe_cuirass_guard','armor',1,22,1,null),
('barrow_robe_owl','armor',2,20,1,null),
('barrow_robe_ember','armor',2,20,1,null),
('barrow_jerkin_fox','armor',2,23,1,null),
('barrow_jerkin_hawk','armor',2,23,1,null),
('barrow_hauberk_bear','armor',2,21,1,null),
('barrow_hauberk_hawk','armor',2,21,1,null),
('barrow_cuirass_bear','armor',2,24,1,null),
('barrow_cuirass_guard','armor',2,24,1,null),
('mirewarden_robe_owl','armor',1,28,1,null),
('mirewarden_robe_ember','armor',1,28,1,null),
('mirewarden_jerkin_fox','armor',1,26,1,null),
('mirewarden_jerkin_hawk','armor',1,26,1,null),
('mirewarden_hauberk_bear','armor',1,29,1,null),
('mirewarden_hauberk_hawk','armor',1,29,1,null),
('mirewarden_cuirass_bear','armor',1,27,1,null),
('mirewarden_cuirass_guard','armor',1,27,1,null),
('blightbane_robe_owl','armor',2,25,1,null),
('blightbane_robe_ember','armor',2,25,1,null),
('blightbane_jerkin_fox','armor',2,28,1,null),
('blightbane_jerkin_hawk','armor',2,28,1,null),
('blightbane_hauberk_bear','armor',2,26,1,null),
('blightbane_hauberk_hawk','armor',2,26,1,null),
('blightbane_cuirass_bear','armor',2,29,1,null),
('blightbane_cuirass_guard','armor',2,29,1,null),
('rimehunter_robe_owl','armor',1,33,1,null),
('rimehunter_robe_ember','armor',1,33,1,null),
('rimehunter_jerkin_fox','armor',1,31,1,null),
('rimehunter_jerkin_hawk','armor',1,31,1,null),
('rimehunter_hauberk_bear','armor',1,34,1,null),
('rimehunter_hauberk_hawk','armor',1,34,1,null),
('rimehunter_cuirass_bear','armor',1,32,1,null),
('rimehunter_cuirass_guard','armor',1,32,1,null),
('jarl_robe_owl','armor',2,30,1,null),
('jarl_robe_ember','armor',2,30,1,null),
('jarl_jerkin_fox','armor',2,33,1,null),
('jarl_jerkin_hawk','armor',2,33,1,null),
('jarl_hauberk_bear','armor',2,31,1,null),
('jarl_hauberk_hawk','armor',2,31,1,null),
('jarl_cuirass_bear','armor',2,34,1,null),
('jarl_cuirass_guard','armor',2,34,1,null),
('bastion_robe_owl','armor',1,38,1,null),
('bastion_robe_ember','armor',1,38,1,null),
('bastion_jerkin_fox','armor',1,36,1,null),
('bastion_jerkin_hawk','armor',1,36,1,null),
('bastion_hauberk_bear','armor',1,39,1,null),
('bastion_hauberk_hawk','armor',1,39,1,null),
('bastion_cuirass_bear','armor',1,37,1,null),
('bastion_cuirass_guard','armor',1,37,1,null),
('emberknight_robe_owl','armor',2,35,1,null),
('emberknight_robe_ember','armor',2,35,1,null),
('emberknight_jerkin_fox','armor',2,38,1,null),
('emberknight_jerkin_hawk','armor',2,38,1,null),
('emberknight_hauberk_bear','armor',2,36,1,null),
('emberknight_hauberk_hawk','armor',2,36,1,null),
('emberknight_cuirass_bear','armor',2,39,1,null),
('emberknight_cuirass_guard','armor',2,39,1,null),
('leather_cap_fox','armor',1,6,1,null),
('leather_cap_hawk','armor',1,6,1,null),
('wanderer_hood_owl','armor',1,4,1,null),
('wanderer_hood_ember','armor',1,4,1,null),
('iron_helm_bear','armor',1,6,1,null),
('iron_helm_guard','armor',1,6,1,null),
('cinder_helm_bear','armor',1,13,1,null),
('cinder_helm_hawk','armor',1,13,1,null),
('forge_helm_bear','armor',2,18,1,null),
('forge_helm_guard','armor',2,18,1,null),
('horned_helm_bear','armor',2,10,1,null),
('horned_helm_hawk','armor',2,10,1,null),
('warden_helm_bear','armor',1,9,1,null),
('warden_helm_hawk','armor',1,9,1,null),
('tidecaller_hood_owl','armor',1,10,1,null),
('tidecaller_hood_ember','armor',1,10,1,null),
('shadow_hood_fox','armor',2,14,1,null),
('shadow_hood_hawk','armor',2,14,1,null),
('stalker_cap_fox','armor',1,12,1,null),
('stalker_cap_hawk','armor',1,12,1,null),
('trackers_hood_fox','armor',2,8,1,null),
('trackers_hood_hawk','armor',2,8,1,null),
('runeweave_hood_owl','armor',2,8,1,null),
('runeweave_hood_ember','armor',2,8,1,null),
('ashsilk_cowl_owl','armor',2,14,1,null),
('ashsilk_cowl_ember','armor',2,14,1,null),
('cinder_cowl_owl','armor',1,17,1,null),
('cinder_cowl_ember','armor',1,17,1,null),
('steppe_hood_owl','armor',1,20,1,null),
('steppe_hood_ember','armor',1,20,1,null),
('steppe_cap_fox','armor',1,23,1,null),
('steppe_cap_hawk','armor',1,23,1,null),
('steppe_coif_bear','armor',1,21,1,null),
('steppe_coif_hawk','armor',1,21,1,null),
('steppe_helm_bear','armor',1,24,1,null),
('steppe_helm_guard','armor',1,24,1,null),
('barrow_hood_owl','armor',2,22,1,null),
('barrow_hood_ember','armor',2,22,1,null),
('barrow_cap_fox','armor',2,20,1,null),
('barrow_cap_hawk','armor',2,20,1,null),
('barrow_coif_bear','armor',2,23,1,null),
('barrow_coif_hawk','armor',2,23,1,null),
('barrow_helm_bear','armor',2,21,1,null),
('barrow_helm_guard','armor',2,21,1,null),
('mirewarden_hood_owl','armor',1,25,1,null),
('mirewarden_hood_ember','armor',1,25,1,null),
('mirewarden_cap_fox','armor',1,28,1,null),
('mirewarden_cap_hawk','armor',1,28,1,null),
('mirewarden_coif_bear','armor',1,26,1,null),
('mirewarden_coif_hawk','armor',1,26,1,null),
('mirewarden_helm_bear','armor',1,29,1,null),
('mirewarden_helm_guard','armor',1,29,1,null),
('blightbane_hood_owl','armor',2,27,1,null),
('blightbane_hood_ember','armor',2,27,1,null),
('blightbane_cap_fox','armor',2,25,1,null),
('blightbane_cap_hawk','armor',2,25,1,null),
('blightbane_coif_bear','armor',2,28,1,null),
('blightbane_coif_hawk','armor',2,28,1,null),
('blightbane_helm_bear','armor',2,26,1,null),
('blightbane_helm_guard','armor',2,26,1,null),
('rimehunter_hood_owl','armor',1,30,1,null),
('rimehunter_hood_ember','armor',1,30,1,null),
('rimehunter_cap_fox','armor',1,33,1,null),
('rimehunter_cap_hawk','armor',1,33,1,null),
('rimehunter_coif_bear','armor',1,31,1,null),
('rimehunter_coif_hawk','armor',1,31,1,null),
('rimehunter_helm_bear','armor',1,34,1,null),
('rimehunter_helm_guard','armor',1,34,1,null),
('jarl_hood_owl','armor',2,32,1,null),
('jarl_hood_ember','armor',2,32,1,null),
('jarl_cap_fox','armor',2,30,1,null),
('jarl_cap_hawk','armor',2,30,1,null),
('jarl_coif_bear','armor',2,33,1,null),
('jarl_coif_hawk','armor',2,33,1,null),
('jarl_helm_bear','armor',2,31,1,null),
('jarl_helm_guard','armor',2,31,1,null),
('bastion_hood_owl','armor',1,35,1,null),
('bastion_hood_ember','armor',1,35,1,null),
('bastion_cap_fox','armor',1,38,1,null),
('bastion_cap_hawk','armor',1,38,1,null),
('bastion_coif_bear','armor',1,36,1,null),
('bastion_coif_hawk','armor',1,36,1,null),
('bastion_helm_bear','armor',1,39,1,null),
('bastion_helm_guard','armor',1,39,1,null),
('emberknight_hood_owl','armor',2,37,1,null),
('emberknight_hood_ember','armor',2,37,1,null),
('emberknight_cap_fox','armor',2,35,1,null),
('emberknight_cap_hawk','armor',2,35,1,null),
('emberknight_coif_bear','armor',2,38,1,null),
('emberknight_coif_hawk','armor',2,38,1,null),
('emberknight_helm_bear','armor',2,36,1,null),
('emberknight_helm_guard','armor',2,36,1,null),
('leather_gloves_fox','armor',1,4,1,null),
('leather_gloves_hawk','armor',1,4,1,null),
('chain_gloves_bear','armor',1,5,1,null),
('chain_gloves_hawk','armor',1,5,1,null),
('cinder_gloves_bear','armor',1,15,1,null),
('cinder_gloves_hawk','armor',1,15,1,null),
('forge_gauntlets_bear','armor',2,18,1,null),
('forge_gauntlets_guard','armor',2,18,1,null),
('borderwatch_gauntlets_bear','armor',2,9,1,null),
('borderwatch_gauntlets_guard','armor',2,9,1,null),
('silk_gloves_owl','armor',1,13,1,null),
('silk_gloves_ember','armor',1,13,1,null),
('suede_grips_fox','armor',2,6,1,null),
('suede_grips_hawk','armor',2,6,1,null),
('linen_gloves_owl','armor',1,5,1,null),
('linen_gloves_ember','armor',1,5,1,null),
('shadow_grips_fox','armor',1,11,1,null),
('shadow_grips_hawk','armor',1,11,1,null),
('stalker_grips_fox','armor',2,14,1,null),
('stalker_grips_hawk','armor',2,14,1,null),
('rune_gloves_owl','armor',2,8,1,null),
('rune_gloves_ember','armor',2,8,1,null),
('embersilk_gloves_owl','armor',2,15,1,null),
('embersilk_gloves_ember','armor',2,15,1,null),
('cinder_wraps_owl','armor',1,17,1,null),
('cinder_wraps_ember','armor',1,17,1,null),
('steppe_gloves_owl','armor',1,22,1,null),
('steppe_gloves_ember','armor',1,22,1,null),
('steppe_grips_fox','armor',1,20,1,null),
('steppe_grips_hawk','armor',1,20,1,null),
('steppe_mitts_bear','armor',1,23,1,null),
('steppe_mitts_hawk','armor',1,23,1,null),
('steppe_gauntlets_bear','armor',1,21,1,null),
('steppe_gauntlets_guard','armor',1,21,1,null),
('barrow_gloves_owl','armor',2,24,1,null),
('barrow_gloves_ember','armor',2,24,1,null),
('barrow_grips_fox','armor',2,22,1,null),
('barrow_grips_hawk','armor',2,22,1,null),
('barrow_mitts_bear','armor',2,20,1,null),
('barrow_mitts_hawk','armor',2,20,1,null),
('barrow_gauntlets_bear','armor',2,23,1,null),
('barrow_gauntlets_guard','armor',2,23,1,null),
('mirewarden_gloves_owl','armor',1,27,1,null),
('mirewarden_gloves_ember','armor',1,27,1,null),
('mirewarden_grips_fox','armor',1,25,1,null),
('mirewarden_grips_hawk','armor',1,25,1,null),
('mirewarden_mitts_bear','armor',1,28,1,null),
('mirewarden_mitts_hawk','armor',1,28,1,null),
('mirewarden_gauntlets_bear','armor',1,26,1,null),
('mirewarden_gauntlets_guard','armor',1,26,1,null),
('blightbane_gloves_owl','armor',2,29,1,null),
('blightbane_gloves_ember','armor',2,29,1,null),
('blightbane_grips_fox','armor',2,27,1,null),
('blightbane_grips_hawk','armor',2,27,1,null),
('blightbane_mitts_bear','armor',2,25,1,null),
('blightbane_mitts_hawk','armor',2,25,1,null),
('blightbane_gauntlets_bear','armor',2,28,1,null),
('blightbane_gauntlets_guard','armor',2,28,1,null),
('rimehunter_gloves_owl','armor',1,32,1,null),
('rimehunter_gloves_ember','armor',1,32,1,null),
('rimehunter_grips_fox','armor',1,30,1,null),
('rimehunter_grips_hawk','armor',1,30,1,null),
('rimehunter_mitts_bear','armor',1,33,1,null),
('rimehunter_mitts_hawk','armor',1,33,1,null),
('rimehunter_gauntlets_bear','armor',1,31,1,null),
('rimehunter_gauntlets_guard','armor',1,31,1,null),
('jarl_gloves_owl','armor',2,34,1,null),
('jarl_gloves_ember','armor',2,34,1,null),
('jarl_grips_fox','armor',2,32,1,null),
('jarl_grips_hawk','armor',2,32,1,null),
('jarl_mitts_bear','armor',2,30,1,null),
('jarl_mitts_hawk','armor',2,30,1,null),
('jarl_gauntlets_bear','armor',2,33,1,null),
('jarl_gauntlets_guard','armor',2,33,1,null),
('bastion_gloves_owl','armor',1,37,1,null),
('bastion_gloves_ember','armor',1,37,1,null),
('bastion_grips_fox','armor',1,35,1,null),
('bastion_grips_hawk','armor',1,35,1,null),
('bastion_mitts_bear','armor',1,38,1,null),
('bastion_mitts_hawk','armor',1,38,1,null),
('bastion_gauntlets_bear','armor',1,36,1,null),
('bastion_gauntlets_guard','armor',1,36,1,null),
('emberknight_gloves_owl','armor',2,39,1,null),
('emberknight_gloves_ember','armor',2,39,1,null),
('emberknight_grips_fox','armor',2,37,1,null),
('emberknight_grips_hawk','armor',2,37,1,null),
('emberknight_mitts_bear','armor',2,35,1,null),
('emberknight_mitts_hawk','armor',2,35,1,null),
('emberknight_gauntlets_bear','armor',2,38,1,null),
('emberknight_gauntlets_guard','armor',2,38,1,null),
('traveler_boots_fox','armor',1,4,1,null),
('traveler_boots_hawk','armor',1,4,1,null),
('ironshod_boots_bear','armor',2,8,1,null),
('ironshod_boots_guard','armor',2,8,1,null),
('cinder_boots_bear','armor',1,14,1,null),
('cinder_boots_hawk','armor',1,14,1,null),
('forge_greaves_bear','armor',2,18,1,null),
('forge_greaves_guard','armor',2,18,1,null),
('ranger_boots_fox','armor',1,12,1,null),
('ranger_boots_hawk','armor',1,12,1,null),
('chain_greaves_bear','armor',1,4,1,null),
('chain_greaves_hawk','armor',1,4,1,null),
('linen_shoes_owl','armor',1,4,1,null),
('linen_shoes_ember','armor',1,4,1,null),
('temple_sandals_owl','armor',1,10,1,null),
('temple_sandals_ember','armor',1,10,1,null),
('silk_slippers_owl','armor',1,16,1,null),
('silk_slippers_ember','armor',1,16,1,null),
('hunters_boots_fox','armor',2,7,1,null),
('hunters_boots_hawk','armor',2,7,1,null),
('rune_slippers_owl','armor',2,8,1,null),
('rune_slippers_ember','armor',2,8,1,null),
('nightstalker_boots_fox','armor',2,14,1,null),
('nightstalker_boots_hawk','armor',2,14,1,null),
('ashsilk_slippers_owl','armor',2,14,1,null),
('ashsilk_slippers_ember','armor',2,14,1,null),
('drifter_sandals_owl','armor',1,20,1,null),
('drifter_sandals_ember','armor',1,20,1,null),
('steppe_slippers_owl','armor',1,24,1,null),
('steppe_slippers_ember','armor',1,24,1,null),
('steppe_boots_fox','armor',1,22,1,null),
('steppe_boots_hawk','armor',1,22,1,null),
('steppe_greaves_bear','armor',1,20,1,null),
('steppe_greaves_hawk','armor',1,20,1,null),
('steppe_sabatons_bear','armor',1,23,1,null),
('steppe_sabatons_guard','armor',1,23,1,null),
('barrow_slippers_owl','armor',2,21,1,null),
('barrow_slippers_ember','armor',2,21,1,null),
('barrow_boots_fox','armor',2,24,1,null),
('barrow_boots_hawk','armor',2,24,1,null),
('barrow_greaves_bear','armor',2,22,1,null),
('barrow_greaves_hawk','armor',2,22,1,null),
('barrow_sabatons_bear','armor',2,20,1,null),
('barrow_sabatons_guard','armor',2,20,1,null),
('mirewarden_slippers_owl','armor',1,29,1,null),
('mirewarden_slippers_ember','armor',1,29,1,null),
('mirewarden_boots_fox','armor',1,27,1,null),
('mirewarden_boots_hawk','armor',1,27,1,null),
('mirewarden_greaves_bear','armor',1,25,1,null),
('mirewarden_greaves_hawk','armor',1,25,1,null),
('mirewarden_sabatons_bear','armor',1,28,1,null),
('mirewarden_sabatons_guard','armor',1,28,1,null),
('blightbane_slippers_owl','armor',2,26,1,null),
('blightbane_slippers_ember','armor',2,26,1,null),
('blightbane_boots_fox','armor',2,29,1,null),
('blightbane_boots_hawk','armor',2,29,1,null),
('blightbane_greaves_bear','armor',2,27,1,null),
('blightbane_greaves_hawk','armor',2,27,1,null),
('blightbane_sabatons_bear','armor',2,25,1,null),
('blightbane_sabatons_guard','armor',2,25,1,null),
('rimehunter_slippers_owl','armor',1,34,1,null),
('rimehunter_slippers_ember','armor',1,34,1,null),
('rimehunter_boots_fox','armor',1,32,1,null),
('rimehunter_boots_hawk','armor',1,32,1,null),
('rimehunter_greaves_bear','armor',1,30,1,null),
('rimehunter_greaves_hawk','armor',1,30,1,null),
('rimehunter_sabatons_bear','armor',1,33,1,null),
('rimehunter_sabatons_guard','armor',1,33,1,null),
('jarl_slippers_owl','armor',2,31,1,null),
('jarl_slippers_ember','armor',2,31,1,null),
('jarl_boots_fox','armor',2,34,1,null),
('jarl_boots_hawk','armor',2,34,1,null),
('jarl_greaves_bear','armor',2,32,1,null),
('jarl_greaves_hawk','armor',2,32,1,null),
('jarl_sabatons_bear','armor',2,30,1,null),
('jarl_sabatons_guard','armor',2,30,1,null),
('bastion_slippers_owl','armor',1,39,1,null),
('bastion_slippers_ember','armor',1,39,1,null),
('bastion_boots_fox','armor',1,37,1,null),
('bastion_boots_hawk','armor',1,37,1,null),
('bastion_greaves_bear','armor',1,35,1,null),
('bastion_greaves_hawk','armor',1,35,1,null),
('bastion_sabatons_bear','armor',1,38,1,null),
('bastion_sabatons_guard','armor',1,38,1,null),
('emberknight_slippers_owl','armor',2,36,1,null),
('emberknight_slippers_ember','armor',2,36,1,null),
('emberknight_boots_fox','armor',2,39,1,null),
('emberknight_boots_hawk','armor',2,39,1,null),
('emberknight_greaves_bear','armor',2,37,1,null),
('emberknight_greaves_hawk','armor',2,37,1,null),
('emberknight_sabatons_bear','armor',2,35,1,null),
('emberknight_sabatons_guard','armor',2,35,1,null),
('minor_potion','consumable',0,1,100,null),
('healing_potion','consumable',0,1,100,null),
('greater_potion','consumable',1,1,100,null),
('minor_mana','consumable',0,1,100,null),
('mana_potion','consumable',0,1,100,null),
('ember_elixir','consumable',2,1,20,null),
('hearth_bread','consumable',0,1,100,null),
('wolf_pelt','material',0,1,50,null),
('wolf_fang','material',0,1,50,null),
('bone_dust','material',0,1,50,null),
('linen','material',0,1,50,null),
('grave_iron','material',1,1,50,null),
('ember_ore','material',1,1,50,null),
('shadow_essence','material',1,1,50,null),
('ruby','material',1,1,50,null),
('sapphire','material',1,1,50,null),
('amethyst','material',2,1,50,null),
('thorn_sap','material',0,1,50,null),
('temple_relic','material',1,1,50,null),
('obsidian_shard','material',1,1,50,null),
('cultist_tome','material',1,1,50,null),
('ember_core','material',2,1,50,null),
('ember_shard','material',3,1,999,null),
('superior_potion','consumable',1,1,100,null),
('supreme_potion','consumable',1,1,100,null),
('greater_mana','consumable',1,1,100,null),
('supreme_mana','consumable',1,1,100,null),
('steppe_jerky','consumable',0,1,100,null),
('hyena_hide','material',0,1,50,null),
('vulture_feather','material',0,1,50,null),
('raider_arrowhead','material',0,1,50,null),
('barrow_bone','material',0,1,50,null),
('leech_ichor','material',0,1,50,null),
('toad_gland','material',0,1,50,null),
('spore_cap','material',0,1,50,null),
('bog_iron','material',1,1,50,null),
('frost_pelt','material',0,1,50,null),
('troll_fat','material',0,1,50,null),
('crystal_silk','material',1,1,50,null),
('rime_crystal','material',1,1,50,null),
('magma_scale','material',1,1,50,null),
('adept_sigil','material',0,1,50,null),
('pilgrim_relic','material',0,1,50,null),
('mount_steppe_horse','mount',2,20,1,null),
('mount_ash_wolf','mount',2,20,1,null),
('mount_marsh_strider','mount',2,20,1,null),
('mount_bone_stallion','mount',3,20,1,null),
('mount_spore_beetle','mount',3,20,1,null),
('mount_frost_elk','mount',3,20,1,null),
('mount_ember_charger','mount',3,40,1,null);
-- Sicherheitsnetz: Shop-Designs nie handelbar, auch wenn der Katalog einmal einen Gegenstand dafür bekäme.
do $$
begin
  if to_regclass('public.shop_exclusive_items') is not null then
    delete from public.market_items where id in (select 'mount_' || substr(key, 7) from public.shop_exclusive_items where key like 'mount:%');
  end if;
end $$;

-- ------------------------------------------------------------------ Spielstand lesen und ändern (nur intern)
create or replace function public.market_snap_count(p_snap jsonb, p_item text, p_mat boolean) returns int
language plpgsql immutable set search_path = '' as $$
declare n numeric := 0; e jsonb;
begin
  if p_mat then
    return coalesce(floor((p_snap #>> array['slices', 'inventory', 'mats', p_item])::numeric), 0)::int;
  end if;
  if jsonb_typeof(p_snap #> '{slices,inventory,slots}') is distinct from 'array' then return 0; end if;
  for e in select x from jsonb_array_elements(p_snap #> '{slices,inventory,slots}') x loop
    if jsonb_typeof(e) = 'object' and e ->> 'itemId' = p_item then n := n + greatest(0, floor((e ->> 'qty')::numeric)); end if;
  end loop;
  return n::int;
end $$;

-- Nimmt qty Stück heraus (Tasche von hinten wie im Spiel, Materialien aus dem Materialbeutel). null = nicht genug.
create or replace function public.market_snap_take(p_snap jsonb, p_item text, p_qty int, p_mat boolean) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare slots jsonb; e jsonb; i int; k int; q int; left_ int := p_qty; have int;
begin
  if p_qty < 1 then return null; end if;
  if p_mat then
    have := public.market_snap_count(p_snap, p_item, true);
    if have < p_qty then return null; end if;
    if have = p_qty then return p_snap #- array['slices', 'inventory', 'mats', p_item]; end if;
    return jsonb_set(p_snap, array['slices', 'inventory', 'mats', p_item], to_jsonb(have - p_qty));
  end if;
  slots := p_snap #> '{slices,inventory,slots}';
  if jsonb_typeof(slots) is distinct from 'array' then return null; end if;
  for i in reverse jsonb_array_length(slots) - 1 .. 0 loop
    exit when left_ <= 0;
    e := slots -> i;
    if jsonb_typeof(e) = 'object' and e ->> 'itemId' = p_item then
      q := greatest(0, floor((e ->> 'qty')::numeric))::int;
      k := least(left_, q);
      left_ := left_ - k;
      slots := jsonb_set(slots, array[i::text], case when q - k <= 0 then 'null'::jsonb else jsonb_set(e, '{qty}', to_jsonb(q - k)) end);
    end if;
  end loop;
  if left_ > 0 then return null; end if;
  return jsonb_set(p_snap, '{slices,inventory,slots}', slots);
end $$;

-- Legt qty Stück hinein (erst auf passende Stapel, dann freie Plätze). null = kein Platz.
create or replace function public.market_snap_give(p_snap jsonb, p_item text, p_qty int, p_stack int, p_mat boolean) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare slots jsonb; e jsonb; i int; k int; q int; left_ int := p_qty; have int;
begin
  if p_mat then
    have := public.market_snap_count(p_snap, p_item, true);
    if have + p_qty > 9999 then return null; end if;
    if jsonb_typeof(p_snap #> '{slices,inventory,mats}') is distinct from 'object' then
      p_snap := jsonb_set(p_snap, '{slices,inventory,mats}', '{}'::jsonb);
    end if;
    return jsonb_set(p_snap, array['slices', 'inventory', 'mats', p_item], to_jsonb(have + p_qty));
  end if;
  slots := p_snap #> '{slices,inventory,slots}';
  if jsonb_typeof(slots) is distinct from 'array' then return null; end if;
  for i in 0 .. jsonb_array_length(slots) - 1 loop
    exit when left_ <= 0;
    e := slots -> i;
    if jsonb_typeof(e) = 'object' and e ->> 'itemId' = p_item then
      q := greatest(0, floor((e ->> 'qty')::numeric))::int;
      k := least(left_, p_stack - q);
      if k > 0 then slots := jsonb_set(slots, array[i::text], jsonb_set(e, '{qty}', to_jsonb(q + k))); left_ := left_ - k; end if;
    end if;
  end loop;
  for i in 0 .. jsonb_array_length(slots) - 1 loop
    exit when left_ <= 0;
    if jsonb_typeof(slots -> i) = 'null' then
      k := least(left_, p_stack);
      slots := jsonb_set(slots, array[i::text], jsonb_build_object('itemId', p_item, 'qty', k, 'n', true));
      left_ := left_ - k;
    end if;
  end loop;
  if left_ > 0 then return null; end if;
  return jsonb_set(p_snap, '{slices,inventory,slots}', slots);
end $$;

create or replace function public.market_snap_gold(p_snap jsonb) returns bigint
language sql immutable set search_path = '' as $$
  select coalesce(floor((p_snap #>> '{slices,wallet,gold}')::numeric), 0)::bigint;
$$;

create or replace function public.market_snap_set_gold(p_snap jsonb, p_gold bigint) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_set(case when jsonb_typeof(p_snap #> '{slices,wallet}') = 'object' then p_snap
                        else jsonb_set(p_snap, '{slices,wallet}', '{}'::jsonb) end,
                   '{slices,wallet,gold}', to_jsonb(p_gold));
$$;

-- Gelerntes Reittier vergessen (null = nicht im Besitz). Aktiv war es: nächstes nehmen, absitzen.
create or replace function public.market_snap_forget_mount(p_snap jsonb, p_mount text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare m jsonb; owned jsonb;
begin
  m := p_snap #> '{slices,character,mounts}';
  if jsonb_typeof(m) is distinct from 'object' or jsonb_typeof(m -> 'owned') is distinct from 'array'
     or not (m -> 'owned') ? p_mount then return null; end if;
  select coalesce(jsonb_agg(x), '[]'::jsonb) into owned from jsonb_array_elements(m -> 'owned') x where x <> to_jsonb(p_mount);
  m := jsonb_set(m, '{owned}', owned);
  if m ->> 'active' = p_mount or jsonb_typeof(m -> 'active') is distinct from 'string' then
    m := jsonb_set(m, '{active}', coalesce(owned -> 0, 'null'::jsonb));
    m := jsonb_set(m, '{riding}', 'false'::jsonb);
  end if;
  return jsonb_set(p_snap, '{slices,character,mounts}', m);
end $$;

-- Reittier (wieder) lernen. null = schon bekannt oder kein Reittier-Bereich im Spielstand.
create or replace function public.market_snap_learn_mount(p_snap jsonb, p_mount text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare m jsonb;
begin
  m := p_snap #> '{slices,character,mounts}';
  if jsonb_typeof(m) is distinct from 'object' then return null; end if;
  if jsonb_typeof(m -> 'owned') is distinct from 'array' then m := jsonb_set(m, '{owned}', '[]'::jsonb); end if;
  if (m -> 'owned') ? p_mount then return null; end if;
  m := jsonb_set(m, '{owned}', (m -> 'owned') || to_jsonb(p_mount));
  if jsonb_typeof(m -> 'active') is distinct from 'string' then m := jsonb_set(m, '{active}', to_jsonb(p_mount)); end if;
  return jsonb_set(p_snap, '{slices,character,mounts}', m);
end $$;

-- Buchung abschließen: Zähler (nur hier) hoch, Spielstand mit Serverzeit schreiben, Goldbilanz führen.
create or replace function public.market_commit(p_user uuid, p_char text, p_snap jsonb, p_gold bigint) returns jsonb
language plpgsql set search_path = '' as $$
declare
  s   bigint;
  ms  bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  insert into public.market_chars as m (user_id, character_id, seq, net) values (p_user, p_char, 1, p_gold)
    on conflict (user_id, character_id) do update set seq = m.seq + 1, net = m.net + p_gold
    returning m.seq into s;
  insert into public.market_accounts as a (user_id, net) values (p_user, p_gold)
    on conflict (user_id) do update set net = a.net + p_gold;
  p_snap := jsonb_set(p_snap, '{slices,market}', jsonb_build_object('seq', s));
  p_snap := jsonb_set(p_snap, '{meta,savedAt}', to_jsonb(ms));
  -- Markierung für characters_market_check: updated_at bleibt (sonst ginge geprüfte Spielzeit verloren).
  perform set_config('emberwrath.market', '1', true);
  update public.characters set snapshot = p_snap, saved_at = timestamptz 'epoch' + ms * interval '1 millisecond'
    where user_id = p_user and id = p_char;
  perform set_config('emberwrath.market', '', true);
  return jsonb_build_object('ok', true, 'seq', s, 'savedAt', ms, 'gold', p_gold);
end $$;

-- Anmeldung, Schummel-Vermerk, Tempo (40 Aktionen je Minute, 60 neue Angebote je Stunde). Liefert Fehlercode oder null.
create or replace function public.market_guard(p_user uuid, p_kind text) returns text
language plpgsql set search_path = '' as $$
declare r public.market_rate; mi timestamptz := date_trunc('minute', now()); hr timestamptz := date_trunc('hour', now());
begin
  if p_user is null then return 'auth'; end if;
  if to_regclass('public.character_flags') is not null and exists (select 1 from public.character_flags f
       where f.user_id = p_user and f.reason in ('stufe', 'gold', 'grenze') and f.created_at > now() - interval '7 days') then
    return 'blocked';
  end if;
  insert into public.market_rate as m (user_id, minute, n, hour, listed)
    values (p_user, mi, 1, hr, case when p_kind = 'list' then 1 else 0 end)
  on conflict (user_id) do update set
    n = case when m.minute = mi then m.n + 1 else 1 end, minute = mi,
    listed = case when m.hour = hr then m.listed else 0 end + case when p_kind = 'list' then 1 else 0 end, hour = hr
  returning * into r;
  if r.n > 40 or (p_kind = 'list' and r.listed > 60) then return 'rate'; end if;
  return null;
end $$;

create or replace function public.market_fee(p_price bigint) returns bigint
language sql immutable set search_path = '' as $$ select floor(p_price * 0.05)::bigint; $$;

-- Shop-Gold dieses Charakters wie characters_shop_gold (20261010090000_sicherheit_2.sql), für die market_*-Funktionen.
create or replace function public.market_shop_gold(p_user uuid, p_character text) returns bigint
language plpgsql stable set search_path = '' as $$
declare g numeric := 0;
begin
  if to_regclass('public.gold_orders') is null then return 0; end if;
  execute 'select coalesce(sum(case when status in (''paid'', ''credited'') then gold else -gold end), 0)
             from public.gold_orders where user_id = $1 and character_id = $2
              and (status in (''paid'', ''credited'')
                   or (status in (''refunded'', ''disputed'') and (delivered_at is not null or credited_at is not null)))'
    into g using p_user, p_character;
  return greatest(0, floor(g))::bigint;
end $$;

-- Goldrahmen für den Handel: geprüfte Spielzeit + Shop-Gold (ohne Freibetrag neuer Charaktere).
create or replace function public.market_gold_frame(c public.characters) returns bigint
language sql stable set search_path = '' as $$
  select floor(150 * greatest(0, coalesce(c.play_verified, 0)))::bigint + public.market_shop_gold(c.user_id, c.id);
$$;

-- Darf dieser Charakter handeln? null = ja, sonst Fehlercode.
create or replace function public.market_eligible(c public.characters) returns text
language plpgsql stable set search_path = '' as $$
declare lvl int;
begin
  begin lvl := coalesce(floor((c.snapshot #>> '{slices,progress,level}')::numeric), 1)::int;
  exception when others then lvl := 0; end;
  if lvl < 10 or coalesce(c.play_verified, 0) < 3600 then return 'young'; end if;
  return null;
end $$;

-- Konto für den Handel anlegen und sperren (gleichzeitige Käufe verschiedener Charaktere laufen nacheinander).
create or replace function public.market_account(p_user uuid) returns public.market_accounts
language plpgsql set search_path = '' as $$
declare a public.market_accounts;
begin
  insert into public.market_accounts (user_id) values (p_user) on conflict do nothing;
  select * into a from public.market_accounts where user_id = p_user for update;
  return a;
end $$;

-- Handelszeit des Kontos in Sekunden: geprüfte Spielzeit aller Charaktere, höchstens 14400 je Tag seit Beginn.
create or replace function public.market_trade_time(a public.market_accounts) returns bigint
language sql stable set search_path = '' as $$
  select least(coalesce((select sum(greatest(0, coalesce(c.play_verified, 0))) from public.characters c where c.user_id = a.user_id), 0),
               14400::numeric * (greatest(0, current_date - a.started) + 2))::bigint;
$$;

-- Goldrahmen des Kontos: Handelszeit + Shop-Gold aller Charaktere (ohne Freibetrag neuer Charaktere).
create or replace function public.market_account_frame(a public.market_accounts) returns bigint
language sql stable set search_path = '' as $$
  select 150 * public.market_trade_time(a)
    + coalesce((select sum(public.market_shop_gold(c.user_id, c.id)) from public.characters c where c.user_id = a.user_id), 0)::bigint;
$$;

-- Darf das Konto noch need Gold ausgeben? Ausgaben minus Einnahmen (net, auch negativ) bleiben im Rahmen.
create or replace function public.market_can_spend(p_user uuid, p_need bigint) returns boolean
language plpgsql set search_path = '' as $$
declare a public.market_accounts := public.market_account(p_user);
begin
  return p_need <= public.market_account_frame(a) + a.net;
end $$;

create or replace function public.market_own_add(p_user uuid, p_char text, p_item text, p_qty int) returns void
language sql set search_path = '' as $$
  insert into public.market_owned as o (user_id, character_id, item_id, qty) values (p_user, p_char, p_item, greatest(0, p_qty))
    on conflict (user_id, character_id, item_id) do update set qty = least(1000000, o.qty + greatest(0, p_qty));
$$;

-- Abgelaufene Angebote abschließen: Höchstbietende gewinnen, Verkäufer bekommen den Erlös (minus Gebühr),
-- ohne Gebot geht der Gegenstand zurück. Alles landet im Abholfach. p_user: zuerst die Angebote dieses Kontos.
create or replace function public.market_settle(p_limit int default 50, p_user uuid default null) returns int
language plpgsql set search_path = '' as $$
declare l public.market_listings; n int := 0;
begin
  for l in select * from public.market_listings
      where status = 'active' and ends_at <= now() and (p_user is null or seller_user = p_user or bidder_user = p_user)
      order by ends_at limit p_limit for update skip locked loop
    if l.bid is not null then
      update public.market_listings set status = 'sold', price = l.bid, closed_at = now() where id = l.id;
      if l.bidder_user is not null then
        insert into public.market_mail (user_id, character_id, kind, item_id, qty, listing_id)
          values (l.bidder_user, l.bidder_char, 'won', l.item_id, l.qty, l.id);
      end if;
      if l.seller_user is not null then
        insert into public.market_mail (user_id, character_id, kind, gold, listing_id)
          values (l.seller_user, l.seller_char, 'sold', l.bid - public.market_fee(l.bid), l.id);
      end if;
    else
      update public.market_listings set status = 'expired', closed_at = now() where id = l.id;
      if l.seller_user is not null then
        insert into public.market_mail (user_id, character_id, kind, item_id, qty, learned, listing_id)
          values (l.seller_user, l.seller_char, 'expired', l.item_id, l.qty, l.learned, l.id);
      end if;
    end if;
    n := n + 1;
  end loop;
  -- Aufräumen (selten): abgeholte Post und abgeschlossene Angebote nach 30 Tagen.
  if p_user is null and random() < 0.05 then
    delete from public.market_mail where collected_at < now() - interval '30 days';
    delete from public.market_listings where status <> 'active' and closed_at < now() - interval '30 days';
  end if;
  return n;
end $$;

create or replace function public.market_err(p_code text) returns jsonb
language sql immutable set search_path = '' as $$ select jsonb_build_object('ok', false, 'error', p_code); $$;

-- Gegenstand in den Spielstand oder, wenn kein Platz ist, ins Abholfach. -> { snap, add|learn|mailed }
create or replace function public.market_deliver(p_user uuid, p_char text, p_snap jsonb, p_item text, p_qty int, p_learned boolean,
  p_kind text, p_listing bigint) returns jsonb
language plpgsql set search_path = '' as $$
declare it public.market_items; s jsonb;
begin
  select * into it from public.market_items where id = p_item;
  if p_learned and p_item like 'mount\_%' then
    s := public.market_snap_learn_mount(p_snap, substr(p_item, 7));
    if s is not null then
      perform public.market_own_add(p_user, p_char, p_item, 1);
      return jsonb_build_object('snap', s, 'learn', substr(p_item, 7));
    end if;
  end if;
  if it.id is not null then
    s := public.market_snap_give(p_snap, p_item, p_qty, it.stack, it.category = 'material');
    if s is not null then
      perform public.market_own_add(p_user, p_char, p_item, p_qty);
      return jsonb_build_object('snap', s, 'add', jsonb_build_object('itemId', p_item, 'qty', p_qty));
    end if;
  end if;
  insert into public.market_mail (user_id, character_id, kind, item_id, qty, learned, listing_id)
    values (p_user, p_char, p_kind, p_item, p_qty, p_learned, p_listing);
  return jsonb_build_object('snap', p_snap, 'mailed', true);
end $$;

-- ------------------------------------------------------------------ Für das Spiel
-- Einstellen: aus der Tasche (oder ein gelerntes Reittier, p_mount) mit Startgebot und/oder Sofortkaufpreis.
create or replace function public.market_list(p_character text, p_item text, p_qty int, p_start_bid bigint, p_buyout bigint,
  p_hours int, p_mount boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e text; c public.characters; it public.market_items; snap jsonb; lid bigint; r jsonb;
  acc public.market_accounts; own int; use_ int; cost int; lvl int;
begin
  e := public.market_guard(uid, 'list');
  if e is not null then return public.market_err(e); end if;
  select * into c from public.characters where user_id = uid and id = p_character for update;
  if not found then return public.market_err('character'); end if;
  e := public.market_eligible(c);
  if e is not null then return public.market_err(e); end if;
  select * into it from public.market_items where id = p_item;
  if not found then return public.market_err('item'); end if;
  if p_hours is null or not (p_hours = any (array[12, 24, 48])) then return public.market_err('hours'); end if;
  if p_start_bid is null and p_buyout is null then return public.market_err('price'); end if;
  if coalesce(p_start_bid, 1) not between 1 and 10000000 or coalesce(p_buyout, 1) not between 1 and 10000000
     or (p_start_bid is not null and p_buyout is not null and p_buyout < p_start_bid) then return public.market_err('price'); end if;
  if p_qty is null or p_qty < 1 or p_qty > it.stack or (p_mount and (p_qty <> 1 or it.category <> 'mount')) then
    return public.market_err('qty');
  end if;
  if (select count(*) from public.market_listings l where l.seller_user = uid and l.status = 'active') >= 30 then
    return public.market_err('limit');
  end if;
  if p_mount then snap := public.market_snap_forget_mount(c.snapshot, substr(p_item, 7));
  else snap := public.market_snap_take(c.snapshot, p_item, p_qty, it.category = 'material'); end if;
  if snap is null then return public.market_err('missing'); end if;
  -- Herkunft: zuerst Bestand aus dem Auktionshaus, sonst eigene Beute (Stufe passt, Kontingent reicht).
  acc := public.market_account(uid);
  own := coalesce((select o.qty from public.market_owned o where o.user_id = uid and o.character_id = p_character
    and o.item_id = p_item for update), 0);
  use_ := least(own, p_qty);
  if use_ < p_qty then
    lvl := coalesce(floor((c.snapshot #>> '{slices,progress,level}')::numeric), 1)::int;
    if it.req_level > lvl + 5 then return public.market_err('level'); end if;
    -- Kontingent nach Seltenheit und Menge (Stapel ab selten je angefangene 5 Stück, darunter je angefangene 10)
    cost := (array[1, 1, 3, 10, 25])[it.rarity + 1] * greatest(1, ceil((p_qty - use_)::numeric / case when it.rarity >= 2 then 5 else 10 end))::int;
    if acc.fresh + cost > 20 + 40 * floor(public.market_trade_time(acc) / 3600) then
      return public.market_err('budget');
    end if;
    update public.market_accounts set fresh = fresh + cost where user_id = uid;
  end if;
  if use_ > 0 then
    update public.market_owned set qty = qty - use_ where user_id = uid and character_id = p_character and item_id = p_item;
  end if;
  insert into public.market_listings (seller_user, seller_char, item_id, qty, learned, category, rarity, req_level, classes,
      start_bid, buyout, ends_at)
    values (uid, p_character, p_item, p_qty, p_mount, it.category, it.rarity, it.req_level, it.classes,
      p_start_bid, p_buyout, now() + p_hours * interval '1 hour')
    returning id into lid;
  r := public.market_commit(uid, p_character, snap, 0);
  return r || jsonb_build_object('listing', lid,
    'remove', case when p_mount then '[]'::jsonb else jsonb_build_array(jsonb_build_object('itemId', p_item, 'qty', p_qty)) end,
    'forgetMount', case when p_mount then to_jsonb(substr(p_item, 7)) else 'null'::jsonb end);
end $$;

-- Bieten: Gold wird sofort abgezogen (bei eigenem Höchstgebot nur die Differenz). Überbotene bekommen ihr Gold ins Abholfach.
-- Gebote kurz vor Schluss verlängern auf 2 Minuten Restzeit.
create or replace function public.market_bid(p_character text, p_listing bigint, p_amount bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e text; c public.characters; l public.market_listings; need bigint; snap jsonb; g bigint;
begin
  e := public.market_guard(uid, 'bid');
  if e is not null then return public.market_err(e); end if;
  select * into c from public.characters where user_id = uid and id = p_character for update;
  if not found then return public.market_err('character'); end if;
  e := public.market_eligible(c);
  if e is not null then return public.market_err(e); end if;
  select * into l from public.market_listings where id = p_listing for update;
  if not found or l.status <> 'active' or l.ends_at <= now() then return public.market_err('gone'); end if;
  if l.start_bid is null then return public.market_err('nobid'); end if;
  if l.seller_user = uid then return public.market_err('own'); end if;
  if p_amount is null or p_amount > 10000000 then return public.market_err('price'); end if;
  if l.bid is null and p_amount < l.start_bid then return public.market_err('low'); end if;
  if l.bid is not null and p_amount < l.bid + greatest(1, ceil(l.bid * 0.05)) then return public.market_err('low'); end if;
  if l.buyout is not null and p_amount >= l.buyout then return public.market_err('buyout'); end if;
  need := case when l.bidder_user = uid and l.bidder_char = p_character then p_amount - l.bid else p_amount end;
  g := public.market_snap_gold(c.snapshot);
  if g < need then return public.market_err('gold'); end if;
  if not public.market_can_spend(uid, need) then return public.market_err('frame'); end if;
  snap := public.market_snap_set_gold(c.snapshot, g - need);
  if l.bid is not null and l.bidder_user is not null and not (l.bidder_user = uid and l.bidder_char = p_character) then
    insert into public.market_mail (user_id, character_id, kind, gold, listing_id) values (l.bidder_user, l.bidder_char, 'outbid', l.bid, l.id);
  end if;
  update public.market_listings set bid = p_amount, bidder_user = uid, bidder_char = p_character, bids = bids + 1,
    ends_at = greatest(ends_at, now() + interval '2 minutes') where id = l.id;
  return public.market_commit(uid, p_character, snap, -need) || jsonb_build_object('listing', l.id);
end $$;

-- Sofort kaufen: Gold ab, Gegenstand direkt in die Tasche (ohne Platz ins Abholfach), Erlös ins Abholfach des Verkäufers.
create or replace function public.market_buyout(p_character text, p_listing bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e text; c public.characters; l public.market_listings; need bigint; snap jsonb; g bigint; d jsonb; mine boolean;
begin
  e := public.market_guard(uid, 'buy');
  if e is not null then return public.market_err(e); end if;
  select * into c from public.characters where user_id = uid and id = p_character for update;
  if not found then return public.market_err('character'); end if;
  e := public.market_eligible(c);
  if e is not null then return public.market_err(e); end if;
  select * into l from public.market_listings where id = p_listing for update;
  if not found or l.status <> 'active' or l.ends_at <= now() then return public.market_err('gone'); end if;
  if l.buyout is null then return public.market_err('nobuyout'); end if;
  if l.seller_user = uid then return public.market_err('own'); end if;
  mine := l.bid is not null and l.bidder_user = uid and l.bidder_char = p_character;
  need := l.buyout - case when mine then l.bid else 0 end;
  g := public.market_snap_gold(c.snapshot);
  if g < need then return public.market_err('gold'); end if;
  if not public.market_can_spend(uid, need) then return public.market_err('frame'); end if;
  snap := public.market_snap_set_gold(c.snapshot, g - need);
  if l.bid is not null and l.bidder_user is not null and not mine then
    insert into public.market_mail (user_id, character_id, kind, gold, listing_id) values (l.bidder_user, l.bidder_char, 'outbid', l.bid, l.id);
  end if;
  update public.market_listings set status = 'sold', price = l.buyout, bidder_user = uid, bidder_char = p_character, closed_at = now()
    where id = l.id;
  if l.seller_user is not null then
    insert into public.market_mail (user_id, character_id, kind, gold, listing_id)
      values (l.seller_user, l.seller_char, 'sold', l.buyout - public.market_fee(l.buyout), l.id);
  end if;
  d := public.market_deliver(uid, p_character, snap, l.item_id, l.qty, false, 'bought', l.id);
  return public.market_commit(uid, p_character, d -> 'snap', -need) || (d - 'snap') || jsonb_build_object('listing', l.id);
end $$;

-- Zurückziehen (nur ohne Gebot): Gegenstand zurück in die Tasche bzw. als gelerntes Reittier, sonst ins Abholfach.
create or replace function public.market_cancel(p_character text, p_listing bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e text; c public.characters; l public.market_listings; d jsonb;
begin
  e := public.market_guard(uid, 'cancel');
  if e is not null then return public.market_err(e); end if;
  select * into c from public.characters where user_id = uid and id = p_character for update;
  if not found then return public.market_err('character'); end if;
  select * into l from public.market_listings where id = p_listing for update;
  if not found or l.seller_user is distinct from uid or l.seller_char <> p_character then return public.market_err('gone'); end if;
  if l.status <> 'active' or l.ends_at <= now() then return public.market_err('gone'); end if;
  if l.bid is not null then return public.market_err('bids'); end if;
  update public.market_listings set status = 'cancelled', closed_at = now() where id = l.id;
  d := public.market_deliver(uid, p_character, c.snapshot, l.item_id, l.qty, l.learned, 'cancelled', l.id);
  return public.market_commit(uid, p_character, d -> 'snap', 0) || (d - 'snap') || jsonb_build_object('listing', l.id);
end $$;

-- Abholfach leeren: Gold immer, Gegenstände solange Platz ist (der Rest bleibt liegen).
create or replace function public.market_collect(p_character text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e text; c public.characters; m public.market_mail; snap jsonb; d jsonb;
  gold bigint := 0; adds jsonb := '[]'; learns jsonb := '[]'; got int := 0; left_ int := 0; capped int := 0; g0 bigint; frame bigint;
  bound bigint;
begin
  e := public.market_guard(uid, 'collect');
  if e is not null then return public.market_err(e); end if;
  select * into c from public.characters where user_id = uid and id = p_character for update;
  if not found then return public.market_err('character'); end if;
  perform public.market_settle(50, uid);
  snap := c.snapshot;
  g0 := public.market_snap_gold(snap);
  frame := public.market_gold_frame(c);
  bound := 50000 + frame; -- Gold-Obergrenze der Spielstandprüfung (characters_plausible)
  for m in select * from public.market_mail where user_id = uid and character_id = p_character and collected_at is null
      order by id for update loop
    if m.item_id is null then
      -- Erlöse bis zum Goldrahmen des Charakters, zurückgegebene Gebote bis zur Gold-Obergrenze; der Rest bleibt liegen.
      if g0 + gold + m.gold > (case when m.kind = 'sold' then frame else bound end) then capped := capped + 1; continue; end if;
      gold := gold + m.gold;
    else
      d := null;
      if m.learned and m.item_id like 'mount\_%' and public.market_snap_learn_mount(snap, substr(m.item_id, 7)) is not null then
        snap := public.market_snap_learn_mount(snap, substr(m.item_id, 7));
        learns := learns || to_jsonb(substr(m.item_id, 7));
        perform public.market_own_add(uid, p_character, m.item_id, 1);
      else
        d := public.market_snap_give(snap, m.item_id, m.qty, coalesce((select stack from public.market_items where id = m.item_id), 1),
          coalesce((select category = 'material' from public.market_items where id = m.item_id), false));
        if d is null then left_ := left_ + 1; continue; end if;
        snap := d;
        adds := adds || jsonb_build_object('itemId', m.item_id, 'qty', m.qty);
        perform public.market_own_add(uid, p_character, m.item_id, m.qty);
      end if;
    end if;
    update public.market_mail set collected_at = now() where id = m.id;
    got := got + 1;
  end loop;
  if got = 0 then return jsonb_build_object('ok', true, 'collected', 0, 'left', left_, 'capped', capped); end if;
  snap := public.market_snap_set_gold(snap, public.market_snap_gold(snap) + gold);
  return public.market_commit(uid, p_character, snap, gold)
    || jsonb_build_object('collected', got, 'left', left_, 'capped', capped, 'add', adds, 'learn', learns);
end $$;

-- Angebote durchsuchen. p_items: nur diese Gegenstände (Namenssuche macht das Spiel), p_class: nur für diese Klasse nutzbar.
-- p_sort: 'new' | 'price' | 'ending'. Liefert höchstens 40 + 1 Zeilen (eine mehr = es gibt eine weitere Seite).
create or replace function public.market_browse(p_character text, p_category text default null, p_min_rarity int default 0,
  p_max_level int default null, p_class text default null, p_items text[] default null, p_sort text default 'new', p_offset int default 0)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); out_ jsonb;
begin
  if uid is null then return public.market_err('auth'); end if;
  perform public.market_settle(50);
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'itemId', x.item_id, 'qty', x.qty, 'startBid', x.start_bid,
      'buyout', x.buyout, 'bid', x.bid, 'bids', x.bids, 'endsAt', x.ends_at, 'mine', x.seller_user = uid,
      'top', x.bidder_user = uid and x.bidder_char = p_character) order by x.rn), '[]'::jsonb)
    into out_
    from (select l.*, row_number() over (order by
            case when p_sort = 'price' then coalesce(l.buyout, l.bid, l.start_bid) end asc,
            case when p_sort = 'ending' then l.ends_at end asc,
            l.created_at desc, l.id desc) rn
          from public.market_listings l
          where l.status = 'active' and l.ends_at > now()
            and (p_category is null or l.category = p_category)
            and l.rarity >= coalesce(p_min_rarity, 0)
            and (p_max_level is null or l.req_level <= p_max_level)
            and (p_class is null or l.classes is null or p_class = any (l.classes))
            and (p_items is null or l.item_id = any (p_items))
          order by rn offset greatest(0, coalesce(p_offset, 0)) limit 41) x;
  return jsonb_build_object('ok', true, 'rows', out_, 'now', now());
end $$;

-- Eigene Angebote, eigene Höchstgebote und das Abholfach dieses Charakters.
create or replace function public.market_overview(p_character text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); mine jsonb; bids jsonb; mail jsonb;
begin
  if uid is null then return public.market_err('auth'); end if;
  perform public.market_settle(50, uid);
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'itemId', l.item_id, 'qty', l.qty, 'startBid', l.start_bid,
      'buyout', l.buyout, 'bid', l.bid, 'bids', l.bids, 'endsAt', l.ends_at, 'learned', l.learned) order by l.ends_at), '[]'::jsonb)
    into mine from public.market_listings l where l.seller_user = uid and l.seller_char = p_character and l.status = 'active';
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'itemId', l.item_id, 'qty', l.qty, 'startBid', l.start_bid,
      'buyout', l.buyout, 'bid', l.bid, 'bids', l.bids, 'endsAt', l.ends_at, 'top', true) order by l.ends_at), '[]'::jsonb)
    into bids from public.market_listings l where l.bidder_user = uid and l.bidder_char = p_character and l.status = 'active';
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'itemId', m.item_id, 'qty', m.qty, 'gold', m.gold,
      'learned', m.learned, 'at', m.created_at, 'about', l.item_id, 'aboutQty', l.qty) order by m.id), '[]'::jsonb)
    into mail from public.market_mail m left join public.market_listings l on l.id = m.listing_id where m.user_id = uid and m.character_id = p_character and m.collected_at is null;
  return jsonb_build_object('ok', true, 'mine', mine, 'bids', bids, 'mail', mail, 'now', now());
end $$;

-- ------------------------------------------------------------------ Spielstand-Prüfung beim Hochladen
-- Für den Trigger (läuft mit der Rolle des Spielers): Buchungszähler. Direkter Aufruf wird abgewiesen.
create or replace function public.characters_market_seq(p_user uuid, p_character text) returns bigint
language plpgsql stable security definer set search_path = '' as $$
begin
  if pg_trigger_depth() < 1 then raise exception 'nicht erlaubt' using errcode = '42501'; end if;
  return (select m.seq from public.market_chars m where m.user_id = p_user and m.character_id = p_character);
end $$;

-- Spielstand mit anderem Buchungszähler als der Server: nicht schreiben (das Spiel lädt den Cloud-Stand).
-- Gleichheit statt »mindestens«: ein erfundener hoher Zähler hilft nicht.
create or replace function public.characters_market_check() returns trigger
language plpgsql set search_path = '' as $$
declare want bigint; have bigint;
begin
  -- Buchung des Auktionshauses (market_commit): updated_at nicht vorstellen, sonst rechnet characters_plausible beim
  -- nächsten Upload nur die Sekunden seit der Buchung als Spielzeit an.
  if tg_op = 'UPDATE' and current_user <> 'authenticated' and current_setting('emberwrath.market', true) = '1' then
    new.updated_at := old.updated_at;
    return new;
  end if;
  if current_user <> 'authenticated' or tg_op <> 'UPDATE' then return new; end if;
  want := public.characters_market_seq(old.user_id, old.id);
  if want is null then return new; end if;
  begin have := coalesce(floor((new.snapshot #>> '{slices,market,seq}')::numeric), 0)::bigint;
  exception when others then have := -1; end;
  if have = want then return new; end if;
  perform public.characters_flag(old.user_id, old.id, 'handel', jsonb_build_object('seq', jsonb_build_array(want, have)));
  return null;
end $$;
drop trigger if exists characters_market_check on public.characters;
-- Name nach characters_before_write und vor characters_plausible (gleichartige Trigger laufen alphabetisch).
-- characters_plausible bleibt unverändert: Gold aus dem Auktionshaus hebt die Gold-Obergrenze nicht an.
create trigger characters_market_check before update on public.characters
  for each row execute function public.characters_market_check();

-- Vermerke: höchstens einer je Minute und Konto wie bisher (20261005090000_sicherheit_spielstand.sql), aber 'handel'
-- (Auktionshaus) zählt getrennt. Sonst unterdrückte ein absichtlich abgelehnter alter Spielstand den Gold-/Stufen-Vermerk.
create or replace function public.characters_flag(p_user uuid, p_character text, p_reason text, p_detail jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() < 1 then raise exception 'nicht erlaubt' using errcode = '42501'; end if;
  if (select auth.uid()) is not null and p_user is distinct from (select auth.uid()) then
    raise exception 'nicht erlaubt' using errcode = '42501';
  end if;
  if exists (select 1 from public.character_flags f where f.user_id = p_user and f.created_at > now() - interval '1 minute'
             and (f.reason = 'handel') = (p_reason = 'handel')) then
    return;
  end if;
  insert into public.character_flags (user_id, character_id, reason, detail) values (p_user, left(p_character, 64), p_reason, p_detail);
end $$;
revoke execute on function public.characters_flag(uuid, text, text, jsonb) from public, anon;
grant execute on function public.characters_flag(uuid, text, text, jsonb) to authenticated;

-- ------------------------------------------------------------------ Rechte
-- Interne Bausteine: niemand von außen.
revoke execute on function public.market_snap_count(jsonb, text, boolean) from public, anon, authenticated;
revoke execute on function public.market_snap_take(jsonb, text, int, boolean) from public, anon, authenticated;
revoke execute on function public.market_snap_give(jsonb, text, int, int, boolean) from public, anon, authenticated;
revoke execute on function public.market_snap_gold(jsonb) from public, anon, authenticated;
revoke execute on function public.market_snap_set_gold(jsonb, bigint) from public, anon, authenticated;
revoke execute on function public.market_snap_forget_mount(jsonb, text) from public, anon, authenticated;
revoke execute on function public.market_snap_learn_mount(jsonb, text) from public, anon, authenticated;
revoke execute on function public.market_commit(uuid, text, jsonb, bigint) from public, anon, authenticated;
revoke execute on function public.market_guard(uuid, text) from public, anon, authenticated;
revoke execute on function public.market_fee(bigint) from public, anon, authenticated;
revoke execute on function public.market_shop_gold(uuid, text) from public, anon, authenticated;
revoke execute on function public.market_gold_frame(public.characters) from public, anon, authenticated;
revoke execute on function public.market_eligible(public.characters) from public, anon, authenticated;
revoke execute on function public.market_account(uuid) from public, anon, authenticated;
revoke execute on function public.market_trade_time(public.market_accounts) from public, anon, authenticated;
revoke execute on function public.market_account_frame(public.market_accounts) from public, anon, authenticated;
revoke execute on function public.market_can_spend(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.market_own_add(uuid, text, text, int) from public, anon, authenticated;
revoke execute on function public.market_settle(int, uuid) from public, anon, authenticated;
revoke execute on function public.market_err(text) from public, anon, authenticated;
revoke execute on function public.market_deliver(uuid, text, jsonb, text, int, boolean, text, bigint) from public, anon, authenticated;
revoke execute on function public.characters_market_check() from public, anon, authenticated;
-- Für den Trigger (prüft pg_trigger_depth selbst):
revoke execute on function public.characters_market_seq(uuid, text) from public, anon;
grant execute on function public.characters_market_seq(uuid, text) to authenticated;
-- Für das Spiel (angemeldete Spieler):
revoke execute on function public.market_list(text, text, int, bigint, bigint, int, boolean) from public, anon;
revoke execute on function public.market_bid(text, bigint, bigint) from public, anon;
revoke execute on function public.market_buyout(text, bigint) from public, anon;
revoke execute on function public.market_cancel(text, bigint) from public, anon;
revoke execute on function public.market_collect(text) from public, anon;
revoke execute on function public.market_browse(text, text, int, int, text, text[], text, int) from public, anon;
revoke execute on function public.market_overview(text) from public, anon;
grant execute on function public.market_list(text, text, int, bigint, bigint, int, boolean) to authenticated;
grant execute on function public.market_bid(text, bigint, bigint) to authenticated;
grant execute on function public.market_buyout(text, bigint) to authenticated;
grant execute on function public.market_cancel(text, bigint) to authenticated;
grant execute on function public.market_collect(text) to authenticated;
grant execute on function public.market_browse(text, text, int, int, text, text[], text, int) to authenticated;
grant execute on function public.market_overview(text) to authenticated;

-- PostgREST: neue Funktionen sofort bekannt machen.
notify pgrst, 'reload schema';
