import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { MenuScene } from '../account/TitleScene.js';
import { focusIfDesktop, characterLine, backButton } from '../account/ui.js';
import { describeError } from './AuthClient.js';
import { inApp } from '../app/native.js';
import { fmtDate, tr, onLangChange } from '../i18n/index.js';

// Anmeldeseite (Szene 'login'). params.mode:
//   'login'        E-Mail + Passwort, Google
//   'register'     Konto anlegen
//   'forgot'       Link zum Zurücksetzen anfordern
//   'newPassword'  neues Passwort setzen (nach Link aus der E-Mail oder im Konto)
//   'consent'      angemeldet, aber Nutzungsbedingungen (aktuelle Fassung) noch nicht bestätigt, z. B. nach erster Google-Anmeldung
//   'deleteAccount' Konto löschen nach erneuter Anmeldung (Passwort bzw. Google; der Server verlangt eine frische Anmeldung)
//   'account'      angemeldet: Verwaltung, lokale Charaktere übernehmen, Kontoeinstellungen (Spielen liegt auf dem Titel)
//   'rename'       Kontonamen ändern, höchstens alle 30 Tage (Sperre im Server: change_display_name)
// Offizielles „G“ aus Googles Sign-in-Branding-Richtlinien (developers.google.com/identity/branding-guidelines).
const GOOGLE_SVG = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
// Rechtstexte der Website (site/). Das Spiel liegt unter /spielen/, die Seiten im Wurzelverzeichnis.
export const LEGAL = { terms: '/nutzungsbedingungen', privacy: '/datenschutz', minAge: 12, adultAge: 18, termsVersion: '2026-10-05' };
// Altersklausel wie in den Nutzungsbedingungen: ab 12 Jahren, unter 18 nur mit Zustimmung der Eltern.
const AGE_CLAUSE = `Spielen ab ${LEGAL.minAge} Jahren; unter ${LEGAL.adultAge} nur mit Zustimmung der Eltern.`;
const consentMeta = () => ({ terms_version: LEGAL.termsVersion, terms_accepted_at: new Date().toISOString() });
// Hat das Konto die aktuelle Fassung der Nutzungsbedingungen bestätigt? (Google-Konten kommen ohne Häkchen an.)
export const needsConsent = (user) => !!user && user.user_metadata?.terms_version !== LEGAL.termsVersion;
const legalLink = (text, href) => h('a.on-legal-link', { href, target: '_blank', rel: 'noopener' }, text);
// Leise Fußzeile unter dem Anmeldeformular (Datenschutz muss beim Anmelden erreichbar bleiben).
const legalFoot = () => h('p.on-legal-foot', legalLink('Nutzungsbedingungen', LEGAL.terms), h('span', { 'aria-hidden': 'true' }, '·'), legalLink('Datenschutz', LEGAL.privacy));
// Frage + Wechsel-Knopf in einer ruhigen Zeile, z. B. „Noch kein Konto? Registrieren“.
const switchLine = (question, label, onclick) => h('p.on-switch', h('span', question), ' ', h('button.on-link', { type: 'button', onclick }, label));

// Häkchen-Satz: ganzer Satz als ein Text übersetzt, die beiden Begriffe darin werden zu Links.
// Finden sich die Begriffe in einer Sprache nicht im Satz, stehen die Links wie früher darunter.
const CONSENT_SENTENCE = 'Ich akzeptiere die Nutzungsbedingungen und habe die Datenschutzerklärung zur Kenntnis genommen.';
function consentSentence() {
  const text = tr(CONSENT_SENTENCE);
  const parts = [];
  let rest = text;
  for (const [word, href] of [[tr('Nutzungsbedingungen'), LEGAL.terms], [tr('Datenschutzerklärung'), LEGAL.privacy]]) {
    const i = rest.toLocaleLowerCase().indexOf(word.toLocaleLowerCase());
    if (i < 0) return null;
    parts.push(rest.slice(0, i), legalLink(rest.slice(i, i + word.length), href));
    rest = rest.slice(i + word.length);
  }
  // Schon übersetzt: der Beobachter soll die Teilstücke nicht noch einmal übersetzen.
  return h('span', { translate: 'no' }, ...parts, rest);
}

const svgIcon = (markup) => { const s = h('span.on-provider-icon'); s.innerHTML = markup; return s; };

// Untertitel nur, wo er etwas erklärt (Anmelde- und Kontoseite bleiben schlank).
const TITLES = {
  login: ['Anmelden', ''],
  register: ['Konto erstellen', ''],
  forgot: ['Passwort vergessen', 'Wir schicken dir einen Link zum Zurücksetzen'],
  newPassword: ['Neues Passwort', ''],
  account: ['Dein Konto', ''],
  consent: ['Nutzungsbedingungen', 'Einmal bestätigen, dann geht es los'],
  deleteAccount: ['Konto löschen', 'Bitte bestätige mit deiner Anmeldung'],
  rename: ['Namen ändern', ''],
};

// Kontoname: dieselben Regeln prüft der Server (supabase/migrations/20261011023000_namen_aendern.sql).
const NAME_CHARS = /^[0-9A-Za-zÀ-ÖØ-öø-ɏ]+([ ._-][0-9A-Za-zÀ-ÖØ-öø-ɏ]+)*$/;
const cleanName = (s) => s.trim().replace(/\s+/g, ' ');
const NAME_ERRORS = {
  name_length: 'Der Name braucht 2 bis 24 Zeichen.',
  name_chars: 'Erlaubt sind Buchstaben und Zahlen, dazwischen einzelne Leerzeichen, Punkte, Binde- oder Unterstriche.',
  name_unchanged: 'So heißt du schon.',
  name_taken: 'Diesen Namen trägt schon ein anderes Konto.',
  name_cooldown: 'Du kannst deinen Namen nur alle 30 Tage ändern.',
};
const nameProblem = (n) => (n.length < 2 || n.length > 24 ? NAME_ERRORS.name_length : NAME_CHARS.test(n) ? null : NAME_ERRORS.name_chars);
const nextChangeText = (iso) => `Nächste Änderung ab ${fmtDate(iso, { day: 'numeric', month: 'long', year: 'numeric' })}.`;

const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const passwordProblem = (pw) => (pw.length < 8 ? 'Das Passwort braucht mindestens 8 Zeichen.'
  : !/[A-Za-zÄÖÜäöüß]/.test(pw) || !/\d/.test(pw) ? 'Nimm Buchstaben und mindestens eine Zahl.' : null);

export class LoginScene extends MenuScene {
  enter(params = {}) {
    this.online = this.game.online;
    this.mode = params.mode ?? (this.online.user ? 'account' : 'login');
    if (['account', 'consent', 'deleteAccount', 'rename'].includes(this.mode) && !this.online.user) this.mode = 'login';
    this.message = this.online.notice; this.online.notice = null;
    this.busy = false;
    this.root = h('div.ef-screen.acc-screen.on-screen');
    this.off = this.game.bus.on(EV.ONLINE_CHANGED, () => { if (this.mode === 'account') this.#render(); });
    // Der Häkchen-Satz wird selbst übersetzt (Links darin), also bei Sprachwechsel neu zeichnen.
    this.offLang = onLangChange(() => { if (this.mode === 'register' || this.mode === 'consent') this.#render(); });
    this.#render();
  }

  exit() { super.exit(); this.off?.(); this.offLang?.(); }

  back() {
    if (this.mode === 'forgot' || this.mode === 'register') { this.#go('login'); return; }
    if (['newPassword', 'deleteAccount', 'rename'].includes(this.mode) && this.online.user) { this.#go('account'); return; }
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
    // E-Mail und Passwort: iOS darf nichts großschreiben oder „korrigieren“ (sonst passt das Passwort bei der
    // Anmeldung nicht mehr, v. a. wenn es beim Registrieren über „Zeigen“ als normaler Text eingetippt wurde)
    const raw = attrs.type === 'email' || attrs.type === 'password' ? { autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', ...attrs } : attrs;
    const input = h('input.ef-input', raw);
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
    const o = this.online;
    // Nicht freigeschaltete Anbieter bleiben unsichtbar (kein „bald“-Knopf).
    const google = h('button.ef-btn.on-provider.on-google', {
      type: 'button', onclick: () => this.#run(() => o.client.signInWithProvider('google')),
    }, svgIcon(GOOGLE_SVG), h('span', 'Weiter mit Google'));
    // Kein Kleingedrucktes: Neue Google-Konten bestätigen Nutzungsbedingungen und Alter danach auf der Seite 'consent'.
    const box = h('div.on-providers', google,
      h('div.on-or', h('span', 'oder mit E-Mail')));
    // In der Store-App nur E-Mail: Google sperrt die Anmeldung in eingebetteten Ansichten, und mit nur eigener
    // Anmeldung verlangt Apple kein „Mit Apple anmelden“ (Richtlinie 4.8).
    const set = (on) => { box.hidden = !on || inApp(); };
    set(!!o.providers.google);
    // Aktive Anbieter kommen aus den Supabase-Einstellungen (freigeschaltet ohne neue Version)
    o.loadProviders?.().then((p) => set(!!p.google));
    return box;
  }

  #messageBox() {
    const m = this.message;
    return h(`p.on-msg${m ? `.${m.kind}` : ''}`, { role: m?.kind === 'error' ? 'alert' : 'status' }, m?.text ?? '');
  }

  #shownMode = null;

  #render() {
    const [title, sub] = TITLES[this.mode] ?? TITLES.login;
    const head = h('header.acc-head',
      backButton(() => this.back()),
      h('div', h('h2.ef-sub', title), sub ? h('p.acc-step', sub) : null));
    let body;
    if (!this.online.configured) body = this.#notConfigured();
    else if (this.mode === 'register') body = this.#register();
    else if (this.mode === 'forgot') body = this.#forgot();
    else if (this.mode === 'newPassword') body = this.#newPassword();
    else if (this.mode === 'account' && this.online.user) body = this.#account();
    else if (this.mode === 'consent' && this.online.user) body = this.#consent();
    else if (this.mode === 'deleteAccount' && this.online.user) body = this.#deleteAccount();
    else if (this.mode === 'rename' && this.online.user) body = this.#rename();
    else body = this.#login();
    // Eingaben bleiben erhalten, wenn dieselbe Seite neu gezeichnet wird (z. B. nach einer Fehlermeldung)
    const keep = this.#shownMode === this.mode ? [...this.root.querySelectorAll('.on-form input')].map((el) => (el.type === 'checkbox' ? el.checked : el.value)) : null;
    this.#shownMode = this.mode;
    this.root.replaceChildren(h('div.ef-panel.acc-panel.on-panel', head, body));
    if (keep) this.root.querySelectorAll('.on-form input').forEach((el, i) => {
      if (i >= keep.length) return;
      if (el.type === 'checkbox') el.checked = keep[i]; else el.value = keep[i];
    });
    // Alte Fehlermeldung verschwindet, sobald wieder getippt wird.
    this.root.querySelectorAll('.on-form input').forEach((el) => el.addEventListener('input', () => {
      const msg = this.root.querySelector('.on-msg.error');
      if (msg) { msg.textContent = ''; msg.classList.remove('error'); }
      if (this.message?.kind === 'error') this.message = null;
    }));
    const first = this.root.querySelector('input:not([type=hidden])');
    if (first) focusIfDesktop(first);
  }

  #notConfigured() {
    return h('div.on-body',
      h('p.acc-lead', 'Die Anmeldung ist gerade nicht erreichbar. Bitte versuche es später erneut.'));
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
        this.game.scenes.go('title');
        this.online.afterSignIn();
      });
    };
    // „Passwort vergessen?“ sitzt rechts in der Zeile des Passwort-Labels (außerhalb des <label>).
    const pwRow = h('div.on-pw-row', pw.el,
      h('button.on-link.on-forgot', { type: 'button', onclick: () => this.#go('forgot') }, 'Passwort vergessen?'));
    return h('div.on-body',
      this.#providers(),
      h('form.on-form', { onsubmit: submit, novalidate: true },
        email.el, pwRow,
        this.#messageBox(),
        h('button.ef-btn.primary.on-submit', { type: 'submit' }, 'Anmelden')),
      h('div.on-after',
        switchLine('Noch kein Konto?', 'Registrieren', () => this.#go('register')),
        legalFoot()));
  }

  #consentBox() {
    const consent = h('input', { type: 'checkbox', required: true });
    const inline = consentSentence();
    const consentEl = h('label.on-check', consent,
      h('span', inline ?? h('span', CONSENT_SENTENCE), ' ', h('span', AGE_CLAUSE)));
    return { consent, consentEl: h('div.on-consent', consentEl, inline ? null : legalFoot()) };
  }

  // Nach der ersten Google-Anmeldung (oder neuer Fassung der Bedingungen): Zustimmung einmal nachholen und im Konto vermerken.
  #consent() {
    const o = this.online;
    const { consent, consentEl } = this.#consentBox();
    const submit = (e) => {
      e.preventDefault();
      if (!consent.checked) { this.message = { kind: 'error', text: 'Bitte bestätige die Nutzungsbedingungen und das Mindestalter.' }; this.#render(); return; }
      this.#run(async () => { await o.client.updateUser({ data: consentMeta() }); o.play(); });
    };
    return h('div.on-body',
      h('p.acc-lead', `Willkommen, ${o.displayName}! Bevor du spielst, bestätige bitte einmal die Nutzungsbedingungen.`),
      h('form.on-form', { onsubmit: submit, novalidate: true },
        consentEl,
        this.#messageBox(),
        h('button.ef-btn.primary.on-submit', { type: 'submit' }, 'Zustimmen und spielen')),
      h('div.on-links',
        h('button.on-link', { type: 'button', onclick: () => this.#run(async () => { await o.client.signOut(); this.game.scenes.go('title'); }) }, 'Abmelden')));
  }

  #register() {
    const name = this.#field('Spielername', { type: 'text', autocomplete: 'nickname', required: true, minlength: 2, maxlength: 24, spellcheck: 'false' });
    const email = this.#field('E-Mail', { type: 'email', autocomplete: 'email', inputmode: 'email', required: true, maxlength: 254 });
    const pw = this.#password('Passwort (mind. 8 Zeichen, mit Zahl)', 'new-password');
    const { consent, consentEl } = this.#consentBox();
    const submit = (e) => {
      e.preventDefault();
      const n = name.input.value.trim().replace(/\s+/g, ' '), mail = email.input.value.trim();
      const problem = n.length < 2 ? 'Der Spielername braucht mindestens 2 Zeichen.'
        : !emailOk(mail) ? 'Bitte gib eine gültige E-Mail-Adresse ein.'
          : passwordProblem(pw.input.value)
            ?? (consent.checked ? null : 'Bitte bestätige die Nutzungsbedingungen und das Mindestalter.');
      if (problem) { this.message = { kind: 'error', text: problem }; this.#render(); return; }
      this.#run(async () => {
        // Zustimmung im Konto vermerken (Nachweis, welche Fassung wann akzeptiert wurde)
        const r = await this.online.client.signUp(mail, pw.input.value, n, consentMeta());
        if (r.needsConfirmation) {
          // In der App öffnet sich der Link im Browser des Geräts: dort bestätigen, dann hier anmelden.
          const text = inApp()
            ? `Fast geschafft: Wir haben eine E-Mail an ${mail} geschickt. Bestätige dein Konto über den Link darin und melde dich danach hier an.`
            : `Fast geschafft: Wir haben eine E-Mail an ${mail} geschickt. Öffne den Link darin in diesem Browser, um dein Konto zu bestätigen.`;
          this.#go('login', { kind: 'ok', text });
        } else {
          this.online.notice = { kind: 'ok', text: `Willkommen, ${this.online.displayName}!` };
          this.game.scenes.go('title');
          this.online.afterSignIn();
        }
      });
    };
    return h('div.on-body',
      this.#providers(),
      h('form.on-form', { onsubmit: submit, novalidate: true },
        name.el, email.el, pw.el, consentEl,
        this.#messageBox(),
        h('button.ef-btn.primary.on-submit', { type: 'submit' }, 'Konto erstellen')),
      switchLine('Schon ein Konto?', 'Anmelden', () => this.#go('login')));
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

  // Abgleich läuft unsichtbar; eine Zeile erscheint nur, wenn etwas nicht klappt.
  #syncLine() {
    const s = this.online.sync;
    const text = {
      offline: 'Keine Verbindung. Du kannst weiterspielen, wir laden hoch, sobald du wieder online bist.',
      error: `Abgleich fehlgeschlagen: ${s.lastError ? describeError(s.lastError) : 'unbekannter Fehler'}`,
    }[s.status];
    if (!text) return null;
    return h(`p.on-sync.${s.status}`, { role: 'status' }, h('span.on-dot', { 'aria-hidden': 'true' }), text);
  }

  #account() {
    const o = this.online, g = this.game, u = o.user;
    const providers = (u.app_metadata?.providers ?? [u.app_metadata?.provider]).filter(Boolean);
    const adminSlot = h('div.on-admin-slot');
    o.isAdmin().then((yes) => {
      if (yes && this.mode === 'account') adminSlot.replaceChildren(h('button.ef-btn.on-admin-btn', { type: 'button', onclick: () => g.scenes.go('admin') }, 'Verwaltung öffnen'));
    });

    return h('div.on-body',
      h('div.on-who',
        h('span.acc-avatar', { 'aria-hidden': 'true' }, o.displayName.slice(0, 1).toUpperCase()),
        h('strong', { translate: 'no' }, o.displayName)),
      this.#syncLine(),
      this.#messageBox(),
      adminSlot,
      this.#importBox(),
      h('details.on-more',
        h('summary', 'Kontoeinstellungen'),
        h('div.on-more-body',
          h('button.ef-btn', { type: 'button', onclick: () => this.#go('rename') }, 'Namen ändern'),
          providers.includes('email') ? h('button.ef-btn', { type: 'button', onclick: () => this.#go('newPassword') }, 'Passwort ändern') : null,
          h('button.ef-btn', { type: 'button', onclick: () => this.#run(async () => {
            const r = await o.signOut();
            this.#go('login', { kind: 'ok', text: r.removedLocalCopy ? 'Du bist abgemeldet.' : 'Abgemeldet. Noch nicht hochgeladene Spielstände werden beim nächsten Anmelden übertragen.' });
          }) }, 'Abmelden'),
          h('button.ef-btn.danger', { type: 'button', onclick: () => this.#go('deleteAccount') }, 'Konto löschen'))));
  }

  // Ältere lokale Charaktere dieses Geräts als Kopie ins Konto übernehmen.
  #importBox() {
    const g = this.game, o = this.online;
    const copied = new Set(o.copiedLocal());
    const locals = g.save.listAccounts().filter((a) => !o.isOnlineAccount(a.id))
      .flatMap((a) => g.save.listCharacters(a.id).map((c) => ({ acc: a, c })))
      .filter(({ acc, c }) => !copied.has(`${acc.id}:${c.id}`));
    if (!locals.length) return null;
    return h('details.on-import', { open: true },
      h('summary', locals.length === 1 ? '1 Charakter aus der Testphase gefunden' : `${locals.length} Charaktere aus der Testphase gefunden`),
      h('p.acc-meta', 'Übernimm sie in dein Konto, dann sind sie in der Cloud gesichert und auf jedem Gerät spielbar.'),
      h('div.acc-list', locals.map(({ acc, c }) => h('div.acc-row.on-import-row',
        h('div.acc-row-main', h('div', h('strong', c.name ?? '?'), h('div.acc-meta', `${characterLine(g.content, c)} · Profil „${acc.name}“`))),
        h('div.acc-row-actions', h('button.ef-btn.primary.acc-small', {
          type: 'button',
          onclick: (e) => {
            const btn = e.currentTarget;
            const id = o.copyLocalCharacter(acc.id, c.id);
            btn.disabled = true;
            btn.textContent = id ? 'Übernommen' : 'Fehlgeschlagen';
            if (id) setTimeout(() => { if (this.mode === 'account') this.#render(); }, 900);
          },
        }, 'In mein Konto übernehmen'))))));
  }

  // Kontonamen ändern. Ob gerade gesperrt ist, sagt der Server (display_name_status); gesperrt wird dort.
  #rename() {
    const o = this.online;
    const name = this.#field('Neuer Name', { type: 'text', autocomplete: 'nickname', required: true, minlength: 2, maxlength: 24, spellcheck: 'false', value: o.displayName });
    const hint = h('p.acc-meta', 'Du kannst deinen Namen alle 30 Tage ändern.');
    const submitBtn = h('button.ef-btn.primary.on-submit', { type: 'submit' }, 'Namen speichern');
    const locked = (iso) => { hint.textContent = nextChangeText(iso); name.input.disabled = true; submitBtn.disabled = true; };
    o.client.rpc('display_name_status').then((st) => { if (st?.next_change_at && this.mode === 'rename') locked(st.next_change_at); }).catch(() => {});
    const submit = (e) => {
      e.preventDefault();
      const n = cleanName(name.input.value);
      const problem = nameProblem(n) ?? (n === o.displayName ? NAME_ERRORS.name_unchanged : null);
      if (problem) { this.message = { kind: 'error', text: problem }; this.#render(); return; }
      this.#run(async () => {
        try { await o.client.rpc('change_display_name', { p_name: n }); } catch (err) {
          if (err?.code === 'network' || err?.status === 401) throw err;
          this.message = { kind: 'error', text: NAME_ERRORS[err?.message] ?? 'Namen ändern klappt gerade nicht. Bitte versuche es später erneut.' };
          this.#render();
          return;
        }
        await o.client.fetchUser().catch(() => {});
        this.#go('account', { kind: 'ok', text: 'Dein Name wurde geändert.' });
      });
    };
    return h('div.on-body',
      h('form.on-form', { onsubmit: submit, novalidate: true }, name.el, hint, this.#messageBox(), submitBtn));
  }

  // Konto löschen: erst erneut anmelden (Schutz, falls jemand ein offenes Gerät benutzt), dann endgültig löschen.
  #deleteAccount() {
    const o = this.online, u = o.user;
    const providers = (u.app_metadata?.providers ?? [u.app_metadata?.provider]).filter(Boolean);
    const remove = async () => {
      try { await o.deleteAccount(); } catch (e) {
        if (e?.code === 'reauth_required') { this.message = { kind: 'error', text: describeError(e) }; this.#render(); return; }
        throw e;
      }
      this.#go('login', { kind: 'ok', text: 'Dein Konto und alle Charaktere wurden gelöscht.' });
    };
    const cancel = h('div.on-links', h('button.on-link', { type: 'button', onclick: () => this.#go('account') }, 'Abbrechen'));
    const intro = h('p.acc-lead', 'Das Löschen lässt sich nicht rückgängig machen. Alle Charaktere, Spielstände und Einstellungen deines Kontos werden entfernt.');
    let step;
    if (o.freshSignIn()) {
      step = h('form.on-form', { onsubmit: (e) => { e.preventDefault(); this.#run(remove); }, novalidate: true },
        h('p.acc-meta', 'Deine Anmeldung ist bestätigt.'),
        this.#messageBox(),
        h('button.ef-btn.danger.on-submit', { type: 'submit' }, 'Konto endgültig löschen'));
    } else if (providers.includes('email') || inApp()) { // in der App immer mit Passwort angemeldet
      const pw = this.#password('Dein Passwort', 'current-password');
      step = h('form.on-form', { onsubmit: (e) => {
        e.preventDefault();
        if (!pw.input.value) { this.message = { kind: 'error', text: 'Bitte gib dein Passwort ein.' }; this.#render(); return; }
        this.#run(async () => { await o.reauthenticate({ password: pw.input.value }); await remove(); });
      }, novalidate: true },
        h('p.acc-meta', 'Gib zur Bestätigung dein Passwort ein.'),
        pw.el,
        this.#messageBox(),
        h('button.ef-btn.danger.on-submit', { type: 'submit' }, 'Konto endgültig löschen'));
    } else {
      step = h('div.on-form',
        h('p.acc-meta', 'Bestätige das Löschen mit einer erneuten Anmeldung bei Google. Danach kommst du hierher zurück.'),
        this.#messageBox(),
        h('button.ef-btn.danger.on-submit', { type: 'button', onclick: () => this.#run(() => o.reauthenticate()) }, 'Mit Google bestätigen'));
    }
    return h('div.on-body', intro, step, cancel);
  }

}
