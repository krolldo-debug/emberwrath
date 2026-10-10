import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { MenuScene } from '../account/TitleScene.js';
import { savedLook, backButton, confirmButton } from '../account/ui.js';
import { getHeroSprites } from '../sprites/hero.js';
import { snapInfo } from '../account/backups.js';
import { langSwitch, lang } from '../i18n/index.js';
import { AuthError, describeError } from '../online/AuthClient.js';
import { siteUrl } from '../platform.js';
import { CrazySdk } from './sdk.js';
import { CrazySession } from './session.js';

// CrazyGames-Fassung (docs/CRAZYGAMES.md). Nur aktiv, wenn src/platform.js IS_CRAZYGAMES meldet (src/main.js).
// - Kein Anmeldeformular: „Spielen“ startet sofort, als Gast oder mit dem CrazyGames-Konto (session.js).
// - Hinweis auf Nutzungsbedingungen und Datenschutz direkt unter „Spielen“ (CrazyGames empfiehlt einen schlichten
//   Hinweis statt eines Fensters); der Klick auf „Spielen“ gilt als Zustimmung, wie dort gesagt.
// - Konto-Seite: Gast oder CrazyGames-Name, Anmelden bei CrazyGames, Konto löschen.
// - SDK: gameplayStart/gameplayStop beim Betreten und Verlassen der Spielwelt.
// Ersetzt die Szenen 'title' und 'login' (alle Wege zu Anmelden/Konto landen hier) sowie online.play/open/boot.

// Rechtstexte der Website in der Sprache des Spiels (volle Adressen, das Spiel läuft auf einer fremden Seite).
const LEGAL_PATHS = { terms: { de: '/nutzungsbedingungen', en: '/en/terms' }, privacy: { de: '/datenschutz', en: '/en/privacy' } };
const legalUrl = (kind) => siteUrl(LEGAL_PATHS[kind][lang() === 'en' ? 'en' : 'de']);
const legalLink = (kind, text) => h('a.on-legal-link', {
  href: legalUrl(kind), target: '_blank', rel: 'noopener',
  onclick: (e) => { e.currentTarget.href = legalUrl(kind); }, // Sprache kann seit dem Zeichnen gewechselt haben
}, text);
const legalLinks = () => h('p.on-legal-links.cg-legal-links', legalLink('terms', 'Nutzungsbedingungen'), legalLink('privacy', 'Datenschutzerklärung'));

function errorText(e) {
  if (e instanceof AuthError) return describeError(e);
  if (e?.code === 'network') return 'Keine Verbindung zum Server. Prüfe deine Internetverbindung.';
  if (e?.code === 'rate_limited') return 'Zu viele Versuche. Bitte warte einen Moment.';
  return 'Der Server ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.';
}

class CgTitleScene extends MenuScene {
  constructor(game, cg) { super(game); this.cg = cg; }

  enter() {
    const g = this.game, o = g.online;
    const accId = o.user ? o.accountId : null;
    const lastRaw = g.save.getLast();
    const last = accId && lastRaw?.accountId === accId ? lastRaw : null;
    const lastChar = last ? g.save.listCharacters(accId).find((c) => c.id === last.characterId) : null;
    if (lastChar) {
      const look = savedLook(g.save, g.content, accId, lastChar.id);
      this.backdrop.figure = { anims: getHeroSprites(lastChar.raceId ?? 'human', lastChar.classId ?? 'warrior', look.variant, look.gear, look.style), x: 480 * 0.74 };
    }
    const info = lastChar ? snapInfo(g.save.loadCharacter(accId, lastChar.id), g.content) : null;
    this.msg = h('p.on-msg.cg-msg', { role: 'status' });
    this.playBtn = h('button.ef-btn.primary.acc-big.acc-play', { type: 'button', onclick: () => this.#play() },
      h('span.acc-btn-title', 'Spielen'),
      h('span.acc-btn-sub', lastChar ? `${lastChar.name} · Stufe ${info?.level ?? lastChar.level ?? 1}` : 'Deinen ersten Helden erschaffen'));

    this.root = h('div.ef-screen.acc-screen.acc-title.cg-title',
      h('div.acc-title-inner',
        h('div.acc-logo',
          h('h1.ef-title', 'EMBERWRATH'),
          h('p.acc-tagline', 'Die Glut erlischt nie')),
        h('div.acc-menu',
          this.playBtn,
          o.user ? h('button.acc-textlink', { type: 'button', onclick: () => g.scenes.go('login') }, 'Konto') : null),
        this.msg,
        langSwitch(),
        h('div.cg-legal',
          h('p.cg-legal-text', 'Mit „Spielen“ stimmst du den Nutzungsbedingungen und der Datenschutzerklärung zu.'),
          legalLinks())),
      h('p.acc-footer.acc-footer-corner', 'Version ', h('span.acc-version', { title: `Stand ${globalThis.EMBERWRATH_BUILD?.commit ?? 'dev'}` }, globalThis.EMBERWRATH_BUILD?.version ?? 'dev')));
    this.#off = g.bus.on(EV.ONLINE_CHANGED, (e) => {
      if (!this.#busy && !!e?.user !== !!accId && g.scenes.currentId === 'title' && !g.scenes.pending) g.scenes.go('title');
    });
  }

  #off = null;
  #busy = false;

  exit() { super.exit(); this.#off?.(); }

  update(dt) {
    super.update(dt);
    if (this.game.input.pressed('interact')) this.#play();
  }

  async #play() {
    if (this.#busy) return;
    this.#busy = true;
    this.playBtn.disabled = true;
    this.root.classList.add('busy');
    this.msg.className = 'on-msg cg-msg'; this.msg.textContent = '';
    try {
      await this.cg.session.ensure();
      await this.cg.session.consent();
      this.cg.play();
    } catch (e) {
      this.msg.className = 'on-msg cg-msg error';
      this.msg.textContent = errorText(e);
    } finally {
      this.#busy = false;
      if (this.playBtn.isConnected) this.playBtn.disabled = false;
      this.root.classList.remove('busy');
    }
  }
}

// Konto-Seite der CrazyGames-Fassung (Szene 'login'; Anmelden/Registrieren gibt es hier nicht).
class CgAccountScene extends MenuScene {
  constructor(game, cg) { super(game); this.cg = cg; }

  enter() {
    this.root = h('div.ef-screen.acc-screen.on-screen');
    if (!this.game.online.user) { this.game.scenes.go('title'); return; }
    this.message = null;
    this.#off = this.game.bus.on(EV.ONLINE_CHANGED, () => this.#render());
    this.#render();
    this.cg.sdk.accountAvailable().then((ok) => { this.canLogin = ok; this.#render(); });
  }

  #off = null;
  canLogin = false;

  exit() { super.exit(); this.#off?.(); }
  back() { this.game.scenes.go('title'); }

  async #run(btn, fn) {
    btn.disabled = true;
    try { await fn(); } catch (e) { this.message = { kind: 'error', text: errorText(e) }; }
    if (this.game.scenes.currentId === 'login') this.#render();
  }

  #render() {
    const g = this.game, o = g.online, s = this.cg.session;
    if (!o.user) return;
    const guest = s.isGuest;
    const name = guest ? 'Gast' : o.displayName;
    const login = guest && this.canLogin ? h('button.ef-btn.primary', { type: 'button', onclick: (e) => this.#run(e.currentTarget, async () => {
      if (await this.cg.sdk.login()) await s.switchAfterLogin();
    }) }, 'Bei CrazyGames anmelden') : null;
    const remove = confirmButton('Konto löschen', 'Wirklich alles löschen?', () => this.#run(remove, async () => {
      await s.reauth();
      await o.deleteAccount();
      if (guest) s.forgetGuest();
      g.scenes.go('title');
    }));
    this.root.replaceChildren(h('div.ef-panel.acc-panel.on-panel',
      h('header.acc-head', backButton(() => this.back()), h('div', h('h2.ef-sub', 'Dein Konto'))),
      h('div.on-body',
        h('div.on-who',
          h('span.acc-avatar', { 'aria-hidden': 'true' }, name.slice(0, 1).toUpperCase()),
          h('strong', guest ? {} : { translate: 'no' }, name)),
        guest ? h('p.acc-meta', 'Dein Fortschritt ist mit diesem Browser verknüpft. Mit einem CrazyGames-Konto spielst du auf jedem Gerät weiter.') : null,
        this.message ? h(`p.on-msg.${this.message.kind}`, { role: 'alert' }, this.message.text) : null,
        h('div.acc-actions', login),
        h('details.on-more',
          h('summary', 'Kontoeinstellungen'),
          h('div.on-more-body', remove)),
        legalLinks())));
  }
}

export function installCrazyGames(game) {
  const sdk = new CrazySdk();
  const session = new CrazySession(game, sdk);
  const online = game.online;
  const cg = { sdk, session };
  game.crazygames = cg;

  // Mit dem angemeldeten Konto weiter: neue Spieler direkt zur Heldenerschaffung.
  cg.play = () => {
    online.sync.ensureLocalAccount(online.user);
    game.login(online.accountId);
    if (!game.save.listCharacters(online.accountId).length) game.scenes.go('characterCreate', { from: 'characters' });
    else game.scenes.go('characters', { from: 'login' });
  };
  // Alle Wege zu Anmeldung, Zustimmung und Konto führen zum Titel bzw. zur Konto-Seite dieser Fassung.
  online.open = (mode) => game.scenes.go(online.user && mode === 'account' ? 'login' : 'title');
  online.play = () => { if (online.user && !online.needsConsent()) cg.play(); else game.scenes.go('title'); };
  // Start: gespeicherte Anmeldung fortsetzen, wenn sie zum CrazyGames-Zustand passt (keine Rückleitungen, keine Anker).
  online.boot = async () => {
    await session.reconcile().catch(() => {});
    if (online.user) online.afterSignIn();
  };

  game.scenes.register('title', (g) => new CgTitleScene(g, cg));
  game.scenes.register('login', (g) => new CgAccountScene(g, cg));
  game.scenes.register('admin', (g) => new CgTitleScene(g, cg));

  // Spielbeginn/-ende an CrazyGames melden (Pflicht, sobald das SDK eingebunden ist).
  game.bus.on(EV.SCENE_CHANGE, ({ from, to }) => {
    if (to === 'play' && from !== 'play') sdk.gameplay(true);
    else if (from === 'play' && to !== 'play') sdk.gameplay(false);
  });
  // Anmeldung bei CrazyGames (Knopf auf der Seite von CrazyGames oder im Konto): Konto passend wechseln.
  sdk.onLogin(() => { session.switchAfterLogin().catch(() => {}); });
}
