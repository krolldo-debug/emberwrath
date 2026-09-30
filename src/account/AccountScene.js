import { h } from '../core/dom.js';
import { MenuScene } from './TitleScene.js';
import { localNotice, formatDate, confirmButton, focusIfDesktop } from './ui.js';

const MAX_ACCOUNTS = 6;

// Lokaler Demo-Account: auswählen, anlegen, löschen. Kein Passwort, kein Server.
// params.next: 'create' (danach Charaktererstellung) | 'characters' (Charakterliste)
export class AccountScene extends MenuScene {
  enter(params = {}) {
    // Demo-Accounts gibt es nicht mehr: gespielt wird nur mit Online-Konto.
    const o = this.game.online;
    if (o) { this.root = h('div.ef-screen.acc-screen'); if (o.user) o.play(); else o.open('login'); return; }
    this.next = params.next ?? 'characters';
    this.root = h('div.ef-screen.acc-screen');
    this.#render();
  }

  back() { this.game.scenes.go('title'); }

  #login(id) {
    const g = this.game;
    g.login(id);
    g.scenes.go(this.next === 'create' ? 'characterCreate' : 'characters', { from: 'account' });
  }

  // Sicherungsdatei aller Spielstände dieses Geräts (INTEGRATION.md §11.11): herunterladen und wieder einspielen.
  #backupBox() {
    const g = this.game;
    const note = h('p.acc-backup-note', { role: 'status' }, this.backupNote ?? '');
    const say = (text) => { this.backupNote = text; note.textContent = text; };
    const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      file.value = '';
      if (!f) return;
      say('Sicherung wird geladen …');
      let r;
      try { r = await g.importSaveFile(f); } catch { r = { ok: false, reason: 'format' }; }
      if (r?.ok) {
        const a = r.accounts ?? 0, c = r.characters ?? 0;
        this.backupNote = `Sicherung geladen: ${a === 1 ? '1 Account' : `${a} Accounts`}, ${c === 1 ? '1 Charakter' : `${c} Charaktere`}.`;
        this.#render();
      } else {
        say({
          size: 'Die Datei ist zu groß oder leer. Bitte eine Emberwrath-Sicherung wählen.',
          full: 'Der Speicher dieses Browsers ist voll. Lösche alte Accounts oder Charaktere und versuche es erneut.',
        }[r?.reason] ?? 'Das ist keine gültige Emberwrath-Sicherung. Bitte die heruntergeladene .json-Datei wählen.');
      }
    });
    const canExport = typeof g.exportSaveFile === 'function';
    return h('div.acc-backup',
      h('label.acc-label', 'Sicherung'),
      h('p.acc-backup-lead', 'Spielstände liegen nur in diesem Browser. Sichere sie als Datei, um sie auf ein anderes Gerät mitzunehmen oder nach dem Löschen der Browserdaten wiederherzustellen.'),
      h('div.acc-inline',
        h('button.ef-btn', {
          type: 'button', disabled: !canExport,
          onclick: () => { let ok = false; try { ok = g.exportSaveFile() !== false; } catch { ok = false; } say(ok ? 'Sicherungsdatei heruntergeladen.' : 'Es gibt noch nichts zu sichern.'); },
        }, 'Spielstand sichern'),
        h('button.ef-btn', { type: 'button', disabled: typeof g.importSaveFile !== 'function', onclick: () => file.click() }, 'Sicherung laden'),
        file),
      note);
  }

  #render(error = null) {
    const g = this.game, save = g.save;
    // Online-Konten (Präfix sb_) sind Cloud-Zwischenspeicher und gehören nicht in die Demo-Liste
    const accounts = save.listAccounts().filter((a) => !g.online?.isOnlineAccount?.(a.id));
    const input = h('input.ef-input.acc-name-input', {
      type: 'text', maxlength: 24, placeholder: 'z. B. Sitzheizung', autocomplete: 'off', spellcheck: 'false',
      'aria-label': 'Name des Demo-Accounts',
    });
    const err = h('p.acc-error', { role: 'alert' }, error ?? '');
    const create = () => {
      const name = input.value.trim().replace(/\s+/g, ' ');
      if (name.length < 2) { err.textContent = 'Bitte mindestens 2 Zeichen eingeben.'; input.focus(); return; }
      if (accounts.some((a) => a.name.toLowerCase() === name.toLowerCase())) { err.textContent = 'Diesen Namen gibt es auf diesem Gerät schon.'; return; }
      if (accounts.length >= MAX_ACCOUNTS) { err.textContent = `Höchstens ${MAX_ACCOUNTS} Demo-Accounts pro Gerät.`; return; }
      const acc = save.createAccount(name);
      this.#login(acc.id);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });

    const list = accounts.length
      ? h('div.acc-list', accounts.map((a) => {
        const n = save.listCharacters(a.id).length;
        return h('div.acc-row.ef-card', { onclick: () => this.#login(a.id) },
          h('div.acc-row-main',
            h('span.acc-avatar', { 'aria-hidden': 'true' }, a.name.slice(0, 1).toUpperCase()),
            h('div',
              h('strong', a.name),
              h('div.acc-meta', `${n === 1 ? '1 Charakter' : `${n} Charaktere`} · angelegt am ${formatDate(a.createdAt)}`))),
          h('div.acc-row-actions',
            h('button.ef-btn.primary.acc-small', { type: 'button', onclick: (e) => { e.stopPropagation(); this.#login(a.id); } }, 'Weiter'),
            confirmButton('Löschen', 'Wirklich löschen?', () => { save.deleteAccount(a.id); if (g.account?.id === a.id) g.logout(); this.#render(); }, 'ef-btn.danger.acc-small')));
      }))
      : h('p.acc-empty', 'Auf diesem Gerät gibt es noch keinen Demo-Account.');

    const panel = h('div.ef-panel.acc-panel',
      h('header.acc-head',
        h('button.acc-back', { type: 'button', onclick: () => this.back(), 'aria-label': 'Zurück' }, '‹'),
        h('div', h('h2.ef-sub', 'Lokaler Demo-Account'), h('p.acc-step', this.next === 'create' ? 'Schritt 1 von 2 · Account wählen' : 'Account wählen'))),
      h('p.acc-lead', 'Ein Demo-Account ist nur ein Profilname auf diesem Gerät. Er fasst deine Charaktere zusammen, ist aber durch nichts geschützt: Jeder, der diesen Browser benutzt, kann ihn öffnen oder löschen.'),
      list,
      h('div.acc-create-account',
        h('label.acc-label', 'Neuen Demo-Account anlegen'),
        h('div.acc-inline', input, h('button.ef-btn.primary', { type: 'button', onclick: create }, 'Anlegen')),
        err),
      this.#backupBox(),
      localNotice(g, { compact: true }));

    this.root.replaceChildren(panel);
    if (!accounts.length) focusIfDesktop(input);
  }
}
