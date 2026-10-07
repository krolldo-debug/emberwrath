-- Emberwrath: Startpaket neuer Charaktere serverseitig prüfen (Sicherheitsbericht D3 Punkt 3).
-- Erzeugt mit: node src/character/startKitSql.mjs (Quelle: src/character/startKit.js). Mehrfach ausführbar.
-- Die Funktion liefert null, wenn der Spielstand ein frisches Startpaket ist (kleiner Spielraum für die ersten
-- Sekunden bis zum ersten Upload), sonst den Grund. characters_plausible ruft sie beim INSERT auf.

create or replace function public.character_start_kit_problem(p_snapshot jsonb, p_class text default null) returns text
language plpgsql immutable set search_path = '' as $$
declare
  classes text[] := array['warrior', 'rogue', 'ranger', 'mage']::text[];
  allowed text[] := array['notched_blade', 'iron_sword', 'woodcutter_axe', 'cudgel', 'rusty_dagger', 'wolfsbane_dagger', 'short_bow', 'ashwood_staff', 'oak_wand', 'novice_robe', 'padded_vest', 'recruit_mail', 'leather_jerkin', 'worn_boots', 'copper_ring', 'bone_amulet', 'minor_potion', 'minor_mana', 'hearth_bread', 'wolf_pelt', 'wolf_fang']::text[];
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
  return null;
exception when others then
  return 'format';
end $$;
revoke execute on function public.character_start_kit_problem(jsonb, text) from public, anon;
grant execute on function public.character_start_kit_problem(jsonb, text) to authenticated, service_role;
