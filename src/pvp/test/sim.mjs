// Grobe Kampfdauer-Rechnung für die Glutarena (node src/pvp/test/sim.mjs).
// Rechnet je Klasse den Schaden je Sekunde, der im Duell ankommt: Grundangriff und Fähigkeiten mit Abklingzeit,
// Krit, Rüstung des Gegners, PVP_DAMAGE, höchstens ein Treffer je 0,6 s (Unverwundbarkeit nach Treffer) und eine
// Trefferquote für Ausweichen und Verfehlen. Ergebnis: Kampfdauer je Paarung (Ziel 25–45 s) und Spitzenwerte für
// das Schadensbudget des Servers (worker/pvp/hub.js BUDGET, Vielfache von power × PVP_DAMAGE).
import { CLASSES, ABILITIES } from '../../character/classes.js';
import { arenaStats, maxHitMult } from '../arenaStats.js';
import { PVP_DAMAGE, PVP_CLASS } from '../rules.js';

// Anteil der Angriffe, die im Duell treffen (geschätzt): Nahkampf trifft, wenn er dran ist; Glutbolzen und Meteor
// sind langsam und gut sichtbar, Pfeile liegen dazwischen
const LAND = {
  warrior: { basic: 0.55, ability: 0.5 }, rogue: { basic: 0.6, ability: 0.5 },
  ranger: { basic: 0.45, ability: 0.4 }, mage: { basic: 0.35, ability: 0.35 },
};
const TARGET_S = Number(process.argv[2] ?? 32);
const INVULN = 0.6;
const ids = Object.keys(CLASSES);

function profile(classId) {
  const st = arenaStats(classId, 'human');
  const b = CLASSES[classId].basic;
  // Grundangriff: Kette der Hiebe; nach einem Treffer ist das Ziel 0,6 s unverwundbar (spätere Hiebe gehen ins Leere)
  let perHit, cadence;
  if (b.kind === 'melee') {
    const t = b.combo.map((c) => c.windup + c.active + c.recover * 0.6);
    let landed = 0, mult = 0, clock = 0, free = 0;
    b.combo.forEach((c, i) => { const at = clock + c.windup; if (at >= free) { landed++; mult += c.mult; free = at + INVULN; } clock += t[i]; });
    perHit = mult / landed; cadence = landed / clock;
  } else {
    perHit = b.shot.mult; cadence = 1 / (b.shot.windup + 0.04 + b.shot.recover);
  }
  const rate = Math.min(cadence, 1 / INVULN);
  const crit = 1 + 0.8 * Math.min(1, st.critChance);
  const basicDps = perHit * rate * crit * st.power * LAND[classId].basic;
  let abilityDps = 0, burst = 0;
  for (const id of CLASSES[classId].abilities) {
    const a = ABILITIES[id];
    if (!a?.mult) continue;
    const m = a.mult * st.abilityPower * (1 + (st.abilityMods?.[id] ?? 0));
    abilityDps += m * crit * st.power * LAND[classId].ability / (a.cooldown * (st.cooldownMult ?? 1));
    burst += m;
  }
  // Höchstwerte ohne Fehlschläge (Budget des Servers): Dauerschaden je Sekunde und alles auf einmal, × power
  const sustain = perHit * rate * 1.12 + CLASSES[classId].abilities.reduce((x, id) => x + (ABILITIES[id]?.mult ? ABILITIES[id].mult * st.abilityPower * (1 + (st.abilityMods?.[id] ?? 0)) * 1.12 / (ABILITIES[id].cooldown * (st.cooldownMult ?? 1)) : 0), 0);
  return { st, sustain, raw: basicDps + abilityDps, dps: (basicDps + abilityDps) * PVP_DAMAGE * (PVP_CLASS[classId] ?? 1), peak: (perHit + maxHitMult(st)) , burst: burst + perHit * 2 };
}

const P = Object.fromEntries(ids.map((c) => [c, profile(c)]));
console.log(`PVP_DAMAGE ${PVP_DAMAGE}`);
for (const c of ids) console.log(c.padEnd(8), 'hp', P[c].st.maxHp, 'power', P[c].st.power, 'DR', P[c].st.damageReduction.toFixed(2), 'dps', P[c].dps.toFixed(1), 'burst×', P[c].burst.toFixed(1));
let sum = 0, n = 0;
console.log('\nKampfdauer in s (Zeile greift an, Spalte verteidigt), Mittel beider Richtungen');
console.log(''.padEnd(9) + ids.map((c) => c.padStart(8)).join(''));
for (const a of ids) {
  const row = ids.map((d) => {
    const ttk = (x, y) => P[y].st.maxHp / (P[x].dps * (1 - P[y].st.damageReduction));
    const t = (ttk(a, d) + ttk(d, a)) / 2;
    sum += t; n++;
    return t.toFixed(0).padStart(8);
  });
  console.log(a.padEnd(9) + row.join(''));
}
console.log(`\nMittel ${(sum / n).toFixed(1)} s`);

// Vorschlag: Klassenfaktoren, mit denen dps × effektives Leben für alle gleich ist, und PVP_DAMAGE für TARGET_S
const ehp = (c) => P[c].st.maxHp / (1 - P[c].st.damageReduction);
const score = Object.fromEntries(ids.map((c) => [c, P[c].raw * ehp(c)]));
const mean = ids.reduce((s, c) => s + score[c], 0) / ids.length;
const fac = Object.fromEntries(ids.map((c) => [c, Math.round((mean / score[c]) * 20) / 20]));
let tsum = 0, tn = 0;
for (const a of ids) for (const d of ids) { tsum += ehp(d) / (P[a].raw * fac[a]); tn++; }
for (const c of ids) console.log(`Budget ${c}: Vorrat ≥ ${(P[c].burst * 1.12 * (1 + (P[c].st.passives?.shadow_dance ? 0.6 : 0))).toFixed(1)}, je Sekunde ≥ ${P[c].sustain.toFixed(1)} (× power × pvpDamage)`);
console.log('Vorschlag PVP_CLASS', JSON.stringify(fac), 'PVP_DAMAGE', (tsum / tn / TARGET_S).toFixed(3));
