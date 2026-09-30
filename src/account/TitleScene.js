import { h } from '../core/dom.js';
import { sharedBackdrop } from './Backdrop.js';
import { localNotice, characterLine, zoneName, formatAgo, savedLook } from './ui.js';
import { getHeroSprites } from '../sprites/hero.js';
import { snapInfo, formatPlayTime, storeSlot } from './backups.js';

// Basis der Menü-Bildschirme: animierter Hintergrund + DOM-Oberfläche.
// Unterklassen setzen this.root in enter() und können back() überschreiben
// (Esc / Zurück).
export class MenuScene {
  constructor(game) { this.game = game; this.backdrop = sharedBackdrop(); }
  update(dt) {
    this.backdrop.update(dt);
    if (this.game.input.pressed('pause')) this.back?.();
  }
  render(ctx) { this.backdrop.render(ctx); }
  exit() { this.backdrop.figure = null; }
}

// Titelbildschirm. Gespielt wird nur mit Online-Konto (src/online, docs/ONLINE.md):
// ohne Anmeldung: Anmelden · Konto erstellen; angemeldet: Fortsetzen · Spielen · Konto.
export class TitleScene extends MenuScene {
  enter() {
    const g = this.game;
    const o = g.online;
    const signedIn = !!o?.user;
    const accId = signedIn ? o.accountId : null;
    const lastRaw = g.save.getLast();
    const last = signedIn && lastRaw?.accountId === accId ? lastRaw : null;
    const lastChar = last ? g.save.listCharacters(last.accountId).find((c) => c.id === last.characterId) : null;
    if (lastChar) {
      const look = savedLook(g.save, g.content, last.accountId, lastChar.id);
      this.backdrop.figure = { anims: getHeroSprites(lastChar.raceId ?? 'human', lastChar.classId ?? 'warrior', look.variant, look.gear, look.style), x: 480 * 0.74 };
    }

    let menu;
    if (signedIn) {
      const info = lastChar ? snapInfo(g.save.loadCharacter(last.accountId, lastChar.id), g.content) : null;
      const count = g.save.listCharacters(accId).length;
      const cont = lastChar ? h('button.ef-btn.primary.acc-big', { type: 'button', onclick: () => this.#continue() },
        h('span.acc-btn-title', 'Fortsetzen'),
        h('span.acc-btn-sub', `${lastChar.name}${info?.title ? ` „${info.title}“` : ''} · ${characterLine(g.content, { ...lastChar, level: info?.level ?? lastChar.level })}`),
        h('span.acc-btn-meta', [zoneName(g.content, lastChar.zoneId), `Spielzeit ${formatPlayTime(info.playTime)}`, `gespeichert ${formatAgo(lastChar.savedAt)}`].filter(Boolean).join(' · '))) : null;
      menu = [
        cont,
        h(`button.ef-btn.acc-big${cont ? '' : '.primary'}`, { type: 'button', onclick: () => o.play() },
          h('span.acc-btn-title', 'Spielen'),
          h('span.acc-btn-sub', count ? 'Charakter wählen oder neu erschaffen' : 'Deinen ersten Charakter erschaffen')),
        h('button.ef-btn.acc-online', { type: 'button', onclick: () => o.open('account') }, `Konto (${o.displayName})`),
      ];
    } else {
      menu = [
        h('button.ef-btn.primary.acc-big', { type: 'button', onclick: () => (o ? o.open('login') : null) },
          h('span.acc-btn-title', 'Anmelden'),
          h('span.acc-btn-sub', 'Mit deinem Emberwrath-Konto weiterspielen')),
        h('button.ef-btn.acc-big', { type: 'button', onclick: () => (o ? o.open('register') : null) },
          h('span.acc-btn-title', 'Konto erstellen'),
          h('span.acc-btn-sub', 'Kostenlos · Charaktere auf jedem Gerät')),
      ];
    }

    this.root = h('div.ef-screen.acc-screen.acc-title',
      h('div.acc-title-inner',
        h('div.acc-logo',
          h('h1.ef-title', 'EMBERWRATH'),
          h('p.acc-tagline', 'Ein kleiner Ausschnitt einer großen Welt')),
        h('div.acc-menu', menu),
        localNotice(g),
        h('p.acc-footer', 'Prototyp · Einzelspieler · Version ', h('span.acc-version', globalThis.EMBERWRATH_BUILD?.commit ?? 'dev'))));
    this.#keyContinue = !!lastChar;
    // Titel neu aufbauen, wenn die Anmeldung sich ändert (z. B. Sitzung wird beim Start wiederhergestellt)
    this.#off = g.bus.on('online:changed', (e) => { if (!!e?.user !== signedIn && g.scenes.currentId === 'title' && !g.scenes.pending) g.scenes.go('title'); });
  }

  #keyContinue = false;
  #off = null;

  exit() { super.exit(); this.#off?.(); }

  update(dt) {
    super.update(dt);
    // Angriff/Interagieren startet "Fortsetzen" (Controller-/Tastaturkomfort)
    if (this.#keyContinue && this.game.input.pressed('interact')) this.#continue();
  }

  #continue() {
    const g = this.game;
    const last = g.save.getLast();
    if (!last || last.accountId !== g.online?.accountId) { g.scenes.go('title'); return; }
    storeSlot(g.save, last.accountId, last.characterId, 'auto');
    if (!g.continueLast()) g.scenes.go('title');
  }
}
