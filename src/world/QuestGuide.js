import { CONFIG } from '../config.js';
import { EV } from '../core/events.js';
import { questTarget } from '../progression/selectors.js';

const T = CONFIG.tileSize;
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

// Questpfad am Boden (INTEGRATION.md §11.6).
// Fragt das Ziel der verfolgten Quest ab (C: game.progression.questTarget()),
// löst es in eine Weltposition auf – oder, wenn es in einer anderen Zone liegt,
// in das Portal Richtung Zielzone (Breitensuche über zone.links) – und sucht
// einen Rasterweg (A*) dorthin. Gezeichnet wird eine leuchtende Glutspur, die
// zum Ziel hin wandert, plus ein pulsierender Ring am Ziel.
// Öffentlich: world.guidePath ([{x,y}] Weltpixel, geglättet) und world.guide.target.
// Abschaltbar über game.prefs 'guidePath'.
export class QuestGuide {
  constructor(world) {
    this.world = world;
    this.path = [];
    this.goal = null;    // { x, y, label, portal }
    this.target = null;  // Rohziel von C
    this.timer = 0;
    this.time = 0;
    this.fade = 0;
    this.dirty = true;
    const bus = world.bus;
    this.offs = [EV.QUEST_TRACKED, EV.QUEST_ACCEPTED, EV.QUEST_PROGRESS, EV.QUEST_COMPLETED, EV.QUEST_READY, 'quest:abandoned', EV.ENEMY_KILLED, EV.OBJECT_INTERACT]
      .filter(Boolean).map((ev) => bus.on(ev, () => { this.dirty = true; }));
  }

  get enabled() {
    const prefs = this.world.session.game?.prefs;
    return prefs ? prefs.get('guidePath', true) !== false : true;
  }

  dispose() { for (const off of this.offs) if (typeof off === 'function') off(); }

  update(dt) {
    this.time += dt;
    const on = this.enabled && !this.world.hero.dead && this.path.length > 1;
    this.fade = Math.max(0, Math.min(1, this.fade + (on ? dt * 2 : -dt * 3)));
    this.timer -= dt;
    if (!this.dirty && this.timer > 0) return;
    this.dirty = false;
    this.timer = 0.5;
    if (!this.enabled) { this.path = []; this.world.guidePath = this.path; return; }
    this.#recompute();
  }

  #readTarget() {
    const g = this.world.session.game;
    try {
      const t = g?.progression?.questTarget ? g.progression.questTarget() : questTarget(this.world.state, this.world.session.content);
      return t ?? null;
    } catch { return null; }
  }

  #recompute() {
    const w = this.world;
    const t = this.#readTarget();
    this.target = t;
    this.goal = t ? this.#resolve(t) : null;
    if (!this.goal) { this.path = []; w.guidePath = this.path; return; }
    const h = w.hero;
    const d = Math.hypot(this.goal.x - h.x, this.goal.y - h.y);
    if (d < (this.goal.near ?? 20)) { this.path = []; w.guidePath = this.path; return; }
    this.path = this.#findPath(h.x, h.y - 2, this.goal.x, this.goal.y) ?? [];
    w.guidePath = this.path;
  }

  // Ziel → Weltposition in dieser Zone
  #resolve(t) {
    const w = this.world, zone = w.zone, content = w.session.content;
    const here = zone.id;
    const kind = t.kind ?? t.type;
    const ids = t.ids?.length ? t.ids : t.id ? [t.id] : [];

    // Zielzone bestimmen
    let zoneId = t.zoneId ?? null;
    if (kind === 'zone') zoneId = t.id;
    if (!zoneId && kind === 'enemy') zoneId = this.#zoneWithEnemy(ids);
    if (!zoneId && kind === 'boss') zoneId = content.all('zone').find((z) => z.bossId === t.id)?.id ?? null;
    if (!zoneId && kind === 'npc') zoneId = content.find('npc', t.id)?.zoneId ?? null;
    if (zoneId && zoneId !== here) return this.#portalToward(zoneId);
    if (kind === 'zone') return null; // schon da

    switch (kind) {
      case 'npc': {
        const n = w.npcs.find((x) => x.npcId === t.id);
        return n ? { x: n.x, y: n.y + 10, near: 28, label: 'npc' } : null;
      }
      case 'area': {
        const a = w.dungeon.level.areas?.find((x) => x.id === t.id);
        return a ? { x: (a.x + a.w / 2) * T, y: (a.y + a.h / 2) * T, near: 24, label: 'area' } : null;
      }
      case 'object': {
        let best = null;
        for (const o of w.interactables) {
          if (!o.objectId || !ids.includes(o.objectId) || o.opened || o.used) continue;
          const d = Math.hypot(o.x - w.hero.x, o.y - w.hero.y);
          if (!best || d < best.d) best = { d, o };
        }
        return best ? { x: best.o.x, y: best.o.y + 8, near: 22, label: 'object' } : null;
      }
      case 'boss': {
        const b = w.boss;
        if (b && !b.dead) return { x: b.x, y: b.y + 8, near: 60, label: 'boss' };
        const a = w.dungeon.level.areas?.find((x) => /boss|sanctum|throne/.test(x.id));
        return a ? { x: (a.x + a.w / 2) * T, y: (a.y + a.h / 2) * T, near: 30, label: 'boss' } : null;
      }
      case 'enemy': {
        let best = null;
        for (const e of w.enemies) {
          if (e.dead || e.summoned || !ids.includes(e.type)) continue;
          const d = Math.hypot(e.x - w.hero.x, e.y - w.hero.y);
          if (!best || d < best.d) best = { d, x: e.x, y: e.y };
        }
        if (!best) {
          // Keiner lebt gerade: zum nächsten Spawnpunkt dieses Typs
          for (const m of w.dungeon.enemyMarks) {
            if (!ids.includes(m.type)) continue;
            const d = Math.hypot(m.x - w.hero.x, m.y - w.hero.y);
            if (!best || d < best.d) best = { d, x: m.x, y: m.y };
          }
        }
        if (!best) {
          const z = this.#zoneWithEnemy(ids);
          return z && z !== here ? this.#portalToward(z) : null;
        }
        return { x: best.x, y: best.y, near: 40, label: 'enemy' };
      }
    }
    return null;
  }

  #zoneWithEnemy(types) {
    const content = this.world.session.content;
    const here = this.world.zone;
    if (here.enemies?.some((e) => types.includes(e))) return here.id;
    return content.all('zone').find((z) => z.enemies?.some((e) => types.includes(e)))?.id ?? null;
  }

  // Nächster Zonenschritt Richtung Ziel (Breitensuche über links) → Portal
  #portalToward(targetZone) {
    const w = this.world, content = w.session.content;
    const prev = new Map([[w.zone.id, null]]);
    const queue = [w.zone.id];
    while (queue.length) {
      const z = queue.shift();
      if (z === targetZone) break;
      for (const n of content.find('zone', z)?.links ?? []) if (!prev.has(n)) { prev.set(n, z); queue.push(n); }
    }
    if (!prev.has(targetZone)) return null;
    let step = targetZone;
    while (prev.get(step) !== w.zone.id && prev.get(step) !== null) step = prev.get(step);
    const portal = w.interactables.find((p) => p.to?.zoneId === step);
    return portal ? { x: portal.x, y: portal.y + 6, near: 18, label: 'portal', portal } : null;
  }

  #blocked(x, y) {
    const f = this.world.flow;
    if (x < 0 || y < 0 || x >= f.w || y >= f.h) return true;
    return f.blocked[y * f.w + x] === 1;
  }

  #nearestOpen(x, y) {
    if (!this.#blocked(x, y)) return [x, y];
    for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (!this.#blocked(x + dx, y + dy)) return [x + dx, y + dy];
    }
    return null;
  }

  // A* auf dem Kachelraster, danach Glättung per Sichtprüfung
  #findPath(ax, ay, bx, by) {
    const f = this.world.flow, W = f.w;
    const s = this.#nearestOpen(Math.floor(ax / T), Math.floor(ay / T));
    const e = this.#nearestOpen(Math.floor(bx / T), Math.floor(by / T));
    if (!s || !e) return null;
    const start = s[1] * W + s[0], goal = e[1] * W + e[0];
    const g = new Float32Array(W * f.h).fill(Infinity);
    const from = new Int32Array(W * f.h).fill(-1);
    const closed = new Uint8Array(W * f.h);
    const heap = [[0, start]];
    const hfn = (i) => { const x = i % W, y = (i / W) | 0; const dx = Math.abs(x - e[0]), dy = Math.abs(y - e[1]); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    const push = (item) => { heap.push(item); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    g[start] = 0;
    let found = false, guard = 0;
    while (heap.length && guard++ < 40000) {
      const [, i] = pop();
      if (i === goal) { found = true; break; }
      if (closed[i]) continue;
      closed[i] = 1;
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy, c] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (this.#blocked(nx, ny)) continue;
        if (dx && dy && (this.#blocked(x + dx, y) || this.#blocked(x, y + dy))) continue;
        const ni = ny * W + nx, ng = g[i] + c;
        if (ng < g[ni]) { g[ni] = ng; from[ni] = i; push([ng + hfn(ni), ni]); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = goal; i !== -1; i = from[i]) cells.push(i);
    cells.reverse();
    // Glätten: so weit wie möglich geradeaus
    const pts = cells.map((i) => ({ x: (i % W) * T + T / 2, y: ((i / W) | 0) * T + T / 2 }));
    pts[0] = { x: ax, y: ay + 2 };
    pts[pts.length - 1] = { x: bx, y: by };
    const out = [pts[0]];
    let k = 0;
    while (k < pts.length - 1) {
      let j = pts.length - 1;
      while (j > k + 1 && !this.#clear(pts[k], pts[j])) j--;
      out.push(pts[j]);
      k = j;
    }
    return out;
  }

  #clear(a, b) {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 5);
    for (let i = 1; i < steps; i++) {
      const t = i / steps, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      // etwas Abstand zu Hindernissen halten
      for (const [ox, oy] of [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5]]) {
        if (this.#blocked(Math.floor((x + ox) / T), Math.floor((y + oy) / T))) return false;
      }
    }
    return true;
  }

  // Punkte gleichmäßig entlang des Pfades (für die Spur)
  #samples(spacing, offset) {
    const out = [];
    const P = this.path;
    let total = 0;
    for (let i = 0; i < P.length - 1; i++) total += Math.hypot(P[i + 1].x - P[i].x, P[i + 1].y - P[i].y);
    let acc = 0, next = offset;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y);
      while (next <= acc + len) {
        const t = (next - acc) / (len || 1);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, d: next, total, ang: Math.atan2(b.y - a.y, b.x - a.x) });
        next += spacing;
      }
      acc += len;
    }
    return out;
  }

  // Lit-Pass: dunkle Brandspur auf dem Boden (unter Figuren)
  render(ctx, cx, cy) {
    if (this.fade <= 0 || this.path.length < 2) return;
    const off = (this.time * 26) % 16;
    ctx.save();
    for (const p of this.#samples(16, off)) {
      const a = this.#alpha(p) * this.fade;
      if (a <= 0.02) continue;
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = '#1a0a04';
      ctx.fillRect(Math.round(p.x - cx - 2), Math.round(p.y - cy - 1), 5, 3);
    }
    ctx.restore();
  }

  #alpha(p) {
    const head = Math.min(1, (p.d - 10) / 24);          // nahe am Helden ausblenden
    const tail = Math.min(1, (p.total - p.d) / 18 + 0.35); // zum Ziel hin auslaufen
    return Math.max(0, Math.min(head, tail));
  }

  // Emissive-Pass: wandernde Glutpunkte (Pfeilspitzen) + Zielring
  renderEmissive(ctx, cx, cy) {
    if (this.fade <= 0) return;
    ctx.save();
    if (this.path.length > 1) {
      const off = (this.time * 26) % 16;
      for (const p of this.#samples(16, off)) {
        const a = this.#alpha(p) * this.fade;
        if (a <= 0.02) continue;
        // Pfeilspitze (Chevron) in Laufrichtung, 2 px dick
        const ux = Math.cos(p.ang), uy = Math.sin(p.ang) * 0.8, vx = -uy, vy = ux;
        const px = p.x - cx, py = p.y - cy;
        ctx.globalAlpha = a;
        // Grafik von D (effects.guide.arrow), sonst selbst gezeichneter Chevron
        const art = this.world.assets.effects?.guide;
        if (art?.arrow) {
          const img = art.arrow(p.ang);
          ctx.drawImage(img, Math.round(px - img.width / 2), Math.round(py - img.height / 2));
          continue;
        }
        for (let k = -3; k <= 3; k++) {
          const back = Math.abs(k) * 0.9;
          const x = Math.round(px - ux * back + vx * k), y = Math.round(py - uy * back + vy * k);
          ctx.fillStyle = Math.abs(k) <= 1 ? '#ffe8a0' : '#f07a1c';
          ctx.fillRect(x, y, 1, 1);
          ctx.fillStyle = '#a83408';
          ctx.fillRect(Math.round(x - ux), Math.round(y - uy), 1, 1);
        }
      }
    }
    const g = this.goal;
    if (g && this.path.length > 1) {
      const pulse = (this.time * 1.4) % 1;
      const x = Math.round(g.x - cx), y = Math.round(g.y - cy);
      ctx.strokeStyle = '#ffb640';
      ctx.lineWidth = 1;
      ctx.globalAlpha = this.fade * (1 - pulse) * 0.9;
      ctx.beginPath(); ctx.ellipse(x, y, 4 + pulse * 10, (4 + pulse * 10) * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = this.fade * 0.7;
      const end = this.world.assets.effects?.guide?.end;
      if (end) { ctx.globalAlpha = this.fade; ctx.drawImage(end, x - (end.width >> 1), y - (end.height >> 1)); }
      else { ctx.fillStyle = '#fff0b0'; ctx.fillRect(x - 1, y - 1, 2, 2); }
    }
    ctx.restore();
  }
}
