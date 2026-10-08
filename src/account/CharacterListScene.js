import { h } from '../core/dom.js';
import { MenuScene } from './TitleScene.js';
import { HeroPortrait, characterLine, zoneName, formatAgo, confirmButton, savedLook, requireOnlineAccount, backButton } from './ui.js';
import { listSlots, storeSlot, restoreSlot, clearSlot, dropSlots, snapInfo, formatPlayTime, SLOT_COUNT } from './backups.js';

export const MAX_CHARACTERS = 8;

// Charakterauswahl des angemeldeten Kontos (wie in MMOs): links die Helden des Kontos,
// in der Mitte der gewählte Held groß auf dem Podest, darunter Name und „Spielen“.
// Speicherplätze je Charakter (backups.js) öffnen sich als Seitenleiste.
// Styles: src/online/online.css (Abschnitt „Charakterauswahl“, Klassen lb-*).
export class CharacterListScene extends MenuScene {
  enter() {
    this.portrait = null;
    this.slotsOpen = false;
    this.root = h('div.ef-screen.lb-screen');
    if (!requireOnlineAccount(this.game)) return;
    const g = this.game, last = g.save.getLast();
    this.sel = last?.accountId === g.account.id ? last.characterId : null;
    this.#render();
  }

  back() {
    if (this.slotsOpen) { this.slotsOpen = false; this.#render(); return; }
    this.game.scenes.go('title');
  }

  update(dt) {
    super.update(dt);
    this.portrait?.update(dt);
    const cur = this.game.account && this.#selected();
    if (cur && !this.slotsOpen && this.game.input.pressed('interact')) this.#play(cur);
  }

  #chars() { return this.game.save.listCharacters(this.game.account.id); }
  #selected() { return this.#chars().find((c) => c.id === this.sel) ?? null; }

  // Vor jedem Start den bisherigen Stand als automatischen Speicherplatz sichern
  #play(c) {
    const g = this.game, acc = g.account;
    storeSlot(g.save, acc.id, c.id, 'auto');
    if (!g.loadGame(acc.id, c.id)) this.#render();
  }

  #select(id) {
    if (id === this.sel) return;
    this.sel = id; this.slotsOpen = false; this.#render();
  }

  #render() {
    const g = this.game, acc = g.account, o = g.online;
    const chars = this.#chars();
    if (!chars.some((c) => c.id === this.sel)) this.sel = chars[0]?.id ?? null;
    const cur = this.#selected();
    const full = chars.length >= MAX_CHARACTERS;
    const create = () => g.scenes.go('characterCreate', { from: 'characters' });
    const name = o?.displayName ?? acc.name;

    const top = h('header.lb-top',
      backButton(() => this.back()),
      h('h1.lb-heading', 'Charakterauswahl'),
      h('button.ef-btn.lb-account', { type: 'button', onclick: () => o?.open('account'), title: 'Konto und Einstellungen' },
        h('span.acc-avatar', { 'aria-hidden': 'true' }, name.slice(0, 1).toUpperCase()),
        h('span.lb-account-name', name)));

    const roster = h('nav.lb-roster', { 'aria-label': 'Deine Helden' },
      h('p.lb-roster-head', 'Deine Helden ', h('span', `${chars.length}/${MAX_CHARACTERS}`)),
      h('div.lb-roster-list',
        chars.map((c) => h(`button.lb-slot${c.id === this.sel ? '.on' : ''}`, {
          type: 'button', 'aria-pressed': c.id === this.sel ? 'true' : 'false',
          onclick: () => this.#select(c.id), ondblclick: () => this.#play(c),
        },
        h('strong', c.name),
        h('span', `Stufe ${c.level ?? 1} · ${g.content.find('class', c.classId)?.name ?? ''}`))),
        full ? null : h('button.lb-slot.lb-new', { type: 'button', onclick: create }, h('strong', '+ Neuer Held'), h('span', 'Charakter erschaffen'))));

    let stage, info;
    if (cur) {
      const i = snapInfo(g.save.loadCharacter(acc.id, cur.id), g.content);
      this.portrait = new HeroPortrait({ raceId: cur.raceId ?? 'human', classId: cur.classId ?? 'warrior', ...savedLook(g.save, g.content, acc.id, cur.id), mode: 'showcase', scale: 6, backdrop: false });
      stage = h('div.lb-stage', h('div.lb-hero', this.portrait.canvas));
      info = h('section.lb-info',
        h('h2.lb-name', cur.name),
        i.title ? h('p.lb-title', `„${i.title}“`) : null,
        h('p.lb-line', characterLine(g.content, { ...cur, level: i.level })),
        h('p.lb-meta', [zoneName(g.content, i.zoneId), `${formatPlayTime(i.playTime)} gespielt`].filter(Boolean).join(' · ')),
        h('button.ef-btn.primary.lb-play', { type: 'button', onclick: () => this.#play(cur) }, 'Spielen'),
        h('div.lb-links',
          h('button.lb-link', { type: 'button', 'aria-expanded': this.slotsOpen ? 'true' : 'false', onclick: () => { this.slotsOpen = !this.slotsOpen; this.#render(); } }, 'Speicherplätze'),
          confirmButton('Löschen', `${cur.name} wirklich löschen?`, () => {
            g.save.deleteCharacter(acc.id, cur.id); dropSlots(g.save, acc.id, cur.id);
            this.sel = null; this.slotsOpen = false; this.#render();
          }, 'lb-link.danger')));
    } else {
      this.portrait = null;
      stage = h('div.lb-stage.empty');
      info = h('section.lb-info',
        h('h2.lb-name', 'Dein erster Held'),
        h('p.lb-line', 'Wähle Volk und Klasse und betritt die Welt von Emberwrath.'),
        h('button.ef-btn.primary.lb-play', { type: 'button', onclick: create }, 'Charakter erschaffen'));
    }

    const drawer = cur && this.slotsOpen
      ? h('aside.lb-drawer.ef-panel',
        h('header.lb-drawer-head',
          h('h3.ef-sub', `Speicherplätze · ${cur.name}`),
          h('button.acc-back', { type: 'button', onclick: () => { this.slotsOpen = false; this.#render(); }, 'aria-label': 'Schließen' }, '×')),
        this.#slots(acc.id, cur.id))
      : null;

    this.root.replaceChildren(...[top, roster, stage, info, drawer].filter(Boolean));
  }

  // Speicherplätze eines Charakters
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
          ? confirmButton('Über­schreiben', 'Wirklich über­schreiben?', () => { storeSlot(g.save, accId, chrId, i); this.#render(); }, 'ef-btn.acc-small')
          : h('button.ef-btn.acc-small', { type: 'button', onclick: () => { storeSlot(g.save, accId, chrId, i); this.#render(); } }, 'Hier sichern');
        return row(`Platz ${i + 1}`, rec, [store, rec ? load(i) : null, rec ? confirmButton('Leeren', 'Wirklich leeren?', () => { clearSlot(g.save, accId, chrId, i); this.#render(); }, 'ef-btn.danger.acc-small') : null].filter(Boolean));
      }),
    ];
    return h('div.acc-slots',
      h('p.acc-slot-hint', 'Vor jedem Spielstart wird der vorherige Stand automatisch gesichert.'),
      rows);
  }
}
