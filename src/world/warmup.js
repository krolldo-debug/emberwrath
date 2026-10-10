import { Outdoor } from './Outdoor.js';
import { LEVELS } from './levels.js';
import { LEVELS2 } from './levels2.js';
import { LEVELS3 } from './levels3.js';
import { ENEMY_TYPES } from '../entities/enemyTypes.js';

// Zone vorbereiten, bevor man sie betritt: Während der Spieler seinen Helden erstellt oder auswählt,
// entstehen Karte, Grafiken der Zone und der Boden rund um den Ankunftsort in kleinen Häppchen.
// „Abenteuer beginnen“ friert danach nicht mehr mehrere Sekunden ein (Messung 10.10.: Handy 6 s, PC 1,6 s).
// Rein vorbereitend: Was nicht fertig wird, baut World beim Betreten wie bisher selbst.
//
//   warmZone(game, zoneId, { spawnId, pos })  Vorbereitung starten (ersetzt eine laufende)
//   takePrebuilt(level)                       World übernimmt die vorbereitete Außenkarte (einmalig)

const SLICE_MS = 8;      // Arbeit je Häppchen
const QUIET_MS = 500;    // nach Tippen/Klicken so lange Ruhe, damit die Oberfläche flüssig bleibt

let job = null;          // { gen, timer, game }
let prebuilt = null;     // { level, dungeon }
let warmed = null;       // Kennung der zuletzt angestoßenen Vorbereitung (Zone + Ankunftsort)
let lastInput = 0;
let listening = false;

const levelFor = (id) => LEVELS[id] ?? LEVELS2[id] ?? LEVELS3[id] ?? null;

export function takePrebuilt(level) {
  if (job && prebuilt?.level === level) stop();
  const d = prebuilt?.level === level ? prebuilt.dungeon : null;
  prebuilt = null; warmed = null;
  return d;
}

export function warmZone(game, zoneId, { spawnId = 'start', pos = null } = {}) {
  const key = `${zoneId}|${spawnId}|${pos ? `${Math.round(pos.x)},${Math.round(pos.y)}` : ''}`;
  if (warmed === key) return; // läuft schon oder ist fertig
  stop();
  warmed = key;
  const zone = game.content.find('zone', zoneId);
  if (!zone) return;
  if (!listening) {
    listening = true;
    const mark = () => { lastInput = performance.now(); };
    window.addEventListener('pointerdown', mark, true);
    window.addEventListener('keydown', mark, true);
  }
  job = { game, gen: tasks(game, zone, spawnId, pos), timer: 0 };
  schedule(300);
}

function stop() {
  if (job?.timer) clearTimeout(job.timer);
  job = null;
}

function schedule(ms) { if (job) job.timer = setTimeout(pump, ms); }

function pump() {
  if (!job) return;
  // Im Spiel übernimmt World; die Vorbereitung endet spätestens hier.
  if (job.game.scenes.currentId === 'play') { stop(); warmed = null; return; }
  if (performance.now() - lastInput < QUIET_MS) { schedule(150); return; }
  const t = performance.now();
  try {
    while (performance.now() - t < SLICE_MS) if (job.gen.next().done) { stop(); return; }
  } catch (e) {
    console.warn('warmup', e);
    stop(); prebuilt = null; warmed = null; return;
  }
  schedule(16);
}

function* tasks(game, zone, spawnId, pos) {
  const { assets } = game;
  const level = levelFor(zone.level);
  if (!level) return;
  yield;
  const outdoor = level.kind === 'outdoor';
  // Grafiken der Zone (jeder Zugriff baut einen Satz; danach liegt er fertig im Speicher)
  const enemyTypes = zone.enemies ?? Object.values(level.enemies ?? {}).map((e) => e.type);
  const keys = new Set([
    outdoor ? 'outdoor' : null, 'crypt', 'npcs', level.decorSet,
    level.biome ? `biome_${level.biome}` : null,
    level.waystone ? 'waystone' : null,
    ...(level.objects ?? []).map((o) => o.set),
    ...enemyTypes.map((t) => ENEMY_TYPES[t]?.sprites ?? t),
  ]);
  void assets.props;
  yield;
  for (const k of keys) {
    if (!k || !(k in assets.sprites)) continue;
    void assets.sprites[k];
    yield;
  }
  if (!outdoor) return;
  // Boden rund um den Ankunftsort
  const dungeon = new Outdoor(level);
  prebuilt = { level, dungeon };
  yield;
  const at = (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) ? pos
    : dungeon.spawns[spawnId] ?? dungeon.spawns.start ?? dungeon.heroStart;
  yield* dungeon.prewarm(assets, at.x, at.y);
}

// Zone eines Spielstands vorbereiten (ohne Spielstand: Startzone wie bei einem neuen Helden).
export function warmCharacter(game, snap = null) {
  const w = snap?.slices?.world;
  let zoneId = w?.zoneId, spawnId = w?.spawnId ?? 'start', pos = w?.pos ?? null;
  if (!zoneId || !game.content.find('zone', zoneId)) {
    zoneId = game.content.all('zone').find((z) => z.start)?.id;
    spawnId = 'start'; pos = null;
  }
  if (zoneId) warmZone(game, zoneId, { spawnId, pos });
}
