import { h } from '../core/dom.js';
import { MenuScene } from '../account/TitleScene.js';
import { focusIfDesktop, formatAgo, characterLine } from '../account/ui.js';
import { describeError } from './AuthClient.js';

// Anmeldeseite (Szene 'login'). params.mode:
//   'login'        E-Mail + Passwort, Google, Apple
//   'register'     Konto anlegen
//   'forgot'       Link zum Zurücksetzen anfordern
//   'newPassword'  neues Passwort setzen (nach Link aus der E-Mail oder im Konto)
//   'account'      angemeldet: Spielen, Verwaltung, lokale Charaktere übernehmen, Abmelden, Konto löschen
const GOOGLE_SVG = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
const APPLE_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M16.37 12.62c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-2.99-.79-1.54.02-2.96.9-3.75 2.27-1.6 2.78-.41 6.89 1.15 9.14.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.78.74 2.99.72 1.24-.02 2.02-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.66zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.58.67-1.1 1.76-.96 2.79 1.02.08 2.06-.52 2.69-1.27z"/></svg>';
const svgIcon = (markup) => { const s = h('span.on-provider-icon'); s.innerHTML = markup; return s; };

const TITLES = {
  login: ['Anmelden', 'Mit deinem Emberwrath-Konto spielen'],
  register: ['Konto erstellen', 'Deine Charaktere sicher in der Cloud, auf jedem Gerät'],
  forgot: ['Passwort vergessen', 'Wir schicken dir einen Link zum Zurücksetzen'],
  newPassword: ['Neues Passwort', 'Wähle ein neues Passwort für dein Konto'],
  account: ['Dein Konto', ''],
};

const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const passwordProblem = (pw) => (pw.length < 8 ? 'Das Passwort braucht mindestens 8 Zeichen.'
  : !/[A-Za-zÄÖÜäöüß]/.test(pw) || !/\d/.test(pw) ? 'Nimm Buchstaben und mindestens eine Zahl.' : null);

export class LoginScene extends MenuScene {
  enter(params = {}) {
    this.online = this.game.online;
    this.mode = params.mode ?? (this.online.user ? 'account' : 'login');
    if (this.mode === 'account' && !this.online.user) this.mode = 'login';
    this.message = this.online.notice; this.online.notice = null;
    this.busy = false;
    this.root = h('div.ef-screen.acc-screen.on-screen');
    this.off = this.game.bus.on('online:changed', () => { if (this.mode === 'account') this.#render(); });
    this.#render();
  }

  exit() { super.exit(); this.off?.(); }

  back() {
    if (this.mode === 'forgot' || this.mode === 'register') { this.#go('login'); return; }
    if (this.mode === 'newPassword' && this.online.user) { this.#go('account'); return; }
    this.game.scenes.go('title');
  }

  #go(mode, message = null) { this.mode = mode; this.message = message; this.#render(); }

  // Führt eine Aktion mit gesperrten Knöpfen aus und zeigt Fehler verständlich an.
  async #run(fn) {
    if (this.busy) return;
    this.busy = true; this.root.classList.add('busy');
    this.root.querySelectorAll('button, input').forEach((el) => { el.dataset.wasDisabled = el.disabled ? '1' : ''; el.disabled = true; });
    try { await fn(); } catch (e) { this.message = { kind: 'error', text: describeError(e) }; this.#render(); }
    finally {
      this.busy = false; this.root.classList.remove('busy');
      this.root.querySelectorAll('button, input').forEach((el) => { if (el.dataset.wasDisabled !== '1') el.disabled = false; });
    }
  }

  #field(label, attrs) {
    const input = h('input.ef-input', attrs);
    return { input, el: h('label.on-field', h('span.acc-label', label), input) };
  }

  #password(label, autocomplete) {
    const f = this.#field(label, { type: 'password', autocomplete, required: true, minlength: 8, maxlength: 72 });
    const toggle = h('button.on-eye', { type: 'button', 'aria-label': 'Passwort anzeigen', onclick: () => {
      const show = f.input.type === 'password';
      f.input.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Verbergen' : 'Zeigen';
      toggle.setAttribute('aria-label', show ? 'Passwort verbergen' : 'Passwort anzeigen');
    } }, 'Zeigen');
    f.el.append(h('span.on-eye-wrap', toggle));
    f.el.classList.add('on-field-pw');
    return f;
  }

  #providers() {
    const p = this.online.providers;
    const btn = (id, label, icon, enabled, hint) => h(`button.ef-btn.on-provider.on-${id}`, {
      type: 'button', disabled: !enabled, title: enabled ? label : hint,
      onclick: () => this.#run(() => this.online.client.signInWithProvider(id)),
    }, svgIcon(icon), h('span', label), enabled ? null : h('span.on-soon', 'bald'));
    return h('div.on-providers',
      btn('google', 'Weiter mit Google', GOOGLE_SVG, !!p.google, 'Google-Anmeldung ist noch nicht freigeschaltet'),
      btn('apple', 'Weiter mit Apple', APPLE_SVG, !!p.apple, 'Apple-Anmeldung folgt, sobald das Apple-Entwicklerkonto eingerichtet ist'));
  }

  #messageBox() {
    const m = this.message;
    return h(`p.on-msg${m ? `.${m.kind}` : ''}`, { role: m?.kind === 'error' ? 'alert' : 'status' }, m?.text ?? '');
  }

  #render() {
    const [title, sub] = TITLES[this.mode] ?? TITLES.login;
    const head = h('header.acc-head',
      h('button.acc-back', { type: 'button', onclick: () => this.back(), 'aria-label': 'Zurück' }, '‹'),
      h('div', h('h2.ef-sub', title), sub ? h('p.acc-step', sub) : null));
    let body;
    if (!this.online.configured) body = this.#notConfigured();
    else if (this.mode === 'register') body = this.#register();
    else if (this.mode === 'forgot') body = this.#forgot();
    else if (this.mode === 'newPassword') body = this.#newPassword();
    else if (this.mode === 'account' && this.online.user) body = this.#account();
    else body = this.#login();
    this.root.replaceChildren(h('div.ef-panel.acc-panel.on-panel', head, body));
    const first = this.root.querySelector('input:not([type=hidden])');
    if (first) focusIfDesktop(first);
  }

  #notConfigured() {
    return h('div.on-body',
      h('p.acc-lead', 'Online-Konten sind in dieser Version noch nicht eingerichtet. Du kannst weiterhin mit einem lokalen Profil auf diesem Gerät spielen.'),
      h('div.acc-actions', h('button.ef-btn.primary', { type: 'button', onclick: () => this.game.scenes.go('account', { next: 'characters' }) }, 'Lokal spielen')));
  }

  #login() {
    const email = this.#field('E-Mail', { type: 'email', autocomplete: 'email', inputmode: 'email', required: true, maxlength: 254 });
    const pw = this.#password('Passwort', 'current-password');
    const submit = (e) => {
      e.preventDefault();
      const mail = email.input.value.trim();
      if (!emailOk(mail)) { this.message = { kind: 'error', text: 'Bitte gib eine gültige E-Mail-Adresse ein.' }; this.#render(); return; }
      if (!pw.input.value) { this.message = { kind: 'error', text: 'Bitte gib dein Passwort ein.' }; this.#render(); return; }
      this.#run(async () => {
        await this.online.client.signIn(mail, pw.input.value);
        this.#go('account', { kind: 'ok', text: `Angemeldet als ${this.online.displayName}.` });
        this.online.afterSignIn();
      });
    };
    return h('div.on-body',
      this.#providers(),
      h('div.on-or', h('span', 'oder mit E-Mail')),
      h('form.on-form', { onsubmit: submit, novalidate: true },
        email.el, pw.el,
        this.#messageBox(),
        h('button.ef-btn.primary.on-submit', { type: 'submit' }, 'Anmelden')),
      h('div.on-links',
        h('button.on-link', { type: 'button', onclick: () => this.#go('forgot') }, 'Passwort vergessen?'),
        h('button.on-link', { type: 'button', onclick: () => this.#go('register') }, 'Noch kein Konto? Registrieren')),
      h('p.on-fine', 'Ohne Konto spielen? ', h('button.on-link', { type: 'button', onclick: () => this.game.scenes.go('account', { next: 'characters' }) }, 'Lokales Profil auf diesem Gerät')));
  }

  #register() {
    const name = this.#field('Spielername', { type: 'text', autocomplete: 'nickname', required: true, minlength: 2, maxlength: 24, spellcheck: 'false' });
    const email = this.#field('E-Mail', { type: 'email', autocomplete: 'email', inputmode: 'email', required: true, maxlength: 254 });
    const pw = this.#password('Passwort (mind. 8 Zeichen, mit Zahl)', 'new-password');
    const submit = (e) => {
      e.preventDefault();
      const n = name.input.value.trim().replace(/\s+/g, ' '), mail = email.input.value.trim();
      const problem = n.length < 2 ? 'Der Spielername braucht mindestens 2 Zeichen.'
        : !emailOk(mail) ? 'Bitte gib eine gültige E-Mail-Adresse ein.'
          : passwordProblem(pw.input.value);
      if (problem) { this.message = { kind: 'error', text: problem }; this.#render(); return; }
      this.#run(async () => {
        const r = await this.online.client.signUp(mail, pw.input.value, n);
        if (r.needsConfirmation) {
          this.#go('login', { kind: 'ok', text: `Fast geschafft: Wir haben eine E-Mail an ${mail} geschickt. Öffne den Link darin in diesem Browser, um dein Konto zu bestätigen.` });
        } else {
          this.#go('account', { kind: 'ok', text: `Willkommen, ${this.online.displayName}!` });
          this.online.afterSignIn();
        }
      });
    };
    return h('div.on-body',
      this.#providers(),
      h('div.on-or', h('span', 'oder mit E-Mail')),
      h('form.on-form', { onsubmit: submit, novalidate: true },
        name.el, email.el, pw.el,
        this.#messageBox(),
        h('button.ef-btn.primary.on-submit', { type: 'submit' }, 'Konto erstellen')),
      h('div.on-links', h('button.on-link', { type: 'button', onclick: () => this.#go('login') }, 'Schon ein Konto? Anmelden')),
      h('p.on-fine', 'Wir speichern deine E-Mail, deinen Spielernamen und deine Spielstände, um dein Konto zu betreiben. Du kannst dein Konto jederzeit selbst löschen.'));
  }

  #forgot() {
    const email = this.#field('E-Mail', { type: 'email', autocomplete: 'email', inputmode: 'email', required: true, maxlength: 254 });
    const submit = (e) => {
      e.preventDefault();
      const mail = email.input.value.trim();
      if (!emailOk(mail)) { this.message = { kind: 'error', text: 'Bitte gib eine gültige E-Mail-Adresse ein.' }; this.#render(); return; }
      this.#run(async () => {
        await this.online.client.requestPasswordReset(mail);
        this.#go('login', { kind: 'ok', text: `Falls es zu ${mail} ein Konto gibt, ist ein Link unterwegs. Öffne ihn in diesem Browser.` });
      });
    };
    return h('div.on-body',
      h('form.on-form', { onsubmit: submit, novalidate: true }, email.el, this.#messageBox(),
        h('button.ef-btn.primary.on-submit', { type: 'submit' }, 'Link senden')));
  }

  #newPassword() {
    const pw = this.#password('Neues Passwort', 'new-password');
    const submit = (e) => {
      e.preventDefault();
      const problem = passwordProblem(pw.input.value);
      if (problem) { this.message = { kind: 'error', text: problem }; this.#render(); return; }
      this.#run(async () => {
        await this.online.client.updateUser({ password: pw.input.value });
        this.#go('account', { kind: 'ok', text: 'Dein Passwort wurde geändert.' });
      });
    };
    if (!this.online.user) return h('div.on-body', h('p.acc-lead', 'Der Link ist abgelaufen. Bitte fordere einen neuen an.'),
      h('button.ef-btn.primary', { type: 'button', onclick: () => this.#go('forgot') }, 'Neuen Link anfordern'));
    return h('div.on-body', h('form.on-form', { onsubmit: submit, novalidate: true }, pw.el, this.#messageBox(),
      h('button.ef-btn.primary.on-submit', { type: 'submit' }, 'Passwort speichern')));
  }

  #syncLine() {
    const s = this.online.sync;
    const text = {
      idle: 'Wird verbunden …',
      syncing: 'Spielstände werden abgeglichen …',
      ok: `Spielstände in der Cloud gesichert${s.lastSyncAt ? ` (${formatAgo(s.lastSyncAt)})` : ''}.`,
      offline: 'Keine Verbindung. Du kannst weiterspielen, wir laden hoch, sobald du wieder online bist.',
      error: `Abgleich fehlgeschlagen: ${s.lastError ? describeError(s.lastError) : 'unbekannter Fehler'}`,
    }[s.status];
    return h(`p.on-sync.${s.status}`, { role: 'status' }, h('span.on-dot', { 'aria-hidden': 'true' }), text);
  }

  #account() {
    const o = this.online, g = this.game, u = o.user;
    const providers = (u.app_metadata?.providers ?? [u.app_metadata?.provider]).filter(Boolean);
    const via = providers.map((p) => ({ email: 'E-Mail', google: 'Google', apple: 'Apple' }[p] ?? p)).join(', ');
    const count = g.save.listCharacters(o.accountId).length;
    const adminSlot = h('div.on-admin-slot');
    o.isAdmin().then((yes) => {
      if (yes && this.mode === 'account') adminSlot.replaceChildren(h('button.ef-btn.on-admin-btn', { type: 'button', onclick: () => g.scenes.go('admin') }, 'Verwaltung öffnen'));
    });

    return h('div.on-body',
      h('div.on-who',
        h('span.acc-avatar', { 'aria-hidden': 'true' }, o.displayName.slice(0, 1).toUpperCase()),
        h('div',
          h('strong', o.displayName),
          h('div.acc-meta', [u.email, via ? `angemeldet über ${via}` : null].filter(Boolean).join(' · ')))),
      this.#syncLine(),
      this.#messageBox(),
      h('div.acc-actions',
        h('button.ef-btn.primary.acc-big', { type: 'button', onclick: () => o.play() },
          h('span.acc-btn-title', 'Spielen'),
          h('span.acc-btn-sub', count ? `${count === 1 ? '1 Charakter' : `${count} Charaktere`} in deinem Konto` : 'Ersten Charakter erschaffen'))),
      adminSlot,
      this.#importBox(),
      h('details.on-more',
        h('summary', 'Kontoeinstellungen'),
        h('div.on-more-body',
          providers.includes('email') ? h('button.ef-btn', { type: 'button', onclick: () => this.#go('newPassword') }, 'Passwort ändern') : null,
          h('button.ef-btn', { type: 'button', onclick: () => this.#run(async () => {
            const r = await o.signOut();
            this.#go('login', { kind: 'ok', text: r.removedLocalCopy ? 'Abgemeldet. Deine Charaktere sind sicher in der Cloud.' : 'Abgemeldet. Nicht hochgeladene Spielstände bleiben auf diesem Gerät, bis du dich wieder anmeldest.' });
          }) }, 'Abmelden'),
          this.#deleteButton())));
  }

  // Lokale Demo-Charaktere dieses Geräts als Kopie ins Konto übernehmen.
  #importBox() {
    const g = this.game, o = this.online;
    const locals = g.save.listAccounts().filter((a) => !o.isOnlineAccount(a.id))
      .flatMap((a) => g.save.listCharacters(a.id).map((c) => ({ acc: a, c })));
    if (!locals.length) return null;
    return h('details.on-import',
      h('summary', `Lokale Charaktere übernehmen (${locals.length})`),
      h('p.acc-meta', 'Kopiert einen Charakter von diesem Gerät in dein Konto. Das Original im lokalen Profil bleibt erhalten.'),
      h('div.acc-list', locals.map(({ acc, c }) => h('div.acc-row.on-import-row',
        h('div.acc-row-main', h('div', h('strong', c.name ?? '?'), h('div.acc-meta', `${characterLine(g.content, c)} · Profil „${acc.name}“`))),
        h('div.acc-row-actions', h('button.ef-btn.acc-small', {
          type: 'button',
          onclick: (e) => {
            const id = o.copyLocalCharacter(acc.id, c.id);
            e.currentTarget.disabled = true;
            e.currentTarget.textContent = id ? 'Übernommen' : 'Fehlgeschlagen';
          },
        }, 'Übernehmen'))))));
  }

  #deleteButton() {
    let armed = false;
    const btn = h('button.ef-btn.danger', { type: 'button', onclick: () => {
      if (!armed) { armed = true; btn.textContent = 'Wirklich endgültig löschen?'; setTimeout(() => { armed = false; btn.textContent = 'Konto löschen'; }, 4000); return; }
      this.#run(async () => {
        await this.online.deleteAccount();
        this.#go('login', { kind: 'ok', text: 'Dein Konto und alle Online-Charaktere wurden gelöscht.' });
      });
    } }, 'Konto löschen');
    return btn;
  }
}
