import { EV } from '../core/events.js';
import { themeForZone, themeForBoss } from './Music.js';

// Klangbild je Zone (Thread D): wählt Musikstück und Atmo-Mischung passend zur
// Zone, wechselt beim Bosskampf (eigenes Stück je Boss, themeForBoss) und in der Glutprüfung auf eigene Stücke und
// danach zurück. Session-System, liest nur Zonendaten und Events.
const ZONE_AMB = { emberhollow: 'outdoor', ashwood: 'forest', sunken_temple: 'water', cinder_peaks: 'fire', molten_forge: 'fire', ember_trial: 'fire',
  // Stufe 20–40 (§12.2)
  ashen_steppe: 'wind', howling_barrow: 'dungeon', blighted_marsh: 'marsh', spore_hollow: 'water', frostspire: 'wind', rime_caverns: 'water', ember_wastes: 'fire', ashen_throne: 'fire' };

export function ambienceForZone(def) {
  if (!def) return 'outdoor';
  return def.ambience ?? ZONE_AMB[def.id] ?? (def.kind === 'dungeon' || def.instanced ? 'dungeon' : 'outdoor');
}

export class Soundscape {
  constructor(session, music) {
    this.s = session;
    this.music = music;
    this.boss = false;
    this.trial = false;
    const bus = session.bus;
    const offs = [
      bus.on(EV.ZONE_ENTER, () => { this.boss = false; this.trial = false; this.#apply(); }),
      bus.on(EV.BOSS_ENGAGED, (e) => { this.boss = true; this.bossId = e?.bossId ?? null; this.#apply(); }),
      bus.on(EV.BOSS_DEFEATED, () => { this.boss = false; this.#apply(); }),
      bus.on(EV.PLAYER_DIED, () => { this.boss = false; this.#apply(); }),
      bus.on(EV.TRIAL_STARTED, () => { this.trial = true; this.#apply(); }),
      bus.on(EV.TRIAL_BOSS, () => { this.boss = true; this.bossId = null; this.#apply(); }),
      bus.on(EV.TRIAL_COMPLETED, () => { this.trial = false; this.boss = false; this.#apply(); }),
      bus.on(EV.TRIAL_FAILED, () => { this.trial = false; this.boss = false; this.#apply(); }),
    ];
    this.offs = offs.filter((f) => typeof f === 'function');
    this.#apply();
  }

  #zoneDef() {
    const z = this.s.zone;
    if (!z) return null;
    return { ...(z.def ?? {}), id: z.def?.id ?? z.zoneId };
  }

  #apply() {
    const def = this.#zoneDef();
    this.s.game.sfx.setAmbience?.(ambienceForZone(def));
    this.music.play(this.boss ? themeForBoss(this.bossId) : this.trial ? 'trial' : themeForZone(def));
  }

  update() { this.music.update(); }

  dispose() {
    for (const off of this.offs) off();
    this.music.stop();
  }
}
