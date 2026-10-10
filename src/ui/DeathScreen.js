import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { canReviveInInstance } from '../world/instanceRevive.js';
import { frameUrl, pixelTitle } from './pixelFrame.js';
import { confirmTap } from './confirmTap.js';
import { lang } from '../i18n/index.js';

// Todesbildschirm (Teil des HUD, liegt in .hud-view über dem Spielbild). Die Welt läuft dahinter weiter.
//   Tafel: gezeichneter Pixelrahmen (ui/pixelFrame.js), Schädel auf der Oberkante, Titel in Pixelschrift,
//          „Wiederbeleben“ füllt sich in vier Stufen; im Dungeon zusätzlich „Verlassen“ (zweiter Tipp bestätigt).
//   Leiste: kämpft die Gruppe noch (hero.partyWaiting, finder/Party.js), nur eine schmale Leiste am unteren Rand,
//           damit man dem Kampf zuschauen kann. Wiederbeleben gibt es dann nicht, die Gruppe hebt einen auf.
// Aussehen: ui/death.css. Stil: harte Kanten, deckende Farben, ganzzahlige Schritte.

const SKULL = ['...#####...', '..#######..', '.#########.', '.##oo#oo##.', '.##oo#oo##.', '.#########.', '..###.###..', '...#####...', '...#.#.#...'];
function skullSvg(cls) {
  let r = '';
  SKULL.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === '.') return;
    const f = c === 'o' ? '#ff6a2a' : y > 5 || x > 7 ? '#a8987a' : '#e6dcc2';
    r += `<rect${c === 'o' ? ' class="eye"' : ''} x="${x}" y="${y}" width="1" height="1" fill="${f}"/>`;
  }));
  return `<svg class="${cls}" viewBox="0 0 11 9" aria-hidden="true" shape-rendering="crispEdges">${r}</svg>`;
}

export class DeathScreen {
  constructor(session) {
    this.s = session;
    const bus = session.bus;
    const sigil = h('div.dz-sigil');
    sigil.innerHTML = skullSvg('dz-skull');
    this.title = h('canvas.dz-title', { 'aria-hidden': 'true' });
    this.titleLang = null;
    this.fill = h('i.dz-fill');
    this.revive = h('button.dz-btn.primary.dz-revive', { type: 'button', onclick: () => bus.emit(EV.RESPAWN_REQUEST, {}) },
      this.fill, h('span.dz-lbl', 'Wiederbeleben'));
    const leaveLbl = h('span.dz-lbl', 'Verlassen');
    this.leave = h('button.dz-btn.dz-leave', { type: 'button' }, leaveLbl);
    this.disarm = [confirmTap(this.leave, leaveLbl, { onConfirm: () => bus.emit(EV.RESPAWN_REQUEST, { leave: true }) })];
    const sparks = [0, 1, 2, 3].map((i) => h(`i.dz-spark.s${i}`));
    this.card = h('div.dz-card', sigil, this.title, h('div.dz-actions', this.revive, this.leave), sparks);

    const barSkull = h('span.dz-bar-skull');
    barSkull.innerHTML = skullSvg('dz-skull');
    const barLbl = h('span.dz-lbl', 'Verlassen');
    const barLeave = h('button.dz-btn.dz-leave', { type: 'button' }, barLbl);
    this.disarm.push(confirmTap(barLeave, barLbl, { onConfirm: () => bus.emit(EV.RESPAWN_REQUEST, { leave: true }) }));
    this.bar = h('div.dz-bar', barSkull, h('span.dz-bar-text', 'Deine Gruppe kämpft weiter.'), barLeave);

    this.el = h('div.dz', { role: 'alertdialog', 'aria-label': 'Du bist gefallen' }, this.card, this.bar);
    this.el.style.setProperty('--dz-frame2', `url(${frameUrl(2)})`);
    this.el.style.setProperty('--dz-frame3', `url(${frameUrl(3)})`);
    this.shown = false;
    this.mode = '';
    this.rdy = -1;
  }

  update(hero) {
    const s = this.s;
    const waiting = !!hero.partyWaiting;
    const dead = hero.dead && (waiting ? (hero.partyDown ?? 0) > 1.2 : s.deadTime > 1.2);
    if (dead !== this.shown) {
      this.shown = dead;
      this.el.classList.toggle('show', dead);
      if (!dead) for (const d of this.disarm) d();
      else this.#renderTitle();
    }
    if (!dead) return;
    const mode = waiting ? 'group' : canReviveInInstance(s.zone?.def) ? 'instance' : 'solo';
    if (mode !== this.mode) { this.mode = mode; this.el.dataset.mode = mode; }
    // Bereit nach 2 s; bis dahin füllt sich der Knopf in vier deckenden Stufen
    const rdy = waiting ? 0 : Math.min(4, Math.max(0, Math.floor(((s.deadTime - 1.2) / 0.8) * 4)));
    if (rdy !== this.rdy) {
      this.rdy = rdy;
      this.fill.style.width = `${rdy * 25}%`;
      this.el.classList.toggle('ready', rdy >= 4);
      this.revive.disabled = rdy < 4;
    }
  }

  // Titel in Pixelschrift, ganzzahlig vergrößert (Sprache kann wechseln)
  #renderTitle() {
    const l = lang();
    if (l === this.titleLang) return;
    this.titleLang = l;
    const c = pixelTitle(this.s.font, 'Du bist gefallen');
    this.title.width = c.width; this.title.height = c.height;
    this.title.getContext('2d').drawImage(c, 0, 0);
    this.title.style.setProperty('--tw', String(c.width));
    this.title.style.setProperty('--th', String(c.height));
  }
}
