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
  trial: { bpm: 124, root: 43, scale: 'phrygian', chords: [0, 1, 0, 6], bars: 1, pad: 'horn', arp: 'saw', arpEvery: 2, melody: null, melodyDensity: 0, bass: [0, 4, 8, 12], bells: 0, drums: { k: 'x...x...x...x...', h: '..x...x...x...x.' }, drumGain: 0.6, gain: 0.5 },
};

// Zone -> Stück (feste IDs aus INTEGRATION.md §11, sonst nach Art der Zone)
const ZONE_THEMES = { emberhollow: 'village', catacombs: 'crypt', ashwood: 'forest', sunken_temple: 'temple', cinder_peaks: 'peaks', molten_forge: 'forge', ember_trial: 'trial' };
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
    const ci = Math.floor(step / chordSteps) % d.chords.length;
    const chord = d.chords[ci];
    const inChord = step % chordSteps;
    const inBar = step % barSteps;
    const triad = [chord, chord + 2, chord + 4];
    // Fläche zu Akkordbeginn
    if (inChord === 0 && d.pad) for (const k of triad) this.#pad(cur, d.pad, NOTE(this.#deg(d, k, 1)), t, chordSteps * sd);
    // Bass
    if (d.bass.includes(inBar)) this.#bass(cur, NOTE(this.#deg(d, chord, -1)), t, sd * (d.bass.length > 2 ? 1.6 : 6));
    // Arpeggio
    if (d.arp && inBar % (d.arpEvery ?? 2) === 0) {
      const seq = [0, 1, 2, 1, 2, 3, 2, 1];
      const idx = seq[(inBar / (d.arpEvery ?? 2)) % seq.length];
      const note = idx === 3 ? this.#deg(d, chord, 2) : this.#deg(d, triad[idx], 1);
      this.#voice(cur, d.arp, NOTE(note), t, sd * 3, 0.5);
    }
    // Melodie: Zufallsweg auf der Tonleiter, bevorzugt Akkordtöne auf Schlägen
    if (d.melody && inBar % 2 === 0 && r() < d.melodyDensity * (inBar % 4 === 0 ? 1.6 : 0.7)) {
      cur.mel += Math.round((r() - 0.5) * 4);
      if (inBar % 8 === 0) cur.mel = triad[Math.floor(r() * 3)] + (cur.mel > 6 ? 7 : 0);
      cur.mel = Math.max(-2, Math.min(9, cur.mel));
      const len = sd * (r() < 0.3 ? 6 : r() < 0.6 ? 4 : 2);
      this.#voice(cur, d.melody, NOTE(this.#deg(d, cur.mel, 2)), t, len, 0.7);
    }
    // Glocken
    if (d.bells && r() < d.bells) this.#voice(cur, 'bell', NOTE(this.#deg(d, triad[Math.floor(r() * 3)], 3)), t, sd * 8, 0.35);
    // Trommeln
    if (d.drums) {
      const g = d.drumGain ?? 0.5;
      if (d.drums.k?.[inBar] === 'x') this.#kick(cur, t, g);
      if (d.drums.h?.[inBar] === 'x') this.#hit(cur, t, g * 0.7, 1800);
      if (d.drums.a?.[inBar] === 'x') this.#anvil(cur, t, g * 0.5);
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
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = kind === 'glass' ? 2400 : kind === 'choir' ? 900 : kind === 'horn' ? 1100 : 1400;
    lp.Q.value = kind === 'choir' ? 4 : 0.8;
    const type = kind === 'glass' ? 'triangle' : kind === 'horn' ? 'sawtooth' : 'sawtooth';
    const peak = kind === 'horn' ? 0.028 : kind === 'glass' ? 0.04 : 0.03;
    for (const det of [-7, 6]) this.#osc(type, f, t, dur + 1.2, det).connect(lp);
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

  #anvil(cur, t, v) {
    const c = this.sfx.ctx;
    const g = c.createGain(); this.#env(g, t, 0.002, 0.01, 0.6, 0.06 * v);
    for (const [r, a] of [[1, 1], [2.4, 0.6], [3.9, 0.4]]) { const gg = c.createGain(); gg.gain.value = a; this.#osc('sine', 880 * r, t, 0.7).connect(gg).connect(g); }
    g.connect(cur.gain);
    this.#hit(cur, t, v, 4200);
  }
}
