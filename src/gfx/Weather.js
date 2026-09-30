import { CONFIG } from '../config.js';
import { ambienceForZone } from '../audio/Soundscape.js';

// Umgebungseffekte je Zone (Thread D): fallende Asche, Regen, aufsteigende Glut,
// Glühwürmchen, Staub, Blasen, Wasserlicht (Kaustik) und Hitzeflimmern.
// Bildschirmraum-Partikel mit Kamera-Mitbewegung (wirken wie in der Welt
// verankert), eigenes kleines Budget, Menge folgt der Qualitätsstufe.
// Rein darstellend: liest Zone, Kamera und Zeit, schreibt keinen Spielzustand.

// Zonen-Rezepte (IDs aus INTEGRATION.md §11.1). Unbekannte Zonen: nach kind.
// layer: { type, n (Anzahl bei hoher Qualität) }, weather: wechselnde Zustände.
export const ZONE_WEATHER = {
  emberhollow: { layers: [{ type: 'firefly', n: 18 }, { type: 'ember', n: 10 }], weather: ['clear', 'clear', 'drizzle'] },
  catacombs: { layers: [{ type: 'dust', n: 40 }, { type: 'drip', n: 4 }] },
  ashwood: { layers: [{ type: 'ash', n: 70 }, { type: 'ember', n: 6 }], weather: ['ash', 'rain', 'ash', 'storm'] },
  sunken_temple: { layers: [{ type: 'bubble', n: 22 }, { type: 'drip', n: 8 }, { type: 'dust', n: 16 }], caustics: true },
  cinder_peaks: { layers: [{ type: 'ash', n: 60 }, { type: 'ember', n: 34 }], shimmer: 0.6, weather: ['ash', 'ashstorm', 'ash'] },
  molten_forge: { layers: [{ type: 'ember', n: 60 }, { type: 'dust', n: 14 }], shimmer: 1, glow: [255, 90, 30] },
  ember_trial: { layers: [{ type: 'ember', n: 50 }, { type: 'ash', n: 20 }], shimmer: 0.7, glow: [255, 70, 40] },
};
const DEFAULT = { outdoor: { layers: [{ type: 'firefly', n: 10 }] }, dungeon: { layers: [{ type: 'dust', n: 30 }] } };

// Qualität -> Mengenfaktor (Einstellung 'quality', ui/Quality.js)
export const QUALITY_WEATHER = { low: 0.3, medium: 0.6, high: 1 };

const rnd = (a, b) => a + Math.random() * (b - a);

export class Weather {
  constructor(session) {
    this.s = session;
    this.t = 0;
    this.scale = 1;        // Mengenfaktor (Qualität)
    this.shimmerOn = true; // Hitzeflimmern nur ab mittlerer Qualität
    this.parts = [];
    this.rain = [];
    this.splash = [];
    this.flash = 0;
    this.state = 'clear'; this.stateT = 0; this.stateLen = 60; this.mix = 0; // 0..1 Stärke des Wetterzustands
    this.lastCam = null;
    this.recipe = null;
    this.zoneId = null;
  }

  setQuality(q) {
    const f = QUALITY_WEATHER[q] ?? 1;
    if (f === this.scale && this.shimmerOn === (q !== 'low')) return;
    this.scale = f; this.shimmerOn = q !== 'low';
    this.#rebuild();
  }

  #recipeFor() {
    const def = this.s.zone?.def;
    const id = def?.id ?? this.s.zone?.zoneId;
    return def?.weather ?? ZONE_WEATHER[id] ?? DEFAULT[def?.kind === 'dungeon' || def?.instanced ? 'dungeon' : 'outdoor'];
  }

  #rebuild() {
    const W = CONFIG.viewWidth, H = CONFIG.viewHeight;
    this.parts = [];
    for (const L of this.recipe?.layers ?? []) {
      const n = Math.round(L.n * this.scale * (W * H) / (480 * 270));
      for (let i = 0; i < n; i++) this.parts.push(this.#make(L.type, W, H, true));
    }
  }

  #make(type, W, H, anywhere) {
    const p = { type, x: rnd(0, W), y: anywhere ? rnd(0, H) : 0, vx: 0, vy: 0, a: 1, ph: rnd(0, 6.28), s: 1, life: 0 };
    switch (type) {
      case 'ash': p.vx = rnd(-6, 4); p.vy = rnd(8, 16); p.s = Math.random() < 0.25 ? 2 : 1; p.a = rnd(0.35, 0.8); p.c = Math.random() < 0.5 ? '#a8a0a0' : '#6e6668'; if (!anywhere) p.y = -2; break;
      case 'ember': p.vx = rnd(-4, 4); p.vy = rnd(-18, -8); p.a = rnd(0.6, 1); p.c = Math.random() < 0.3 ? '#fff0b0' : Math.random() < 0.6 ? '#ffb640' : '#f07a1c'; if (!anywhere) p.y = H + 2; break;
      case 'firefly': p.vx = rnd(-3, 3); p.vy = rnd(-3, 3); p.c = Math.random() < 0.5 ? '#d8ff90' : '#fff0a0'; break;
      case 'dust': p.vx = rnd(-2, 2); p.vy = rnd(-1.5, 1.5); p.a = rnd(0.2, 0.5); p.c = '#c8b8a0'; break;
      case 'bubble': p.vx = 0; p.vy = rnd(-10, -5); p.a = rnd(0.35, 0.7); p.s = Math.random() < 0.3 ? 2 : 1; if (!anywhere) p.y = H + 2; break;
      case 'drip': p.vx = 0; p.vy = 0; p.life = rnd(0, 3); p.y = rnd(0, H * 0.6); p.fall = false; break;
    }
    return p;
  }

  update(dt) {
    this.t += dt;
    const W = CONFIG.viewWidth, H = CONFIG.viewHeight;
    const def = this.s.zone?.def, zid = def?.id ?? this.s.zone?.zoneId;
    if (zid !== this.zoneId || this.size !== `${W}x${H}`) {
      this.zoneId = zid; this.size = `${W}x${H}`;
      this.recipe = this.#recipeFor();
      this.state = this.recipe?.weather?.[0] ?? 'clear'; this.stateT = 0; this.stateLen = rnd(70, 130); this.mix = 0.5;
      this.rain = []; this.splash = [];
      this.lastCam = null; this.ambKey = undefined;
      this.#rebuild();
    }
    // Kamera-Mitbewegung: Verschiebung der Kamera zieht die Partikel mit
    const cam = this.s.camera;
    const cx = cam?.x ?? 0, cy = cam?.y ?? 0;
    let dx = 0, dy = 0;
    if (this.lastCam) { dx = cx - this.lastCam.x; dy = cy - this.lastCam.y; if (Math.abs(dx) > 60 || Math.abs(dy) > 60) dx = dy = 0; }
    this.lastCam = { x: cx, y: cy };

    // Wetterwechsel (nur Zonen mit weather-Liste)
    const list = this.recipe?.weather;
    if (list) {
      this.stateT += dt;
      if (this.stateT > this.stateLen) {
        this.state = list[(list.indexOf(this.state) + 1) % list.length];
        this.stateT = 0; this.stateLen = rnd(60, 120); this.mix = 0;
      }
      this.mix = Math.min(1, this.mix + dt / 8);
    }
    const wet = this.state === 'rain' || this.state === 'storm' || this.state === 'drizzle';
    const windy = this.state === 'ashstorm' || this.state === 'storm';

    for (const p of this.parts) {
      p.x -= dx; p.y -= dy;
      const wind = windy ? 22 : 0;
      switch (p.type) {
        case 'ash': p.x += (p.vx + Math.sin(this.t * 0.8 + p.ph) * 5 - wind) * dt; p.y += p.vy * (windy ? 1.6 : 1) * dt; break;
        case 'ember': p.x += (p.vx + Math.sin(this.t * 2 + p.ph) * 6 - wind * 0.5) * dt; p.y += p.vy * dt; break;
        case 'firefly': p.x += (p.vx + Math.sin(this.t * 0.7 + p.ph) * 4) * dt; p.y += (p.vy + Math.cos(this.t * 0.9 + p.ph) * 4) * dt; break;
        case 'dust': p.x += (p.vx + Math.sin(this.t * 0.3 + p.ph)) * dt; p.y += p.vy * dt; break;
        case 'bubble': p.x += Math.sin(this.t * 3 + p.ph) * 6 * dt; p.y += p.vy * dt; break;
        case 'drip':
          p.life -= dt;
          if (!p.fall && p.life <= 0) { p.fall = true; p.vy = 0; p.y0 = p.y; }
          if (p.fall) { p.vy += 260 * dt; p.y += p.vy * dt; if (p.y - p.y0 > 40) { this.#addSplash(p.x, p.y, '#8ac8e0'); Object.assign(p, this.#make('drip', W, H, true)); } }
          break;
      }
      // Umlauf am Rand (so bleibt die Dichte konstant)
      if (p.x < -4) p.x += W + 8; else if (p.x > W + 4) p.x -= W + 8;
      if (p.y < -4) { if (p.type === 'ember' || p.type === 'bubble') Object.assign(p, this.#make(p.type, W, H, false)); else p.y += H + 8; }
      else if (p.y > H + 4) { if (p.type === 'ash') Object.assign(p, this.#make(p.type, W, H, false)); else p.y -= H + 8; }
    }

    // Regen: eigene Tropfen, Menge je Zustand
    const want = wet ? Math.round((this.state === 'drizzle' ? 50 : this.state === 'storm' ? 220 : 140) * this.scale * this.mix * (W * H) / (480 * 270)) : 0;
    while (this.rain.length < want) this.rain.push({ x: rnd(-20, W + 20), y: rnd(-H, 0), v: rnd(220, 300), l: rnd(4, 7), gy: rnd(H * 0.2, H) });
    if (this.rain.length > want) this.rain.length = want;
    for (const r of this.rain) {
      r.x -= dx + (windy ? 60 : 30) * dt; r.y += r.v * dt - dy;
      if (r.y > r.gy) { if (Math.random() < 0.5 * this.scale) this.#addSplash(r.x, r.gy, '#a8c0e0'); r.x = rnd(-20, W + 40); r.y = rnd(-30, -5); r.gy = rnd(H * 0.15, H); }
      if (r.x < -30) r.x += W + 60;
    }
    for (const sp of this.splash) { sp.t += dt; sp.x -= dx; sp.y -= dy; }
    this.splash = this.splash.filter((sp) => sp.t < 0.25);
    // Gewitterblitz (selten)
    if (this.state === 'storm' && this.mix > 0.6 && Math.random() < dt * 0.05) { this.flash = 1; this.s.sfx?.play?.('bossRoar', { pitch: 0.5 }); }
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.wet = wet; this.windy = windy;
    // Regengeräusch: Atmo-Mischung mitwechseln (zurück zur Zonen-Atmo, wenn trocken)
    const ambKey = wet ? (this.state === 'storm' ? 'storm' : 'rain') : null;
    if (ambKey !== this.ambKey) {
      this.ambKey = ambKey;
      this.s.game.sfx?.setAmbience?.(ambKey ?? ambienceForZone({ ...(def ?? {}), id: zid }));
    }
  }

  #addSplash(x, y, c) { if (this.splash.length < 40) this.splash.push({ x, y, t: 0, c }); }

  draw(ctx) {
    const W = CONFIG.viewWidth, H = CONFIG.viewHeight, R = this.recipe;
    if (!R) return;
    const t = this.t;
    // Hitzeflimmern: Bildstreifen leicht seitlich versetzt (vor den Partikeln)
    if (R.shimmer && this.shimmerOn) this.#shimmer(ctx, W, H, R.shimmer);
    if (R.caustics) this.#caustics(ctx, W, H);
    if (R.glow) {
      const [r, g, b] = R.glow, a = 0.08 + 0.04 * Math.sin(t * 1.3);
      const lg = ctx.createLinearGradient(0, H, 0, H * 0.45);
      lg.addColorStop(0, `rgba(${r},${g},${b},${a})`); lg.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
    }
    // Wetter-Tönung
    if (this.wet) { ctx.fillStyle = `rgba(20,30,60,${0.16 * this.mix})`; ctx.fillRect(0, 0, W, H); }
    if (this.state === 'ashstorm') { ctx.fillStyle = `rgba(70,50,50,${0.18 * this.mix})`; ctx.fillRect(0, 0, W, H); }

    for (const p of this.parts) {
      const x = p.x | 0, y = p.y | 0;
      switch (p.type) {
        case 'ash': ctx.globalAlpha = p.a; ctx.fillStyle = p.c; ctx.fillRect(x, y, p.s, 1); break;
        case 'ember': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(t * 9 + p.ph));
          ctx.fillStyle = p.c; ctx.fillRect(x, y, 1, 1);
          ctx.globalAlpha *= 0.35; ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3);
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'firefly': {
          const a = Math.max(0, Math.sin(t * 1.6 + p.ph));
          if (a < 0.05) break;
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = a; ctx.fillStyle = p.c; ctx.fillRect(x, y, 1, 1);
          ctx.globalAlpha = a * 0.3; ctx.fillRect(x - 1, y - 1, 3, 3);
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'dust': ctx.globalAlpha = p.a * (0.5 + 0.5 * Math.sin(t * 0.8 + p.ph)); ctx.fillStyle = p.c; ctx.fillRect(x, y, 1, 1); break;
        case 'bubble':
          ctx.globalAlpha = p.a; ctx.fillStyle = '#b8e8ff';
          if (p.s > 1) { ctx.fillRect(x + 1, y, 1, 1); ctx.fillRect(x, y + 1, 1, 1); ctx.fillRect(x + 2, y + 1, 1, 1); ctx.fillRect(x + 1, y + 2, 1, 1); ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 1, y, 1, 1); }
          else ctx.fillRect(x, y, 1, 1);
          break;
        case 'drip':
          if (!p.fall) { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4 + p.ph); ctx.fillStyle = '#8ac8e0'; ctx.fillRect(x, y, 1, 1); }
          else { ctx.globalAlpha = 0.8; ctx.fillStyle = '#a8d8f0'; ctx.fillRect(x, y, 1, 2); }
          break;
      }
    }
    ctx.globalAlpha = 1;
    if (this.rain.length) {
      ctx.strokeStyle = 'rgba(170,190,230,0.55)'; ctx.lineWidth = 1; ctx.beginPath();
      const slant = this.windy ? 0.28 : 0.14;
      for (const r of this.rain) { ctx.moveTo((r.x | 0) + 0.5, r.y | 0); ctx.lineTo((r.x - r.l * slant | 0) + 0.5, (r.y - r.l) | 0); }
      ctx.stroke();
    }
    for (const sp of this.splash) {
      const k = sp.t / 0.25; ctx.globalAlpha = 0.7 * (1 - k); ctx.fillStyle = sp.c;
      const w = 1 + Math.round(k * 3); ctx.fillRect((sp.x | 0) - w, sp.y | 0, 1, 1); ctx.fillRect((sp.x | 0) + w, sp.y | 0, 1, 1); if (k < 0.4) ctx.fillRect(sp.x | 0, (sp.y | 0) - 1, 1, 1);
    }
    ctx.globalAlpha = 1;
    if (this.flash > 0) { ctx.globalAlpha = this.flash * 0.35; ctx.fillStyle = '#dce8ff'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }

  #shimmer(ctx, W, H, k) {
    // Nur die untere Bildhälfte (Hitze vom Boden), in 3-px-Streifen um bis zu 1 px versetzt
    const src = ctx.canvas, t = this.t;
    if (!this.buf || this.buf.width !== W || this.buf.height !== H) { this.buf = document.createElement('canvas'); this.buf.width = W; this.buf.height = H; this.bctx = this.buf.getContext('2d'); }
    const y0 = Math.floor(H * 0.35);
    this.bctx.clearRect(0, 0, W, H);
    this.bctx.drawImage(src, 0, y0, W, H - y0, 0, y0, W, H - y0);
    for (let y = y0; y < H; y += 3) {
      const off = Math.round(Math.sin(y * 0.21 + t * 4.2) * k * ((y - y0) / (H - y0)) * 1.4);
      if (off) ctx.drawImage(this.buf, 0, y, W, 3, off, y, W, 3);
    }
  }

  #caustics(ctx, W, H) {
    // Wasserlicht: wandernde helle Bänder, additiv und sehr zart
    const t = this.t;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgb(40,110,150)';
    for (let i = 0; i < 7; i++) {
      const y = ((i * 47 + t * 9) % (H + 40)) - 20;
      ctx.globalAlpha = 0.08 + 0.05 * Math.sin(t * 1.7 + i);
      for (let x = -10; x < W + 10; x += 6) {
        const yy = y + Math.sin(x * 0.05 + t * 1.3 + i) * 6;
        ctx.fillRect(x, yy | 0, 6, 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
