import { Entity } from './Entity.js';
import { HazardCloud } from './Hazards.js';
import { fineRes } from '../gfx/Fine.js';
import { makeCanvas } from '../gfx/PixelCanvas.js';
import { createArrowSprite } from '../sprites/effects.js';

// Feinraster (docs/STYLE.md „Feinraster“): Geschosse zeichnen auf Feinpixel gerundet (q = fineRes(), bei „Niedrig“ 1
// wie früher). Licht von oben links, harte Stufen; Zauberkugeln als vorgerechnete Bilder je Element (Frost mit
// Eisdornen, Schatten/Fluch mit dunklem Kern und hellem Rand, Feuer mit Flammenzungen …), Schweif in Feinpixeln.
const sn = (v, q) => Math.round(v * q) / q;
const SHADOW = 'rgba(4,2,8,0.4)';
let arrowFine = null;

// Pfeil: fliegt in Höhe z über dem Boden, bleibt in Wänden stecken,
// kann vom Schwert des Helden abgewehrt werden.
export class Arrow extends Entity {
  constructor(x, y, angle, speed, damage, owner, sprite) {
    super(x, y);
    this.angle = angle;
    this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
    this.z = 10; this.damage = damage; this.owner = owner;
    this.team = owner.team; this.sprite = sprite;
    this.stuck = false; this.life = 3; this.deflectable = true;
  }
  update(dt, world) {
    this.life -= dt;
    if (this.life <= 0) { this.removed = true; return; }
    if (this.stuck) return;
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    const T = 16;
    if (world.dungeon.isWall(Math.floor(nx / T), Math.floor((ny - this.z * 0.5) / T))) {
      this.stuck = true; this.life = 1.2;
      world.particles.dust(this.x, this.y - this.z, 3);
      world.bus.emit('arrowStuck', { x: this.x, y: this.y });
      return;
    }
    this.x = nx; this.y = ny;
    const h = world.hero;
    if (!h.dead && Math.hypot(h.x - this.x, h.centerY - (this.y - this.z * 0.2)) < h.hurtRadius + 2) {
      const hit = { damage: this.damage, dirX: Math.cos(this.angle), dirY: Math.sin(this.angle), knockback: 90, source: this.owner };
      if (h.takeHit(hit)) {
        world.bus.emit('hit', { attacker: this.owner, target: h, damage: hit.damage, crit: false, heavy: false, dirX: hit.dirX, dirY: hit.dirY, x: h.x, y: h.centerY, killed: h.dead });
        this.removed = true;
      }
    }
  }
  deflect(world) {
    this.removed = true;
    world.bus.emit('deflect', { x: this.x, y: this.y - this.z });
  }
  render(ctx, cx, cy) {
    const q = fineRes();
    ctx.fillStyle = SHADOW;
    ctx.fillRect(sn(this.x - cx, q) - 2, sn(this.y - cy, q), 4, 1);
    ctx.save();
    ctx.translate(sn(this.x - cx, q), sn(this.y - this.z - cy, q));
    ctx.rotate(Math.round(this.angle / (Math.PI / 8)) * (Math.PI / 8));
    // Feinraster: eigener Pfeil in 2 Texeln je Weltpixel (Assets-Pfeil bleibt die grobe Fassung für „Niedrig“)
    if (q > 1) ctx.drawImage(arrowFine ??= createArrowSprite(2), -7, -1, 9, 3);
    else ctx.drawImage(this.sprite, -7, -1);
    ctx.restore();
  }
}

// Knochenspeer des Knochenfürsten: schneller, nicht abwehrbar (ausweichen!),
// zersplittert an Wänden. Leuchtet violett.
export class BoneSpear extends Entity {
  constructor(x, y, angle, speed, damage, owner) {
    super(x, y);
    this.angle = angle;
    this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
    this.z = 14; this.damage = damage; this.owner = owner;
    this.team = owner.team; this.life = 2.2; this.deflectable = false; this.stuck = false;
  }
  update(dt, world) {
    this.life -= dt;
    if (this.life <= 0) { this.removed = true; return; }
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    if (world.dungeon.isWall(Math.floor(nx / 16), Math.floor((ny - this.z * 0.5) / 16))) {
      this.removed = true;
      world.particles.bones(this.x, this.y, this.z, this.angle + Math.PI, 4, ['#80755c', '#bcae8e', '#e6dcc0']);
      world.bus.emit('arrowStuck', { x: this.x, y: this.y });
      return;
    }
    this.x = nx; this.y = ny;
    if (Math.random() < dt * 30) world.particles.spawn({ x: this.x, y: this.y - this.z, vx: 0, vy: 0, rise: 4, life: 0.3, colors: ['#e0b8ff', '#a060f0'], emissive: true });
    const h = world.hero;
    if (!h.dead && Math.hypot(h.x - this.x, h.centerY - (this.y - this.z * 0.3)) < h.hurtRadius + 3) {
      const hit = { damage: this.damage, dirX: Math.cos(this.angle), dirY: Math.sin(this.angle), knockback: 120, source: this.owner };
      if (h.takeHit(hit)) {
        world.bus.emit('hit', { attacker: this.owner, target: h, damage: hit.damage, crit: false, heavy: false, dirX: hit.dirX, dirY: hit.dirY, x: h.x, y: h.centerY, killed: h.dead });
        this.removed = true;
      }
    }
  }
  render(ctx, cx, cy) {
    const q = fineRes(), P = 1 / q;
    ctx.fillStyle = SHADOW;
    ctx.fillRect(sn(this.x - cx, q) - 3, sn(this.y - cy, q), 6, 1);
    const x = this.x - cx, y = this.y - this.z - cy;
    const dx = Math.cos(this.angle), dy = Math.sin(this.angle);
    if (q === 1) {
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = i > 9 ? '#fffbef' : i > 5 ? '#e6dcc0' : '#bcae8e';
        ctx.fillRect(Math.round(x - dx * (11 - i)), Math.round(y - dy * (11 - i)), 1, 1);
      }
      return;
    }
    // Feinraster: Knochenschaft 2 Feinpixel stark (oben hell, unten Schatten), Gelenkknoten, Spitze mit Glanz
    const nx = -dy, ny = dx, up = ny < 0 ? 1 : -1;   // Normale zur Lichtseite (oben)
    for (let i = 0; i < 12 * q; i++) {
      const u = 11 - i * P, px = sn(x - dx * u, q), py = sn(y - dy * u, q);
      const tip = u < 2.5, knot = !tip && Math.round(u * q) % (4 * q) === 0;
      ctx.fillStyle = tip ? '#fffbef' : knot ? '#80755c' : u < 6 ? '#e6dcc0' : '#bcae8e';
      ctx.fillRect(px, py, P, P);
      if (u > 0.5) { ctx.fillStyle = tip ? '#e6dcc0' : knot ? '#bcae8e' : '#80755c'; ctx.fillRect(sn(px - nx * P * up, q), sn(py - ny * P * up, q), P, P); }
      if (knot) { ctx.fillStyle = '#e6dcc0'; ctx.fillRect(sn(px + nx * P * up, q), sn(py + ny * P * up, q), P, P); }
    }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(sn(x - dx * P, q), sn(y - dy * P, q), P, P);
  }
  renderEmissive(ctx, cx, cy) {
    const q = fineRes(), P = 1 / q;
    const x = this.x - cx, y = this.y - this.z - cy;
    ctx.fillStyle = 'rgba(200,140,255,0.66)';
    ctx.fillRect(sn(x, q) - 1, sn(y, q) - 1, 2, 2);
    if (q === 1) return;
    // violetter Saum entlang des Schafts (gedünnt) und ein Funkenkreuz an der Spitze
    const dx = Math.cos(this.angle), dy = Math.sin(this.angle), nx = -dy, ny = dx;
    ctx.fillStyle = 'rgba(160,96,240,0.66)';
    for (let i = 2; i < 11 * q; i += 2) for (const s of [-1.5, 1.5]) ctx.fillRect(sn(x - dx * i * P + nx * s * P, q), sn(y - dy * i * P + ny * s * P, q), P, P);
    ctx.fillStyle = '#f0e0ff';
    ctx.fillRect(sn(x, q) - P, sn(y, q), 3 * P, P); ctx.fillRect(sn(x, q), sn(y, q) - P, P, 3 * P);
  }
}

// Magisches Geschoss der Zauberer (Wasser, Feuer, Gift): leuchtende Kugel mit
// Schweif. Nicht abwehrbar – ausweichen. Zerplatzt an Wänden.
const BOLT_COLORS = {
  water: ['#ffffff', '#b8f0ff', '#50c8e0', '#1a6a8a'],
  fire: ['#fff4d8', '#ffb070', '#f0602a', '#8a1a08'],
  poison: ['#f8ffc0', '#c8f060', '#70b030', '#2a5010'],
  shadow: ['#ffffff', '#e0b8ff', '#a060f0', '#3a1466'],
  frost: ['#ffffff', '#d8f4ff', '#78c0f0', '#1e4a8a'],
  spore: ['#f8e8ff', '#d0a0ff', '#9a58d8', '#3a1a5a'],
  dust: ['#fff8e0', '#f0d8a0', '#c8a060', '#5a4228'],
  curse: ['#ffffff', '#e8b8ff', '#a050c8', '#3a1450'],
};
export class MagicBolt extends Entity {
  constructor(x, y, angle, speed, damage, owner, element = 'fire', { radius = 3, homing = 0, life = 2.4 } = {}) {
    super(x, y);
    this.angle = angle; this.speed = speed;
    this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
    this.z = 12; this.damage = damage; this.owner = owner; this.team = owner.team;
    this.element = element; this.colors = BOLT_COLORS[element] ?? BOLT_COLORS.fire;
    this.radius = radius; this.homing = homing; this.life = life; this.t = 0;
    this.deflectable = false;
  }
  update(dt, world) {
    this.life -= dt; this.t += dt;
    if (this.life <= 0) { this.#burst(world); return; }
    const h = world.hero;
    if (this.homing && !h.dead) {
      const want = Math.atan2(h.centerY - (this.y - this.z * 0.3), h.x - this.x);
      let d = want - this.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.angle += Math.max(-this.homing * dt, Math.min(this.homing * dt, d));
      this.vx = Math.cos(this.angle) * this.speed; this.vy = Math.sin(this.angle) * this.speed;
    }
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    if (world.dungeon.isWall(Math.floor(nx / 16), Math.floor((ny - this.z * 0.5) / 16)) && !world.dungeon.isLiquid?.(Math.floor(nx / 16), Math.floor((ny - this.z * 0.5) / 16))) { this.#burst(world); return; }
    this.x = nx; this.y = ny;
    if (Math.random() < dt * 40) world.particles.spawn({ x: this.x + (Math.random() - 0.5) * 3, y: this.y - this.z, vx: -this.vx * 0.1, vy: -this.vy * 0.1, rise: 3, life: 0.35, colors: this.colors.slice(1), emissive: true });
    if (!h.dead && Math.hypot(h.x - this.x, h.centerY - (this.y - this.z * 0.3)) < h.hurtRadius + this.radius) {
      const hit = { damage: this.damage, dirX: Math.cos(this.angle), dirY: Math.sin(this.angle), knockback: 110, source: this.owner };
      if (h.takeHit(hit)) {
        world.bus.emit('hit', { attacker: this.owner, target: h, damage: hit.damage, crit: false, heavy: false, dirX: hit.dirX, dirY: hit.dirY, x: h.x, y: h.centerY, killed: h.dead });
        this.#burst(world);
      }
    }
  }
  #burst(world) {
    this.removed = true;
    world.particles.ring(this.x, this.y - this.z, 6, 10, this.colors, 60);
    world.bus.emit('spellImpact', { x: this.x, y: this.y, element: this.element, radius: 8, big: false });
  }
  render(ctx, cx, cy) {
    const q = fineRes();
    ctx.fillStyle = SHADOW;
    ctx.fillRect(sn(this.x - cx, q) - 2, sn(this.y - cy, q), 5, 1);
  }
  renderEmissive(ctx, cx, cy) {
    const q = fineRes();
    if (q === 1) { this.#renderCoarse(ctx, cx, cy); return; }
    renderBolt(ctx, this.x - cx, this.y - this.z - cy, this.angle, this.element, this.colors, this.radius, this.t, q);
  }
  #renderCoarse(ctx, cx, cy) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - this.z - cy);
    const r = this.radius + (Math.sin(this.t * 20) > 0 ? 1 : 0);
    const dx = Math.cos(this.angle), dy = Math.sin(this.angle);
    ctx.fillStyle = this.colors[3];
    for (let i = 1; i < 6; i++) ctx.fillRect(Math.round(x - dx * i * 2) - 1, Math.round(y - dy * i * 2) - 1, 2, 2);
    ctx.fillStyle = this.colors[2]; ctx.fillRect(x - r, y - r + 1, r * 2, r * 2 - 2); ctx.fillRect(x - r + 1, y - r, r * 2 - 2, r * 2);
    ctx.fillStyle = this.colors[1]; ctx.fillRect(x - r + 1, y - r + 1, r * 2 - 2, r * 2 - 2);
    ctx.fillStyle = this.colors[0]; ctx.fillRect(x - 1, y - 1, 2, 2);
  }
}

// Zauberkugel mit Schweif im Feinraster zeichnen (auch für Helden-Geschosse, character/abilities.js).
// x/y = Mitte in Bildkoordinaten (Weltpixel), colors = Rampe hell → dunkel (4 Stufen), t = Lebenszeit (Flackern).
export function renderBolt(ctx, x0, y0, angle, element, c, radius, t, q = fineRes()) {
  const x = sn(x0, q), y = sn(y0, q);
  const tail = tailSprite(element, c, radius, angle, q);
  ctx.drawImage(tail.canvas, x - tail.half, y - tail.half, tail.size, tail.size);
  const f = (Math.sin(t * 20) > 0 ? 1 : 0) + 2 * (Math.floor(t * 9) % 2);
  const img = boltSprite(element, c, radius, f, q);
  ctx.drawImage(img.canvas, x - img.half, y - img.half, img.size, img.size);
}

// Schweif als Bild je Richtung (32 Richtungen): verjüngt sich über 11 Weltpixel, Mitte in der Mittelfarbe, Rand dunkel,
// hinten gedünnt (jedes zweite Feinpixel).
const tailCache = new Map();
function tailSprite(el, c, radius, angle, q) {
  let di = Math.round((angle / (Math.PI * 2)) * 32) % 32; if (di < 0) di += 32;
  const key = `${c.join()}|${radius}|${di}|${q}`;
  let tsp = tailCache.get(key);
  if (tsp) return tsp;
  const L = 11, R = radius, ext = L + Math.ceil(R) + 1, size = ext * 2 + 1, S = size * q, mid = (S - 1) / 2, P = 1 / q;
  const a = (di / 32) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  const cv = makeCanvas(S, S), g = cv.getContext('2d');
  for (let i = R * 0.6; i < L; i += P) {
    const k = i / L, w = R * 0.85 * (1 - k), thin = k > 0.55;
    for (let j = -w; j <= w + 1e-6; j += P) {
      if (thin && ((Math.round(i * q) + Math.round(j * q)) & 1)) continue;
      g.fillStyle = Math.abs(j) > w - P * 1.5 || k > 0.75 ? c[3] : c[2];
      g.fillRect(Math.round(mid + (-dx * i + nx * j) * q), Math.round(mid + (-dy * i + ny * j) * q), 1, 1);
    }
  }
  tsp = { canvas: cv, size, half: size / 2 - 0.5 / q };
  tailCache.set(key, tsp);
  return tsp;
}

// Zauberkugel als Bild (je Element, Radius, 4 Bilder: Puls × Flackern). Kugel mit Licht von oben links:
// heller Kern oben links, Mittelfarbe, Rand dunkel, Glanzpunkt weiß. Elemente bekommen eine eigene Form:
//   frost  – vier Eisdornen (drehen zwischen den Bildern um 45°), Facettenlinie im Kern
//   shadow/curse – dunkler Kern mit hellem Rand, Splitter kreisen außen (Schatten soll sich klar abheben)
//   fire   – Flammenzungen nach oben; poison – Tropfen unten; water – Glanzbogen; spore/dust – Körner außen
const boltCache = new Map();
const VOID_DEEP = '#4a148e';
function boltSprite(el, c, radius, f, q) {
  const key = `${el}|${c.join()}|${radius}|${f}|${q}`;
  let b = boltCache.get(key);
  if (b) return b;
  const pulse = f & 1, flick = f >> 1;
  const rr = radius + 0.5 + pulse * 0.5, ext = Math.ceil(rr + 4);
  const size = ext * 2 + 1, S = size * q, mid = (S - 1) / 2;
  const cv = makeCanvas(S, S), g = cv.getContext('2d');
  const put = (X, Y, col) => { if (X >= 0 && Y >= 0 && X < S && Y < S) { g.fillStyle = col; g.fillRect(X, Y, 1, 1); } };
  const pol = (a, r) => [Math.round(mid + Math.cos(a) * r * q), Math.round(mid + Math.sin(a) * r * q)];
  const dark = el === 'shadow' || el === 'curse';
  // Kugel
  // Leere (Schatten/Fluch): Kern fast schwarz-violett, darum gesättigtes Violett in drei harten Stufen, außen
  // ein Feinpixel-Saum in der Mittelfarbe – so steht die Kugel auch auf dunklem Boden als Ring mit Loch
  const halo = dark ? 1 + 1 / (q * rr) : 1;
  for (let Y = 0; Y < S; Y++) for (let X = 0; X < S; X++) {
    const ox = (X - mid) / q, oy = (Y - mid) / q, d = Math.hypot(ox, oy) / rr;
    if (d > halo) continue;
    const l = d + (ox + oy) / rr * 0.32;   // Licht von oben links
    let col;
    if (dark) col = d > 1 ? c[2] : d > 0.78 ? (ox + oy < 0 ? c[1] : c[2]) : d > 0.55 ? VOID_DEEP : '#12041e';
    else col = d > 0.84 ? c[3] : l < 0.12 ? c[0] : l < 0.5 ? c[1] : c[2];
    put(X, Y, col);
  }
  const shine = (a, r) => { const [X, Y] = pol(a, r); put(X, Y, '#ffffff'); };
  shine(-2.36, rr * (dark ? 0.85 : 0.45));
  if (el === 'frost') {
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + (flick ? Math.PI / 4 : 0), L = rr + 3;
      for (let r = rr * 0.7; r <= L; r += 1 / q) {
        const [X, Y] = pol(a, r), w = r > L - 1 ? 0 : 1;
        put(X, Y, r > L - 1.2 ? '#ffffff' : c[1]);
        if (w && q > 1) { const [X2, Y2] = pol(a + 0.5 / r, r); put(X2, Y2, c[2]); }
      }
    }
    const [a0, b0] = pol(-2.36, rr * 0.2), [a1, b1] = pol(0.78, rr * 0.5);
    for (let t = 0; t <= 1; t += 0.2) put(Math.round(a0 + (a1 - a0) * t), Math.round(b0 + (b1 - b0) * t), '#ffffff');
  } else if (dark) {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + f * 0.9, [X, Y] = pol(a, rr + 2);
      put(X, Y, c[0]); put(X + 1, Y, c[1]); put(X, Y + 1, c[2]);
      const [X2, Y2] = pol(a - 0.5, rr + 1.3); put(X2, Y2, c[2]);
    }
  } else if (el === 'fire') {
    for (let k = -1; k <= 1; k++) {
      const h = 2 + ((k + 2 + f) % 3);
      for (let j = 0; j < h * q; j++) put(Math.round(mid + k * rr * 0.55 * q), Math.round(mid - rr * q * 0.7 - j), j < h * q * 0.4 ? c[1] : c[2]);
    }
  } else if (el === 'poison') {
    const [X, Y] = pol(Math.PI / 2 + (flick ? 0.4 : -0.3), rr + 1 + pulse);
    put(X, Y, c[1]); put(X, Y + 1, c[2]); put(X + 1, Y, c[3]);
  } else if (el === 'water') {
    for (let a = -2.8; a < -1.6; a += 0.15) { const [X, Y] = pol(a, rr * 0.7); put(X, Y, c[0]); }
  } else {
    for (let k = 0; k < 4; k++) { const [X, Y] = pol((k / 4) * Math.PI * 2 + f * 0.6, rr + 1.5); put(X, Y, c[1]); }
  }
  b = { canvas: cv, size, half: size / 2 - 0.5 / q };
  boltCache.set(key, b);
  return b;
}

// Netzwurf (Fallensteller): fliegt geradlinig im Bildraum (wie die Linienwarnung mit screen: true),
// trifft nur, wer mit den Füßen auf der Bahn steht, und hält das Ziel fest (hero.buff 'rooted').
export class NetShot extends Entity {
  constructor(x, y, angle, speed, len, owner, { damage = 1, root = 1.2, radius = 6, onRoot = null } = {}) {
    super(x, y);
    this.angle = angle; this.speed = speed; this.owner = owner; this.team = owner.team;
    this.dirX = Math.cos(angle); this.dirY = Math.sin(angle);
    this.life = len / speed; this.t = 0;
    Object.assign(this, { damage, root, hitR: radius, onRoot });
    this.z = 8; this.deflectable = false;
  }
  update(dt, world) {
    this.t += dt;
    if (this.t >= this.life) { this.#drop(world); return; }
    this.x += this.dirX * this.speed * dt; this.y += this.dirY * this.speed * dt;
    const h = world.hero;
    if (h.dead) return;
    if (Math.hypot(h.x - this.x, (h.y - this.y) / 0.75) > this.hitR) return;
    const hit = { damage: this.damage, dirX: this.dirX, dirY: this.dirY, knockback: 0, source: this.owner };
    if (h.takeHit(hit)) {
      world.bus.emit('hit', { attacker: this.owner, target: h, damage: hit.damage, crit: false, heavy: false, dirX: hit.dirX, dirY: hit.dirY, x: h.x, y: h.centerY, killed: h.dead });
      h.buff?.('rooted', this.root, { moveSpeed: 0 });
      h.vx = 0; h.vy = 0;
      this.onRoot?.(h, world);
      this.removed = true;
    } else if (h.dodgedTimer > 0) this.removed = true;
  }
  #drop(world) {
    this.removed = true;
    world.particles.dust(this.x, this.y, 3, '#8a6e40');
  }
  render(ctx, cx, cy) {
    const q = fineRes(), P = 1 / q;
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    ctx.fillStyle = SHADOW; ctx.fillRect(x - 3, y, 7, 1);
    // aufgespanntes Netz: Raute mit Maschen, dreht sich im Flug
    const yy = y - this.z, s = Math.sin(this.t * 14) > 0 ? 1 : 0;
    if (q === 1) {
      ctx.fillStyle = '#2a1c10';
      for (let i = -4; i <= 4; i++) { ctx.fillRect(x + i, yy - (4 - Math.abs(i)) + 1, 1, 1); ctx.fillRect(x + i, yy + (4 - Math.abs(i)) + 1, 1, 1); }
      ctx.fillStyle = '#c8aa70';
      for (let i = -4; i <= 4; i++) { ctx.fillRect(x + i, yy - (4 - Math.abs(i)), 1, 1); ctx.fillRect(x + i, yy + (4 - Math.abs(i)), 1, 1); }
      ctx.fillStyle = '#8a6e40';
      for (let i = -2; i <= 2; i += 2) { ctx.fillRect(x + i + s, yy - 2, 1, 5); ctx.fillRect(x - 2, yy + i, 5, 1); }
      return;
    }
    // Feinraster: Seile 1 Feinpixel mit dunklem Schatten darunter, Maschen diagonal, Knoten heller, Gewichte an den Ecken
    const X = x + 0.5, Y = yy + 0.5, R = 4.5;
    const edge = (fx, fy, col) => { ctx.fillStyle = col; ctx.fillRect(sn(fx, q), sn(fy, q), P, P); };
    for (let i = -R; i <= R; i += P) {
      const h = R - Math.abs(i);
      edge(X + i, Y - h + P, '#2a1c10'); edge(X + i, Y + h + P, '#2a1c10');
      edge(X + i, Y - h, '#c8aa70'); edge(X + i, Y + h, '#c8aa70');
    }
    for (let m = -2; m <= 2; m += 2) for (let t = -R / 2; t <= R / 2; t += P) {
      const o = (s ? 1 : -1) * 0.5;
      edge(X + t + m * 0.5 + o, Y + t - m * 0.5, '#8a6e40');
      edge(X + t - m * 0.5 - o, Y - t - m * 0.5, '#8a6e40');
    }
    for (const [a, b] of [[-R, 0], [R, 0], [0, -R], [0, R]]) { ctx.fillStyle = '#5a4630'; ctx.fillRect(sn(X + a, q) - P, sn(Y + b, q) - P, 2 * P, 2 * P); ctx.fillStyle = '#a0907a'; ctx.fillRect(sn(X + a, q) - P, sn(Y + b, q) - P, P, P); }
  }
}

// Bogenwurf (Aschebombardier): fliegt in fester Zeit zu einem festen Zielpunkt (dort liegt die
// Kreiswarnung), schlägt genau in diesem Kreis ein und hinterlässt kurz brennenden Boden.
export class LobBomb extends Entity {
  constructor(x, y, tx, ty, flight, owner, { damage = 20, radius = 22, element = 'fire', burn = null, height = 46 } = {}) {
    super(x, y);
    Object.assign(this, { x0: x, y0: y, tx, ty, flight, owner, damage, radius, element, burn, height });
    this.team = owner.team; this.t = 0; this.z = 12; this.deflectable = false;
  }
  update(dt, world) {
    this.t += dt;
    const k = Math.min(1, this.t / this.flight);
    this.x = this.x0 + (this.tx - this.x0) * k; this.y = this.y0 + (this.ty - this.y0) * k;
    this.z = 12 * (1 - k) + this.height * 4 * k * (1 - k);
    if (Math.random() < dt * 30) world.particles.spawn({ x: this.x, y: this.y - this.z, vx: 0, vy: 0, rise: 6, life: 0.4, colors: ['#fff0b0', '#ffb640', '#5a4a50'], emissive: true });
    if (k < 1) return;
    this.removed = true;
    const o = this.owner;
    // Trefferkreis = Warnkreis (Fußpunkt in der Ellipse, lift 0)
    if (o && !o.dead) world.combat.add({ owner: o, team: 'enemy', shape: 'circle', follow: false, x: this.tx, y: this.ty, lift: 0, r: this.radius, damage: this.damage, knockback: 150, heavy: true, ttl: 0.1 });
    world.particles.ring(this.tx, this.ty, 8, 18, ['#fff0b0', '#ffb640', '#f07a1c', '#5a2a10'], 110);
    world.particles.dust(this.tx, this.ty, 10, '#3a3036');
    world.decals.scorch?.(this.tx, this.ty, this.radius * 0.4);
    world.session?.camera?.shake(2.5);
    world.bus.emit('spellImpact', { x: this.tx, y: this.ty, element: this.element, radius: this.radius, big: false });
    if (this.burn) world.spawn(new HazardCloud(this.tx, this.ty, o, { radius: this.burn.radius, duration: this.burn.duration, damage: this.burn.damage, tick: 0.5, element: 'fire' }));
  }
  render(ctx, cx, cy) {
    const q = fineRes(), P = 1 / q;
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    ctx.fillStyle = 'rgba(4,2,8,0.45)'; ctx.fillRect(x - 2, y, 5, 2);
    const yy = Math.round(y - this.z);
    if (q === 1) {
      ctx.fillStyle = '#140a0c'; ctx.fillRect(x - 3, yy - 2, 6, 5); ctx.fillRect(x - 2, yy - 3, 4, 7);
      ctx.fillStyle = '#4a3a40'; ctx.fillRect(x - 2, yy - 2, 4, 4);
      ctx.fillStyle = '#6a5a60'; ctx.fillRect(x - 2, yy - 2, 2, 1);
      return;
    }
    // Feinraster: runde Bombe mit Lichtkante oben links, Eisenband, Glanzpunkt, Zündhütchen oben
    const cx0 = x, cy0 = yy + 0.5, R = 3.5;
    for (let j = -R; j < R; j += P) for (let i = -R; i < R; i += P) {
      const ox = i + P / 2, oy = j + P / 2, d = Math.hypot(ox, oy) / R;
      if (d > 1) continue;
      const l = d + (ox + oy) / R * 0.35;
      ctx.fillStyle = d > 0.84 ? '#140a0c' : Math.abs(oy - 0.4) < P ? '#2a1e24' : l < 0.15 ? '#8a7a80' : l < 0.6 ? '#6a5a60' : '#4a3a40';
      ctx.fillRect(cx0 + i, cy0 + j, P, P);
    }
    ctx.fillStyle = '#d8ccd0'; ctx.fillRect(cx0 - 1.5, cy0 - 1.5, P, P);
    ctx.fillStyle = '#2a1e24'; ctx.fillRect(cx0, cy0 - R - P, 1, 2 * P);
  }
  renderEmissive(ctx, cx, cy) {
    const q = fineRes(), P = 1 / q;
    const x = Math.round(this.x - cx), yy = Math.round(this.y - cy - this.z);
    const on = Math.sin(this.t * 30) > 0;
    ctx.fillStyle = on ? '#fff0b0' : '#ffb640';
    if (q === 1) { ctx.fillRect(x + 1, yy - 4, 1, 2); return; }
    // Funke an der Lunte: Kreuz in Feinpixeln, abwechselnd groß und klein
    const X = x + 0.5, Y = yy - 3.5;
    ctx.fillRect(X, Y, P, P);
    ctx.fillStyle = on ? '#ffb640' : '#f07a1c';
    ctx.fillRect(X - P, Y, P, P); ctx.fillRect(X + P, Y, P, P); ctx.fillRect(X, Y - P, P, P);
    if (on) { ctx.fillRect(X, Y - 2 * P, P, P); ctx.fillRect(X + 2 * P, Y - P, P, P); }
  }
}
