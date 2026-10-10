import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { iconUrl, abilityIcon } from '../gfx/Icons.js';
import { ACHIEVEMENTS, rewardItemId } from '../progression/achievements.js';
import { DYES } from '../character/cosmetics.js';
import { CLASSES } from '../character/classes.js';
import { fmtNum } from '../i18n/index.js';

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
  achievements: { label: 'Erfolge errungen', cls: 'achievement' },
  reward: { label: 'Belohnung errungen', cls: 'reward' },
  mount: { label: 'Neues Reittier', cls: 'mount' },
  riding: { label: 'Reiten gelernt', cls: 'mount' },
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
    bus.on(EV.MOUNT_LEARNED, (e) => this.#onMount(e));
    bus.on(EV.QUEST_COMPLETED, (e) => { if (e.questId === 'q_first_ride') this.push({ kind: 'riding', name: 'Reiten', icon: 'ui_mount', sub: 'Reittiere gibt es bei Stallmeisterin Orla' }); });
    bus.on(EV.ACHIEVEMENT_UNLOCKED, (e) => this.push(e.reward ? this.#rewardCard(e) : {
      kind: 'achievement', name: e.name, points: e.points ?? 0, icon: e.icon ?? ACHIEVEMENTS[e.id]?.icon ?? 'ui_achievements',
      sub: [e.points ? `${fmtNum(e.points)} Punkte` : '', e.title ? `Titel „${e.title}“` : ''].filter(Boolean).join(' · '),
    }));
  }

  // Erfolg mit Belohnung (progression/achievements.js reward): eigene Karte mit dem Bild der Belohnung
  #rewardCard(e) {
    const c = this.s.content, r = e.reward;
    let name = '', icon = e.icon ?? 'ui_achievements';
    if (r.kind === 'dye') name = `Färbung „${DYES[r.id]?.name ?? ''}“`;
    else if (r.kind === 'mount') { name = c.find('mount', r.id)?.name ?? ''; icon = `mount_${r.id}`; }
    else {
      const it = c.find('item', r.kind === 'item' ? rewardItemId(r, CLASSES[this.s.state.slices.character?.classId]?.primary) : r.id);
      name = it?.name ?? ''; icon = it?.icon ?? icon;
    }
    return { kind: 'reward', name: e.name, icon, sub: `Belohnung: ${name}` };
  }

  // Reittiere (§12.6): neues Reittier und freigeschaltetes Reiten (Reitstunde bei Orla)
  #onMount(e) {
    if (e.source === 'achievement') return; // kommt mit der Belohnungskarte
    const def = this.s.content.find('mount', e.mountId);
    const pct = def?.speed ? ` · +${Math.round(def.speed * 100)} % Tempo` : '';
    this.push({ kind: 'mount', name: def?.name ?? 'Reittier', icon: `mount_${e.mountId}`, sub: `Aufsitzen: Taste V${pct}` });
  }

  #onCharacter(e) {
    const hero = this.s.world?.hero;
    const key = { 0: 'Q', 1: 'R', 2: 'T', 3: 'G' }[hero?.abilities?.findIndex((a) => a.id === e.id)];
    if (e.kind === 'talents') this.push({ kind: 'talents', name: e.name, icon: 'ui_talents', sub: 'Talentpunkte verteilen: Taste U' });
    else this.push({ kind: e.kind === 'passive' ? 'passive' : 'ability', name: e.name, icon: abilityIcon(e.id, null), sub: key ? `Taste ${key} · Stufe ${e.level}` : `Stufe ${e.level}` });
  }

  push(card) { this.queue.push(card); }

  get showing() { return this.left > 0; }
  // Karte blendet gerade aus (nach normalem Ablauf): ein Banner wartet so lange
  get fading() { return this.left <= 0 && this.left > -0.35 && !this.el.classList.contains('cut'); }

  // Ein wichtigeres Banner (Hud) braucht den Platz: Karte sofort ausblenden (kein Überblenden).
  // War sie schon gut zu sehen (ab 1 s), ist sie erledigt; sonst kommt sie danach mit der Restzeit wieder.
  yieldTo() {
    if (!(this.left > 0) || !this.current) return;
    const c = this.current;
    c.seen += (performance.now() - c.shownAt) / 1000;   // Echtzeit: Hitstop/Zeitlupe zählen mit
    if (c.seen < 1) { c.remain = Math.max(0.8, this.left); this.queue.unshift(c); }
    this.current = null;
    this.left = -1;
    this.el.classList.add('cut');
    this.el.classList.remove('show');
  }

  // mehrere wartende Erfolge (z. B. nach einem Banner) werden zu einer Karte
  #merge(c) {
    if (c.kind !== 'achievement' || c.remain) return c;
    const more = this.queue.filter((q) => q.kind === 'achievement' && !q.remain);
    if (!more.length) return c;
    this.queue = this.queue.filter((q) => !more.includes(q));
    const all = [c, ...more];
    const pts = all.reduce((n, q) => n + (q.points ?? 0), 0);
    return { kind: 'achievements', name: all.map((q) => q.name).join(' · '), icon: c.icon, sub: pts ? `${fmtNum(pts)} Punkte` : '' };
  }

  #show(c) {
    const k = KIND[c.kind] ?? KIND.ability;
    const again = c === this.lastShown;   // nach yieldTo(): kein zweiter Klang
    this.current = c; this.lastShown = c;
    c.seen ??= 0; c.shownAt = performance.now();
    this.icon.src = iconUrl(c.icon);
    this.kind.textContent = k.label;
    this.name.textContent = c.name ?? '';
    this.sub.textContent = c.sub ?? '';
    this.el.className = `ef-unlock show k-${k.cls}`;
    const show = this.s?.input?.usingTouch ? SHOW * 0.75 : SHOW; // Handy: kürzer
    this.left = c.remain ?? (this.queue.length >= 2 ? show * 0.55 : show); // viele auf einmal (Stufensprung): schneller durch
    if (!again) this.s.sfx?.play?.(c.kind.startsWith('achievement') || c.kind === 'reward' ? 'achievement' : 'unlock');
  }

  update(dt) {
    // erst wenn kein Banner mehr läuft (inkl. Ausblenden), damit nie zwei Ansagen übereinander stehen
    this.calm = this.hud?.bannerBusy ? 0 : (this.calm ?? 1) + dt;
    if (this.left > 0) {
      this.left -= dt;
      if (this.left <= 0) this.el.classList.remove('show');
      return;
    }
    // kurze Pause zwischen zwei Karten, dann die nächste
    if (this.left > -0.35) { this.left -= dt; return; }
    // nicht gleichzeitig mit einem Banner (Stufe, Quest) und nicht unter einem offenen Fenster
    if (!this.queue.length || this.calm < 0.4 || this.s.panels?.openId) return;
    const next = this.queue.shift();
    if (next) this.#show(this.#merge(next));
  }

  dispose() { this.el.remove(); }
}
