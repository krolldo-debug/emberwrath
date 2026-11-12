import { lang, onLangChange } from '../i18n/index.js';
import { themeForZone } from '../audio/Music.js';
import { ambienceForZone } from '../audio/Soundscape.js';

// Spielt einen Film aus film.js über der Welt ab: Bild (Canvas in Gerätepixeln, Kinoformat), Tonspur der gewählten
// Sprache (Stimme, Musik und Geräusche fertig gemischt), Untertitel. Überspringen: Knopf, Esc, Enter oder Leertaste.
// Die Zeit kommt aus der Tonspur (AudioContext), damit Bild und Stimme auch nach Rucklern zusammenbleiben; ohne Ton
// (stumm geschaltet, Datei fehlt) läuft sie nach der Uhr. Fehlen Bilder, endet der Film sofort und das Spiel beginnt.
const LOAD_TIMEOUT = 9000;   // ms: länger wartet niemand vor schwarzem Bild
const SKIP_DELAY = 1.2;      // s: so lange ist „Überspringen“ verborgen (kein versehentliches Wegtippen beim Start)
const FADE = 0.9;            // s: Abblende am Ende
const MAX_W = 2600;          // Bildpunkte: breiter wird die Zeichenfläche nicht (größere Schirme: ganzzahlig geteilt)
const SLOW_MS = 40;          // ms je Bild: darüber kommt das Gerät nicht mit (30 Bilder/s im Stromsparmodus sind in Ordnung)

export function introBase() {
  // Website: neben dem Spiel-Skript (/spielen/intro/), Entwicklung: im Quellordner
  if (globalThis.EMBERWRATH_BUILD) return new URL('intro/', globalThis.EMBERWRATH_I18N_BASE ?? location.href);
  return new URL('src/intro/media/', location.href);
}

export class IntroPlayer {
  constructor(game, session, film, { onEnd }) {
    this.game = game; this.s = session; this.film = film; this.onEnd = onEnd;
    this.base = introBase();
    this.t = 0; this.ended = false; this.raf = 0; this.src = null; this.offs = [];
    this.cue = -1;
    this.div = 1;              // Teiler der Zeichenfläche (1 = Gerätepixel); steigt, wenn das Gerät nicht mitkommt
    this.frames = 0; this.slow = 0; this.last = 0;
  }

  start() {
    const root = this.root = document.createElement('div');
    root.className = 'intro';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Prolog');
    const cv = this.cv = document.createElement('canvas');
    cv.className = 'intro-cv';
    this.g = cv.getContext('2d');
    const sub = this.sub = document.createElement('div');
    sub.className = 'intro-sub';
    sub.setAttribute('aria-live', 'polite');
    this.subWho = document.createElement('span'); this.subWho.className = 'intro-who';
    this.subLine = document.createElement('span'); this.subLine.className = 'intro-line';
    sub.append(this.subWho, this.subLine);
    const skip = this.skipBtn = document.createElement('button');
    skip.type = 'button';
    skip.className = 'intro-skip';
    skip.textContent = 'Überspringen';
    skip.addEventListener('click', (e) => { e.stopPropagation(); this.end('skip'); });
    root.append(cv, sub, skip);
    // Tippen zeigt den Knopf sofort (Handy), Tasten überspringen direkt
    root.addEventListener('pointerdown', () => root.classList.add('intro-touched'));
    this.onKey = (e) => {
      if (this.t < SKIP_DELAY) return;
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); this.end('skip'); }
    };
    window.addEventListener('keydown', this.onKey, true);
    document.body.append(root);
    this.fit();
    this.onResize = () => this.fit();
    window.addEventListener('resize', this.onResize);
    this.offs.push(onLangChange(() => { this.cue = -1; }));

    // Spielmusik und Atmo ruhen, solange der Film läuft
    this.game.music?.stop();
    this.game.sfx?.setAmbience?.('fire');

    const timeout = new Promise((ok) => setTimeout(() => ok('timeout'), LOAD_TIMEOUT));
    Promise.race([Promise.all([this.film.load(this.base, this.s), this.#loadAudio()]), timeout]).then((r) => {
      if (this.ended) return;
      if (r === 'timeout' || !r[0]) { this.end('error'); return; }
      this.assets = r[0];
      this.audio = r[1];
      this.#play();
    }, (err) => { console.error('Intro laden', err); this.end('error'); });
  }

  // Tonspur der aktuellen Sprache; fehlt sie, die deutsche. null = ohne Ton
  async #loadAudio() {
    const sfx = this.game.sfx;
    const ctx = sfx?.ctx;
    if (!ctx || sfx.muted) return null;
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* bleibt stumm */ } }
    for (const id of [...new Set([lang(), 'de'])]) {
      try {
        const res = await fetch(new URL(this.film.audio(id), this.base));
        if (!res.ok) continue;
        return { lang: id, buffer: await ctx.decodeAudioData(await res.arrayBuffer()) };
      } catch { /* nächste Sprache */ }
    }
    return null;
  }

  #play() {
    const sfx = this.game.sfx, ctx = sfx?.ctx;
    this.timing = this.film.timing(this.audio?.lang ?? lang());
    if (this.audio && ctx?.state === 'running') {
      const src = this.src = ctx.createBufferSource();
      src.buffer = this.audio.buffer;
      src.connect(sfx.output);
      this.t0 = ctx.currentTime + 0.05;
      src.start(this.t0);
      this.clock = () => ctx.currentTime - this.t0;
    } else {
      const p0 = performance.now() + 50;
      this.clock = () => (performance.now() - p0) / 1000;
    }
    const frame = (now) => {
      if (this.ended) return;
      this.raf = requestAnimationFrame(frame);
      this.#pace(now);
      this.t = Math.max(0, this.clock());
      this.root.classList.toggle('intro-can-skip', this.t >= SKIP_DELAY);
      if (this.t >= this.film.duration + FADE) { this.end('end'); return; }
      try {
        this.film.draw(this.g, Math.min(this.t, this.film.duration), this.assets);
        this.#fade();
      } catch (err) { console.error('Intro zeichnen', err); this.end('error'); return; }
      this.#subtitle();
    };
    frame();
  }

  // Kommt das Gerät nicht mit (über mehrere Sekunden weniger als 25 Bilder je Sekunde), wird die Zeichenfläche
  // halbiert bzw. gedrittelt: gleiche Bildpunkte, etwas weichere Kanten, dafür flüssig. Höchstens zweimal.
  #pace(now) {
    if (!now || !this.last) { this.last = now ?? 0; return; }
    const dt = now - this.last;
    this.last = now;
    if (dt > 250) return;                          // Tab war verdeckt o. Ä.: zählt nicht
    this.frames++;
    if (dt > SLOW_MS) this.slow++;
    if (this.frames < 90) return;
    if (this.slow > 45 && this.div < 3) { this.div++; this.fit(); }
    this.frames = 0; this.slow = 0;
  }

  // Abblende auf Schwarz
  #fade() {
    const over = this.t - this.film.duration;
    if (over <= 0) return;
    const k = Math.min(1, over / FADE);
    this.g.fillStyle = `rgba(0,0,0,${k})`;
    this.g.fillRect(0, 0, this.cv.width, this.cv.height);
  }

  #subtitle() {
    const cues = this.timing, t = this.t;
    let i = -1;
    for (let k = 0; k < cues.length; k++) if (t >= cues[k].t0 && t < cues[k].t1) { i = k; break; }
    if (i === this.cue) return;
    this.cue = i;
    const c = cues[i];
    this.subWho.textContent = c?.who ?? '';
    this.subLine.textContent = c?.text ?? '';
    this.sub.classList.toggle('show', !!c);
  }

  // Bild so groß wie möglich im Seitenverhältnis des Films, mittig; Untertitel unter dem Bild, wenn dort Platz ist
  fit() {
    const W = window.innerWidth, H = window.innerHeight, ar = this.film.width / this.film.height;
    const w = Math.min(W, H * ar), h = w / ar;
    Object.assign(this.cv.style, { width: `${Math.round(w)}px`, height: `${Math.round(h)}px` });
    // Zeichenfläche in Gerätepixeln: so bleiben die Bildpunkte des Films scharfe Quadrate. Sehr große Schirme (und
    // Geräte, die nicht mitkommen) bekommen einen ganzzahligen Bruchteil, den der Browser pixelgenau vergrößert.
    const px = Math.round(w) * (window.devicePixelRatio || 1);
    let n = this.div;
    while (px / n > MAX_W) n++;
    const cw = Math.max(this.film.width, Math.round(px / n)), ch = Math.round(cw / ar);
    if (this.cv.width !== cw || this.cv.height !== ch) {
      this.cv.width = cw; this.cv.height = ch;
      this.g.fillStyle = '#000'; this.g.fillRect(0, 0, cw, ch);
    }
    this.cv.classList.toggle('intro-cv-scaled', n > 1);
    const bar = (H - h) / 2;
    this.root.style.setProperty('--intro-bar', `${Math.max(0, Math.round(bar))}px`);
    this.root.classList.toggle('intro-wide-bars', bar >= 56);
  }

  end(how) {
    if (this.ended) return;
    this.ended = true;
    this.dispose();
    const def = this.s.zone?.def;
    this.game.music?.play(themeForZone(def));
    this.game.sfx?.setAmbience?.(ambienceForZone(def));
    this.onEnd?.(how);
  }

  dispose() {
    this.ended = true;
    cancelAnimationFrame(this.raf);
    try { this.src?.stop(); } catch { /* schon zu Ende */ }
    this.src?.disconnect();
    this.src = null;
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.onResize);
    this.offs.forEach((off) => off?.());
    this.offs = [];
    this.root?.remove();
  }
}
