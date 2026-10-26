// Prozedurale Musik über WebAudio (Thread D) – keine Audiodateien.
// Ein kleiner "Komponist": je Stück Tempo, Tonart, Akkordfolge und Stimmen
// (Fläche, Bass, Arpeggio, Melodie, Glocken, Trommeln). Noten werden kurz im
// Voraus auf der Audio-Uhr geplant (Lookahead), Stücke blenden weich über.
// Hall entsteht aus einer selbst erzeugten Impulsantwort.
//
// API: const m = new Music(sfx, prefs); m.play(themeId); m.update(dt); m.setVolume(v)
// Themen: THEMES[id]; Zonen wählen über themeForZone(zoneDef).

const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);
const SCALES = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  pentaMinor: [0, 3, 5, 7, 10],
  hijaz: [0, 1, 4, 5, 7, 8, 10],
};

// Akkorde als Stufen der Tonleiter (0 = Grundton). bars = Takte je Akkord.
export const THEMES = {
  // Glutsenke: nächtliches Dorf – Harfe, weiche Fläche, Flöte
  village: { bpm: 72, root: 50, scale: 'dorian', chords: [0, 3, 6, 4], bars: 2, pad: 'warm', arp: 'harp', arpEvery: 2, melody: 'flute', melodyDensity: 0.28, bass: [0], bells: 0.02, drums: null, gain: 0.5 },
  // Katakomben: Grabesstille – Dröhnen, Chor, einzelne Glocken
  crypt: { bpm: 56, root: 48, scale: 'phrygian', chords: [0, 1, 0, 5], bars: 4, pad: 'choir', arp: null, melody: 'bell', melodyDensity: 0.08, bass: [0], bells: 0.05, drums: null, gain: 0.55 },
  // Aschenwald: Laute, Flöte, leise Handtrommel
  forest: { bpm: 84, root: 45, scale: 'aeolian', chords: [0, 5, 2, 6], bars: 2, pad: 'warm', arp: 'lute', arpEvery: 2, melody: 'flute', melodyDensity: 0.3, bass: [0, 10], bells: 0.01, drums: { k: 'x.......x.......', h: '....x.......x...' }, drumGain: 0.35, gain: 0.5 },
  // Versunkener Tempel: glitzernd, schwebend
  temple: { bpm: 64, root: 52, scale: 'lydian', chords: [0, 1, 5, 4], bars: 4, pad: 'glass', arp: 'bell', arpEvery: 4, melody: 'bell', melodyDensity: 0.12, bass: [0], bells: 0.06, drums: null, gain: 0.5 },
  // Schlackenhöhen: schwer, Hörner, tiefe Trommeln
  peaks: { bpm: 90, root: 38, scale: 'harmonic', chords: [0, 5, 3, 4], bars: 2, pad: 'horn', arp: null, melody: 'horn', melodyDensity: 0.18, bass: [0, 6, 8], bells: 0, drums: { k: 'x.....x.x.......', h: '........x.......' }, drumGain: 0.55, gain: 0.5 },
  // Glutschmiede: Ambosse, dunkles Blech
  forge: { bpm: 100, root: 36, scale: 'harmonic', chords: [0, 1, 0, 6], bars: 2, pad: 'horn', arp: 'lute', arpEvery: 4, melody: 'horn', melodyDensity: 0.14, bass: [0, 3, 8, 11], bells: 0, drums: { k: 'x...x...x...x...', h: '..x...x...x...x.', a: '............x...' }, drumGain: 0.55, gain: 0.5 },
  // Bosskampf: treibend
  boss: { bpm: 138, root: 40, scale: 'harmonic', chords: [0, 0, 5, 4, 0, 0, 6, 4], bars: 1, pad: 'horn', arp: 'saw', arpEvery: 1, melody: 'horn', melodyDensity: 0.22, bass: [0, 3, 6, 8, 11, 14], bells: 0, drums: { k: 'x..x..x.x..x..x.', h: '....x.......x...', a: '..x...x...x...x.' }, drumGain: 0.7, gain: 0.55 },
  // Glutprüfung: gehetzt
  // ---- Stufe 20–40: eigene Stimmung je Gebiet
  steppe: { bpm: 76, root: 45, scale: 'pentaMinor', chords: [0, 3, 2, 0], chordsB: [0, 4, 3, 2], bars: 2, pad: 'drone', arp: 'pluck', arpEvery: 2, melody: 'flute', melodyDensity: 0.3, bass: [0, 8], bells: 0, drums: { f: 'x.....x...x.....', s: '..x...x...x...x.' }, drumGain: 0.4, intro: 2, gain: 0.5 },
  barrow: { bpm: 52, root: 43, scale: 'phrygian', chords: [0, 1, 0, 6], bars: 4, pad: 'choir', arp: null, melody: 'choir', melodyDensity: 0.1, motif: false, bass: [0], bells: 0.04, drums: { t: 'x...............' }, drumGain: 0.35, gain: 0.55 },
  marsh: { bpm: 66, root: 41, scale: 'aeolian', chords: [0, 5, 3, 4], chordsB: [0, 6, 5, 4], bars: 2, pad: 'murk', arp: 'pluck', arpEvery: 4, melody: 'reed', melodyDensity: 0.18, bass: [0, 7, 10], bells: 0, drums: { f: 'x.......x..x....' }, drumGain: 0.3, gain: 0.5 },
  spores: { bpm: 60, root: 50, scale: 'hijaz', chords: [0, 1, 3, 1], bars: 4, pad: 'glass', arp: 'celesta', arpEvery: 3, melody: 'bell', melodyDensity: 0.1, bass: [0], bells: 0.05, drums: null, wobble: 0.5, gain: 0.5 },
  frost: { bpm: 70, root: 47, scale: 'aeolian', chords: [0, 5, 2, 6], chordsB: [3, 0, 4, 4], bars: 2, pad: 'ice', arp: 'celesta', arpEvery: 2, melody: 'flute', melodyDensity: 0.22, bass: [0], bells: 0.06, drums: { t: 'x.........x.....' }, drumGain: 0.3, intro: 2, gain: 0.5 },
  rime: { bpm: 54, root: 44, scale: 'dorian', chords: [0, 3, 0, 6], bars: 4, pad: 'ice', arp: null, melody: 'celesta', melodyDensity: 0.12, motif: false, bass: [0], bells: 0.09, drums: null, gain: 0.55 },
  wastes: { bpm: 108, root: 38, scale: 'hijaz', chords: [0, 1, 0, 5], chordsB: [0, 6, 5, 1], bars: 2, pad: 'horn', arp: 'saw', arpEvery: 2, melody: 'horn', melodyDensity: 0.2, bass: [0, 3, 8, 10, 11], bells: 0, drums: { t: 'x.....x...x.....', n: '....x.......x...', a: '..............x.' }, drumGain: 0.6, intro: 1, gain: 0.5 },
  throne: { bpm: 80, root: 37, scale: 'harmonic', chords: [0, 5, 3, 4], chordsB: [0, 1, 5, 4], bars: 2, pad: 'organ', arp: 'saw', arpEvery: 4, melody: 'choir', melodyDensity: 0.2, bass: [0, 8], bells: 0.02, drums: { t: 'x.......x.......', n: '............x...' }, drumGain: 0.5, intro: 2, gain: 0.5 },
  // ---- eigene Bossmusik (Soundscape wählt nach bossId, sonst 'boss')
  boss_bones: { bpm: 128, root: 41, scale: 'phrygian', chords: [0, 1, 0, 6], bars: 1, pad: 'choir', arp: 'pluck', arpEvery: 1, melody: 'bell', melodyDensity: 0.2, bass: [0, 3, 6, 10], bells: 0.03, drums: { k: 'x...x...x...x...', n: '....x.......x...', s: 'x.x.x.x.x.x.x.x.' }, drumGain: 0.65, gain: 0.55 },
  boss_drowned: { bpm: 112, root: 43, scale: 'aeolian', chords: [0, 5, 3, 4], bars: 1, pad: 'murk', arp: 'harp', arpEvery: 1, melody: 'choir', melodyDensity: 0.2, bass: [0, 6, 8, 14], bells: 0.03, drums: { t: 'x.....x.x.......', n: '....x.......x...' }, drumGain: 0.6, gain: 0.55 },
  boss_barrow: { bpm: 120, root: 39, scale: 'phrygian', chords: [0, 1, 6, 1], bars: 1, pad: 'choir', arp: 'saw', arpEvery: 2, melody: 'choir', melodyDensity: 0.22, bass: [0, 3, 8, 11], bells: 0.04, drums: { t: 'x..x..x...x..x..', n: '....x.......x...' }, drumGain: 0.65, gain: 0.55 },
  boss_rot: { bpm: 104, root: 40, scale: 'hijaz', chords: [0, 1, 0, 3], bars: 1, pad: 'murk', arp: 'pluck', arpEvery: 1, melody: 'reed', melodyDensity: 0.24, bass: [0, 3, 6, 8, 11], bells: 0, drums: { t: 'x...x..x..x.x...', f: '..x.......x.....' }, drumGain: 0.6, wobble: 0.6, gain: 0.55 },
  boss_frost: { bpm: 132, root: 42, scale: 'aeolian', chords: [0, 5, 6, 4], bars: 1, pad: 'ice', arp: 'celesta', arpEvery: 1, melody: 'horn', melodyDensity: 0.2, bass: [0, 3, 6, 8, 11, 14], bells: 0.05, drums: { k: 'x..x..x.x..x..x.', n: '....x.......x...', s: '..x...x...x...x.' }, drumGain: 0.65, gain: 0.55 },
  boss_sovereign: { bpm: 140, root: 38, scale: 'harmonic', chords: [0, 0, 5, 4, 0, 1, 6, 4], bars: 1, pad: 'organ', arp: 'saw', arpEvery: 1, melody: 'choir', melodyDensity: 0.26, bass: [0, 3, 6, 8, 11, 14], bells: 0, drums: { k: 'x..x..x.x..x..x.', t: 'x.......x.......', n: '....x.......x...', a: '..x...x...x...x.' }, drumGain: 0.7, gain: 0.5 },
  trial: { bpm: 124, root: 43, scale: 'phrygian', chords: [0, 1, 0, 6], bars: 1, pad: 'horn', arp: 'saw', arpEvery: 2, melody: null, melodyDensity: 0, bass: [0, 4, 8, 12], bells: 0, drums: { k: 'x...x...x...x...', h: '..x...x...x...x.' }, drumGain: 0.6, gain: 0.5 },
};

// Zone -> Stück (feste IDs aus INTEGRATION.md §11, sonst nach Art der Zone)
const ZONE_THEMES = { emberhollow: 'village', catacombs: 'crypt', ashwood: 'forest', sunken_temple: 'temple', cinder_peaks: 'peaks', molten_forge: 'forge', ember_trial: 'trial',
  ashen_steppe: 'steppe', howling_barrow: 'barrow', blighted_marsh: 'marsh', spore_hollow: 'spores', frostspire: 'frost', rime_caverns: 'rime', ember_wastes: 'wastes', ashen_throne: 'throne' };
// Boss -> eigenes Stück (Varkhul behält das klassische 'boss')
const BOSS_THEMES = { bonelord: 'boss_bones', drowned_priestess: 'boss_drowned', barrow_king: 'boss_barrow', rot_mother: 'boss_rot', frost_wyrm: 'boss_frost', ash_sovereign: 'boss_sovereign' };
export function themeForBoss(bossId) { return BOSS_THEMES[bossId] ?? 'boss'; }
export function themeForZone(def) {
  if (!def) return 'village';
  return def.music ?? ZONE_THEMES[def.id] ?? (def.kind === 'dungeon' || def.instanced ? 'crypt' : 'village');
}

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

export class Music {
  constructor(sfx, prefs) {
    this.sfx = sfx; this.prefs = prefs;
    this.volume = Math.max(0, Math.min(1, Number(prefs?.get('musicVolume', 0.6)) || 0));
    this.bus = null;        // Musik-Bus -> Hall + trocken -> sfx.output
    this.current = null;    // { id, def, gain, step, next, rand, mel }
    this.old = [];
    this.wanted = null;
  }

  #init() {
    const c = this.sfx.ctx;
    this.bus = c.createGain(); this.bus.gain.value = this.volume * 1.7;
    const verb = c.createConvolver(); verb.buffer = this.#impulse(2.6);
    const wet = c.createGain(); wet.gain.value = 0.32;
    this.bus.connect(this.sfx.output);
    this.bus.connect(verb).connect(wet).connect(this.sfx.output);
    // leichtes Echo für Glocken/Harfe
    this.echo = c.createDelay(1); this.echo.delayTime.value = 0.36;
    const fb = c.createGain(); fb.gain.value = 0.28;
    const eg = c.createGain(); eg.gain.value = 0.25;
    this.echoIn = c.createGain();
    this.echoIn.connect(this.echo).connect(fb).connect(this.echo);
    this.echo.connect(eg).connect(this.bus);
  }

  #impulse(sec) {
    const c = this.sfx.ctx, len = Math.floor(c.sampleRate * sec);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    this.prefs?.set('musicVolume', this.volume);
    if (this.bus) this.bus.gain.setTargetAtTime(this.volume * 1.7, this.sfx.ctx.currentTime, 0.1);
  }

  play(id) { this.wanted = THEMES[id] ? id : null; }
  stop() { this.wanted = null; }

  update() {
    if (!this.sfx.ready) return;
    if (!this.bus) this.#init();
    const c = this.sfx.ctx, now = c.currentTime;
    if ((this.current?.id ?? null) !== this.wanted) this.#switch(now);
    const cur = this.current;
    if (!cur) return;
    const stepDur = 60 / cur.def.bpm / 4;
    if (cur.next < now) cur.next = now + 0.05; // nach Pause/Tab-Wechsel nicht nachholen
    while (cur.next < now + 0.3) {
      this.#step(cur, cur.step, cur.next, stepDur);
      cur.step++; cur.next += stepDur;
    }
  }

  #switch(now) {
    const c = this.sfx.ctx;
    if (this.current) {
      const g = this.current.gain;
      g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(0, now + 1.6);
      setTimeout(() => g.disconnect(), 2200);
    }
    if (!this.wanted) { this.current = null; return; }
    const def = THEMES[this.wanted];
    const gain = c.createGain(); gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(def.gain, now + 2.2);
    gain.connect(this.bus);
    this.current = { id: this.wanted, def, gain, step: 0, next: now + 0.1, rand: rng(Math.floor(Math.random() * 1e9)), mel: 0 };
  }

  // Tonhöhe: Stufe (auch negativ/über 7) in der Tonleiter -> MIDI
  #deg(def, d, oct = 0) {
    const sc = SCALES[def.scale];
    const o = Math.floor(d / sc.length);
    return def.root + sc[((d % sc.length) + sc.length) % sc.length] + 12 * (o + oct);
  }

  #step(cur, step, t, sd) {
    const d = cur.def, r = cur.rand;
    const barSteps = 16, chordSteps = barSteps * d.bars;
    const phraseSteps = chordSteps * d.chords.length;
    const phrase = Math.floor(step / phraseSteps);
    const inPhrase = step % phraseSteps;
    // Teil B: jede zweite Phrase eine andere Akkordfolge (falls vorhanden)
    const chords = d.chordsB && phrase % 2 === 1 ? d.chordsB : d.chords;
    const ci = Math.floor(inPhrase / chordSteps) % chords.length;
    const chord = chords[ci];
    const inChord = step % chordSteps;
    const inBar = step % barSteps;
    const bar = Math.floor(step / barSteps);
    const triad = [chord, chord + 2, chord + 4];
    // Fläche zu Akkordbeginn
    if (inChord === 0 && d.pad) for (const k of triad) this.#pad(cur, d.pad, NOTE(this.#deg(d, k, 1)), t, chordSteps * sd);
    // Bass
    if (d.bass.includes(inBar)) this.#bass(cur, NOTE(this.#deg(d, chord, -1)), t, sd * (d.bass.length > 2 ? 1.6 : 6));
    // Arpeggio
    if (d.arp && inBar % (d.arpEvery ?? 2) === 0) {
      const seq = [0, 1, 2, 1, 2, 3, 2, 1];
      const idx = seq[Math.floor(inBar / (d.arpEvery ?? 2)) % seq.length];
      const note = idx === 3 ? this.#deg(d, chord, 2) : this.#deg(d, triad[idx], 1);
      this.#voice(cur, d.arp, NOTE(note), t, sd * 3, 0.5);
    }
    // Melodie
    if (d.melody) {
      if (d.motif === false) this.#wander(cur, d, triad, inBar, t, sd);
      else this.#motif(cur, d, chord, phrase, inPhrase, inBar, t, sd);
    }
    // Glocken
    if (d.bells && r() < d.bells) this.#voice(cur, 'bell', NOTE(this.#deg(d, triad[Math.floor(r() * 3)], 3)), t, sd * 8, 0.35);
    // Trommeln (nach dem Auftakt; im letzten Takt der Phrase ein Wirbel)
    if (d.drums && bar >= (d.intro ?? 0)) {
      const g = d.drumGain ?? 0.5;
      const dr = d.drums;
      if (dr.k?.[inBar] === 'x') this.#kick(cur, t, g);
      if (dr.h?.[inBar] === 'x') this.#hit(cur, t, g * 0.7, 1800);
      if (dr.a?.[inBar] === 'x') this.#anvil(cur, t, g * 0.5);
      if (dr.t?.[inBar] === 'x') this.#taiko(cur, t, g);
      if (dr.f?.[inBar] === 'x') this.#frame(cur, t, g);
      if (dr.s?.[inBar] === 'x') this.#shaker(cur, t, g * (inBar % 4 === 0 ? 0.9 : 0.6));
      if (dr.n?.[inBar] === 'x') this.#snare(cur, t, g);
      if (inPhrase >= phraseSteps - barSteps && inBar >= 8 && inBar % 2 === 0 && phrase % 2 === 1) this.#snare(cur, t, g * (0.35 + (inBar - 8) * 0.06));
    }
  }

  // Frei schweifende Melodie (für schwebende Stücke ohne Thema)
  #wander(cur, d, triad, inBar, t, sd) {
    const r = cur.rand;
    if (inBar % 2 !== 0 || r() >= d.melodyDensity * (inBar % 4 === 0 ? 1.6 : 0.7)) return;
    cur.mel += Math.round((r() - 0.5) * 4);
    if (inBar % 8 === 0) cur.mel = triad[Math.floor(r() * 3)] + (cur.mel > 6 ? 7 : 0);
    cur.mel = Math.max(-2, Math.min(9, cur.mel));
    const len = sd * (r() < 0.3 ? 6 : r() < 0.6 ? 4 : 2);
    this.#voice(cur, d.melody, NOTE(this.#deg(d, cur.mel, 2)), t, len, 0.7);
  }

  // Thema: ein Takt langes Motiv, das wiederkehrt (Takt 1 und 3), in Takt 2 leicht
  // abgewandelt und in Takt 4 als Antwort auf dem Grundton endet. Alle zwei Phrasen neu.
  #motif(cur, d, chord, phrase, inPhrase, inBar, t, sd) {
    const r = cur.rand;
    if (!cur.motif || (inPhrase === 0 && phrase % 2 === 0 && phrase !== cur.motifPhrase)) {
      cur.motifPhrase = phrase;
      const notes = [];
      let deg = [0, 2, 4][Math.floor(r() * 3)];
      for (let pos = 0; pos < 16; pos += 2) {
        if (r() >= d.melodyDensity * (pos % 4 === 0 ? 2.4 : 1.1) && !(pos === 0)) continue;
        deg = Math.max(-1, Math.min(7, deg + Math.round((r() - 0.5) * 3.2)));
        const len = r() < 0.35 ? 4 : r() < 0.7 ? 2 : 6;
        notes.push([pos, deg, len]);
      }
      cur.motif = notes;
    }
    const b = Math.floor(inPhrase / 16) % 4;
    for (const [pos, deg, len] of cur.motif) {
      if (pos !== inBar) continue;
      let dd = deg;
      if (b === 1) dd += (pos * 7 + phrase) % 3 === 0 ? 1 : 0;
      if (b === 3) { if (pos >= 8) return; dd = pos >= 4 ? 0 : deg; }
      this.#voice(cur, d.melody, NOTE(this.#deg(d, chord + dd, 2)), t, sd * (b === 3 && pos >= 4 ? 8 : len), 0.7);
    }
  }

  // ---------------------------------------------------------------- Instrumente
  #env(g, t, a, hold, rel, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  }

  #osc(type, f, t, dur, det = 0) {
    const o = this.sfx.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = det;
    o.start(t); o.stop(t + dur + 0.1);
    return o;
  }

  #pad(cur, kind, f, t, dur) {
    const c = this.sfx.ctx;
    const g = c.createGain();
    const end = dur + 1.2;
    if (kind === 'organ') {
      // Orgel: Zugriegel 8' 4' 2 2/3' 2', leichtes Tremolo
      for (const [m, a] of [[1, 1], [2, 0.55], [3, 0.25], [4, 0.2]]) { const pg = c.createGain(); pg.gain.value = a; this.#osc('sine', f * m, t, end).connect(pg).connect(g); }
      const trem = c.createOscillator(); trem.frequency.value = 5.6; const tg = c.createGain(); tg.gain.value = 0.006;
      trem.connect(tg).connect(g.gain); trem.start(t); trem.stop(t + end + 0.1);
      g.connect(cur.gain);
      this.#env(g, t, Math.min(0.6, dur * 0.2), dur * 0.7, 1, 0.018);
      return;
    }
    if (kind === 'choir') {
      // Chor: Sägezahn durch zwei Formantfilter ("ah")
      const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 760; f1.Q.value = 6;
      const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1180; f2.Q.value = 7;
      const mix = c.createGain(); mix.gain.value = 2.4;
      for (const det of [-9, 0, 8]) { const o = this.#osc('sawtooth', f, t, end, det); o.connect(f1); o.connect(f2); }
      f1.connect(mix); f2.connect(mix); mix.connect(g).connect(cur.gain);
      this.#env(g, t, Math.min(1.4, dur * 0.35), dur * 0.55, 1.4, 0.03);
      return;
    }
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = kind === 'glass' ? 2400 : kind === 'ice' ? 3200 : kind === 'murk' ? 520 : kind === 'drone' ? 600 : kind === 'horn' ? 1100 : 1400;
    lp.Q.value = kind === 'murk' ? 3 : 0.8;
    const type = kind === 'glass' || kind === 'ice' ? 'triangle' : 'sawtooth';
    const peak = kind === 'horn' ? 0.028 : kind === 'glass' || kind === 'ice' ? 0.04 : kind === 'drone' ? 0.024 : 0.03;
    for (const det of [-7, 6]) this.#osc(type, kind === 'drone' ? f / 2 : f, t, end, det).connect(lp);
    if (kind === 'ice') {
      // Eis: hohes Flirren eine Oktave darüber, langsam auf- und zugehender Filter
      const sh = c.createGain(); sh.gain.value = 0.35; this.#osc('sine', f * 2, t, end, 3).connect(sh).connect(lp);
      lp.frequency.setValueAtTime(1400, t); lp.frequency.linearRampToValueAtTime(3600, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(1600, t + dur);
    }
    if (kind === 'murk' || cur.def.wobble) {
      // Sumpf/Sporen: Filter wabert
      const lfo = c.createOscillator(); lfo.frequency.value = 0.35 + (cur.def.wobble ?? 0) * 0.6; const lg = c.createGain(); lg.gain.value = lp.frequency.value * 0.45;
      lfo.connect(lg).connect(lp.frequency); lfo.start(t); lfo.stop(t + end + 0.1);
    }
    lp.connect(g).connect(cur.gain);
    this.#env(g, t, Math.min(1.2, dur * 0.3), dur * 0.6, 1.2, peak);
  }

  #bass(cur, f, t, dur) {
    const c = this.sfx.ctx;
    const g = c.createGain();
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    // Nicht unter C2 (65 Hz): tiefer bringt auf Handylautsprechern nichts und frisst nur Aussteuerung.
    while (f < 65) f *= 2;
    lp.frequency.value = 700;
    this.#osc('triangle', f, t, dur).connect(lp);
    const sq = c.createGain(); sq.gain.value = 0.35; // Obertöne, damit der Bass auch klein hörbar bleibt
    this.#osc('square', f, t, dur).connect(sq).connect(lp);
    lp.connect(g).connect(cur.gain);
    this.#env(g, t, 0.01, dur * 0.4, dur * 0.6, 0.09);
  }

  #voice(cur, kind, f, t, dur, vel) {
    const c = this.sfx.ctx;
    const g = c.createGain();
    let peak = 0.06 * vel, a = 0.005, hold = 0, rel = dur;
    switch (kind) {
      case 'harp': case 'lute': {
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(kind === 'harp' ? 3200 : 2200, t); lp.frequency.exponentialRampToValueAtTime(500, t + dur);
        this.#osc('triangle', f, t, dur).connect(lp);
        if (kind === 'lute') this.#osc('square', f, t, dur * 0.3).connect(lp);
        lp.connect(g); peak = (kind === 'lute' ? 0.05 : 0.07) * vel; rel = dur * 1.4;
        g.connect(this.echoIn);
        break;
      }
      case 'flute': {
        const o = this.#osc('sine', f, t, dur + 0.3);
        const vib = c.createOscillator(); vib.frequency.value = 5.2;
        const vg = c.createGain(); vg.gain.value = f * 0.008;
        vib.connect(vg).connect(o.frequency); vib.start(t + 0.15); vib.stop(t + dur + 0.4);
        o.connect(g); this.#osc('triangle', f * 2, t, dur + 0.3).connect(g);
        peak = 0.045 * vel; a = 0.08; hold = dur * 0.6; rel = 0.35;
        break;
      }
      case 'bell': {
        this.#osc('sine', f, t, dur).connect(g);
        const g2 = c.createGain(); g2.gain.value = 0.35;
        this.#osc('sine', f * 2.76, t, dur * 0.5).connect(g2).connect(g);
        peak = 0.05 * vel; rel = dur * 1.5;
        g.connect(this.echoIn);
        break;
      }
      case 'choir': {
        const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 820; f1.Q.value = 5;
        const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1250; f2.Q.value = 6;
        const vib = c.createOscillator(); vib.frequency.value = 4.8; const vg = c.createGain(); vg.gain.value = f * 0.006;
        for (const det of [-6, 6]) { const o = this.#osc('sawtooth', f, t, dur + 0.5, det); vib.connect(vg).connect(o.frequency); o.connect(f1); o.connect(f2); }
        vib.start(t + 0.1); vib.stop(t + dur + 0.6);
        const mix = c.createGain(); mix.gain.value = 2.6; f1.connect(mix); f2.connect(mix); mix.connect(g);
        peak = 0.05 * vel; a = 0.12; hold = dur * 0.6; rel = 0.5;
        g.connect(this.echoIn);
        break;
      }
      case 'reed': {
        // Schalmei/Duduk: gefiltertes Rechteck mit weichem Einsatz
        const bp = c.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 1300; bp.Q.value = 2;
        const o = this.#osc('square', f, t, dur + 0.3);
        const vib = c.createOscillator(); vib.frequency.value = 5; const vg = c.createGain(); vg.gain.value = f * 0.01;
        vib.connect(vg).connect(o.frequency); vib.start(t + 0.2); vib.stop(t + dur + 0.4);
        o.connect(bp).connect(g);
        peak = 0.03 * vel; a = 0.07; hold = dur * 0.6; rel = 0.3;
        break;
      }
      case 'pluck': {
        // Gezupft (Saz/Kantele): heller Anschlag, schnell dumpfer
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(300, t + Math.min(dur, 0.6));
        this.#osc('sawtooth', f, t, dur).connect(lp); this.#osc('triangle', f * 2, t, dur * 0.4).connect(lp);
        lp.connect(g); peak = 0.04 * vel; rel = Math.min(dur * 1.2, 0.9);
        g.connect(this.echoIn);
        break;
      }
      case 'celesta': {
        this.#osc('sine', f * 2, t, dur).connect(g);
        const g2 = c.createGain(); g2.gain.value = 0.25; this.#osc('sine', f * 8, t, 0.15).connect(g2).connect(g);
        peak = 0.045 * vel; rel = Math.min(dur * 1.6, 1.4);
        g.connect(this.echoIn);
        break;
      }
      case 'horn': {
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(600, t); lp.frequency.linearRampToValueAtTime(1500, t + 0.15);
        this.#osc('sawtooth', f, t, dur + 0.3, -4).connect(lp); this.#osc('sawtooth', f, t, dur + 0.3, 5).connect(lp);
        lp.connect(g); peak = 0.035 * vel; a = 0.06; hold = dur * 0.7; rel = 0.3;
        break;
      }
      case 'saw': default: {
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(400, t + dur);
        this.#osc('sawtooth', f, t, dur).connect(lp); lp.connect(g); peak = 0.03 * vel;
      }
    }
    g.connect(cur.gain);
    this.#env(g, t, a, hold, rel, peak * 1.6); // Melodie und Arpeggio tragen das Stück
  }

  #kick(cur, t, v) {
    const c = this.sfx.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    const g = c.createGain(); this.#env(g, t, 0.003, 0.02, 0.25, 0.35 * v);
    o.connect(g).connect(cur.gain); o.start(t); o.stop(t + 0.35);
    this.#hit(cur, t, v * 0.5, 2500); // Anschlag, damit die Trommel auch auf kleinen Lautsprechern zu hören ist
  }

  #hit(cur, t, v, freq) {
    const c = this.sfx.ctx;
    const src = c.createBufferSource(); src.buffer = this.sfx.noise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.2;
    const g = c.createGain(); this.#env(g, t, 0.002, 0.01, 0.12, 0.18 * v);
    src.connect(bp).connect(g).connect(cur.gain); src.start(t, Math.random() * 0.5, 0.2);
  }

  // Taiko: tiefe große Trommel mit Fellanschlag
  #taiko(cur, t, v) {
    const c = this.sfx.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.3);
    const g = c.createGain(); this.#env(g, t, 0.004, 0.05, 0.45, 0.4 * v);
    o.connect(g).connect(cur.gain); o.start(t); o.stop(t + 0.6);
    this.#hit(cur, t, v * 0.7, 700);
  }

  // Rahmentrommel: wärmer und kürzer
  #frame(cur, t, v) {
    const c = this.sfx.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.12);
    const g = c.createGain(); this.#env(g, t, 0.003, 0.02, 0.22, 0.22 * v);
    o.connect(g).connect(cur.gain); o.start(t); o.stop(t + 0.35);
    this.#hit(cur, t, v * 0.5, 1100);
  }

  #shaker(cur, t, v) {
    const c = this.sfx.ctx;
    const src = c.createBufferSource(); src.buffer = this.sfx.noise;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
    const g = c.createGain(); this.#env(g, t, 0.008, 0.01, 0.06, 0.07 * v);
    src.connect(hp).connect(g).connect(cur.gain); src.start(t, Math.random() * 0.5, 0.1);
  }

  #snare(cur, t, v) {
    const c = this.sfx.ctx;
    const o = c.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const g = c.createGain(); this.#env(g, t, 0.002, 0.01, 0.1, 0.12 * v);
    o.connect(g).connect(cur.gain); o.start(t); o.stop(t + 0.2);
    this.#hit(cur, t, v * 0.9, 2200);
  }

  #anvil(cur, t, v) {
    const c = this.sfx.ctx;
    const g = c.createGain(); this.#env(g, t, 0.002, 0.01, 0.6, 0.06 * v);
    for (const [r, a] of [[1, 1], [2.4, 0.6], [3.9, 0.4]]) { const gg = c.createGain(); gg.gain.value = a; this.#osc('sine', 880 * r, t, 0.7).connect(gg).connect(g); }
    g.connect(cur.gain);
    this.#hit(cur, t, v, 4200);
  }
}
