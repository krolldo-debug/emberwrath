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
  // Stufe 20–40 (INTEGRATION.md §12.2): Steppe Aschewind, Marsch Nebel/Sporen, Zinnen Schnee, Öde Glutregen/Flimmern (sparsam)
  ashen_steppe: { layers: [{ type: 'ash', n: 45 }, { type: 'dust', n: 24 }], weather: ['ashwind', 'clear', 'ashwind', 'ashstorm'] },
  howling_barrow: { layers: [{ type: 'dust', n: 34 }, { type: 'drip', n: 3 }], fog: { a: 0.28, c: [120, 130, 150] } },
  blighted_marsh: { layers: [{ type: 'spore', n: 26 }, { type: 'firefly', n: 8 }], fog: { a: 0.45, c: [110, 140, 100] }, weather: ['fog', 'clear', 'drizzle', 'fog'] },
  spore_hollow: { layers: [{ type: 'spore', n: 60 }, { type: 'dust', n: 10 }], fog: { a: 0.3, c: [110, 160, 90] }, glow: [110, 210, 80] },
  frostspire: { layers: [{ type: 'snow', n: 80 }], weather: ['snow', 'blizzard', 'snow', 'clear'], tint: [150, 190, 240, 0.08] },
  rime_caverns: { layers: [{ type: 'glint', n: 26 }, { type: 'snow', n: 14 }, { type: 'drip', n: 4 }], glow: [110, 170, 255], tint: [120, 170, 240, 0.06] },
  ember_wastes: { layers: [{ type: 'emberrain', n: 22 }, { type: 'ember', n: 28 }, { type: 'ash', n: 26 }], shimmer: 0.45, glow: [255, 90, 30], weather: ['ash', 'emberstorm', 'ash'] },
  ashen_throne: { layers: [{ type: 'ember', n: 50 }, { type: 'emberrain', n: 10 }], shimmer: 0.35, glow: [255, 70, 40] },
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
    // Nebelschwaden: wenige große, weiche Flecken (vorgerendert), ziehen langsam
    this.fogs = [];
    const fog = this.recipe?.fog;
    if (fog) {
      this.fogSprites = [0, 1, 2, 3].map((k) => this.#fogSprite(fog.c, k));
      const n = Math.max(3, Math.round(7 * this.scale * (W * H) / (480 * 270)));
      for (let i = 0; i < n; i++) { const k = i % 4, sp = this.fogSprites[k]; this.fogs.push({ x: rnd(-40, W), y: rnd(H * 0.1, H), k, w: sp.width, h: sp.height, v: rnd(3, 8), ph: rnd(0, 6.28) }); }
    }
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
      case 'snow': p.vx = rnd(-4, 4); p.vy = rnd(10, 22); p.s = Math.random() < 0.3 ? 2 : 1; p.a = rnd(0.55, 0.95); if (!anywhere) p.y = -2; break;
      case 'spore': p.vx = rnd(-2, 2); p.vy = rnd(-5, -1.5); p.a = rnd(0.4, 0.85); p.c = Math.random() < 0.5 ? '#c8f070' : Math.random() < 0.5 ? '#90e060' : '#f0e890'; if (!anywhere) p.y = H + 2; break;
      case 'emberrain': p.vx = rnd(-8, -3); p.vy = rnd(38, 60); p.a = rnd(0.55, 0.95); p.c = Math.random() < 0.35 ? '#fff0b0' : '#ff9a30'; if (!anywhere) p.y = -3; break;
      case 'glint': p.a = rnd(0.5, 1); p.c = Math.random() < 0.5 ? '#e8f6ff' : '#9ad0ff'; break;
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
    const windy = this.state === 'ashstorm' || this.state === 'storm' || this.state === 'blizzard' || this.state === 'emberstorm' || this.state === 'ashwind';
    const blizzard = this.state === 'blizzard';

    for (const p of this.parts) {
      p.x -= dx; p.y -= dy;
      const wind = windy ? (this.state === 'ashwind' ? 14 : blizzard ? 46 : 22) : 0;
      switch (p.type) {
        case 'ash': p.x += (p.vx + Math.sin(this.t * 0.8 + p.ph) * 5 - wind) * dt; p.y += p.vy * (windy ? 1.6 : 1) * dt; break;
        case 'ember': p.x += (p.vx + Math.sin(this.t * 2 + p.ph) * 6 - wind * 0.5) * dt; p.y += p.vy * dt; break;
        case 'firefly': p.x += (p.vx + Math.sin(this.t * 0.7 + p.ph) * 4) * dt; p.y += (p.vy + Math.cos(this.t * 0.9 + p.ph) * 4) * dt; break;
        case 'dust': p.x += (p.vx + Math.sin(this.t * 0.3 + p.ph)) * dt; p.y += p.vy * dt; break;
        case 'bubble': p.x += Math.sin(this.t * 3 + p.ph) * 6 * dt; p.y += p.vy * dt; break;
        case 'snow': p.x += (p.vx + Math.sin(this.t * 1.1 + p.ph) * 6 - wind) * dt; p.y += p.vy * (blizzard ? 1.8 : 1) * dt; break;
        case 'spore': p.x += (p.vx + Math.sin(this.t * 0.6 + p.ph) * 5) * dt; p.y += p.vy * dt; break;
        case 'emberrain': p.x += (p.vx - wind * 0.6) * dt; p.y += p.vy * (this.state === 'emberstorm' ? 1.5 : 1) * dt; break;
        case 'glint': break;
        case 'drip':
          p.life -= dt;
          if (!p.fall && p.life <= 0) { p.fall = true; p.vy = 0; p.y0 = p.y; }
          if (p.fall) { p.vy += 260 * dt; p.y += p.vy * dt; if (p.y - p.y0 > 40) { this.#addSplash(p.x, p.y, '#8ac8e0'); Object.assign(p, this.#make('drip', W, H, true)); } }
          break;
      }
      // Umlauf am Rand (so bleibt die Dichte konstant)
      if (p.x < -4) p.x += W + 8; else if (p.x > W + 4) p.x -= W + 8;
      if (p.y < -4) { if (p.type === 'ember' || p.type === 'bubble' || p.type === 'spore') Object.assign(p, this.#make(p.type, W, H, false)); else p.y += H + 8; }
      else if (p.y > H + 4) { if (p.type === 'ash' || p.type === 'snow' || p.type === 'emberrain') Object.assign(p, this.#make(p.type, W, H, false)); else p.y -= H + 8; }
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
    for (const f of this.fogs ?? []) { f.x -= dx + f.v * dt * (windy ? 2 : 1); f.y -= dy; if (f.x < -f.w) f.x += W + f.w * 2; if (f.x > W + f.w) f.x -= W + f.w * 2; if (f.y < -f.h) f.y += H + f.h; if (f.y > H + f.h) f.y -= H + f.h; }
    this.blizzard = blizzard;
    const ambKey = wet ? (this.state === 'storm' ? 'storm' : 'rain') : blizzard ? 'blizzard' : null;
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
    if (this.state === 'ashwind') { ctx.fillStyle = `rgba(80,64,52,${0.08 * this.mix})`; ctx.fillRect(0, 0, W, H); }
    if (R.tint) { const [r, g, b, a] = R.tint; ctx.fillStyle = `rgba(${r},${g},${b},${a})`; ctx.fillRect(0, 0, W, H); }
    if (this.blizzard) { ctx.fillStyle = `rgba(220,235,255,${0.12 * this.mix})`; ctx.fillRect(0, 0, W, H); }
    if (this.fogs?.length && this.fogSprites) {
      const a = R.fog.a * (this.state === 'fog' ? 0.6 + 0.4 * this.mix : 0.6);
      for (const f of this.fogs) { ctx.globalAlpha = a * (0.7 + 0.3 * Math.sin(t * 0.3 + f.ph)); ctx.drawImage(this.fogSprites[f.k], f.x | 0, (f.y + Math.sin(t * 0.21 + f.ph) * 2) | 0); }
      ctx.globalAlpha = 1;
    }

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
        case 'snow':
          ctx.globalAlpha = p.a; ctx.fillStyle = '#f4f8ff'; ctx.fillRect(x, y, p.s, p.s);
          if (p.s > 1) { ctx.globalAlpha = p.a * 0.4; ctx.fillRect(x - 1, y, 1, 1); }
          break;
        case 'spore': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = p.a * (0.55 + 0.45 * Math.sin(t * 1.4 + p.ph)); ctx.fillStyle = p.c; ctx.fillRect(x, y, 1, 1);
          ctx.globalAlpha *= 0.3; ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3);
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'emberrain':
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = p.a; ctx.fillStyle = p.c; ctx.fillRect(x, y, 1, 1);
          ctx.globalAlpha = p.a * 0.45; ctx.fillRect(x + 1, y - 2, 1, 2); ctx.globalAlpha = p.a * 0.2; ctx.fillRect(x + 1, y - 4, 1, 2);
          ctx.globalCompositeOperation = 'source-over';
          break;
        case 'glint': {
          const b = Math.max(0, Math.sin(t * 1.2 + p.ph * 3));
          if (b < 0.3) break;
          ctx.globalAlpha = p.a * b; ctx.fillStyle = p.c; ctx.fillRect(x, y, 1, 1);
          if (b > 0.85) { ctx.globalAlpha *= 0.5; ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
          break;
        }
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

  // Nebelschwade: weiche, unregelmäßige Wolke aus mehreren Dichteballen, Ränder laufen über
  // geordnetes Dithering (4x4 Bayer, 5 Alphastufen) aus – kein Rechteck, keine harte Kante.
  // Deterministisch je Variante k, gezeichnet 1:1 in Bildpunkten der internen Auflösung.
  #fogSprite([r, g, b], k = 0) {
    let s = 0x9e3779b1 ^ (k * 2654435761);
    const rand = () => { s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >>> 17)) >>> 0; s = (s ^ (s << 5)) >>> 0; return s / 4294967296; };
    const w = 150 + Math.floor(rand() * 60), h = 44 + Math.floor(rand() * 20);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), img = x.createImageData(w, h), d = img.data;
    const blobs = [];
    const nb = 6 + Math.floor(rand() * 4);
    for (let i = 0; i < nb; i++) {
      const u = 0.15 + rand() * 0.7;
      blobs.push({ x: u * w, y: h * (0.42 + (rand() - 0.5) * 0.3), rx: w * (0.1 + rand() * 0.14) * (1 - Math.abs(u - 0.5)), ry: h * (0.16 + rand() * 0.14), a: 0.55 + rand() * 0.45 });
    }
    const ph1 = rand() * 6.28, ph2 = rand() * 6.28;
    const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      let dens = 0;
      for (const o of blobs) { const dx = (px - o.x) / o.rx, dy = (py - o.y) / o.ry; dens += o.a * Math.exp(-(dx * dx + dy * dy)); }
      // Fasern: langgezogene Schlieren entlang der Zugrichtung
      dens *= 0.78 + 0.22 * Math.sin(px * 0.045 + Math.sin(py * 0.21 + ph1) * 1.6 + ph2);
      const ex = Math.min(px, w - 1 - px) / (w * 0.18), ey = Math.min(py, h - 1 - py) / (h * 0.3);
      const edge = Math.min(1, ex) * Math.min(1, ey);
      dens = Math.min(1, dens) * edge * edge * (3 - 2 * edge);
      const lv = dens * 4 + B[(py & 3) * 4 + (px & 3)] / 16 - 0.5;
      const q = Math.max(0, Math.min(4, Math.round(lv)));
      if (!q) continue;
      const i = (py * w + px) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = [0, 46, 92, 140, 190][q];
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  #shimmer(ctx, W, H, k) {
    // Nur die untere Bildhälfte (Hitze vom Boden), in 3-px-Streifen um bis zu 1 px versetzt
    // Quelle ist das überabgetastete Bild (s Bildpunkte je Weltpixel); gezeichnet wird in Weltpixeln.
    // Eine Kopie in einen Puffer ist deutlich billiger als Streifen direkt aus dem Bild selbst (gemessen).
    const src = ctx.canvas, t = this.t, s = src.width / W;
    const bw = src.width, bh = src.height;
    if (!this.buf || this.buf.width !== bw || this.buf.height !== bh) { this.buf = document.createElement('canvas'); this.buf.width = bw; this.buf.height = bh; this.bctx = this.buf.getContext('2d'); }
    const y0 = Math.floor(H * 0.35);
    this.bctx.drawImage(src, 0, y0 * s, bw, (H - y0) * s, 0, y0 * s, bw, (H - y0) * s);
    for (let y = y0; y < H; y += 3) {
      const off = Math.round(Math.sin(y * 0.21 + t * 4.2) * k * ((y - y0) / (H - y0)) * 1.4);
      if (off) ctx.drawImage(this.buf, 0, y * s, bw, 3 * s, off, y, W, 3);
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
