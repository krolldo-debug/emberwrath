import { h } from '../core/dom.js';
import { MenuScene } from './TitleScene.js';
import { HeroPortrait, characterLine, zoneName, formatAgo, confirmButton, localNotice, savedLook } from './ui.js';
import { listSlots, storeSlot, restoreSlot, clearSlot, dropSlots, snapInfo, formatPlayTime, SLOT_COUNT } from './backups.js';

export const MAX_CHARACTERS = 8;

// Charaktere des eingeloggten Demo-Accounts: spielen, löschen, neu erstellen,
// Speicherplätze je Charakter (backups.js) sichern und laden.
export class CharacterListScene extends MenuScene {
  enter() {
    this.portraits = [];
    this.open = null; // Charakter-ID mit aufgeklappten Speicherplätzen
    this.root = h('div.ef-screen.acc-screen');
    if (!this.game.account) { this.game.scenes.go('account', { next: 'characters' }); return; }
    this.#render();
  }

  back() { this.game.scenes.go('title'); }

  update(dt) {
    super.update(dt);
    for (const p of this.portraits) p.update(dt);
  }

  #render() {
    const g = this.game, acc = g.account;
    const chars = g.save.listCharacters(acc.id);
    this.portraits = [];
    const cards = chars.map((c) => {
      const portrait = new HeroPortrait({ raceId: c.raceId ?? 'human', classId: c.classId ?? 'warrior', ...savedLook(g.save, g.content, acc.id, c.id), scale: 1.25, backdrop: false });
      this.portraits.push(portrait);
      // Vor jedem Start den bisherigen Stand als automatischen Speicherplatz sichern
      const play = () => { storeSlot(g.save, acc.id, c.id, 'auto'); if (!g.loadGame(acc.id, c.id)) this.#render(); };
      const snap = g.save.loadCharacter(acc.id, c.id);
      const info = snapInfo(snap, g.content);
      const where = zoneName(g.content, info.zoneId);
      const open = this.open === c.id;
      const card = h(`div.acc-char.ef-card${open ? '.open' : ''}`, { onclick: play },
        h('div.acc-char-portrait', portrait.canvas),
        h('div.acc-char-info',
          h('strong.acc-char-name', c.name, info.title ? h('span.acc-char-title', info.title) : null),
          h('div.acc-meta', characterLine(g.content, { ...c, level: info.level })),
          h('div.acc-meta.dim', [where, `Spielzeit ${formatPlayTime(info.playTime)}`, `gespeichert ${formatAgo(c.savedAt)}`].filter(Boolean).join(' · '))),
        h('div.acc-row-actions',
          h('button.ef-btn.primary.acc-small', { type: 'button', onclick: (e) => { e.stopPropagation(); play(); } }, 'Spielen'),
          h('button.ef-btn.acc-small', { type: 'button', 'aria-expanded': open ? 'true' : 'false', onclick: (e) => { e.stopPropagation(); this.open = open ? null : c.id; this.#render(); } }, 'Speicher\u00ADplätze'),
          confirmButton('Löschen', 'Wirklich löschen?', () => { g.save.deleteCharacter(acc.id, c.id); dropSlots(g.save, acc.id, c.id); this.#render(); }, 'ef-btn.danger.acc-small')));
      return open ? h('div.acc-char-wrap', card, this.#slots(acc.id, c.id)) : card;
    });

    const full = chars.length >= MAX_CHARACTERS;
    const panel = h('div.ef-panel.acc-panel',
      h('header.acc-head',
        h('button.acc-back', { type: 'button', onclick: () => this.back(), 'aria-label': 'Zurück zum Titel' }, '‹'),
        h('div', h('h2.ef-sub', `Charaktere von „${acc.name}“`), h('p.acc-step', 'Lokaler Demo-Account · auf diesem Gerät gespeichert'))),
      cards.length ? h('div.acc-list', cards) : h('p.acc-empty', 'Dieser Account hat noch keinen Charakter.'),
      h('div.acc-actions',
        h('button.ef-btn.primary', { type: 'button', disabled: full, onclick: () => g.scenes.go('characterCreate', { from: 'characters' }) },
          full ? `Maximal ${MAX_CHARACTERS} Charaktere` : 'Neuen Charakter erschaffen'),
        h('button.ef-btn', { type: 'button', onclick: () => { g.logout(); g.scenes.go('account', { next: 'characters' }); } }, 'Account wechseln')),
      localNotice(g, { compact: true }));
    this.root.replaceChildren(panel);
  }

  // Aufgeklappte Speicherplätze eines Charakters
  #slots(accId, chrId) {
    const g = this.game;
    const d = listSlots(g.save, accId, chrId);
    const line = (rec) => {
      const i = snapInfo(rec.snap, g.content);
      return [`Stufe ${i.level}`, zoneName(g.content, i.zoneId), `Spielzeit ${formatPlayTime(i.playTime)}`, `${i.gold} Gold`].filter(Boolean).join(' · ');
    };
    const load = (idx) => confirmButton('Laden', 'Aktuellen Stand ersetzen?', () => {
      storeSlot(g.save, accId, chrId, 'auto');
      if (restoreSlot(g.save, accId, chrId, idx)) g.loadGame(accId, chrId); else this.#render();
    }, 'ef-btn.acc-small');
    const row = (label, rec, actions) => h(`div.acc-slot${rec ? '' : '.empty'}`,
      h('div.acc-slot-info',
        h('strong', label),
        h('div.acc-meta', rec ? line(rec) : 'Leer'),
        rec ? h('div.acc-meta.dim', `gesichert ${formatAgo(rec.at)}`) : null),
      h('div.acc-row-actions', actions));
    const rows = [
      row('Automatisch', d.auto, d.auto ? [load('auto')] : []),
      ...Array.from({ length: SLOT_COUNT }, (_, i) => {
        const rec = d.slots[i];
        const store = rec
          ? confirmButton('Über\u00ADschreiben', 'Wirklich über\u00ADschreiben?', () => { storeSlot(g.save, accId, chrId, i); this.#render(); }, 'ef-btn.acc-small')
          : h('button.ef-btn.acc-small', { type: 'button', onclick: () => { storeSlot(g.save, accId, chrId, i); this.#render(); } }, 'Hier sichern');
        return row(`Platz ${i + 1}`, rec, [store, rec ? load(i) : null, rec ? confirmButton('Leeren', 'Wirklich leeren?', () => { clearSlot(g.save, accId, chrId, i); this.#render(); }, 'ef-btn.danger.acc-small') : null].filter(Boolean));
      }),
    ];
    return h('div.acc-slots', { onclick: (e) => e.stopPropagation() },
      h('p.acc-slot-hint', 'Sichert den zuletzt gespeicherten Stand dieses Charakters auf diesem Gerät. Vor jedem Spielstart wird der vorherige Stand automatisch gesichert.'),
      rows);
  }
}
