import { FINDER_CONFIG } from './config.js';

// Gegner in Dungeon-Instanzen sind auf drei Personen ausgelegt – mit Gruppe aus der Dungeonsuche ebenso wie allein
// durchs Portal (Nutzerwunsch 10.10.). Glutprüfungen haben eigene Stufen und bleiben außen vor, ebenso die Glutarena
// (dort kämpfen alle mit denselben Arena-Werten, src/pvp/arenaStats.js).
export function isGroupDungeon(zone) { return !!zone?.instanced && zone.kind === 'dungeon' && !zone.trial && !zone.pvp; }

// Einmal je Gegner, solange er unverletzt ist; Beschworene (Diener der Bosse) bleiben wie sie sind.
export function scaleForGroup(e, world) {
  if (e.groupScaled || e.summoned || e.hp !== e.maxHp) return false;
  e.groupScaled = true;
  const boss = e === world.boss || !!e.def?.boss;
  const id = e.def?.bossId ?? e.bossId;
  const k = boss ? FINDER_CONFIG.bossHpScaleById?.[id] ?? FINDER_CONFIG.bossHpScale : FINDER_CONFIG.hpScale;
  e.maxHp = Math.round(e.maxHp * k); e.hp = e.maxHp;
  if (boss) e.groupDmgMult = FINDER_CONFIG.bossDmgScaleById?.[id] ?? 1;
  else if (e.lvlPower) { e.dmgMul *= FINDER_CONFIG.dmgScale ?? 1; e.power = e.lvlPower * e.dmgMul; }
  return true;
}

// Erster Dungeon allein (ohne Gruppe/Söldner): Gegner ohne Gruppenfaktor, Boss mit eigenen Werten (FINDER_CONFIG.solo),
// damit neue Spieler ihn in wenigen Minuten schaffen. Mit Gruppe gilt weiter scaleForGroup.
export function scaleForSolo(e, world, cfg) {
  if (e.groupScaled || e.summoned || e.hp !== e.maxHp) return false;
  e.groupScaled = true;
  if (e !== world.boss && !e.def?.boss) return true;
  e.maxHp = Math.round(e.maxHp * (cfg.bossHp ?? 1)); e.hp = e.maxHp;
  e.groupDmgMult = cfg.bossDmg ?? 1;
  if (cfg.furyStart) e.furyStart = cfg.furyStart;
  return true;
}
