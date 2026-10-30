import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { appPlatform, appNativeLevel } from './native.js';
import { serverNow } from '../progression/clock.js';
import { boardDay } from '../progression/board.js';
import { tr } from '../i18n/index.js';

// Mitteilungen in der iOS-App (ab 1.1, native Seite: app/ios/App/App/PushPlugin.swift).
//
// Wann gefragt wird: nie beim ersten Start. Erst wenn ein Held an seinem zweiten Spieltag die Tagesbelohnung bekommt
// (er kommt also wieder), einige Sekunden nach dem Banner, in einem ruhigen Moment. Zuerst eine eigene kleine Frage im
// Spiel; nur bei „Ja, erinnere mich“ kommt Apples Abfrage, die je Installation nur einmal erscheinen darf. „Nein danke“
// fragt nie wieder (Gerät, game.prefs).
//
// Was kommt: höchstens eine Erinnerung am Tag, um 18 Uhr Ortszeit, sobald die nächste Tagesbelohnung bereitliegt.
// Wer vorher spielt, bekommt sie nicht: jeder Spielstart plant sie neu (gleiche Kennung ersetzt die alte).
// Mitteilungen vom Server (APNs) sind vorbereitet: die App meldet sich nach der Erlaubnis bei Apple an, token() liefert
// das Geräte-Token. Gesendet wird noch nichts.
const PLUGIN = 'EmberPush';
const ASKED = 'notifyAsked';
const REMIND_ID = 'daily';
const REMIND_HOUR = 18;
const ASK_DELAY_MS = 7000;
const DAY_MS = 86400000;

export const hasPush = () => appPlatform() === 'ios' && appNativeLevel() >= 2 && typeof globalThis.Capacitor?.nativePromise === 'function';
const call = (method, options = {}) => globalThis.Capacitor.nativePromise(PLUGIN, method, options);
const status = () => call('status').then((r) => r?.status ?? 'prompt').catch(() => 'denied');

// Erstes REMIND_HOUR Uhr (Ortszeit), zu dem die nächste Tagesbelohnung (neuer Tag nach UTC) schon bereitliegt.
// Der Tag zählt nach Serverzeit, die Uhrzeit nach dem Gerät; Ergebnis in Gerätezeit (ms).
export function nextReminder(serverMs, deviceMs = serverMs) {
  const ready = (boardDay(serverMs) + 1) * DAY_MS - (serverMs - deviceMs);
  const at = new Date(deviceMs);
  at.setHours(REMIND_HOUR, 0, 0, 0);
  while (at.getTime() < ready) at.setDate(at.getDate() + 1);
  return at.getTime();
}

function schedule() {
  call('schedule', {
    id: REMIND_ID,
    title: tr('Deine Tagesbelohnung wartet'),
    body: tr('Schau in Emberwrath vorbei und hol sie dir ab.'),
    at: nextReminder(serverNow(), Date.now()),
  }).catch(() => {});
}

function askPanel(session, done) {
  const answer = (yes) => { session.panels.close(); done(yes); };
  const root = h('div.ef-panel.ef-center.nt-win', { role: 'dialog', 'aria-label': 'Erinnerung' },
    h('h2.ef-sub', 'Erinnerung'),
    h('p.ef-note', 'Sollen wir dir Bescheid geben, wenn deine nächste Tagesbelohnung bereitliegt? Höchstens einmal am Tag.'),
    h('div.nt-actions',
      h('button.ef-btn.primary', { type: 'button', onclick: () => answer(true) }, 'Ja, erinnere mich'),
      h('button.ef-btn', { type: 'button', onclick: () => answer(false) }, 'Nein danke')));
  return { root };
}

export function installNotify(game) {
  if (!hasPush()) return;
  const answer = async (yes) => {
    game.prefs.set(ASKED, true);
    if (!yes) return;
    if ((await call('request').then((r) => r?.status).catch(() => 'denied')) === 'granted') schedule();
  };
  game.panels.register('notify', (s) => askPanel(s, answer), { title: 'Erinnerung' });

  game.addSessionSystem('notify', (sess) => {
    let timer = 0;
    // Spielstart: Erinnerung für den nächsten Tag neu planen (falls erlaubt)
    status().then((st) => { if (st === 'granted') schedule(); });
    const ask = (tries = 0) => {
      timer = setTimeout(() => {
        if (game.prefs.get(ASKED, false)) return;
        // Ruhiger Moment: kein Fenster offen, Held lebt, App sichtbar; sonst etwas später noch einmal (höchstens 2 Minuten)
        if (sess.panels.openId || sess.world?.hero?.dead || document.visibilityState !== 'visible') {
          if (tries < 24) ask(tries + 1);
          return;
        }
        status().then((st) => {
          if (st !== 'prompt') { game.prefs.set(ASKED, true); if (st === 'granted') schedule(); return; }
          sess.panels.open('notify');
        });
      }, tries ? 5000 : ASK_DELAY_MS);
    };
    const off = sess.bus.on('daily:reward', (e) => {
      status().then((st) => { if (st === 'granted') schedule(); });
      if (e.streak >= 2 && !game.prefs.get(ASKED, false)) ask();
    });
    return { dispose: () => { off?.(); clearTimeout(timer); } };
  }, 91);
}
