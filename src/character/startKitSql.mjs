// Erzeugt die Datenbankfunktion public.character_start_kit_problem(snapshot, class_id) aus startKit.js
// (Thread A, Sicherheitsbericht D3 Punkt 3). Nicht Teil des Spiels.
//
//   node src/character/startKitSql.mjs > supabase/migrations/<zeit>_startpaket.sql
//   node src/character/startKitSql.mjs --test     # vergleicht JS und SQL an Beispielständen (braucht psql/initdb)
//
// Ändert sich das Startpaket in startKit.js, die Migration neu erzeugen und ausführen.
import { START_ITEMS, STARTER_GEAR, START_ZONE_ITEMS, START_ZONE_QUESTS, START_ACHIEVEMENTS, START_BANK_SIZE, START_MAX_LEVEL, START_MAX_GOLD, startKitProblem } from './startKit.js';

const lit = (a) => `array[${[...new Set(a)].map((x) => `'${String(x).replace(/'/g, "''")}'`).join(', ')}]::text[]`;

export function startKitSql() {
  const items = [...START_ZONE_ITEMS, ...START_ITEMS.map((i) => i.itemId), ...Object.values(STARTER_GEAR).flatMap((g) => Object.values(g))];
  return `-- Emberwrath: Startpaket neuer Charaktere serverseitig prüfen (Sicherheitsbericht D3 Punkt 3).
-- Erzeugt mit: node src/character/startKitSql.mjs (Quelle: src/character/startKit.js). Mehrfach ausführbar.
-- Die Funktion liefert null, wenn der Spielstand ein frisches Startpaket ist (kleiner Spielraum für die ersten
-- Sekunden bis zum ersten Upload), sonst den Grund. characters_plausible ruft sie beim INSERT auf.

create or replace function public.character_start_kit_problem(p_snapshot jsonb, p_class text default null) returns text
language plpgsql immutable set search_path = '' as $$
declare
  classes text[] := ${lit(Object.keys(STARTER_GEAR))};
  allowed text[] := ${lit(items)};
  quests  text[] := ${lit(START_ZONE_QUESTS)};
  achiev  text[] := ${lit(START_ACHIEVEMENTS)};
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
  if lvl <> trunc(lvl) or lvl < 1 or lvl > ${START_MAX_LEVEL} then return 'stufe'; end if;
  if gold > ${START_MAX_GOLD} then return 'gold'; end if;

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
  v := coalesce(nullif(s #> '{bank,size}', 'null'), '${START_BANK_SIZE}');
  if v <> '${START_BANK_SIZE}'::jsonb then return 'bank'; end if;
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
`;
}

// Beispielstände: frisch, mit kleinem Fortschritt und typische Angriffe aus dem Bericht.
function samples() {
  const fresh = (cls = 'ranger') => ({
    meta: { playTime: 0 },
    slices: {
      character: { name: 'Test', raceId: 'human', classId: cls, appearance: { variant: 0 }, talents: {}, mounts: { owned: [], active: null, riding: false } },
      progress: { level: 1, xp: 0 },
      wallet: { gold: 0 },
      quests: { active: {}, completed: [], repeats: {}, tracked: null, guide: null },
      bank: { size: 16, slots: Array(16).fill(null) },
      world: { zoneId: 'emberhollow', spawnId: 'start', pos: { x: 312, y: 396 }, flags: {}, bossesDefeated: [] },
      trials: { best: 0, runs: 0, cleared: {}, run: null },
      achievements: { unlocked: {}, title: null },
      shop: { credited: [] },
      inventory: { slots: [...START_ITEMS.map((i) => ({ ...i })), ...Array(34).fill(null)], equipment: { weapon: STARTER_GEAR[cls].weapon, head: null, chest: STARTER_GEAR[cls].chest, hands: null, feet: null, ring: null, amulet: null }, upgrades: {}, enchants: {}, questBag: [], autoSell: null },
    },
  });
  const mod = (f) => { const x = fresh(); f(x.slices); return x; };
  return [
    ['frisch', fresh(), null], ['frisch Krieger', fresh('warrior'), 'warrior'], ['falsche Klasse', fresh('mage'), 'warrior'],
    ['Stufe 2 mit Beute', mod((s) => { s.progress.level = 2; s.wallet.gold = 40; s.inventory.slots[2] = { itemId: 'wolf_pelt', qty: 3 }; s.character.talents = { g_hawkeye: 1 }; s.quests.completed = ['q_ashen_wolves']; }), null],
    ['Stufe 4', mod((s) => { s.progress.level = 4; }), null],
    ['Gold 50000', mod((s) => { s.wallet.gold = 50000; }), null],
    ['Gold als Text', mod((s) => { s.wallet.gold = '10'; }), null],
    ['Schlackendrache', mod((s) => { s.character.mounts = { owned: ['cinder_drake'], active: 'cinder_drake', riding: true }; }), null],
    ['nur aktiv', mod((s) => { s.character.mounts = { owned: [], active: 'cinder_drake' }; }), null],
    ['Reittiere als Text', mod((s) => { s.character.mounts = { owned: 'x' }; }), null],
    ['999 legendäre', mod((s) => { s.inventory.slots = Array(36).fill({ itemId: 'starfall', qty: 1 }); }), null],
    ['legendär angelegt', mod((s) => { s.inventory.equipment.weapon = 'starfall'; }), null],
    ['Ausrüstung als Objekt', mod((s) => { s.inventory.equipment.weapon = { itemId: 'short_bow' }; }), null],
    ['Questbeutel', mod((s) => { s.inventory.questBag = [{ itemId: 'rot_idol', qty: 1 }]; }), null],
    ['Quest Stufe 40', mod((s) => { s.quests.completed = ['q_ash_sovereign']; }), null],
    ['zu viele Talente', mod((s) => { s.character.talents = { g_hawkeye: 2 }; }), null],
    ['Talent negativ', mod((s) => { s.progress.level = 3; s.character.talents = { a: -5, b: 7 }; }), null],
    ['Talent Bruch', mod((s) => { s.progress.level = 3; s.character.talents = { a: 0.5 }; }), null],
    ['Schmiede +10', mod((s) => { s.inventory.upgrades = { weapon: 10 }; }), null],
    ['Schmiede 0', mod((s) => { s.inventory.upgrades = { weapon: 0 }; }), null],
    ['Verzauberung', mod((s) => { s.inventory.enchants = { weapon: 'flame' }; }), null],
    ['Tasche als Objekt', mod((s) => { s.inventory.slots = { a: 1 }; }), null],
    ['Stufe Bruch', mod((s) => { s.progress.level = 1.5; }), null],
    ['ohne slices', { meta: {} }, null],
    ['Charakter fehlt', mod((s) => { delete s.character; }), null],
    ['Bank 48', mod((s) => { s.bank = { size: 48, slots: [] }; }), null],
    ['Bank legendär', mod((s) => { s.bank = { size: 16, slots: [{ itemId: 'starfall', qty: 1 }] }; }), null],
    ['Boss besiegt', mod((s) => { s.world = { zoneId: 'emberhollow', bossesDefeated: ['ash_sovereign'] }; }), null],
    ['Prüfung', mod((s) => { s.trials = { best: 12, runs: 3, cleared: {}, run: null }; }), null],
    ['Erfolg früh', mod((s) => { s.achievements = { unlocked: { first_blood: 123 }, title: null }; }), null],
    ['Erfolg Titel', mod((s) => { s.achievements = { unlocked: { ignaroth: 1 }, title: 'Königsmörder' }; }), null],
  ];
}

async function test() {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(`${tmpdir()}/startkit-`);
  const bin = '/usr/lib/postgresql/16/bin';
  const pg = (...a) => execFileSync(`${bin}/${a[0]}`, a.slice(1), { encoding: 'utf8' });
  pg('initdb', '-D', `${dir}/db`, '-A', 'trust', '-U', 'postgres');
  pg('pg_ctl', '-D', `${dir}/db`, '-o', `-k ${dir} -p 55433 -c listen_addresses=''`, '-l', `${dir}/log`, '-w', 'start');
  const psql = (sql) => execFileSync('psql', ['-h', dir, '-p', '55433', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'], { input: sql, encoding: 'utf8' });
  let fails = 0;
  try {
    psql(`create role anon; create role authenticated; create role service_role;\n${startKitSql()}`);
    for (const [name, snap, cls] of samples()) {
      const js = startKitProblem(snap, cls);
      writeFileSync(`${dir}/s.json`, JSON.stringify(snap));
      const q = `select coalesce(public.character_start_kit_problem($j$${JSON.stringify(snap)}$j$::jsonb, ${cls ? `'${cls}'` : 'null'}), 'ok');`;
      const sql = psql(q).trim();
      const ok = (js ?? 'ok') === sql;
      if (!ok) fails++;
      console.log(`${ok ? 'ok  ' : 'FEHL'} ${name.padEnd(22)} js=${js ?? 'ok'} sql=${sql}`);
    }
  } finally {
    pg('pg_ctl', '-D', `${dir}/db`, '-m', 'fast', 'stop');
  }
  if (fails) { console.log(`${fails} Abweichungen`); process.exit(1); }
}

if (process.argv[1]?.endsWith('startKitSql.mjs')) {
  if (process.argv.includes('--test')) await test();
  else process.stdout.write(startKitSql());
}
