-- Emberwrath: Startpaket neuer Charaktere serverseitig prüfen (Sicherheitsbericht D3 Punkt 3).
-- Erzeugt mit: node src/character/startKitSql.mjs (Quelle: src/character/startKit.js). Mehrfach ausführbar.
-- Die Funktion liefert null, wenn der Spielstand ein frisches Startpaket ist (kleiner Spielraum für die ersten
-- Sekunden bis zum ersten Upload), sonst den Grund. characters_plausible ruft sie beim INSERT auf.

create or replace function public.character_start_kit_problem(p_snapshot jsonb, p_class text default null) returns text
language plpgsql immutable set search_path = '' as $$
declare
  classes text[] := array['warrior', 'rogue', 'ranger', 'mage']::text[];
  allowed text[] := array['notched_blade', 'notched_blade_bear', 'notched_blade_guard', 'notched_blade_fox', 'notched_blade_hawk', 'notched_blade_owl', 'notched_blade_ember', 'iron_sword', 'iron_sword_bear', 'iron_sword_guard', 'iron_sword_fox', 'iron_sword_hawk', 'iron_sword_owl', 'iron_sword_ember', 'woodcutter_axe', 'woodcutter_axe_bear', 'woodcutter_axe_guard', 'woodcutter_axe_fox', 'woodcutter_axe_hawk', 'woodcutter_axe_owl', 'woodcutter_axe_ember', 'cudgel', 'cudgel_bear', 'cudgel_guard', 'cudgel_fox', 'cudgel_hawk', 'cudgel_owl', 'cudgel_ember', 'rusty_dagger', 'rusty_dagger_bear', 'rusty_dagger_guard', 'rusty_dagger_fox', 'rusty_dagger_hawk', 'rusty_dagger_owl', 'rusty_dagger_ember', 'wolfsbane_dagger', 'wolfsbane_dagger_bear', 'wolfsbane_dagger_guard', 'wolfsbane_dagger_fox', 'wolfsbane_dagger_hawk', 'wolfsbane_dagger_owl', 'wolfsbane_dagger_ember', 'short_bow', 'short_bow_bear', 'short_bow_guard', 'short_bow_fox', 'short_bow_hawk', 'short_bow_owl', 'short_bow_ember', 'ashwood_staff', 'ashwood_staff_bear', 'ashwood_staff_guard', 'ashwood_staff_fox', 'ashwood_staff_hawk', 'ashwood_staff_owl', 'ashwood_staff_ember', 'oak_wand', 'oak_wand_bear', 'oak_wand_guard', 'oak_wand_fox', 'oak_wand_hawk', 'oak_wand_owl', 'oak_wand_ember', 'novice_robe', 'novice_robe_bear', 'novice_robe_guard', 'novice_robe_fox', 'novice_robe_hawk', 'novice_robe_owl', 'novice_robe_ember', 'padded_vest', 'padded_vest_bear', 'padded_vest_guard', 'padded_vest_fox', 'padded_vest_hawk', 'padded_vest_owl', 'padded_vest_ember', 'recruit_mail', 'recruit_mail_bear', 'recruit_mail_guard', 'recruit_mail_fox', 'recruit_mail_hawk', 'recruit_mail_owl', 'recruit_mail_ember', 'leather_jerkin', 'leather_jerkin_bear', 'leather_jerkin_guard', 'leather_jerkin_fox', 'leather_jerkin_hawk', 'leather_jerkin_owl', 'leather_jerkin_ember', 'worn_boots', 'worn_boots_bear', 'worn_boots_guard', 'worn_boots_fox', 'worn_boots_hawk', 'worn_boots_owl', 'worn_boots_ember', 'copper_ring', 'copper_ring_bear', 'copper_ring_guard', 'copper_ring_fox', 'copper_ring_hawk', 'copper_ring_owl', 'copper_ring_ember', 'bone_amulet', 'bone_amulet_bear', 'bone_amulet_guard', 'bone_amulet_fox', 'bone_amulet_hawk', 'bone_amulet_owl', 'bone_amulet_ember', 'minor_potion', 'minor_potion_bear', 'minor_potion_guard', 'minor_potion_fox', 'minor_potion_hawk', 'minor_potion_owl', 'minor_potion_ember', 'minor_mana', 'minor_mana_bear', 'minor_mana_guard', 'minor_mana_fox', 'minor_mana_hawk', 'minor_mana_owl', 'minor_mana_ember', 'hearth_bread', 'hearth_bread_bear', 'hearth_bread_guard', 'hearth_bread_fox', 'hearth_bread_hawk', 'hearth_bread_owl', 'hearth_bread_ember', 'wolf_pelt', 'wolf_pelt_bear', 'wolf_pelt_guard', 'wolf_pelt_fox', 'wolf_pelt_hawk', 'wolf_pelt_owl', 'wolf_pelt_ember', 'wolf_fang', 'wolf_fang_bear', 'wolf_fang_guard', 'wolf_fang_fox', 'wolf_fang_hawk', 'wolf_fang_owl', 'wolf_fang_ember']::text[];
  quests  text[] := array['q_ashen_wolves', 'q_bounty_emberhollow', 'q_glutfang', 'q_into_catacombs', 'q_spider_silk']::text[];
  achiev  text[] := array['first_blood', 'first_quest']::text[];
  falsy   jsonb[] := array['null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb];
  s jsonb; ch jsonb; inv jsonb; m jsonb; v jsonb; e jsonb;
  cls text; id text; lvl numeric; gold numeric; ranks numeric := 0;
begin
  s := p_snapshot -> 'slices';
  if jsonb_typeof(s) is distinct from 'object' then return 'format'; end if;
  ch := s -> 'character'; inv := coalesce(nullif(s -> 'inventory', 'null'), '{}');
  if coalesce(jsonb_typeof(nullif(ch, 'null')), 'object') <> 'object'
     or coalesce(jsonb_typeof(nullif(s -> 'progress', 'null')), 'object') <> 'object'
     or coalesce(jsonb_typeof(nullif(s -> 'wallet', 'null')), 'object') <> 'object'
     or coalesce(jsonb_typeof(nullif(s -> 'quests', 'null')), 'object') <> 'object'
     or coalesce(jsonb_typeof(nullif(s -> 'bank', 'null')), 'object') <> 'object'
     or coalesce(jsonb_typeof(nullif(s -> 'world', 'null')), 'object') <> 'object'
     or coalesce(jsonb_typeof(nullif(s -> 'trials', 'null')), 'object') <> 'object'
     or coalesce(jsonb_typeof(nullif(s -> 'achievements', 'null')), 'object') <> 'object'
     or coalesce(jsonb_typeof(nullif(s -> 'board', 'null')), 'object') <> 'object'
     or jsonb_typeof(inv) <> 'object' then return 'format'; end if;
  if coalesce(jsonb_typeof(nullif(s #> '{progress,level}', 'null')), 'number') <> 'number'
     or coalesce(jsonb_typeof(nullif(s #> '{wallet,gold}', 'null')), 'number') <> 'number' then return 'format'; end if;
  lvl := coalesce((s #>> '{progress,level}')::numeric, 1);
  gold := coalesce((s #>> '{wallet,gold}')::numeric, 0);

  if jsonb_typeof(ch -> 'classId') is distinct from 'string' then return 'klasse'; end if;
  cls := ch ->> 'classId';
  if not (cls = any(classes)) or (p_class is not null and p_class <> cls) then return 'klasse'; end if;
  if lvl <> trunc(lvl) or lvl < 1 or lvl > 3 then return 'stufe'; end if;
  if gold > 5000 then return 'gold'; end if;

  m := coalesce(nullif(ch -> 'mounts', 'null'), '{}');
  if jsonb_typeof(m) <> 'object'
     or (nullif(m -> 'owned', 'null') is not null and m -> 'owned' <> '[]'::jsonb)
     or not (coalesce(m -> 'active', 'null') = any(falsy))
     or not (coalesce(m -> 'riding', 'null') = any(falsy)) then return 'reittier'; end if;

  v := coalesce(nullif(ch -> 'talents', 'null'), '{}');
  if jsonb_typeof(v) <> 'object' then return 'talente'; end if;
  for e in select value from jsonb_each(v) loop
    if jsonb_typeof(e) <> 'number' or (e #>> '{}')::numeric <> trunc((e #>> '{}')::numeric) or (e #>> '{}')::numeric < 0 then return 'talente'; end if;
    ranks := ranks + (e #>> '{}')::numeric;
  end loop;
  if ranks > lvl - 1 then return 'talente'; end if;

  v := coalesce(nullif(s #> '{quests,completed}', 'null'), '[]');
  if jsonb_typeof(v) <> 'array' then return 'quest'; end if;
  for e in select value from jsonb_array_elements(v) loop
    if jsonb_typeof(e) <> 'string' or not ((e #>> '{}') = any(quests)) then return 'quest'; end if;
  end loop;

  for v in select x from unnest(array[coalesce(nullif(inv -> 'slots', 'null'), '[]'), coalesce(nullif(inv -> 'questBag', 'null'), '[]')]) x loop
    if jsonb_typeof(v) <> 'array' then return 'gegenstand'; end if;
    for e in select value from jsonb_array_elements(v) loop
      continue when e = 'null';
      id := case jsonb_typeof(e) when 'string' then e #>> '{}' when 'object' then case when jsonb_typeof(e -> 'itemId') = 'string' then e ->> 'itemId' end end;
      if id is null or not (id = any(allowed)) then return 'gegenstand'; end if;
    end loop;
  end loop;

  -- Materialbeutel { itemId: Anzahl }
  v := coalesce(nullif(inv -> 'mats', 'null'), '{}');
  if jsonb_typeof(v) <> 'object' then return 'gegenstand'; end if;
  for id, e in select key, value from jsonb_each(v) loop
    if not (id = any(allowed)) or jsonb_typeof(e) <> 'number' or (e #>> '{}')::numeric <> trunc((e #>> '{}')::numeric) or (e #>> '{}')::numeric < 0 then return 'gegenstand'; end if;
  end loop;

  v := coalesce(nullif(inv -> 'equipment', 'null'), '{}');
  if jsonb_typeof(v) <> 'object' then return 'ausruestung'; end if;
  for e in select value from jsonb_each(v) loop
    continue when e = 'null';
    id := case jsonb_typeof(e) when 'string' then e #>> '{}' when 'object' then case when jsonb_typeof(e -> 'itemId') = 'string' then e ->> 'itemId' end end;
    if id is null or not (id = any(allowed)) then return 'ausruestung'; end if;
  end loop;

  for v in select x from unnest(array[coalesce(nullif(inv -> 'upgrades', 'null'), '{}'), coalesce(nullif(inv -> 'enchants', 'null'), '{}')]) x loop
    if jsonb_typeof(v) <> 'object' then return 'schmiede'; end if;
    for e in select value from jsonb_each(v) loop
      if not (e = any(falsy)) then return 'schmiede'; end if;
    end loop;
  end loop;
  -- Bank: Grundgröße, nur erlaubte Gegenstände
  v := coalesce(nullif(s #> '{bank,size}', 'null'), '16');
  if v <> '16'::jsonb then return 'bank'; end if;
  v := coalesce(nullif(s #> '{bank,slots}', 'null'), '[]');
  if jsonb_typeof(v) <> 'array' then return 'bank'; end if;
  for e in select value from jsonb_array_elements(v) loop
    continue when e = 'null';
    id := case jsonb_typeof(e) when 'string' then e #>> '{}' when 'object' then case when jsonb_typeof(e -> 'itemId') = 'string' then e ->> 'itemId' end end;
    if id is null or not (id = any(allowed)) then return 'bank'; end if;
  end loop;

  v := coalesce(nullif(s #> '{world,bossesDefeated}', 'null'), '[]');
  if v <> '[]'::jsonb then return 'boss'; end if;

  v := coalesce(nullif(s -> 'trials', 'null'), '{}');
  if not (coalesce(v -> 'best', 'null') = any(falsy)) or not (coalesce(v -> 'runs', 'null') = any(falsy))
     or not (coalesce(v -> 'run', 'null') = any(falsy))
     or (nullif(v -> 'cleared', 'null') is not null and v -> 'cleared' <> '{}'::jsonb) then return 'pruefung'; end if;

  v := coalesce(nullif(s #> '{achievements,unlocked}', 'null'), '{}');
  if jsonb_typeof(v) <> 'object' or exists (select 1 from jsonb_object_keys(v) k where not (k = any(achiev)))
     or not (coalesce(s #> '{achievements,title}', 'null') = any(falsy)) then return 'erfolg'; end if;

  -- Auftragsbrett: angenommen darf schon sein, erledigt oder Wochenbelohnung noch nicht
  v := coalesce(nullif(s -> 'board', 'null'), '{}');
  if coalesce(jsonb_typeof(nullif(v -> 'done', 'null')), 'array') <> 'array'
     or coalesce(nullif(v -> 'done', 'null'), '[]') <> '[]'::jsonb
     or not (coalesce(v -> 'weekDone', 'null') = any(falsy)) or not (coalesce(v -> 'weekClaimed', 'null') = any(falsy))
     or coalesce(jsonb_typeof(nullif(v -> 'taken', 'null')), 'object') <> 'object' then return 'auftrag'; end if;
  return null;
exception when others then
  return 'format';
end $$;
revoke execute on function public.character_start_kit_problem(jsonb, text) from public, anon;
grant execute on function public.character_start_kit_problem(jsonb, text) to authenticated, service_role;
