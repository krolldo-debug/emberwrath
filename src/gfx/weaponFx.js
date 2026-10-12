// Seltenheits-Effekte der Waffe (docs/STYLE.md „Feinraster“ §5), gemeinsam für den eigenen Helden (entities/Hero.js)
// und Mitspieler (net/RemotePlayer.js): Glanzlauf, pulsierende Kante, Umlauffunken, Flammenzungen/Runen, Lichtkreis.
// Nur Zeichnen – Teilchen und Licht erzeugt der Held selbst (Hero.#weaponFx).
//
// drawWeaponFx(ctx, o, cx, cy) – o wie ein Akteur:
//   x, y      Fußpunkt in Weltpixeln          facing  Blickrichtung (±1)
//   frame     aktueller Frame mit frame.weapon (Achse, Stufe, Element aus character/gearLook.js); ein zusammengesetzter
//             Reit-Frame (frame.rider) wird aufgelöst
//   ox, oy    Versatz des Reiters (Hero.rideOff), sonst 0
//   ring      Lichtkreis am Boden erlaubt (nicht beritten, nicht im Abrollen), Standard true
//   seed      verschiebt den Glanzlauf je Figur (Entity.id)   t  Zeit in s (Standard performance.now)
//   alpha     Deckkraft (Einblenden), Standard 1
// Kosten: Kante einmal je Frame aus dem Bild gelesen (gecacht), danach je Bild einige Dutzend fillRect.
import { getRarityRing, RING_FRAMES } from '../sprites/effects.js';
import { ELEMENTS } from './Particles.js';
import { makeCanvas } from './PixelCanvas.js';
import { hexToRgb } from './Palette.js';
import { CONFIG } from '../config.js';

// Kante der Waffe je Frame (Seltenheits-Effekte, drawWeaponFx): einmal aus dem Frame-Bild gelesen, dann gecacht.
// Von der Waffenachse aus wird quer nach außen getastet; das letzte deckende Texel vor dem Hintergrund ist der Umriss
// der Klinge. Wo die Waffe vor dem Körper liegt, findet sich in Reichweite kein Hintergrund → dort keine Kante.
// Einträge: [tx, ty, un, up, sx, sy] (Umriss-Texel, un = 0 Griff … 1 Spitze, up = Umriss zeigt nach oben → Ansatz für
// Zungen/Runen, sx/sy = erstes freies Texel davor → Saum, der den Umriss nach außen um ein Feinpixel verbreitert).
const EDGE_CACHE = new WeakMap();
function weaponEdge(frame, a) {
  let e = EDGE_CACHE.get(frame);
  if (e) return e;
  e = [];
  EDGE_CACHE.set(frame, e);
  const cv = frame.canvas, r = frame.res ?? 1;
  const dx = Math.cos(a.ang), dy = Math.sin(a.ang), span = a.u1 - a.u0 || 1;
  const bend = (u) => (a.arc ? a.arc * (1 - ((2 * (u - a.u0)) / span - 1) ** 2) : 0);
  const reachW = a.great ? 3.5 : a.arc ? 1.5 : 2.5, reach = Math.round(reachW * r);
  // Nur das Rechteck um die Waffe lesen (weniger Rücklesen aus der Grafikkarte)
  const m = reachW + Math.abs(a.arc ?? 0) + 1;
  const ex = [a.x + dx * a.u0, a.x + dx * a.u1], ey = [a.y + dy * a.u0, a.y + dy * a.u1];
  const X0 = Math.max(0, Math.floor(frame.ax + (Math.min(...ex) - m) * r)), Y0 = Math.max(0, Math.floor(frame.ay + (Math.min(...ey) - m) * r));
  const X1 = Math.min(cv.width, Math.ceil(frame.ax + (Math.max(...ex) + m) * r)), Y1 = Math.min(cv.height, Math.ceil(frame.ay + (Math.max(...ey) + m) * r));
  const W = X1 - X0, H = Y1 - Y0;
  if (W <= 0 || H <= 0) return e;
  let data;
  try { data = cv.getContext('2d').getImageData(X0, Y0, W, H).data; } catch { return e; }
  const seen = new Set();
  const walk = (u, bx, by, ux, uy) => {
    let last = -1;
    for (let k = 0; k <= reach; k++) {
      const tx = Math.floor(frame.ax + (bx + ux * (k / r)) * r) - X0, ty = Math.floor(frame.ay + (by + uy * (k / r)) * r) - Y0;
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return;
      const i = ty * W + tx;
      if (data[i * 4 + 3] < 16) {
        if (last >= 0 && !seen.has(last)) { seen.add(last); e.push([X0 + (last % W), Y0 + ((last / W) | 0), (u - a.u0) / span, uy < -0.3, X0 + tx, Y0 + ty]); }
        return;
      }
      last = i;
    }
  };
  const u0 = a.arc ? a.u0 : a.u0 + Math.min(1.5, span * 0.15);   // Griff und Hand auslassen
  for (let u = u0; u <= a.u1 + 0.01; u += 1 / r) {
    const s = bend(u), bx = a.x + dx * u - dy * s, by = a.y + dy * u + dx * s;
    walk(u, bx, by, -dy, dx); walk(u, bx, by, dy, -dx);
  }
  walk(a.u1, a.x + dx * a.u1 - dy * bend(a.u1), a.y + dy * a.u1 + dx * bend(a.u1), dx, dy);   // Spitze
  return e;
}
// Ruhende Kante legendärer Waffen als fertige Ebene je Frame und Blickrichtung (Saum dunkelste Stufe, Umriss
// zweitdunkelste): ein drawImage statt vieler Einzelpixel; bewegt werden danach nur Puls und Leuchtbänder.
function edgeBase(frame, edge, c, flip) {
  const key = `${c[3]}|${c[4]}|${flip ? 1 : 0}`;
  edge.base ??= new Map();
  let cv = edge.base.get(key);
  if (cv) return cv;
  const W = frame.canvas.width, H = frame.canvas.height;
  cv = makeCanvas(W, H);
  const g = cv.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  const put = (x, y, rgb) => { const i = (y * W + (flip ? W - 1 - x : x)) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255; };
  const halo = hexToRgb(c[4]), line = hexToRgb(c[3]);
  for (const e of edge) put(e[4], e[5], halo);
  for (const e of edge) put(e[0], e[1], line);
  g.putImageData(img, 0, 0);
  edge.base.set(key, cv);
  return cv;
}
// Runen der legendären Nicht-Feuer-Waffen (Feinpixel, 3 × 3)
const WEAPON_RUNES = [[[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]], [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]], [[1, 0], [0, 1], [2, 1], [1, 2]]];

// Leuchten an der Waffe, gestaffelt nach Seltenheit; nur harte Feinpixel (0,5 Weltpixel), keine Transparenzstufen.
//   selten   – gelegentlicher Glanzlauf von der Hand zur Spitze, dort kurz ein Funkelstern
//   episch   – dazu pulsierende Kante (Umriss der Klinge in der Elementfarbe) und zwei Funken, die die Waffe umlaufen
//   legendär – dazu Flammenzungen (Feuer/Licht) bzw. aufsteigende Runen entlang der Oberkante, drei Umlauffunken
//              und ein gestufter Lichtkreis am Boden (sprites/effects.js getRarityRing)
// Farben = Elementrampe (gfx/Particles.js ELEMENTS) wie das Item-Bild im Inventar (gfx/ItemFx.js itemFxTheme/FX_PALETTES).
export function drawWeaponFx(ctx, o, cx, cy) {
  let frame = o.frame, ox = o.ox ?? 0, oy = o.oy ?? 0, ground = o.ring ?? true;
  const hx = o.x, hy = o.y, facing = o.facing ?? 1;
  if (frame?.rider) {   // Mitspieler beritten: zusammengesetzter Frame (sprites/mounts.js RideFrame) → Reiter-Frame + Sattelversatz
    ox += frame.ox * (facing < 0 ? -1 : 1); oy += frame.oy; frame = frame.rider; ground = false;
  }
  const a = frame?.weapon;
  if (!a || !a.tier) return;
  const t = o.t ?? performance.now() / 1000;
  const el = ELEMENTS[a.fx] ?? ELEMENTS.arcane, c = el.colors;
  const q = (CONFIG.renderScale ?? 1) >= 2 ? 2 : 1, P = 1 / q;   // Feinraster (gfx/Fine.js fineRes)
  const snap = (v) => Math.round(v * q) / q;
  const prev = ctx.globalCompositeOperation;
  ctx.globalAlpha = o.alpha ?? 1;
  // Lichtkreis am Boden (legendär, nicht beritten): hellt den Boden mit harten Pixeln auf
  if (a.tier >= 3 && ground) {
    const ring = getRarityRing(c, q, Math.floor(t * 8) % RING_FRAMES);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(ring.canvas, snap(hx - cx - ring.w / 2), snap(hy - cy + 0.5 - ring.h / 2), ring.w, ring.h);
    ctx.globalCompositeOperation = prev;
  }
  if (a.back) return;   // back: Zweihänder hinter dem Kopf (Ausholen), Effekt nicht über den Helm legen
  const f = facing < 0 ? -1 : 1;
  const dx = Math.cos(a.ang), dy = Math.sin(a.ang), span = a.u1 - a.u0 || 1;
  const bend = (u) => (a.arc ? a.arc * (1 - ((2 * (u - a.u0)) / span - 1) ** 2) : 0); // Bogen gekrümmt
  const px = (u, s = 0) => snap(hx - cx + ox + (a.x + dx * u - dy * (s + bend(u))) * f - (f < 0 ? 1 / (frame.res ?? 1) : 0));
  const py = (u, s = 0) => snap(hy - cy + oy + a.y + dy * u + dx * (s + bend(u)));
  const dot = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, P, P); };
  if (a.tier >= 2) {
    const strong = a.tier >= 3;
    // Pulsierende Kante: Umrisspixel der Klinge in der Elementfarbe, ein heller Puls läuft zur Spitze
    const edge = weaponEdge(frame, a);
    if (edge.length) {
      const r = frame.res ?? 1, W = frame.canvas.width;
      const left = f < 0 ? Math.round((hx - cx + ox) * r - (W - frame.ax)) / r : Math.round((hx - cx + ox) * r - frame.ax) / r;
      const top = Math.round((hy - cy + oy) * r - frame.ay) / r;
      const run = (t * (strong ? 0.9 : 0.7)) % 1.6;   // heller Puls Hand → Spitze, danach kurze Pause
      const wave = (un) => Math.sin(t * 3.1 - un * 5) > 0.2;   // langsame Leuchtbänder entlang der Kante (kein Blinken)
      const T = 1 / r;
      const X = (tx) => left + (f < 0 ? W - 1 - tx : tx) * T;
      // Saum außen (ein Feinpixel) in der dunkelsten Stufe – ersetzt den alten weichen Schein. Episch nur in den
      // Leuchtbändern, legendär durchgehend; am Puls eine Stufe heller.
      let cur = null;
      const fill = (col) => { if (col !== cur) { ctx.fillStyle = col; cur = col; } };
      if (strong) { const base = edgeBase(frame, edge, c, f < 0); ctx.drawImage(base, left, top, base.width * T, base.height * T); }
      for (let i = 0; i < edge.length; i++) {
        const e = edge[i], d = Math.abs(e[2] - run);
        if (d < 0.2) fill(c[3]);
        else if (!strong && wave(e[2])) fill(c[4]);
        else continue;
        ctx.fillRect(X(e[4]), top + e[5] * T, T, T);
      }
      // Umriss selbst: Puls weiß-heiß, Bänder in der Mittelstufe; episch außerhalb der Bänder unverändert dunkel
      for (let i = 0; i < edge.length; i++) {
        const [tx, ty, un] = edge[i];
        const d = Math.abs(un - run), lit = wave(un);
        let col;
        if (d < 0.08) col = c[0];
        else if (d < 0.2) col = c[1];
        else if (lit) col = strong ? c[2] : c[3];
        else continue;   // legendär: ruhende Kante liegt schon in der Ebene, episch: Umriss bleibt dunkel
        fill(col);
        ctx.fillRect(X(tx), top + ty * T, T, T);
      }
    }
    // Umlauffunken: kreisen spiralig von der Hand zur Spitze; über der Klinge ausgespart (keine Sprenkel auf dem Metall),
    // auf der Rückseite eine Stufe dunkler
    const short = span < 8;   // Dolch, Stabkopf: kleine Fläche, weniger Zierde, sonst verklumpt es
    const n = short ? 1 : strong ? 3 : 2, rad = a.great ? 4.5 : a.arc ? 3.5 : short ? 3 : 4, hw = a.great ? 1.8 : a.arc ? 1 : 1.4;
    const FRONT = [c[0], c[1], c[1], c[2], c[3]], BACK = [c[2], c[3], c[3], c[4], c[4]];
    for (let i = 0; i < n; i++) {
      const ph0 = (t * 0.55 + i / n) % 1;
      for (let k = 4; k >= 0; k--) {
        const ph = ph0 - k * (0.5 / Math.max(6, span));   // Spur: ein Feinpixel je Glied
        if (ph < 0.04) continue;
        const ang = ph * Math.PI * 4 + i * 1.3;
        const u = a.u0 + span * ph, s = rad * Math.sin(ang);
        if (Math.abs(s) < hw) continue;
        const col = (Math.cos(ang) > 0 ? FRONT : BACK)[k];
        dot(px(u, s), py(u, s), ph > 0.94 && k === 0 ? c[2] : col);
      }
    }
    // Legendär: Flammenzungen (Feuer, Licht) bzw. aufsteigende Runen entlang der Oberkante
    if (strong && edge.length) {
      const tops = edge.filter((e) => e[3]);
      const src = tops.length >= 3 ? tops : edge;
      const r = frame.res ?? 1, W = frame.canvas.width;
      const left = f < 0 ? Math.round((hx - cx + ox) * r - (W - frame.ax)) / r : Math.round((hx - cx + ox) * r - frame.ax) / r;
      const top = Math.round((hy - cy + oy) * r - frame.ay) / r;
      const at = (e) => [snap(left + (f < 0 ? W - 1 - e[0] : e[0]) / r), snap(top + e[1] / r)];
      const tongues = a.fx === 'fire' || a.fx === 'holy';
      const m = a.arc ? 3 : short ? 1 : Math.min(a.great ? 4 : 5, Math.round(span / 3));
      for (let i = 0; i < m; i++) {
        const e = src[Math.min(src.length - 1, Math.floor(((i + 0.5) / m) * src.length))];
        const [x, y] = at(e);
        if (tongues) {
          const ph = t * 8 + i * 2.39;
          const h0 = 2 + Math.round(2.5 * (0.5 + 0.5 * Math.sin(ph)) + (Math.sin(ph * 0.53) > 0.6 ? 1 : 0));   // Feinpixel
          const h = q > 1 ? h0 : Math.ceil(h0 / 2);   // „Niedrig“: gleiche Höhe in Weltpixeln
          for (let k = 0; k < h; k++) {
            const kk = k / h;
            const sway = k > 1 ? Math.round(Math.sin(ph * 0.7 + k) * 0.8) * P : 0;
            const col = kk < 0.3 ? c[0] : kk < 0.65 ? c[1] : c[2];
            ctx.fillStyle = col;
            ctx.fillRect(x + sway, y - (k + 1) * P, kk < 0.4 && q > 1 ? 2 * P : P, P);
          }
          if (h >= 4) dot(x + Math.round(Math.sin(ph) * 1.2) * P, y - (h + 2) * P, c[3]);   // abgelöster Fetzen
        } else {
          const cyc = (t * 0.8 + i * 0.37) % 1.4;   // 1 s sichtbar, dann Pause
          if (cyc > 1) continue;
          const rise = Math.floor(cyc * 5) * P;
          const col = cyc < 0.25 ? c[0] : cyc < 0.6 ? c[1] : cyc < 0.85 ? c[2] : c[3];
          ctx.fillStyle = col;
          for (const [u, v] of WEAPON_RUNES[(i + Math.floor(t * 0.8 + i * 0.37 + 0.4)) % WEAPON_RUNES.length]) ctx.fillRect(x + (u - 1) * P, y - 4 * P - rise + v * P, P, P);
        }
      }
    }
  }
  // Glanzlauf von der Hand zur Spitze (ab selten), am Ende ein kurzer Funkelstern
  const period = a.tier >= 3 ? 2 : a.tier >= 2 ? 2.6 : 3.4;
  const p = ((t + (o.seed ?? 0) * 0.37) % period) / 0.35;
  if (p < 1) {
    const u = a.u0 + span * p;
    dot(px(u), py(u), '#ffffff');
    if (p > 0.08) dot(px(u - 0.5), py(u - 0.5), c[0]);
    if (p > 0.16) dot(px(u - 1), py(u - 1), c[1]);
  } else if (p < 1.6) {
    const x = px(a.u1), y = py(a.u1), arm = p < 1.2 || p > 1.45 ? 1 : 2;
    dot(x, y, '#ffffff');
    for (let k = 1; k <= arm; k++) {
      const col = k === 1 ? c[0] : c[1];
      dot(x - k * P, y, col); dot(x + k * P, y, col); dot(x, y - k * P, col); dot(x, y + k * P, col);
    }
  }
}
