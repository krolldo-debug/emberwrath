import { KLANG } from './klangListe.js';

// Echte Klänge (ElevenLabs, erzeugt mit tools/klang/): ersetzen einzelne prozedurale Effekte aus Sfx.js.
// Die Dateien laden erst nach dem ersten Ton im Hintergrund nach (Effekte, dann Bosse, dann NPC-Laute),
// damit der Spielstart nicht wartet. Fehlt eine Datei oder ist sie noch nicht da, klingt der
// prozedurale Effekt wie bisher.
const MAX_VOICES = 4;   // höchstens so viele gleichzeitige Wiedergaben je Klang
const MIN_GAP = 0.03;   // Sekunden zwischen zwei Starts desselben Klangs
const GREET_GAP = 25;   // Sekunden, bevor derselbe NPC wieder grüßt

function baseUrl() {
  // Website: Dateien liegen neben dem Spiel-Skript (/spielen/klang/), Entwicklung: im Quellordner
  if (globalThis.EMBERWRATH_BUILD) return new URL('klang/', globalThis.EMBERWRATH_I18N_BASE ?? location.href);
  return new URL('src/audio/klang/', location.href);
}

export class Samples {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.out = out;
    this.buffers = new Map();  // Dateiname -> AudioBuffer
    this.voices = new Map();   // Klangname -> { n, last }
    this.greeted = new Map();  // NPC -> Zeitpunkt
    this.base = baseUrl();
  }

  // Lädt alle Dateien nacheinander, wichtige zuerst; Fehler bleiben still (prozeduraler Klang bleibt).
  async preload() {
    const order = { fx: 0, boss: 1, greet: 2 };
    const files = Object.values(KLANG).sort((a, b) => order[a.group] - order[b.group]).flatMap((k) => k.files);
    for (const f of files) {
      if (this.buffers.has(f)) continue;
      try {
        const res = await fetch(new URL(f, this.base));
        if (!res.ok) continue;
        this.buffers.set(f, await this.ctx.decodeAudioData(await res.arrayBuffer()));
      } catch { /* Datei fehlt oder Gerät kann sie nicht lesen */ }
    }
  }

  // Spielt den echten Klang, wenn vorhanden; false = Sfx.js nimmt den prozeduralen.
  play(name, opts = {}, t = this.ctx.currentTime) {
    let key = name;
    if (name === 'bossRoar' && KLANG[`bossRoar_${opts.boss}`]) key = `bossRoar_${opts.boss}`;
    if (name === 'dialog' && opts.npc) {
      key = `greet_${opts.npc}`;
      if (!KLANG[key]) return false;
      const last = this.greeted.get(opts.npc);
      if (last !== undefined && t - last < GREET_GAP) return false;
    }
    const k = KLANG[key];
    if (!k) return false;
    const ready = k.files.filter((f) => this.buffers.has(f));
    if (!ready.length) return false;
    const v = this.voices.get(key) ?? { n: 0, last: -1 };
    if (v.n >= MAX_VOICES || t - v.last < MIN_GAP) return true;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers.get(ready[Math.floor(Math.random() * ready.length)]);
    if (k.vary) src.playbackRate.value = Math.max(0.8, Math.min(1.2, opts.pitch ?? (0.94 + Math.random() * 0.12)));
    const g = this.ctx.createGain();
    g.gain.value = k.gain;
    src.connect(g).connect(this.out);
    v.n++; v.last = t;
    this.voices.set(key, v);
    src.onended = () => { v.n--; g.disconnect(); };
    src.start(t);
    if (k.group === 'greet') this.greeted.set(opts.npc, t);
    return true;
  }
}
