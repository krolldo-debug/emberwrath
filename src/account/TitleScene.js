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

// Titelbildschirm: Fortsetzen, Neues Spiel, Spielstände verwalten.
export class TitleScene extends MenuScene {
  enter() {
    const g = this.game;
    const last = g.save.getLast();
    const lastChar = last ? g.save.listCharacters(last.accountId).find((c) => c.id === last.characterId) : null;
    const lastAcc = last ? g.save.getAccount(last.accountId) : null;
    if (lastChar) {
      const look = savedLook(g.save, g.content, last.accountId, lastChar.id);
      this.backdrop.figure = { anims: getHeroSprites(lastChar.raceId ?? 'human', lastChar.classId ?? 'warrior', look.variant, look.gear, look.style), x: 480 * 0.74 };
    }

    const info = lastChar ? snapInfo(g.save.loadCharacter(last.accountId, lastChar.id), g.content) : null;
    const cont = h('button.ef-btn.primary.acc-big', { type: 'button', disabled: !lastChar, onclick: () => this.#continue() },
      h('span.acc-btn-title', 'Fortsetzen'),
      lastChar
        ? h('span.acc-btn-sub', `${lastChar.name}${info?.title ? ` „${info.title}“` : ''} · ${characterLine(g.content, { ...lastChar, level: info?.level ?? lastChar.level })}`)
        : h('span.acc-btn-sub', 'Noch kein Spielstand auf diesem Gerät'));
    if (lastChar) {
      const where = zoneName(g.content, lastChar.zoneId);
      cont.append(h('span.acc-btn-meta', [where, `Spielzeit ${formatPlayTime(info.playTime)}`, `gespeichert ${formatAgo(lastChar.savedAt)}`, lastAcc ? `Account „${lastAcc.name}“` : null].filter(Boolean).join(' · ')));
    }

    this.root = h('div.ef-screen.acc-screen.acc-title',
      h('div.acc-title-inner',
        h('div.acc-logo',
          h('h1.ef-title', 'EMBERWRATH'),
          h('p.acc-tagline', 'Ein kleiner Ausschnitt einer großen Welt')),
        h('div.acc-menu',
          cont,
          h('button.ef-btn.acc-big', { type: 'button', onclick: () => this.#newGame() },
            h('span.acc-btn-title', 'Neues Spiel'),
            h('span.acc-btn-sub', 'Demo-Account wählen und Charakter erschaffen')),
          h('button.ef-btn', { type: 'button', onclick: () => g.scenes.go('account', { next: 'characters' }) }, 'Accounts & Charaktere'),
          // Online-Konto (src/online, docs/ONLINE.md): nur wenn eingerichtet
          g.online ? h('button.ef-btn.acc-online', { type: 'button', onclick: () => g.online.open(g.online.user ? 'account' : 'login') },
            g.online.user ? `Konto (${g.online.displayName ?? 'angemeldet'})` : 'Anmelden') : null),
        localNotice(g),
        h('p.acc-footer', 'Prototyp · Einzelspieler · Lokale Instanz')));
    if (lastChar) this.#keyContinue = true;
  }

  #keyContinue = false;

  update(dt) {
    super.update(dt);
    // Angriff/Interagieren startet "Fortsetzen" (Controller-/Tastaturkomfort)
    if (this.#keyContinue && this.game.input.pressed('interact')) this.#continue();
  }

  #continue() {
    const last = this.game.save.getLast();
    if (last) storeSlot(this.game.save, last.accountId, last.characterId, 'auto');
    if (!this.game.continueLast()) this.game.scenes.go('title');
  }

  #newGame() {
    const g = this.game;
    g.scenes.go('account', { next: 'create' });
  }
}
