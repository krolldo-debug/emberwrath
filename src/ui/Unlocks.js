import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { iconUrl, abilityIcon } from '../gfx/Icons.js';
import { ACHIEVEMENTS } from '../progression/achievements.js';

// Freischalt-Karten (Thread D): kurze, auffällige Karte oben in der Mitte für
// neue Fähigkeiten, Passive und Talentreihen (Thread A, 'character:unlock')
// sowie Erfolge (Thread C, EV.ACHIEVEMENT_UNLOCKED). Eine Karte nach der
// anderen, damit sich nichts überlagert. Rein darstellend.
const SHOW = 3.4;
const KIND = {
  ability: { label: 'Neue Fähigkeit', cls: 'ability' },
  passive: { label: 'Neue Passive', cls: 'passive' },
  talents: { label: 'Neue Talentreihe', cls: 'talents' },
  achievement: { label: 'Erfolg errungen', cls: 'achievement' },
};

export class Unlocks {
  constructor(session, hud = null) {
    this.s = session;
    this.hud = hud;
    this.icon = h('img.ef-icon.ul-icon', { alt: '', width: 48, height: 48, draggable: 'false' });
    this.kind = h('div.ul-kind');
    this.name = h('div.ul-name');
    this.sub = h('div.ul-sub');
    this.el = h('div.ef-unlock', { 'aria-live': 'polite' },
      h('div.ul-rays'), h('div.ul-frame', this.icon), h('div.ul-text', this.kind, this.name, this.sub));
    session.game.ui.root.append(this.el);
    this.queue = [];
    this.left = 0;
    const bus = session.bus;
    bus.on('character:unlock', (e) => this.#onCharacter(e));
    bus.on(EV.ACHIEVEMENT_UNLOCKED, (e) => this.push({
      kind: 'achievement', name: e.name, icon: e.icon ?? ACHIEVEMENTS[e.id]?.icon ?? 'ui_achievements',
      sub: [e.points ? `${e.points} Punkte` : '', e.title ? `Titel „${e.title}“` : ''].filter(Boolean).join(' · '),
    }));
  }

  #onCharacter(e) {
    const hero = this.s.world?.hero;
    const key = { 0: 'Q', 1: 'R', 2: 'T', 3: 'G' }[hero?.abilities?.findIndex((a) => a.id === e.id)];
    if (e.kind === 'talents') this.push({ kind: 'talents', name: e.name, icon: 'ui_talents', sub: 'Talentpunkte verteilen: Taste U' });
    else this.push({ kind: e.kind === 'passive' ? 'passive' : 'ability', name: e.name, icon: abilityIcon(e.id, null), sub: key ? `Taste ${key} · Stufe ${e.level}` : `Stufe ${e.level}` });
  }

  push(card) { this.queue.push(card); }

  #show(c) {
    const k = KIND[c.kind] ?? KIND.ability;
    this.icon.src = iconUrl(c.icon);
    this.kind.textContent = k.label;
    this.name.textContent = c.name ?? '';
    this.sub.textContent = c.sub ?? '';
    this.el.className = `ef-unlock show k-${k.cls}`;
    const show = this.s?.input?.usingTouch ? SHOW * 0.75 : SHOW; // Handy: kürzer
    this.left = this.queue.length >= 2 ? show * 0.55 : show; // viele auf einmal (Stufensprung): schneller durch
    this.s.sfx?.play?.(c.kind === 'achievement' ? 'achievement' : 'unlock');
  }

  update(dt) {
    if (this.left > 0) {
      this.left -= dt;
      if (this.left <= 0) this.el.classList.remove('show');
      return;
    }
    // kurze Pause zwischen zwei Karten, dann die nächste
    if (this.left > -0.35) { this.left -= dt; return; }
    // nicht gleichzeitig mit einem Banner (Stufe, Quest) und nicht unter einem offenen Fenster
    if (!this.queue.length || this.hud?.bannerBusy || this.s.panels?.openId) return;
    const next = this.queue.shift();
    if (next) this.#show(next);
  }

  dispose() { this.el.remove(); }
}
