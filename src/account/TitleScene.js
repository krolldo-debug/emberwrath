import { h } from '../core/dom.js';
import { sharedBackdrop } from './Backdrop.js';
import { savedLook, backButton, websiteUrl } from './ui.js';
import { getHeroSprites } from '../sprites/hero.js';
import { snapInfo, storeSlot } from './backups.js';
import { langSwitch } from '../i18n/index.js';

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
// ohne Anmeldung: Anmelden · Konto erstellen; angemeldet mit Helden: Weiterspielen (letzter Held) · Heldenauswahl · Konto,
// ohne Helden: Spielen (→ Erschaffung) · Konto.
export class TitleScene extends MenuScene {
  enter() {
    const g = this.game;
    const o = g.online;
    const signedIn = !!o?.user;
    const accId = signedIn ? o.accountId : null;
    // Helden dieses Kontos. Der zuletzt gespielte steht vorn: „last“ gilt nur für dieses Konto, sonst der jüngste Spielstand
    // (frisches Gerät, Cloud-Abgleich, zuletzt mit einem anderen Konto gespielt).
    const chars = signedIn ? g.save.listCharacters(accId) : [];
    const lastRaw = g.save.getLast();
    const lastChar = chars.find((c) => lastRaw?.accountId === accId && c.id === lastRaw.characterId) ?? chars[0] ?? null;
    if (lastChar) {
      const look = savedLook(g.save, g.content, accId, lastChar.id);
      this.backdrop.figure = { anims: getHeroSprites(lastChar.raceId ?? 'human', lastChar.classId ?? 'warrior', look.variant, look.gear, look.style), x: 480 * 0.74 };
    }

    // Einmalige Meldung nach der Anmeldung (z. B. „E-Mail bestätigt“), sonst zeigt sie die Anmeldeseite
    const note = signedIn && o.notice?.kind === 'ok' ? o.notice : null;
    if (note) o.notice = null;
    let menu;
    // Zone des zuletzt gespielten Helden (sonst die Startzone) schon im Hintergrund vorbereiten (world/warmup.js)
    const lastSnap = lastChar ? g.save.loadCharacter(accId, lastChar.id) : null;
    g.warmup?.character(lastSnap);
    if (signedIn) {
      const info = lastChar ? snapInfo(lastSnap, g.content) : null;
      // Mit Helden: direkt weiter mit dem letzten, daneben die Auswahl aller Helden. „Ersten Helden“ erst, wenn der Abgleich sicher leer ist.
      const empty = o.syncStatus === 'ok' ? 'Deinen ersten Helden erschaffen' : null;
      menu = [
        lastChar
          ? h('button.ef-btn.primary.acc-big.acc-play', { type: 'button', onclick: () => this.#continue(lastChar.id) },
            h('span.acc-btn-title', 'Weiterspielen'),
            h('span.acc-btn-sub', h('span', { translate: 'no' }, lastChar.name), ` · Stufe ${info?.level ?? lastChar.level ?? 1}`))
          : h('button.ef-btn.primary.acc-big.acc-play', { type: 'button', onclick: () => o.play() },
            h('span.acc-btn-title', 'Spielen'),
            empty ? h('span.acc-btn-sub', empty) : null),
        lastChar
          ? h('button.ef-btn.acc-big.acc-heroes', { type: 'button', onclick: () => o.play() },
            h('span.acc-btn-title', 'Heldenauswahl'),
            h('span.acc-btn-sub', chars.length > 1 ? `${chars.length} Helden · neuen erschaffen` : 'Neuen Helden erschaffen'))
          : null,
        h('button.acc-textlink', { type: 'button', onclick: () => o.open('account') }, `Konto · ${o.displayName}`),
        note ? h('p.on-msg.ok.acc-title-note', { role: 'status' }, note.text) : null,
      ];
    } else {
      menu = [
        h('button.ef-btn.primary.acc-big.acc-play', { type: 'button', onclick: () => (o ? o.open('login') : null) },
          h('span.acc-btn-title', 'Anmelden')),
        h('button.ef-btn.acc-big', { type: 'button', onclick: () => (o ? o.open('register') : null) },
          h('span.acc-btn-title', 'Konto erstellen'),
          h('span.acc-btn-sub', 'Kostenlos · deine Helden in der Cloud')),
      ];
    }

    // Unterste Ebene: Der Zurück-Pfeil führt auf die Website. Bewusst nicht auf Esc gelegt (kein versehentliches Verlassen).
    this.root = h('div.ef-screen.acc-screen.acc-title',
      h('div.acc-title-back', backButton(() => location.assign(websiteUrl()), 'Zurück zur Website')),
      h('div.acc-title-inner',
        h('div.acc-logo',
          h('h1.ef-title', 'EMBERWRATH'),
          h('p.acc-tagline', 'Die Glut erlischt nie')),
        h('div.acc-menu', menu),
        langSwitch()),
      h('p.acc-footer.acc-footer-corner', 'Version ', h('span.acc-version', { title: `Stand ${globalThis.EMBERWRATH_BUILD?.commit ?? 'dev'}` }, globalThis.EMBERWRATH_BUILD?.version ?? 'dev')));
    this.#keyPlay = signedIn;
    // Titel neu aufbauen, wenn die Anmeldung sich ändert (z. B. Sitzung wird beim Start wiederhergestellt)
    // … und wenn der Cloud-Abgleich Helden gebracht hat oder feststeht, dass es keine gibt
    const heroesKey = () => { const n = g.save.listCharacters(accId).length; return n ? `${n}` : `0:${o.syncStatus === 'ok'}`; };
    const shown = signedIn ? heroesKey() : '';
    this.#off = g.bus.on('online:changed', (e) => {
      if (g.scenes.currentId !== 'title' || g.scenes.pending) return;
      if (!!e?.user !== signedIn || (signedIn && heroesKey() !== shown)) g.scenes.go('title');
    });
  }

  // Direkt mit dem zuletzt gespielten Helden weiter (vorher wie in der Charakterauswahl den Stand automatisch sichern)
  #continue(characterId) {
    const g = this.game, o = g.online, accId = o.accountId;
    if (!o.user || o.needsConsent()) { o.play(); return; }
    storeSlot(g.save, accId, characterId, 'auto');
    if (!g.loadGame(accId, characterId)) o.play();
  }

  #keyPlay = false;
  #off = null;

  exit() { super.exit(); this.#off?.(); }

  update(dt) {
    super.update(dt);
    // Angriff/Interagieren öffnet die Charakterauswahl (Controller-/Tastaturkomfort)
    if (this.#keyPlay && this.game.input.pressed('interact')) this.game.online.play();
  }
}
