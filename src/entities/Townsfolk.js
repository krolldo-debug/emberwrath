import { Entity, getShadow } from './Entity.js';
import { Animator } from '../gfx/Sprite.js';
import { Light } from '../gfx/Lighting.js';
import { hash2 } from '../core/math.js';
import { tr } from '../i18n/index.js';

// Bewohner einer Stadt (world/townlife.js): geht zwischen Plätzen, Nachbarn und Häusern hin und her, verschwindet
// in Häusern und kommt wieder heraus, plaudert mit Nachbarn und Questgebern und spricht den Helden im Vorbeigehen an.
// Kein Kampf, keine Kollision, kein Spielstand. Wachen gehen Streife und steigen ab und zu auf ihren Turm.
const WALK = 24;            // Weltpixel je Sekunde (Held läuft ~4× so schnell)
const GREET_RANGE = 40;     // so nah muss der Held kommen
const GREET_EVERY = 45;     // Sekunden, bis derselbe Bewohner wieder etwas sagt
const TOWN_GAP = 6;         // Sekunden zwischen zwei Sprüchen im selben Ort
const SAY_TIME = 4.2;
const FADE = 0.45;
const BUBBLE_UP = 29;      // Zipfelspitze über dem Fußpunkt (knapp über dem Kopf)

export class Townsfolk extends Entity {
  constructor(x, y, { town, spec, home, anims, seed }) {
    super(x, y);
    this.team = 'folk';
    this.town = town; this.spec = spec; this.home = home;
    this.guard = spec.role === 'guard';
    this.getAnims = anims;
    this.animator = null;
    this.seed = seed; this.n = 0;
    this.facing = hash2(seed, 1, 5) < 0.5 ? 1 : -1;
    this.alpha = 0;
    this.path = null; this.goal = null;
    this.state = 'inside'; this.timer = 0.4 + hash2(seed, 2, 5) * 5;   // gestaffelt aus den Häusern
    this.in = home;                       // Haus, in dem er gerade ist (null = draußen)
    if (this.guard || !home) { this.state = 'stand'; this.timer = 1 + hash2(seed, 3, 5) * 4; this.in = null; this.alpha = 1; }
    this.talkT = 0; this.lookAt = null; this.spot = null;
    this.line = null; this.lineT = 0; this.greetT = 4 + hash2(seed, 4, 5) * 10; this.lines = 0;
  }

  #rnd(k) { return hash2(this.seed, this.n * 13 + k, 77); }
  #anims() {
    if (!this.animator) { this.animator = new Animator(this.getAnims()); this.animator.play('idle'); this.animator.time = this.#rnd(9) * 2; }
    return this.animator;
  }
  #play(name) { const a = this.#anims(); if (a.name !== name) a.play(name, true); }

  update(dt, world) {
    this.lineT = Math.max(0, this.lineT - dt);
    this.greetT -= dt;
    if (this.state === 'inside') {
      if ((this.timer -= dt) <= 0) this.#leave(world);
      return;
    }
    this.#anims().update(dt);
    if (this.state === 'fadeIn') {
      this.alpha = Math.min(1, this.alpha + dt / FADE);
      this.y += dt * 8;
      if (this.alpha >= 1) { this.state = 'walk'; this.#next(); }
    } else if (this.state === 'fadeOut') {
      this.alpha = Math.max(0, this.alpha - dt / FADE);
      this.y -= dt * 8;
      if (this.alpha <= 0) {
        this.state = 'inside'; this.alpha = 0; this.target = null;
        this.timer = this.guard ? 18 + this.#rnd(1) * 20 : 7 + this.#rnd(1) * 16;
      }
    } else if (this.state === 'greet') {
      this.#face(world.hero.x);
      if ((this.timer -= dt) <= 0) { this.state = this.path ? 'walk' : 'stand'; this.timer = Math.max(this.timer, 1.5); }
      else this.#play(this.timer > SAY_TIME - 1.8 ? 'talk' : 'idle');
    } else if (this.state === 'walk') this.#walk(dt);
    else if (this.state === 'stand') this.#stand(dt);
    this.#greet(world);
  }

  // ---------------------------------------------------------------- Ablauf
  // Nach jedem Halt: nächstes Ziel wählen (Platz, Nachbar, eigenes oder fremdes Haus, Turm)
  #next() {
    this.n++;
    if (this.spot?.by === this) this.spot.by = null;   // Platz wieder frei
    if (this.visiting?.visitor === this) this.visiting.visitor = null;
    this.spot = null; this.visiting = null;
    const T = this.town, r = this.#rnd(0);
    if (this.guard) {
      if (T.towers.length && r < 0.18) return this.#goHouse(T.towers[Math.floor(this.#rnd(1) * T.towers.length)]);
      return this.#goSpot(this.#freeSpot((this.seed + this.n) % T.spots.length));
    }
    if (this.home && r < 0.22) return this.#goHouse(this.home);
    if (T.houses.length > 1 && r < 0.34) return this.#goHouse(T.houses[Math.floor(this.#rnd(1) * T.houses.length)]);
    if (r < 0.5) {
      // zu einem Nachbarn, der gerade irgendwo steht
      const mates = T.folk.filter((f) => f !== this && f.state === 'stand' && !f.guard && !f.visitor && !f.lookAt?.npcId);
      if (mates.length) { const m = mates[Math.floor(this.#rnd(2) * mates.length)]; m.visitor = this; this.visiting = m; return this.#goSpot({ x: m.x + (this.#rnd(3) < 0.5 ? -17 : 17), y: m.y + 2, mate: m }); }
    }
    this.#goSpot(this.#freeSpot(Math.floor(this.#rnd(4) * T.spots.length)));
  }

  // Platz ab Index i, an dem gerade niemand steht (sonst drängeln sich zwei auf demselben Fleck)
  #freeSpot(i) {
    const S = this.town.spots;
    for (let k = 0; k < S.length; k++) { const sp = S[(i + k) % S.length]; if (!sp.by) return sp; }
    return S[i % S.length];
  }

  #goSpot(spot) {
    if (!spot.mate) { spot.by = this; this.spot = spot; }
    const jx = (this.#rnd(5) - 0.5) * 12, jy = (this.#rnd(6) - 0.5) * 6;
    let p = spot.mate ? this.town.free(spot.x, spot.y) : this.town.free(spot.x + jx, spot.y + jy);
    if (!p.ok) p = spot;
    // Nicht auf denselben Punkt wie ein anderer Bewohner (zwei Plätze können aufs selbe freie Feld fallen)
    const taken = (q) => this.town.folk.some((f) => f !== this && f.target && Math.hypot(f.target.x - q.x, f.target.y - q.y) < 12);
    if (taken(p)) p = [[18, 0], [-18, 0], [0, 12], [18, 10], [-18, 10]].map(([dx, dy]) => this.town.free(p.x + dx, p.y + dy)).find((q) => q.ok && !taken(q)) ?? p;
    this.goal = { kind: 'spot', spot };
    this.#route(p);
  }

  #goHouse(h) {
    this.goal = { kind: 'house', house: h };
    this.#route(h.step);
  }

  #route(p) {
    const path = this.town.path(this.x, this.y, p.x, p.y);
    if (!path) { this.state = 'stand'; this.timer = 2 + this.#rnd(7) * 3; this.goal = null; return; }
    this.path = path; this.state = 'walk'; this.target = p;
  }

  #walk(dt) {
    const p = this.path?.[0];
    if (!p) return this.#arrive();
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy), s = WALK * dt;
    if (Math.abs(dx) > 0.5) this.facing = dx > 0 ? 1 : -1;
    if (d <= s) { this.x = p.x; this.y = p.y; this.path.shift(); }
    else { this.x += (dx / d) * s; this.y += (dy / d) * s; }
    this.#play('walk');
  }

  #arrive() {
    this.path = null;
    const g = this.goal;
    if (g?.kind === 'house' && !g.door) {
      // letzter Schritt bis an die Tür, dann hinein
      g.door = true;
      this.path = [{ x: g.house.x, y: g.house.y }];
      return;
    }
    if (g?.kind === 'house') {
      this.in = g.house; this.state = 'fadeOut'; this.#doorLight();
      this.#play('idle');
      return;
    }
    this.state = 'stand';
    const sp = g?.spot;
    this.lookAt = sp?.mate ?? sp?.npc ?? null;
    // Der Besuchte dreht sich zum Besucher und plaudert mit
    const m = sp?.mate;
    if (m && m.state === 'stand' && !m.lookAt) { m.lookAt = this; m.talkT = -1; m.timer = Math.max(m.timer, 6); }
    if (!this.lookAt && sp && Math.abs(sp.x - this.x) > 3) this.facing = sp.x > this.x ? 1 : -1;
    this.timer = this.guard ? 3 + this.#rnd(8) * 5 : 6 + this.#rnd(8) * 10;
    this.talkT = this.lookAt ? 0.5 + this.#rnd(9) * 2 : 0;
  }

  #stand(dt) {
    if (this.lookAt) this.#face(this.lookAt.x);
    // Plaudern: abwechselnd Gesten, solange jemand gegenüber steht
    if (this.lookAt && !this.lookAt.removed && (this.lookAt.state === undefined || this.lookAt.state === 'stand')) {
      this.talkT -= dt;
      if (this.talkT < -2.4) this.talkT = 1.4 + this.#rnd(10) * 1.6;
      this.#play(this.talkT > 0 ? 'talk' : 'idle');
    } else { this.lookAt = null; this.#play('idle'); }
    if ((this.timer -= dt) <= 0) { this.lookAt = null; this.#next(); }
  }

  #leave(world) {
    const h = this.in ?? this.home;
    // Steht schon jemand an der Tür (geteiltes Haus), noch etwas drinnen bleiben
    if (this.town.folk.some((f) => f !== this && f.alpha > 0 && Math.hypot(f.x - h.x, f.y - h.y) < 16)) { this.timer = 2 + this.#rnd(13) * 3; this.n++; return; }
    this.in = null;
    this.x = h.x; this.y = h.y - 4;
    this.facing = this.#rnd(11) < 0.5 ? 1 : -1;
    this.state = 'fadeIn'; this.alpha = 0;
    this.#doorLight();
  }

  // Warmes Licht fällt kurz aus der offenen Tür
  #doorLight() {
    const h = this.in ?? this.goal?.house ?? this.home;
    if (!h || this.town.world.lights.length > 220) return;
    this.town.world.addLight(new Light({ x: h.x, y: h.y - 8, radius: 34, color: [255, 170, 90], intensity: 0.7, ttl: 0.9, bloom: 0.2 }));
  }

  #face(x) { if (Math.abs(x - this.x) > 2) this.facing = x > this.x ? 1 : -1; }

  // ---------------------------------------------------------------- Ansprechen
  #greet(world) {
    const h = world.hero, font = world.session?.font;
    if (!h || h.dead || !font || this.greetT > 0 || this.alpha < 1 || this.state === 'greet' || this.state === 'fadeOut') return;
    if (Math.hypot(h.x - this.x, (h.y - this.y) * 1.3) > GREET_RANGE) return;
    const T = this.town;
    if (world.time - (T.lastLine ?? -99) < TOWN_GAP) return;
    const text = T.pickLine(this.spec.say ?? [], world.state, this.lines);
    if (!text) return;
    // Nur sprechen, wenn die Blase frei über dem Sprecher steht: nicht über dem Helden, nicht über einem Namensschild
    const ox = this.#place(world, bubble(font, text));
    if (ox == null) return;
    this.lines++;
    T.lastLine = world.time;
    this.greetT = GREET_EVERY + this.#rnd(12) * 20;
    this.line = text; this.lineT = SAY_TIME; this.ox = ox;
    this.state = 'greet'; this.timer = SAY_TIME;
  }

  // Waagrechter Versatz der Blase (Zipfel bleibt über dem Sprecher) oder null, wenn kein freier Platz ist
  #place(world, b) {
    const h = world.hero, top = this.y - BUBBLE_UP - 3 - b.h, bot = this.y - BUBBLE_UP + 1;
    const hit = (ox, r) => this.x + ox - b.w / 2 < r.x1 && this.x + ox + b.w / 2 > r.x0 && top < r.y1 && bot > r.y0;
    const hero = { x0: h.x - 8, x1: h.x + 8, y0: h.y - 30, y1: h.y + 2 };
    const room = b.w / 2 - 6;
    let ox = 0;
    if (hit(0, hero)) ox = h.x >= this.x ? hero.x0 - (this.x + b.w / 2) - 1 : hero.x1 - (this.x - b.w / 2) + 1;
    if (Math.abs(ox) > room || hit(ox, hero)) return null;
    for (const n of world.npcs) {
      if (!n.nearHero) continue;
      const font = world.session.font, hw = Math.max(font.measure(n.def.name.toUpperCase()), font.measure((n.def.title ?? '').toUpperCase())) / 2 + 3;
      if (hit(ox, { x0: n.x - hw, x1: n.x + hw, y0: n.y - 47, y1: n.y - 27 })) return null;
    }
    return ox;
  }

  // ---------------------------------------------------------------- Zeichnen
  render(ctx, cx, cy) {
    if (this.state === 'inside' || !this.animator) return;
    const f = this.animator.frame;
    if (!f) return;
    const a = this.alpha;
    if (a < 1) ctx.globalAlpha = a;
    const sh = getShadow(11);
    ctx.drawImage(sh, Math.round(this.x - cx - sh.width / 2), Math.round(this.y - cy - sh.height / 2));
    f.draw(ctx, this.x - cx, this.y - cy, { flip: this.facing < 0 });
    if (a < 1) ctx.globalAlpha = 1;
  }

  // Sprechblase nach dem Licht, damit sie auch im Dunkeln lesbar bleibt
  renderEmissive(ctx, cx, cy) {
    if (this.lineT <= 0 || !this.line) return;
    const font = this.town.world.session?.font;
    if (!font) return;
    const b = bubble(font, this.line);
    this.ox = this.#place(this.town.world, b) ?? this.ox ?? 0;   // dem Helden ausweichen, solange er sich bewegt
    drawBubble(ctx, b, this.x - cx, this.y - cy - BUBBLE_UP, this.ox, Math.min(1, this.lineT / 0.4, (SAY_TIME - this.lineT) / 0.15));
  }
}

// Sprechblase: dunkle Tafel mit hellem Rand, Text in der Pixelschrift, höchstens drei Zeilen. Der Zipfel wird
// eigens über dem Sprecher gezeichnet, damit die Tafel seitlich ausweichen kann.
const bubbleCache = new Map();
function bubble(font, text) {
  const t = tr(text).toUpperCase();
  let b = bubbleCache.get(t);
  if (b) return b;
  const words = t.split(/\s+/), lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && font.measure(next, 1, true) > 92) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  const up = Math.max(...lines.map((l) => font.ascent(l, true)));
  const lh = 7 + up, W = Math.max(...lines.map((l) => font.measure(l, 1, true))) + 8, H = lines.length * lh + 5;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#5a4636'; g.fillRect(1, 0, W - 2, H); g.fillRect(0, 1, W, H - 2);
  g.fillStyle = '#16100e'; g.fillRect(1, 1, W - 2, H - 2);
  g.fillStyle = '#241a16'; g.fillRect(2, 2, W - 4, 1);
  lines.forEach((l, i) => font.draw(g, l, Math.floor(W / 2), 3 + up + i * lh, { color: '#e8dcc0', align: 'center', raw: true }));
  b = { c, w: W, h: H };
  bubbleCache.set(t, b);
  if (bubbleCache.size > 40) bubbleCache.delete(bubbleCache.keys().next().value);
  return b;
}

// x, y: Spitze des Zipfels (über dem Kopf des Sprechers); ox: Versatz der Tafel
function drawBubble(ctx, b, x, y, ox, alpha) {
  if (alpha < 1) ctx.globalAlpha = Math.max(0, alpha);
  const m = Math.round(x), bot = Math.round(y) - 3;   // unterste Zeile der Tafel; Zipfel 4 Zeilen bis zur Spitze
  ctx.drawImage(b.c, Math.round(x + ox - b.w / 2), bot - b.h + 1);
  ctx.fillStyle = '#5a4636';
  for (let r = 0; r < 4; r++) ctx.fillRect(m - 3 + r, bot + r, 7 - r * 2, 1);
  ctx.fillStyle = '#16100e';
  for (let r = 0; r < 3; r++) ctx.fillRect(m - 2 + r, bot + r - 1, 5 - r * 2, 1);
  ctx.globalAlpha = 1;
}
