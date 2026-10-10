import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { CONFIG } from '../config.js';

// Einstiegshinweise (10.10.): ein frischer Held bekommt in den ersten Minuten ein paar
// kleine Hinweise, jeweils im passenden Moment und genau einmal:
//   Laufen, Glutspur zur ersten Aufgabe, Angreifen, Fähigkeit, Ausweichen, Heiltrank,
//   neue Ausrüstung (Inventar), Karte.
// Am PC mit Tasten/Maus, auf dem Handy als Zeiger auf den passenden Knopf (der Knopf glimmt).
// Ohne Ziel-Knopf steht der Hinweis knapp unter dem Helden, so bleibt die Ansagen-Reihe
// oben (Banner, Freischalt-Karten) und die Meldungsspalte frei.
// Nur für Charaktere, die auf diesem Gerät neu angelegt wurden (GAME_STARTED isNew);
// bestehende Charaktere sehen nichts. Abschaltbar: prefs 'guideHints' (Einstellungen).
// Liest nur Zustand und Ereignisse, schreibt nie in den Spielstand.

const STORE = 'emberwrath:guide:';
const PREF = 'guideHints';
const MAX_LEVEL = 8;      // darüber (z. B. auf anderem Gerät weitergespielt) keine Hinweise mehr
const GAP = 3;            // Sekunden Ruhe zwischen zwei Hinweisen
const SHOW = 9;           // so lange steht ein Hinweis höchstens
const NEAR = 110;         // Gegner so nah (Welt-Pixel): Kampfhinweise

const MOUSE = (btn) => `<svg class="eg-mouse" viewBox="0 0 9 11" width="18" height="22" shape-rendering="crispEdges" aria-hidden="true">
<path fill="#0b0710" d="M1 0h7v1h1v9H8v1H1v-1H0V1h1z"/>
<path fill="#d8cdb0" d="M1 1h7v9H1z"/>
<path fill="${btn === 'l' ? '#ffb347' : '#8a7c62'}" d="M1 1h3v3H1z"/>
<path fill="${btn === 'r' ? '#ffb347' : '#8a7c62'}" d="M5 1h3v3H5z"/>
<path fill="#0b0710" d="M4 1h1v3H4zM1 4h7v1H1z"/></svg>`;

const DRAG = `<svg class="eg-drag" viewBox="0 0 22 22" width="30" height="30" shape-rendering="crispEdges" aria-hidden="true">
<path fill="rgba(232,194,90,.55)" d="M8 1h6v1h2v1h2v2h1v2h1v8h-1v2h-1v2h-2v1h-2v1H8v-1H6v-1H4v-2H3v-2H2V7h1V5h1V3h2V2h2zm0 2v1H6v1H5v2H4v8h1v2h1v1h2v1h6v-1h2v-1h1v-2h1V7h-1V5h-1V4h-2V3z"/>
<path class="eg-knob" fill="#e8c25a" d="M12 7h4v1h1v4h-1v1h-4v-1h-1V8h1z"/>
<path fill="#7d5418" d="M12 11h4v1h-4z"/></svg>`;

// Glutspur wie am Boden (QuestGuide): drei kleine Glutwinkel
const TRAIL = `<svg class="eg-trail" viewBox="0 0 15 9" width="22" height="13" shape-rendering="crispEdges" aria-hidden="true">
<path fill="#ff8a2a" d="M0 6h3v1H1v2H0zM6 3h3v1H7v2H6zM12 0h3v1h-2v2h-1z"/>
<path fill="#ffd27a" d="M0 6h2v1H0zM6 3h2v1H6zM12 0h2v1h-2z"/></svg>`;

// Inhalt: Tastenkappen (k), Maus (m), Pixelbild (i) und genau ein Satz (t).
// place: wo der Hinweis zum Ziel steht (left | above | below); ohne Ziel unter dem Helden.
const HINTS = {
  move: {
    pc: { k: ['W', 'A', 'S', 'D'], wasd: true, t: 'Laufen' },
    touch: { i: DRAG, t: 'Links ziehen, um zu laufen', at: 'stick' },
  },
  quest: {
    pc: { i: TRAIL, t: 'Folge der Glutspur zu deiner ersten Aufgabe.' },
    touch: { i: TRAIL, t: 'Folge der Glutspur zu deiner ersten Aufgabe.' },
  },
  attack: {
    pc: { m: 'l', k: ['Leertaste'], t: 'Angreifen' },
    touch: { t: 'Angreifen', slot: 'attack', place: 'left' },
  },
  skill: {
    pc: { k: ['Q'], t: 'Fähigkeit einsetzen', slot: 'skill1', place: 'above' },
    touch: { t: 'Fähigkeit einsetzen', slot: 'skill1', place: 'left' },
  },
  dodge: {
    pc: { m: 'r', k: ['Shift'], t: 'Ausweichen' },
    touch: { t: 'Ausweichen', slot: 'dodge', place: 'left' },
  },
  potion: {
    pc: { k: ['H'], t: 'Heiltrank trinken', slot: 'potion', place: 'above' },
    touch: { t: 'Heiltrank trinken', slot: 'potion', place: 'left' },
    urgent: true,
  },
  gear: {
    pc: { k: ['I'], t: 'Neue Ausrüstung im Inventar', sel: '[data-action="inventory"]', place: 'above' },
    touch: { t: 'Neue Ausrüstung im Inventar', sel: '.hud-menu-toggle', place: 'below' },
  },
  map: {
    pc: { k: ['M'], t: 'Karte öffnen', sel: '.hud-minimap', place: 'left' },
    touch: { t: 'Karte öffnen', sel: '.hud-minimap', place: 'below' },
  },
};

function load(id) {
  try { return JSON.parse(localStorage.getItem(STORE + id) ?? 'null'); } catch { return null; }
}
function store(id, rec) {
  try { localStorage.setItem(STORE + id, JSON.stringify(rec)); } catch { /* nur für diese Sitzung */ }
}

export class Guide {
  constructor(session, hud) {
    this.s = session;
    this.hud = hud;
    this.game = session.game;
    this.on = false;
    this.rec = null;
    this.want = new Set();     // ausgelöst, wartet auf einen ruhigen Moment
    this.cur = null;           // { id, t, done, mode, target }
    this.quiet = GAP;          // Ruhe seit dem letzten Hinweis
    this.t = 0;
    this.kills = 0;
    this.lastHp = null;

    this.body = h('div.eg-body');
    this.arrow = h('i.eg-arrow');
    this.el = h('div.ef-guide', { role: 'status', 'aria-live': 'polite' }, this.body, this.arrow);
    this.layer = h('div.ef-guide-layer', this.el);
    this.game.ui.root.append(this.layer);
    this.#listen();
  }

  #listen() {
    const bus = this.s.bus;
    bus.on(EV.GAME_STARTED, (e) => this.#start(e));
    bus.on(EV.PREFS_CHANGED, (e) => { if (e.key === PREF && e.value === false) this.#hide(true); });
    bus.on(EV.QUEST_ACCEPTED, () => this.#finish('quest'));
    bus.on(EV.ITEM_USED, () => this.#finish('potion'));
    bus.on(EV.ENEMY_KILLED, () => { this.kills++; this.#finish('attack'); });
    bus.on(EV.ITEM_ADDED, (e) => {
      const def = this.s.content.find('item', e.itemId);
      if (def?.slot && e.source !== 'buy') this.#want('gear');
    });
    bus.on(EV.QUEST_COMPLETED, () => this.#want('map'));
  }

  #start({ characterId, isNew }) {
    if (!characterId) return;
    this.id = characterId;
    this.rec = load(characterId) ?? (isNew ? { done: [] } : null);
    if (!this.rec) return;
    if (isNew) store(characterId, this.rec);
    const level = this.s.state.slices.progress?.level ?? 1;
    const quests = this.s.state.slices.quests;
    // Wer schon eine Aufgabe hat, braucht den Weg dorthin nicht mehr
    if (quests && (Object.keys(quests.active ?? {}).length || quests.completed?.length)) this.#mark('quest');
    this.on = level <= MAX_LEVEL && this.rec.done.length < Object.keys(HINTS).length;
    if (this.on) { this.#want('move'); this.#want('quest'); }
  }

  get #enabled() { return this.on && this.game.prefs.get(PREF, true) !== false; }
  #seen(id) { return this.rec?.done.includes(id); }
  #want(id) { if (this.on && !this.#seen(id)) this.want.add(id); }

  #mark(id) {
    this.want.delete(id);
    if (!this.rec || this.#seen(id)) return;
    this.rec.done.push(id);
    store(this.id, this.rec);
  }

  // Aufgabe erledigt: läuft der Hinweis gerade, bestätigt er kurz und geht; sonst kommt er gar nicht
  #finish(id) {
    if (this.cur?.id === id) { if (!this.cur.done) { this.cur.done = 0.01; this.el.classList.add('done'); this.#mark(id); } return; }
    this.#mark(id);
  }

  // ---------------------------------------------------------------- Bedingungen
  #nearEnemy(hero) {
    for (const e of this.s.world?.enemies ?? []) {
      if (e.dead || e.removed) continue;
      if (Math.hypot(e.x - hero.x, e.y - hero.y) < NEAR) return true;
    }
    return false;
  }

  #watch(hero) {
    const inp = this.s.input;
    // Laufen: genug Weg zurückgelegt
    this.home ??= { x: hero.x, y: hero.y };
    if (Math.hypot(hero.x - this.home.x, hero.y - this.home.y) > 40) this.#finish('move');
    const near = this.#nearEnemy(hero);
    if (near) this.#want('attack');
    if (inp.pressed('attack') && near) this.#finish('attack');
    const a = hero.abilities?.[0];
    if (near && a && !a.locked && (a.ready ?? !(a.cdLeft > 0)) && (this.kills > 0 || this.#seen('attack'))) this.#want('skill');
    if (inp.pressed('skill1')) this.#finish('skill');
    if (inp.pressed('dodge')) this.#finish('dodge');
    // Ausweichen: erst wenn ein Treffer gesessen hat
    const hp = hero.hp, max = hero.maxHp || 1;
    if (this.lastHp != null && hp < this.lastHp && near && hp / max < 0.8) this.#want('dodge');
    this.lastHp = hp;
    if (hp / max < 0.45 && !hero.dead && this.#hasPotion()) this.#want('potion');
    if (this.cur?.id === 'potion' && hp / max > 0.7) this.#finish('potion');
    const open = this.s.panels?.openId;
    if (open === 'inventory') this.#finish('gear');
    if (open === 'map') this.#finish('map');
  }

  #hasPotion() {
    const sl = this.hud.slots?.find((x) => x.action === 'potion');
    return !!sl && !sl.el.classList.contains('hidden') && !sl.el.classList.contains('disabled');
  }

  // ---------------------------------------------------------------- Anzeige
  #pick() {
    if (this.want.has('potion')) return 'potion';
    const order = ['move', 'quest', 'attack', 'skill', 'dodge', 'gear', 'map'];
    // Spur zur Aufgabe erst nach dem Laufen, damit nicht zwei Dinge auf einmal kommen
    return order.find((id) => this.want.has(id) && (id !== 'quest' || this.#seen('move')));
  }

  #show(id) {
    const touch = !!this.s.input.usingTouch;
    const d = HINTS[id][touch ? 'touch' : 'pc'];
    this.#mark(id); // gilt ab jetzt als gesehen (auch nach Neuladen); kurz verdrängt kommt er in dieser Sitzung noch einmal
    const parts = [];
    if (d.i) { const ico = h('span.eg-ico'); ico.innerHTML = d.i; parts.push(ico); }
    if (d.m || d.k) {
      const keys = h(`span.eg-keys${d.wasd ? '.wasd' : ''}`);
      if (d.m) { const m = h('span.eg-ico'); m.innerHTML = MOUSE(d.m); keys.append(m); }
      if (d.m && d.k) keys.append(h('span.eg-or', '/'));
      for (const k of d.k ?? []) keys.append(h('kbd.eg-key', k));
      parts.push(keys);
    }
    const target = this.#target(d);
    // Handy: Bild des Knopfs im Hinweis, damit klar ist, welcher gemeint ist (der Knopf glimmt dazu)
    const src = touch && d.slot ? target?.querySelector('img')?.getAttribute('src') : null;
    if (src) parts.push(h('img.eg-btn', { src, alt: '', width: 20, height: 20, draggable: 'false' }));
    parts.push(h('span.eg-text', d.t));
    this.body.replaceChildren(...parts);
    this.cur = { id, t: 0, done: 0, touch, d, target };
    this.cur.target?.classList.add('ef-guide-target');
    this.el.className = `ef-guide show${d.place ? ` p-${d.place}` : ' p-hero'}${d.at ? ` at-${d.at}` : ''}`;
    this.lastPos = null;
    this.#place();
    this.s.sfx?.play?.('ui');
  }

  #target(d) {
    if (d.slot) return this.hud.slots?.find((x) => x.action === d.slot)?.el ?? null;
    if (d.sel) return this.hud.root.querySelector(d.sel) ?? null;
    return null;
  }

  #hide(fast = false) {
    if (!this.cur) return;
    this.cur.target?.classList.remove('ef-guide-target');
    this.el.classList.remove('show', 'done');
    if (fast) this.el.classList.add('cut');
    this.cur = null;
    this.quiet = 0;
  }

  // Lage berechnen: am Ziel-Knopf oder unter dem Helden; immer ganz im Bild
  #place() {
    const c = this.cur;
    if (!c) return;
    const W = window.innerWidth, H = window.innerHeight;
    const w = this.el.offsetWidth, hh = this.el.offsetHeight;
    const m = 8, gap = 12;
    let x, y, ax = null;
    const r = c.target?.getBoundingClientRect();
    if (r && r.width) {
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (c.d.place === 'left') {
        // links neben die ganze Knopfreihe auf dieser Höhe, nicht zwischen zwei Knöpfe
        let left = r.left;
        for (const b of this.hud.barEl?.children ?? []) {
          const q = b.getBoundingClientRect();
          if (q.width && q.top < cy && q.bottom > cy && q.right <= r.left + 2) left = Math.min(left, q.left);
        }
        x = left - w - gap; y = cy - hh / 2;
        this.el.classList.toggle('far', left < r.left); // ein anderer Knopf liegt dazwischen: kein Zeiger
      }
      else if (c.d.place === 'below') { x = cx - w / 2; y = r.bottom + gap; }
      else { x = cx - w / 2; y = r.top - hh - gap; }
      x = Math.max(m, Math.min(W - w - m, x));
      y = Math.max(m, Math.min(H - hh - m, y));
      ax = c.d.place === 'left' ? cy - y : cx - x;
    } else if (c.d.at === 'stick') {
      // Handy: dort, wo der Daumen den Stick aufzieht (linke untere Hälfte)
      x = Math.max(m, W * 0.06); y = H * 0.62 - hh / 2;
    } else {
      const hero = this.s.world?.hero, cam = this.s.camera;
      const cr = this.game.canvas.getBoundingClientRect();
      const px = hero && cam ? cr.left + ((hero.x - cam.rx) / CONFIG.viewWidth) * cr.width : W / 2;
      const py = hero && cam ? cr.top + ((hero.y - cam.ry) / CONFIG.viewHeight) * cr.height : H / 2;
      x = Math.max(m, Math.min(W - w - m, px - w / 2));
      y = Math.max(m, Math.min(H - hh - m, py + Math.max(16, cr.height * 0.06)));
    }
    x = Math.round(x); y = Math.round(y);
    const key = `${x},${y},${ax}`;
    if (key === this.lastPos) return;
    this.lastPos = key;
    this.el.style.left = `${x}px`; this.el.style.top = `${y}px`;
    if (ax != null) this.el.style.setProperty('--ax', `${Math.round(ax)}px`);
  }

  update(dt) {
    this.t += dt;
    const hero = this.s.world?.hero;
    if (!this.#enabled || !hero) { if (this.cur) this.#hide(true); return; }
    this.#watch(hero);
    const busy = !!this.s.panels?.openId || hero.dead || this.s.paused;
    const c = this.cur;
    if (c) {
      // Fenster offen, Held gefallen: ausblenden; was noch nicht erledigt ist, kommt später wieder
      if (busy && !c.done) { if (c.t < 2.5) this.want.add(c.id); this.#hide(true); return; }
      // Handy/PC gewechselt: neu aufbauen
      if (c.touch !== !!this.s.input.usingTouch && !c.done) { const id = c.id; this.#hide(true); this.#show(id); return; }
      c.t += dt;
      if (c.done) c.done += dt;
      const dur = c.id === 'move' ? SHOW + 5 : SHOW;
      if (c.done > 0.9 || (!c.done && c.t > dur)) { this.#hide(); return; }
      // Heiltrank drängt sich vor einen gewöhnlichen Hinweis
      if (this.want.has('potion') && c.id !== 'potion' && !c.done) { if (c.t < 2.5) this.want.add(c.id); this.#hide(true); this.#show('potion'); return; }
      this.#place();
      return;
    }
    this.quiet += dt;
    if (busy || this.t < 2.2) return;
    const next = this.#pick();
    if (!next) {
      if (this.rec && this.rec.done.length >= Object.keys(HINTS).length) this.on = false;
      return;
    }
    const urgent = HINTS[next].urgent;
    // nicht zugleich mit einer großen Ansage (Stufe, Boss) und nicht Schlag auf Schlag
    if (!urgent && (this.quiet < GAP || this.hud.bannerBusy)) return;
    this.el.classList.remove('cut');
    this.#show(next);
  }

  dispose() { this.#hide(true); this.layer.remove(); }
}
