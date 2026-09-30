// Geräte-Einstellungen (nicht Teil des Spielstands): Questpfad, Ton, Bildschirmwackeln …
// Liegen in localStorage unter einem eigenen Schlüssel; ohne Speicher nur im Arbeitsspeicher.
import { EV } from './events.js';

const KEY = 'emberfall:v1:prefs';

export class Prefs {
  constructor(bus) {
    this.bus = bus;
    this.values = {};
    try {
      const raw = globalThis.localStorage?.getItem(KEY);
      if (raw) this.values = JSON.parse(raw) ?? {};
    } catch { this.values = {}; }
  }

  get(key, fallback) {
    return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : fallback;
  }

  set(key, value) {
    if (this.values[key] === value) return;
    this.values[key] = value;
    try { globalThis.localStorage?.setItem(KEY, JSON.stringify(this.values)); } catch { /* nur Arbeitsspeicher */ }
    this.bus.emit(EV.PREFS_CHANGED, { key, value });
  }
}
