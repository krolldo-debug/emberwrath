// Tempo-Simulation (Thread C): spielt die Kampagne mit den echten Commands durch.
//   node src/progression/test/pacing.mjs
// Annahmen: Gegnerstufen wie ENEMY_LEVELS (Richtwerte für Thread B), zusätzlich zu den Questzielen
// fallen je Questziel-Kill `trash` (2) weitere Gegner der Zone (Weg, Rudel, Nachzügler). Keine Kopfgelder.
import { EventBus } from '../../core/EventBus.js';
import { Content } from '../../core/Content.js';
import { GameState } from '../../core/GameState.js';
import { LocalAuthority } from '../../core/Authority.js';
import { registerProgressionContent, registerProgressionState } from '../logic.js';
import { questStatus } from '../selectors.js';

export const ENEMY_LEVELS = {
  // Durchschnitt der echten Weltdaten (Thread B, Stand 2026-09-30)
  wolf: 1, wolf_alpha: 3, skeleton: 4, archer: 3, spider: 5, bonelord: 6,
  ash_boar: 6, bandit: 8, bandit_archer: 8, thorn_crawler: 8, bandit_chief: 10,
  drowned: 10, tide_cultist: 11, temple_guardian: 11, drowned_priestess: 12,
  fire_imp: 13, magma_hound: 14, ash_golem: 15, cinder_cultist: 14, magma_behemoth: 16,
  forge_golem: 18, flame_acolyte: 18, ember_drake: 19, forge_warden: 19, ember_tyrant: 20,
};
const ELITE = new Set(['wolf_alpha', 'bandit_chief', 'magma_behemoth', 'forge_warden']);
const BOSS = new Set(['bonelord', 'drowned_priestess', 'ember_tyrant']);
const TRASH = { emberhollow: ['wolf'], catacombs: ['skeleton', 'archer'], ashwood: ['bandit', 'ash_boar'], sunken_temple: ['drowned', 'tide_cultist'], cinder_peaks: ['fire_imp', 'magma_hound'], molten_forge: ['forge_golem', 'flame_acolyte'] };
const NPC_ZONE = { elder_maren: 'emberhollow', smith_brom: 'emberhollow', warden_ilsa: 'ashwood', herbalist_oona: 'ashwood', trader_vesk: 'ashwood', commander_hale: 'cinder_peaks', seer_ysolde: 'cinder_peaks', quartermaster_dunn: 'cinder_peaks' };

export function runCampaign({ trash = 2, sideQuests = true, log = null } = {}) {
  const bus = new EventBus(), content = new Content();
  const state = new GameState(bus, new LocalAuthority(content), content);
  state.defineSlice('world', { create: () => ({ zoneId: 'emberhollow', bossesDefeated: [] }) });
  state.defineSlice('character', { create: () => ({ name: 'Sim', classId: 'mage' }) });
  registerProgressionContent(content);
  registerProgressionState(state, { rng: () => 0.5 });
  const c = (t, p) => state.commit(t, p);
  let kills = 0, killXp = 0, questXp = 0;
  const kill = (type) => {
    const r = c('progress:kill', { type, level: ENEMY_LEVELS[type] ?? state.slices.progress.level, elite: ELITE.has(type), isBoss: BOSS.has(type), bossId: BOSS.has(type) ? type : undefined });
    kills++; killXp += r.xp;
  };
  const milestones = {};
  const P = () => state.slices.progress;

  for (let guard = 0; guard < 200; guard++) {
    const next = content.all('quest')
      .filter((q) => !q.repeatable && (sideQuests || q.main) && questStatus(state, content, q.id) === 'available')
      .sort((a, b) => a.level - b.level || (b.main ? 1 : 0) - (a.main ? 1 : 0))[0];
    if (!next) break;
    c('quest:accept', { questId: next.id });
    for (const o of next.objectives) {
      const zone = o.zone ?? NPC_ZONE[next.giver];
      state.slices.world.zoneId = zone;
      const targets = [].concat(o.target);
      for (let i = 0; i < o.count; i++) {
        if (o.kind === 'kill') { kill(targets[i % targets.length]); for (let t = 0; t < trash && !ELITE.has(targets[0]); t++) kill(TRASH[zone]?.[i % 2] ?? targets[0]); }
        else if (o.kind === 'boss') { kill(o.target); c('quest:event', { kind: 'boss', target: o.target }); }
        else if (o.kind === 'collect') {
          const from = o.from ?? [];
          if (!BOSS.has(from[0])) for (let k = 0; k < 2; k++) kill(from[k % Math.max(1, from.length)] ?? TRASH[zone][0]);
          c('inventory:add', { itemId: o.target, qty: 1 });
        } else if (o.kind === 'interact') { c('quest:event', { kind: 'interact', target: targets[i] ?? targets[0] }); kill(TRASH[zone]?.[0] ?? 'wolf'); }
        else if (o.kind === 'reach') { c('quest:event', { kind: 'reach', target: targets[0] }); for (let k = 0; k < 4; k++) kill(TRASH[zone]?.[k % 2] ?? 'wolf'); }
        else if (o.kind === 'talk') c('quest:event', { kind: 'talk', target: o.target });
      }
    }
    const xp0 = P().xp;
    const r = c('quest:turnIn', { questId: next.id });
    if (!r.ok) throw new Error(`Abgabe fehlgeschlagen: ${next.id} (${r.reason})`);
    questXp += P().xp - xp0;
    milestones[next.id] = P().level;
    log?.(`${next.id.padEnd(20)} Q${String(next.level).padStart(2)}  Stufe ${P().level}`);
  }
  return { milestones, level: P().level, kills, killXp, questXp, questShare: questXp / (questXp + killXp) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = runCampaign({ log: console.log });
  console.log(`\nEndstufe ${r.level}, ${r.kills} Kills, Quest-Anteil ${(r.questShare * 100).toFixed(0)} %`);
  const m = runCampaign({ sideQuests: false });
  console.log(`Nur Hauptquests: Endstufe ${m.level} (Rest über Kopfgelder und Nebenquests)`);
}
