// Prozedurale Soundeffekte über WebAudio – keine Asset-Dateien nötig.
// Später austauschbar gegen Samples, die API (play(name)) bleibt gleich.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 1;     // 0..1, Geräte-Einstellung 'volume'
    this.prefs = null;   // game.prefs (bindPrefs), speichert 'muted'/'volume'
    this.master = null;
    const unlock = () => this.#init();
    ['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, unlock, { once: false, passive: true }));
  }

  #init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.#gain();
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.#ambience();
  }

  #gain() { return this.muted ? 0 : 0.55 * this.volume; }
  #applyGain() { if (this.master) this.master.gain.setTargetAtTime(this.#gain(), this.ctx.currentTime, 0.05); }

  // Geräte-Einstellungen übernehmen und künftige Änderungen dort speichern.
  bindPrefs(prefs) {
    this.prefs = prefs;
    this.muted = !!prefs.get('muted', false);
    this.volume = Math.max(0, Math.min(1, Number(prefs.get('volume', 1)) || 0));
    this.#applyGain();
  }

  setMuted(on) {
    this.muted = !!on;
    this.#applyGain();
    this.prefs?.set('muted', this.muted);
    return this.muted;
  }

  toggleMute() { return this.setMuted(!this.muted); }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    this.#applyGain();
    this.prefs?.set('volume', this.volume);
  }

  // --- Bausteine -----------------------------------------------------------
  #env(gainNode, t, attack, decay, peak) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  #noise(t, { dur = 0.2, type = 'bandpass', f0 = 1000, f1 = f0, q = 1, peak = 0.5, attack = 0.005 }) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filt = c.createBiquadFilter();
    filt.type = type; filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    this.#env(g, t, attack, dur, peak);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5, dur + attack + 0.05);
  }
  #tone(t, { type = 'sine', f0 = 200, f1 = f0, dur = 0.2, peak = 0.4, attack = 0.005 }) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    this.#env(g, t, attack, dur, peak);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + attack + dur + 0.05);
  }

  // Zwei Atmo-Schichten, zwischen denen je nach Zone überblendet wird:
  // 'dungeon' (tiefes Dröhnen) und 'outdoor' (Wind, fernes Knistern).
  #ambience() {
    const c = this.ctx;
    this.amb = {};
    const dg = c.createGain(); dg.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = c.createGain(); lfoG.gain.value = 80;
    lfo.connect(lfoG).connect(lp.frequency);
    [55, 55.6, 82.4].forEach((f) => {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      o.connect(lp); o.start();
    });
    lp.connect(dg).connect(this.master);
    lfo.start();
    this.amb.dungeon = dg;

    const og = c.createGain(); og.gain.value = 0;
    const wind = c.createBufferSource(); wind.buffer = this.noise; wind.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 0.6;
    const wl = c.createOscillator(); wl.frequency.value = 0.11;
    const wlG = c.createGain(); wlG.gain.value = 220;
    wl.connect(wlG).connect(bp.frequency);
    wind.connect(bp).connect(og).connect(this.master);
    wind.start(); wl.start();
    this.amb.outdoor = og;

    // Wasser: gedämpftes Rauschen mit langsamem Wogen (Tempel, Ufer)
    const wg = c.createGain(); wg.gain.value = 0;
    const water = c.createBufferSource(); water.buffer = this.noise; water.loop = true; water.playbackRate.value = 0.6;
    const wlp = c.createBiquadFilter(); wlp.type = 'lowpass'; wlp.frequency.value = 520; wlp.Q.value = 0.7;
    const wlo = c.createOscillator(); wlo.frequency.value = 0.18;
    const wloG = c.createGain(); wloG.gain.value = 260;
    wlo.connect(wloG).connect(wlp.frequency);
    water.connect(wlp).connect(wg).connect(this.master);
    water.start(); wlo.start();
    this.amb.water = wg;

    // Glut: tiefes Grollen (Lava, Schmiede)
    const fg = c.createGain(); fg.gain.value = 0;
    const rum = c.createBufferSource(); rum.buffer = this.noise; rum.loop = true; rum.playbackRate.value = 0.35;
    const flp = c.createBiquadFilter(); flp.type = 'lowpass'; flp.frequency.value = 110; flp.Q.value = 1.4;
    rum.connect(flp).connect(fg).connect(this.master);
    rum.start();
    this.amb.fire = fg;
    this.setAmbience(this.ambKind ?? 'dungeon');
  }

  // Atmo-Mischungen je Zonenart: outdoor | forest | dungeon | water | fire
  static AMB_MIX = {
    outdoor: { outdoor: 0.045 },
    forest: { outdoor: 0.035, water: 0.008 },
    dungeon: { dungeon: 0.05 },
    rain: { outdoor: 0.03, water: 0.05 },
    storm: { outdoor: 0.05, water: 0.07 },
    water: { dungeon: 0.025, water: 0.05 },
    fire: { outdoor: 0.025, fire: 0.09 },
  };

  setAmbience(kind) {
    this.ambKind = kind;
    if (!this.amb) return;
    const t = this.ctx.currentTime;
    const mix = Sfx.AMB_MIX[kind] ?? Sfx.AMB_MIX.dungeon;
    for (const [layer, g] of Object.entries(this.amb)) g.gain.setTargetAtTime(mix[layer] ?? 0, t, 0.8);
  }

  // Für die Musik (audio/Music.js): Kontext und Ausgang, sobald der Ton entsperrt ist.
  get ready() { return !!this.ctx && !!this.master; }
  get output() { return this.master; }

  play(name, opts = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + 0.001;
    const p = opts.pitch ?? (0.92 + Math.random() * 0.16);
    switch (name) {
      case 'swing':
        this.#noise(t, { dur: 0.13, f0: 700 * p, f1: 2600 * p, q: 1.2, peak: 0.28 });
        break;
      case 'swingHeavy':
        this.#noise(t, { dur: 0.22, f0: 400 * p, f1: 1800 * p, q: 0.9, peak: 0.4, attack: 0.02 });
        this.#tone(t, { type: 'sine', f0: 120, f1: 60, dur: 0.2, peak: 0.15 });
        break;
      case 'hit':
        this.#tone(t, { type: 'sine', f0: 160 * p, f1: 45, dur: 0.14, peak: 0.6 });
        this.#noise(t, { dur: 0.07, type: 'lowpass', f0: 2500, f1: 400, peak: 0.5 });
        break;
      case 'crit':
        this.#tone(t, { type: 'sine', f0: 190, f1: 40, dur: 0.2, peak: 0.7 });
        this.#noise(t, { dur: 0.1, type: 'lowpass', f0: 4000, f1: 500, peak: 0.55 });
        this.#tone(t + 0.01, { type: 'triangle', f0: 1400, f1: 1300, dur: 0.18, peak: 0.12 });
        break;
      case 'bone':
        for (let i = 0; i < 4; i++) this.#noise(t + i * 0.025 + Math.random() * 0.02, { dur: 0.03, type: 'highpass', f0: 2500 + Math.random() * 2000, peak: 0.22 });
        break;
      case 'chitin':
        this.#noise(t, { dur: 0.16, type: 'bandpass', f0: 900 * p, f1: 300, q: 2, peak: 0.4 });
        break;
      case 'boneDeath':
        for (let i = 0; i < 9; i++) this.#noise(t + i * 0.04 + Math.random() * 0.03, { dur: 0.04, type: 'highpass', f0: 1800 + Math.random() * 2500, peak: 0.25 });
        this.#tone(t, { type: 'sine', f0: 90, f1: 40, dur: 0.3, peak: 0.3 });
        break;
      case 'spiderDeath':
        this.#noise(t, { dur: 0.35, type: 'bandpass', f0: 1200, f1: 200, q: 3, peak: 0.4 });
        this.#tone(t, { type: 'square', f0: 300, f1: 80, dur: 0.25, peak: 0.06 });
        break;
      case 'hiss':
        this.#noise(t, { dur: 0.35, type: 'highpass', f0: 3000, f1: 5000, peak: 0.12, attack: 0.05 });
        break;
      case 'rattle':
        for (let i = 0; i < 3; i++) this.#noise(t + i * 0.05, { dur: 0.025, type: 'highpass', f0: 3000, peak: 0.1 });
        break;
      case 'enemySwing':
        this.#noise(t, { dur: 0.12, f0: 500, f1: 1500, q: 1.2, peak: 0.18 });
        break;
      case 'hurt':
        this.#tone(t, { type: 'square', f0: 220, f1: 90, dur: 0.18, peak: 0.12 });
        this.#tone(t, { type: 'sine', f0: 120, f1: 40, dur: 0.25, peak: 0.6 });
        this.#noise(t, { dur: 0.12, type: 'lowpass', f0: 1500, f1: 300, peak: 0.4 });
        break;
      case 'roll':
        this.#noise(t, { dur: 0.22, type: 'lowpass', f0: 1200, f1: 300, peak: 0.25, attack: 0.02 });
        break;
      case 'step':
        this.#noise(t, { dur: 0.04, type: 'lowpass', f0: 500, f1: 200, peak: 0.06 });
        break;
      case 'spawn':
        this.#tone(t, { type: 'sine', f0: 60, f1: 140, dur: 0.6, peak: 0.18, attack: 0.1 });
        this.#noise(t, { dur: 0.6, type: 'bandpass', f0: 300, f1: 1400, q: 4, peak: 0.1, attack: 0.2 });
        break;
      case 'shoot':
        this.#noise(t, { dur: 0.08, type: 'highpass', f0: 1500, f1: 3000, peak: 0.2 });
        this.#tone(t, { type: 'triangle', f0: 180, f1: 90, dur: 0.1, peak: 0.12 });
        break;
      case 'deflect':
        this.#tone(t, { type: 'sine', f0: 1850, f1: 1800, dur: 0.3, peak: 0.18 });
        this.#tone(t, { type: 'sine', f0: 2650, f1: 2600, dur: 0.22, peak: 0.12 });
        this.#noise(t, { dur: 0.05, type: 'highpass', f0: 3000, peak: 0.3 });
        break;
      case 'thunk':
        this.#noise(t, { dur: 0.05, type: 'lowpass', f0: 800, f1: 200, peak: 0.2 });
        break;
      case 'wave':
        [196, 247, 294].forEach((f, i) => this.#tone(t + i * 0.09, { type: 'triangle', f0: f, dur: 0.9, peak: 0.12, attack: 0.02 }));
        this.#tone(t, { type: 'sine', f0: 49, dur: 1.2, peak: 0.25, attack: 0.05 });
        break;
      case 'clear':
        [294, 370, 440, 587].forEach((f, i) => this.#tone(t + i * 0.08, { type: 'triangle', f0: f, dur: 0.6, peak: 0.1 }));
        break;
      case 'heal':
        [440, 554, 659].forEach((f, i) => this.#tone(t + i * 0.06, { type: 'sine', f0: f, f1: f * 1.02, dur: 0.4, peak: 0.08 }));
        break;
      case 'coin':
        [1320, 1760].forEach((f, i) => this.#tone(t + i * 0.05, { type: 'square', f0: f * p, dur: 0.09, peak: 0.05 }));
        break;
      case 'pickup':
        this.#tone(t, { type: 'triangle', f0: 520 * p, f1: 900 * p, dur: 0.12, peak: 0.12 });
        this.#noise(t, { dur: 0.06, f0: 3000, peak: 0.06 });
        break;
      case 'rareLoot': {
        // Schimmernder Akkord; opts.tier 'epic' (Moll-Glanz) oder 'legendary' (heller, länger)
        const leg = opts.tier === 'legendary';
        const notes = leg ? [523, 659, 784, 1047, 1319] : [440, 554, 659, 880];
        notes.forEach((f, i) => this.#tone(t + i * 0.06, { type: 'triangle', f0: f, dur: leg ? 0.9 : 0.6, peak: 0.08, attack: 0.01 }));
        this.#noise(t, { dur: leg ? 0.9 : 0.5, type: 'highpass', f0: 5000, f1: 9000, peak: 0.05, attack: 0.1 });
        break;
      }
      case 'levelUp':
        [262, 330, 392, 523, 659].forEach((f, i) => this.#tone(t + i * 0.07, { type: 'triangle', f0: f, dur: 0.8, peak: 0.1, attack: 0.01 }));
        this.#tone(t, { type: 'sine', f0: 65, dur: 1.2, peak: 0.3, attack: 0.03 });
        this.#noise(t + 0.1, { dur: 0.8, type: 'highpass', f0: 4000, f1: 8000, peak: 0.05, attack: 0.2 });
        break;
      case 'quest':
        [392, 494, 587].forEach((f, i) => this.#tone(t + i * 0.1, { type: 'triangle', f0: f, dur: 0.5, peak: 0.1 }));
        break;
      case 'questDone':
        [392, 494, 587, 784].forEach((f, i) => this.#tone(t + i * 0.09, { type: 'triangle', f0: f, dur: 0.7, peak: 0.11 }));
        this.#tone(t + 0.27, { type: 'sine', f0: 98, dur: 0.9, peak: 0.25 });
        break;
      case 'bossRoar':
        this.#tone(t, { type: 'sawtooth', f0: 70, f1: 40, dur: 1.4, peak: 0.22, attack: 0.08 });
        this.#noise(t, { dur: 1.2, type: 'lowpass', f0: 600, f1: 120, peak: 0.35, attack: 0.1 });
        break;
      case 'victory':
        [262, 330, 392, 523].forEach((f, i) => this.#tone(t + i * 0.12, { type: 'triangle', f0: f, dur: 1.1, peak: 0.12 }));
        this.#tone(t + 0.48, { type: 'sine', f0: 131, dur: 1.6, peak: 0.3 });
        break;
      case 'ui':
        this.#tone(t, { type: 'square', f0: 880, f1: 660, dur: 0.04, peak: 0.04 });
        break;
      case 'magic':
        this.#tone(t, { type: 'sine', f0: 600 * p, f1: 1400 * p, dur: 0.25, peak: 0.1 });
        this.#noise(t, { dur: 0.25, f0: 2000, f1: 6000, q: 2, peak: 0.08 });
        break;
      case 'fire':
        this.#noise(t, { dur: 0.35, type: 'lowpass', f0: 2400, f1: 300, peak: 0.3 });
        break;
      case 'frost':
        this.#noise(t, { dur: 0.3, type: 'highpass', f0: 5000, f1: 2000, peak: 0.12 });
        this.#tone(t, { type: 'sine', f0: 1800 * p, f1: 900, dur: 0.2, peak: 0.05 });
        break;
      // --- Gegnerstimmen (Runde 4, Zuordnung in audio/voices.js) ---
      case 'growl': // Tiere: Wolf, Keiler, Magmahund
        this.#tone(t, { type: 'sawtooth', f0: 110 * p, f1: 75 * p, dur: 0.38, peak: 0.1, attack: 0.04 });
        this.#noise(t, { dur: 0.36, type: 'bandpass', f0: 380 * p, f1: 240 * p, q: 3, peak: 0.22, attack: 0.05 });
        break;
      case 'grunt': // Menschen: Banditen, Kultisten
        this.#tone(t, { type: 'square', f0: 150 * p, f1: 105 * p, dur: 0.16, peak: 0.07 });
        this.#noise(t, { dur: 0.14, type: 'bandpass', f0: 700 * p, f1: 450 * p, q: 2.5, peak: 0.18 });
        break;
      case 'impChitter': // Feuerwichte: hohes Schnattern
        for (let i = 0; i < 4; i++) this.#tone(t + i * 0.045, { type: 'square', f0: (900 + Math.random() * 500) * p, f1: 600 * p, dur: 0.04, peak: 0.04 });
        break;
      case 'rumble': // Golems, Wächter: Steinmahlen
        this.#tone(t, { type: 'sine', f0: 55 * p, f1: 38, dur: 0.6, peak: 0.35, attack: 0.05 });
        this.#noise(t, { dur: 0.55, type: 'lowpass', f0: 420, f1: 120, peak: 0.3, attack: 0.06 });
        break;
      case 'gurgle': // Ertrunkene: nasses Blubbern
        for (let i = 0; i < 5; i++) this.#tone(t + i * 0.05 + Math.random() * 0.02, { type: 'sine', f0: (220 + Math.random() * 260) * p, f1: 500 * p, dur: 0.05, peak: 0.08 });
        this.#noise(t, { dur: 0.3, type: 'lowpass', f0: 700, f1: 250, peak: 0.12 });
        break;
      case 'dragonBreath': // Glutdrache: Fauchen mit Feuer
        this.#tone(t, { type: 'sawtooth', f0: 90, f1: 60, dur: 0.7, peak: 0.12, attack: 0.05 });
        this.#noise(t, { dur: 0.8, type: 'bandpass', f0: 1800, f1: 500, q: 0.8, peak: 0.35, attack: 0.08 });
        break;
      case 'stone': // Treffer auf Stein
        this.#noise(t, { dur: 0.08, type: 'bandpass', f0: 1600 * p, f1: 700, q: 1.5, peak: 0.35 });
        this.#tone(t, { type: 'triangle', f0: 240 * p, f1: 140, dur: 0.1, peak: 0.12 });
        break;
      case 'stoneDeath':
        for (let i = 0; i < 7; i++) this.#noise(t + i * 0.05 + Math.random() * 0.03, { dur: 0.07, type: 'lowpass', f0: 900 + Math.random() * 800, f1: 200, peak: 0.28 });
        this.#tone(t, { type: 'sine', f0: 60, f1: 30, dur: 0.7, peak: 0.4 });
        break;
      case 'ember': // Treffer auf Glutwesen: Zischen
        this.#noise(t, { dur: 0.16, type: 'highpass', f0: 2500 * p, f1: 1200, peak: 0.2 });
        this.#tone(t, { type: 'sine', f0: 160 * p, f1: 60, dur: 0.1, peak: 0.3 });
        break;
      case 'emberDeath':
        this.#noise(t, { dur: 0.5, type: 'lowpass', f0: 3000, f1: 200, peak: 0.35 });
        this.#noise(t + 0.05, { dur: 0.4, type: 'highpass', f0: 4000, f1: 1500, peak: 0.1 });
        break;
      case 'splash': // Treffer auf Wasserwesen
        this.#noise(t, { dur: 0.14, type: 'bandpass', f0: 1100 * p, f1: 500, q: 1.2, peak: 0.3 });
        this.#tone(t, { type: 'sine', f0: 300 * p, f1: 700 * p, dur: 0.06, peak: 0.06 });
        break;
      case 'fleshDeath':
        this.#tone(t, { type: 'sine', f0: 120 * p, f1: 40, dur: 0.35, peak: 0.4 });
        this.#noise(t, { dur: 0.25, type: 'lowpass', f0: 1200, f1: 200, peak: 0.3 });
        break;
      // --- Fähigkeiten (Runde 4) ---
      case 'shout':
        this.#tone(t, { type: 'sawtooth', f0: 180, f1: 140, dur: 0.45, peak: 0.1, attack: 0.03 });
        this.#tone(t, { type: 'sawtooth', f0: 271, f1: 210, dur: 0.45, peak: 0.06, attack: 0.03 });
        this.#noise(t, { dur: 0.4, type: 'bandpass', f0: 900, f1: 600, q: 1.5, peak: 0.15, attack: 0.03 });
        break;
      case 'whoosh': // Wirbelwind, Sturmangriff
        this.#noise(t, { dur: 0.45, type: 'bandpass', f0: 400 * p, f1: 2200 * p, q: 1.4, peak: 0.3, attack: 0.08 });
        break;
      case 'quake': // Erdspalter, Meteor-Einschlag
        this.#tone(t, { type: 'sine', f0: 70, f1: 28, dur: 0.9, peak: 0.6 });
        this.#noise(t, { dur: 0.7, type: 'lowpass', f0: 900, f1: 90, peak: 0.5 });
        for (let i = 0; i < 5; i++) this.#noise(t + 0.08 + i * 0.07, { dur: 0.06, type: 'lowpass', f0: 1400, f1: 300, peak: 0.18 });
        break;
      case 'shadow': // Schattenschritt, Tarnung, Meucheln
        this.#tone(t, { type: 'sine', f0: 900 * p, f1: 180 * p, dur: 0.28, peak: 0.1 });
        this.#noise(t, { dur: 0.3, type: 'highpass', f0: 3000, f1: 800, peak: 0.1, attack: 0.03 });
        break;
      case 'knives':
        for (let i = 0; i < 5; i++) this.#noise(t + i * 0.022, { dur: 0.06, type: 'highpass', f0: 3500 + i * 300, f1: 6000, peak: 0.12 });
        break;
      case 'bowDraw':
        this.#tone(t, { type: 'triangle', f0: 120 * p, f1: 260 * p, dur: 0.25, peak: 0.06, attack: 0.1 });
        this.#noise(t, { dur: 0.22, type: 'bandpass', f0: 1500, f1: 2400, q: 4, peak: 0.05, attack: 0.1 });
        break;
      case 'arrowRain':
        for (let i = 0; i < 9; i++) this.#noise(t + i * 0.05 + Math.random() * 0.03, { dur: 0.09, type: 'highpass', f0: 2000 + Math.random() * 1500, f1: 4500, peak: 0.1 });
        break;
      case 'trap':
        this.#tone(t, { type: 'square', f0: 700, f1: 500, dur: 0.05, peak: 0.05 });
        this.#noise(t + 0.03, { dur: 0.06, type: 'highpass', f0: 3000, peak: 0.12 });
        break;
      case 'blink':
        this.#tone(t, { type: 'sine', f0: 400 * p, f1: 1800 * p, dur: 0.18, peak: 0.1 });
        this.#tone(t + 0.1, { type: 'sine', f0: 1800 * p, f1: 900 * p, dur: 0.16, peak: 0.06 });
        break;
      case 'meteorFall':
        this.#noise(t, { dur: 0.8, type: 'bandpass', f0: 3000, f1: 400, q: 1, peak: 0.25, attack: 0.3 });
        this.#tone(t, { type: 'sine', f0: 900, f1: 120, dur: 0.8, peak: 0.06, attack: 0.3 });
        break;
      case 'unlock': // neue Fähigkeit / Talent frei
        [523, 784, 1047].forEach((f, i) => this.#tone(t + i * 0.05, { type: 'triangle', f0: f, dur: 0.6, peak: 0.08 }));
        this.#tone(t, { type: 'sine', f0: 131, dur: 0.8, peak: 0.2 });
        break;
      case 'achievement':
        [659, 784, 988, 1319].forEach((f, i) => this.#tone(t + i * 0.07, { type: 'square', f0: f, dur: 0.3, peak: 0.03 }));
        [659, 784, 988, 1319].forEach((f, i) => this.#tone(t + i * 0.07, { type: 'triangle', f0: f, dur: 0.7, peak: 0.07 }));
        break;
      case 'dialog': // Dialogfenster öffnet / Seite weiter
        this.#tone(t, { type: 'triangle', f0: 660 * p, f1: 720 * p, dur: 0.06, peak: 0.05 });
        break;
      case 'blip': // Schreibmaschine im Dialog
        this.#tone(t, { type: 'square', f0: (opts.freq ?? 320) * p, dur: 0.025, peak: 0.018 });
        break;
      // --- Bossangriffe (Thread B, Runde 4) ---
      case 'bossBreath': // Feuer-/Glutatem: langes Fauchen
        this.#tone(t, { type: 'sawtooth', f0: 75, f1: 55, dur: 1.1, peak: 0.12, attack: 0.1 });
        this.#noise(t, { dur: 1.2, type: 'bandpass', f0: 900, f1: 2200, q: 0.7, peak: 0.4, attack: 0.15 });
        this.#noise(t + 0.2, { dur: 0.9, type: 'lowpass', f0: 1500, f1: 400, peak: 0.25, attack: 0.1 });
        break;
      case 'bossMeteor': // herabstürzender Brocken, dann Einschlag
        this.#noise(t, { dur: 0.7, type: 'bandpass', f0: 4000, f1: 500, q: 1, peak: 0.25, attack: 0.3 });
        this.#tone(t + 0.62, { type: 'sine', f0: 80, f1: 26, dur: 0.9, peak: 0.7 });
        this.#noise(t + 0.62, { dur: 0.6, type: 'lowpass', f0: 1800, f1: 120, peak: 0.55 });
        break;
      case 'bossWave': // Flutwelle / Druckwelle
        this.#noise(t, { dur: 1.0, type: 'lowpass', f0: 400, f1: 2400, peak: 0.4, attack: 0.35 });
        this.#tone(t, { type: 'sine', f0: 50, f1: 90, dur: 1.0, peak: 0.35, attack: 0.3 });
        break;
      case 'bossDive': // Abtauchen / Sprung ins Wasser
        this.#tone(t, { type: 'sine', f0: 700, f1: 120, dur: 0.35, peak: 0.12 });
        this.#noise(t + 0.25, { dur: 0.5, type: 'bandpass', f0: 1400, f1: 400, q: 1.1, peak: 0.45 });
        break;
      case 'bossEmerge': // Auftauchen: Blubbern, dann Brandung
        for (let i = 0; i < 8; i++) this.#tone(t + i * 0.05, { type: 'sine', f0: 200 + Math.random() * 300, f1: 600, dur: 0.06, peak: 0.08 });
        this.#noise(t + 0.3, { dur: 0.7, type: 'bandpass', f0: 500, f1: 1600, q: 0.9, peak: 0.45, attack: 0.05 });
        this.#tone(t + 0.3, { type: 'sine', f0: 60, f1: 40, dur: 0.8, peak: 0.35 });
        break;
      // --- Welt (Thread B): Kleintiere, Fallen, Hebel, Geheimtüren ---
      case 'crow':
        this.#tone(t, { type: 'sawtooth', f0: 820 * p, f1: 520 * p, dur: 0.14, peak: 0.05 });
        this.#tone(t + 0.18, { type: 'sawtooth', f0: 760 * p, f1: 480 * p, dur: 0.16, peak: 0.04 });
        this.#noise(t, { dur: 0.3, type: 'bandpass', f0: 1400, f1: 900, q: 3, peak: 0.06 });
        break;
      case 'squeak':
        this.#tone(t, { type: 'square', f0: 2600 * p, f1: 3200 * p, dur: 0.06, peak: 0.02 });
        this.#tone(t + 0.08, { type: 'square', f0: 2900 * p, f1: 2400 * p, dur: 0.05, peak: 0.015 });
        break;
      case 'flutter':
        for (let i = 0; i < 6; i++) this.#noise(t + i * 0.04, { dur: 0.03, type: 'bandpass', f0: 900 + i * 60, q: 2, peak: 0.07 });
        break;
      case 'spikes':
        this.#noise(t, { dur: 0.06, type: 'highpass', f0: 2500, peak: 0.3 });
        this.#tone(t, { type: 'triangle', f0: 900, f1: 1200, dur: 0.12, peak: 0.08 });
        this.#tone(t + 0.02, { type: 'sine', f0: 140, f1: 70, dur: 0.14, peak: 0.25 });
        break;
      case 'lever':
        this.#noise(t, { dur: 0.12, type: 'bandpass', f0: 600, f1: 300, q: 2, peak: 0.25 });
        this.#tone(t + 0.1, { type: 'square', f0: 180, f1: 120, dur: 0.06, peak: 0.08 });
        break;
      case 'secret':
        this.#tone(t, { type: 'sine', f0: 50, f1: 40, dur: 1.2, peak: 0.35, attack: 0.1 });
        this.#noise(t, { dur: 1.1, type: 'lowpass', f0: 500, f1: 200, peak: 0.3, attack: 0.1 });
        [587, 740, 880, 1175].forEach((f, i) => this.#tone(t + 0.9 + i * 0.08, { type: 'triangle', f0: f, dur: 0.6, peak: 0.07 }));
        break;
      case 'heroDeath':
        this.#tone(t, { type: 'sawtooth', f0: 110, f1: 30, dur: 1.4, peak: 0.15 });
        this.#tone(t, { type: 'sine', f0: 80, f1: 25, dur: 1.6, peak: 0.4 });
        break;
    }
  }
}
