// Tempo-Simulation (Thread C): spielt die Kampagne mit den echten Commands durch.
//   node src/progression/test/pacing.mjs
// Annahmen: Gegnerstufen wie ENEMY_LEVELS (Richtwerte für Thread B), zusätzlich zu den Questzielen
// fallen je Questziel-Kill `trash` (2) weitere Gegner der Zone (Weg, Rudel, Nachzügler).
// Zeitmodell (an der Nutzerrückmeldung „Stufe 20 nach etwa 30 Minuten“ geeicht): SEC_PER_KILL Sekunden je Kill
// einschließlich Laufwege, SEC_PER_QUEST Sekunden je Quest für Gespräche und Reisen.
// Ab Stufe 20: Liegt die nächste Quest mehr als GAP Stufen über dem Spieler, macht er das Kopfgeld der Region.
// Gold: Beute jedes Kills wird mit loot.js gewürfelt und komplett verkauft (Obergrenze dessen, was man verdienen kann).
import { EventBus } from '../../core/EventBus.js';
import { Content } from '../../core/Content.js';
import { GameState } from '../../core/GameState.js';
import { LocalAuthority } from '../../core/Authority.js';
import { registerProgressionContent, registerProgressionState } from '../logic.js';
import { questStatus, setWorldFeatures } from '../selectors.js';
import { rollLoot } from '../loot.js';
import { ITEMS } from '../items.js';
import { PACE } from '../xp.js';

export const SEC_PER_KILL = 60 / PACE.killsPerMinute;
export const SEC_PER_QUEST = 30;
// Ab 20 nimmt der Spieler Quests bis GAP Stufen über sich an; sonst macht er Kopfgelder.
export const GAP = 2;

export const ENEMY_LEVELS = {
  // Durchschnitt der echten Weltdaten (Thread B, Stand 2026-09-30)
  wolf: 1, wolf_alpha: 3, skeleton: 4, archer: 3, spider: 5, bonelord: 6,
  ash_boar: 6, bandit: 8, bandit_archer: 8, thorn_crawler: 8, bandit_chief: 10,
  drowned: 10, tide_cultist: 11, temple_guardian: 11, drowned_priestess: 12,
  fire_imp: 13, magma_hound: 14, ash_golem: 15, cinder_cultist: 14, magma_behemoth: 16,
  forge_golem: 18, flame_acolyte: 18, ember_drake: 19, forge_warden: 19, ember_tyrant: 20,
  // Stufe 20–40: Durchschnitt der Weltdaten von Thread B (Stand 2026-09-30, 15:45)
  steppe_raider: 22, raider_archer: 21, dust_hyena: 23, ash_vulture: 24, steppe_warlord: 25,
  barrow_wight: 25, grave_hound: 26, bone_archer: 25, wight_caller: 26, barrow_king: 26,
  bog_lurker: 26, rot_shaman: 27, swamp_leech: 27, plague_toad: 30, bog_horror: 30,
  sporeling: 30, fungal_brute: 31, spore_caster: 31, rot_mother: 32,
  frost_wolf: 32, ice_troll: 34, rime_witch: 35, snow_stalker: 34, ice_troll_chief: 35,
  ice_elemental: 36, crystal_spider: 36, frozen_knight: 37, frost_wyrm: 37,
  ash_wraith: 37, cinder_knight: 39, magma_serpent: 39, ember_cultist_adept: 38, waste_colossus: 40,
  throne_guard: 39, ash_priest: 39, ember_hellhound: 40, throne_sentinel: 40, ash_sovereign: 40,
};
const ELITE = new Set(['wolf_alpha', 'bandit_chief', 'magma_behemoth', 'forge_warden', 'steppe_warlord', 'bog_horror', 'ice_troll_chief', 'waste_colossus', 'throne_sentinel']);
const BOSS = new Set(['bonelord', 'drowned_priestess', 'ember_tyrant', 'barrow_king', 'rot_mother', 'frost_wyrm', 'ash_sovereign']);
const TRASH = {
  emberhollow: ['wolf'], catacombs: ['skeleton', 'archer'], ashwood: ['bandit', 'ash_boar'], sunken_temple: ['drowned', 'tide_cultist'], cinder_peaks: ['fire_imp', 'magma_hound'], molten_forge: ['forge_golem', 'flame_acolyte'],
  ashen_steppe: ['steppe_raider', 'dust_hyena'], howling_barrow: ['barrow_wight', 'grave_hound'], blighted_marsh: ['bog_lurker', 'swamp_leech'], spore_hollow: ['sporeling', 'fungal_brute'],
  frostspire: ['frost_wolf', 'ice_troll'], rime_caverns: ['ice_elemental', 'crystal_spider'], ember_wastes: ['ash_wraith', 'cinder_knight'], ashen_throne: ['throne_guard', 'ash_priest'],
};
const NPC_ZONE = {
  elder_maren: 'emberhollow', smith_brom: 'emberhollow', warden_ilsa: 'ashwood', herbalist_oona: 'ashwood', trader_vesk: 'ashwood', commander_hale: 'cinder_peaks', seer_ysolde: 'cinder_peaks', quartermaster_dunn: 'cinder_peaks',
  captain_varra: 'ashen_steppe', stablemaster_orla: 'ashen_steppe', nomad_kesh: 'ashen_steppe', trader_imra: 'ashen_steppe', warden_thane: 'blighted_marsh', alchemist_brisa: 'blighted_marsh', trader_moll: 'blighted_marsh',
  jarl_eskil: 'frostspire', hunter_sigrun: 'frostspire', trader_fenn: 'frostspire', marshal_corvane: 'ember_wastes', pilgrim_aldo: 'ember_wastes', quartermaster_ryn: 'ember_wastes',
};

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// until: Quest-ID, nach deren Abgabe die Simulation endet (z. B. 'q_ignaroth' für den Teil bis 20)
export function runCampaign({ trash = 2, sideQuests = true, until = null, log = null, seed = 7 } = {}) {
  const bus = new EventBus(), content = new Content();
  const state = new GameState(bus, new LocalAuthority(content), content);
  state.defineSlice('world', { create: () => ({ zoneId: 'emberhollow', bossesDefeated: [] }) });
  state.defineSlice('character', { create: () => ({ name: 'Sim', classId: 'mage' }) });
  registerProgressionContent(content);
  registerProgressionState(state, { rng: () => 0.5 });
  setWorldFeatures(['escort', 'defend']);
  const rng = mulberry(seed);
  const c = (t, p) => state.commit(t, p);
  const P = () => state.slices.progress;
  let kills = 0, killXp = 0, questXp = 0, quests = 0, bounties = 0, seconds = 0, lootGold = 0, questGold = 0;
  const levelAt = { 1: 0 };          // Sekunden, zu denen eine Stufe erreicht wurde
  const goldAt = { 1: 0 };
  const stamp = () => { const l = P().level; if (levelAt[l] == null) { levelAt[l] = seconds; goldAt[l] = lootGold + questGold; } };
  const kill = (type) => {
    const level = ENEMY_LEVELS[type] ?? P().level;
    const r = c('progress:kill', { type, level, elite: ELITE.has(type), isBoss: BOSS.has(type), bossId: BOSS.has(type) ? type : undefined });
    kills++; killXp += r.xp; seconds += SEC_PER_KILL;
    for (const d of rollLoot({ type, level, elite: ELITE.has(type), boss: BOSS.has(type), bossId: type }, { rng })) {
      if (d.gold) lootGold += d.gold;
      else if (ITEMS[d.itemId]?.type !== 'quest') lootGold += (ITEMS[d.itemId]?.value ?? 0) * d.qty;
    }
    stamp();
  };
  const milestones = {};
  const play = (q) => {
    c('quest:accept', { questId: q.id });
    for (const o of q.objectives) {
      const zone = o.zone ?? NPC_ZONE[q.giver];
      state.slices.world.zoneId = zone;
      const targets = [].concat(o.target);
      for (let i = 0; i < o.count; i++) {
        if (o.kind === 'kill') { kill(targets[i % targets.length]); for (let t = 0; t < trash && !ELITE.has(targets[0]); t++) kill(TRASH[zone]?.[i % 2] ?? targets[0]); }
        else if (o.kind === 'boss') { kill(o.target); c('quest:event', { kind: 'boss', target: o.target }); }
        else if (o.kind === 'collect') {
          const from = o.from ?? [];
          if (!BOSS.has(from[0]) && !ELITE.has(from[0])) for (let k = 0; k < 2; k++) kill(from[k % Math.max(1, from.length)] ?? TRASH[zone][0]);
          c('inventory:add', { itemId: o.target, qty: 1 });
        } else if (o.kind === 'interact') { c('quest:event', { kind: 'interact', target: targets[i] ?? targets[0] }); kill(TRASH[zone]?.[0] ?? 'wolf'); }
        else if (o.kind === 'reach') { c('quest:event', { kind: 'reach', target: targets[i] ?? targets[0] }); for (let k = 0; k < 4; k++) kill(TRASH[zone]?.[k % 2] ?? 'wolf'); }
        else if (o.kind === 'talk') c('quest:event', { kind: 'talk', target: o.target });
        // Questvielfalt: Rätsel/Benutzen wie Objekte (mit etwas Kampf am Weg), Eskorte/Verteidigen mit Wellen
        else if (o.kind === 'sequence' || o.kind === 'use') { c('quest:event', { kind: 'interact', target: targets[i] }); kill(TRASH[zone]?.[i % 2] ?? 'wolf'); }
        else if (o.kind === 'escort' || o.kind === 'defend') { c('quest:event', { kind: o.kind, target: o.target }); for (let k = 0; k < 8; k++) kill(TRASH[zone]?.[k % 2] ?? 'wolf'); }
      }
    }
    const xp0 = P().xp, g0 = state.slices.wallet.gold;
    const r = c('quest:turnIn', { questId: q.id, choice: q.choices?.[0]?.id ?? null });
    if (!r.ok) throw new Error(`Abgabe fehlgeschlagen: ${q.id} (${r.reason})`);
    questXp += P().xp - xp0; questGold += state.slices.wallet.gold - g0;
    seconds += SEC_PER_QUEST; quests++;
    stamp();
  };

  for (let guard = 0; guard < 2000 && P().level < 40; guard++) {
    const avail = content.all('quest').filter((q) => (sideQuests || q.main || q.id === 'q_first_ride') && questStatus(state, content, q.id) === 'available');
    const next = avail.filter((q) => !q.repeatable).sort((a, b) => a.level - b.level || (b.main ? 1 : 0) - (a.main ? 1 : 0))[0];
    if (!next) {
      if (P().level < 20) break;
      // Geschichte zu Ende, aber noch nicht 40: Kopfgeld der höchsten Region
      const b = avail.filter((q) => q.repeatable).sort((x, y) => y.level - x.level)[0];
      if (!b) break;
      play(b); bounties++; continue;
    }
    if (P().level >= 20 && next.level > P().level + GAP) {
      const b = avail.filter((q) => q.repeatable && q.level <= P().level + GAP).sort((x, y) => y.level - x.level)[0];
      if (b) { play(b); bounties++; continue; }
    }
    play(next);
    milestones[next.id] = P().level;
    log?.(`${next.id.padEnd(22)} Q${String(next.level).padStart(2)}  Stufe ${P().level}  ${(seconds / 60).toFixed(0).padStart(4)} min`);
    if (until && next.id === until) break;
  }
  const minutesPerLevel = {};
  for (let l = 20; l < 40; l++) if (levelAt[l] != null && levelAt[l + 1] != null) minutesPerLevel[l] = (levelAt[l + 1] - levelAt[l]) / 60;
  return {
    milestones, level: P().level, kills, killXp, questXp, questShare: questXp / (questXp + killXp), quests, bounties,
    minutes: seconds / 60, levelAt, goldAt, minutesPerLevel, lootGold, questGold,
  };
}

// Anteile und Gold nur für den Abschnitt ab Stufe 20 (zweiter Lauf bis q_ignaroth zum Abziehen)
export function expansionReport(opts = {}) {
  const full = runCampaign(opts);
  const base = runCampaign({ ...opts, until: 'q_ignaroth' });
  const hours = (from, to) => ((full.levelAt[to] ?? NaN) - (full.levelAt[from] ?? NaN)) / 3600;
  const gold = (from, to) => (full.goldAt[to] ?? NaN) - (full.goldAt[from] ?? NaN);
  return {
    full, base,
    hours20to40: hours(20, 40),
    questShare: (full.questXp - base.questXp) / ((full.questXp - base.questXp) + (full.killXp - base.killXp)),
    goldPerHour25to35: gold(25, 35) / hours(25, 35),
    gold20to40: gold(20, 40),
    goldAt: (l) => full.goldAt[l] - full.goldAt[20],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = runCampaign({ log: console.log });
  const x = expansionReport();
  console.log(`\nStufe 1–20: ${x.base.minutes.toFixed(0)} min, ${x.base.kills} Kills, Quest-Anteil ${(x.base.questShare * 100).toFixed(0)} %`);
  console.log(`Stufe 20–40: ${x.hours20to40.toFixed(1)} h, Quest-Anteil ${(x.questShare * 100).toFixed(0)} %, ${r.bounties} Kopfgelder, ${r.kills - x.base.kills} Kills`);
  console.log('Minuten je Stufe: ' + Object.entries(r.minutesPerLevel).map(([l, m]) => `${l}:${m.toFixed(0)}`).join(' '));
  console.log(`Gold 20→40: ${Math.round(x.gold20to40)} (Beute komplett verkauft), 25–35: ${Math.round(x.goldPerHour25to35)} Gold/h, bis 30: ${Math.round(x.goldAt(30))}, bis 38: ${Math.round(x.goldAt(38))}`);
}
