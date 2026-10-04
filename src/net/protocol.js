// Mehrspieler-Protokoll (Client und Welt-Server teilen diese Datei; siehe src/net/README.md).
//
// Transport: eine WebSocket-Verbindung je Spieler zu genau einem Shard = (Zone, Welt).
// Nachrichten sind JSON-Objekte mit Feld t (Typ). Zahlen sind ganze Weltpixel.
//
// Client -> Server
//   hello { v, token, zone, world, char: { id, name, level }, look, s }   erste Nachricht, sonst nichts
//   s     { s: [x, y, f, a, n, fl, t] }                                    eigener Zustand (höchstens SEND_HZ, nur bei Änderung)
//   look  { level, look }                                                   Stufe/Aussehen/Ausrüstung/Reittier geändert
//   chat  { text }                                                          Zonen-Chat (Server filtert, chatFilter.js)
//   report { id, reason, note, goodFaith }                                  Spieler melden (DSA Art. 16), reason: REPORT_REASONS
//   'ping' (reiner Text)                                                    Lebenszeichen, Server antwortet 'pong'
// Server -> Client
//   welcome { v, id, k, zone, world, cap, players: [Spieler] }              Spieler = { id, k, name, level, look, s }
//                                                                          k = dauerhafter Schlüssel des Kontos (Ignorieren)
//   join    { p: Spieler }      leave { id }
//   u       { s: [[id, x, y, f, a, n, fl, t], …] }                           geänderte Zustände seit dem letzten Paket
//   look    { id, level, look } chat { id, name, text, at }
//   full    { zone, world }     Shard voll -> Client fragt die nächste Welt an
//   reported { id, ok, error }  Eingangsbestätigung einer Meldung ('rate' | 'reason' | 'target')
//   notice  { kind: 'muted', until, reason }   Chatsperre (Nachricht wurde nicht verteilt)
//   notice  { kind: 'name', reason, name }     Name nicht erlaubt ('reserviert'|'anstoessig'), andere sehen `name`
//   bye     { reason }          'replaced' (neue Verbindung desselben Kontos) | 'auth' | 'version' | 'kick'
//
// Zustand s = [x, y, f, a, n, fl, t]
//   x, y  Fußpunkt in Weltpixeln        f  Blickrichtung (1 | -1)
//   a     Animationsname ('idle', 'run', 'atk1', 'roll', …)   n  Zähler, erhöht bei jedem Neustart einer Animation
//   fl    Bitfeld FLAG_*                 t  Uhr des Senders in ms (für gleichmäßige Interpolation beim Empfänger)
//
// Stufe 2 (serverseitige Gegner/Beute) ergänzt nur neue Typen (e = Gegner-Zustände, hit, loot, …) und neue Flag-Bits;
// bestehende Felder bleiben. Unbekannte Typen ignorieren beide Seiten.

export const NET_VERSION = 1;
export const NET_PATH = '/net';

export const SEND_HZ = 8;            // Client: höchstens so viele Zustände pro Sekunde
export const IDLE_RESEND_S = 5;      // Client: unveränderter Zustand trotzdem alle n Sekunden (Wiederaufbau nach Server-Neustart)
export const BROADCAST_MS = 50;      // Server: Zustände gebündelt alle 50 ms
export const INTERP_DELAY_MS = 200;  // Empfänger: Darstellung so weit in der Vergangenheit (≥ Sendeabstand + Bündelung + Schwankung)
export const EXTRAPOLATE_MS = 120;   // Empfänger: fehlt der nächste Zustand, höchstens so lange in Laufrichtung weiterschieben
export const PING_MS = 20_000;
export const PONG_TIMEOUT_MS = 12_000;
export const DEFAULT_CAPACITY = 40;  // falls eine Zone kein maxPlayers trägt
export const MAX_WORLDS = 99;

export const FLAG_DEAD = 1;
export const FLAG_RIDING = 2;
export const FLAG_COMBAT = 4;

export const CHAT_MAX = 160;
export const REPORT_NOTE_MAX = 500;
export const REPORT_REASON_LABELS = {
  beleidigung: 'Beleidigung oder Belästigung', hass: 'Hass, Hetze oder Drohung', spam: 'Spam oder Werbung',
  betrug: 'Betrug oder Schummeln', name: 'Anstößiger Name', sonstiges: 'Etwas anderes (bitte beschreiben)',
};
export const NAME_MAX = 24;
export const LOOK_MAX_BYTES = 6000;

// Shard-Name für Durable Objects: '<zoneId>~<welt>'. Neue Zonen brauchen keine Codeänderung.
export const shardName = (zoneId, world) => `${zoneId}~${world}`;
export const ZONE_ID_RE = /^[a-z][a-z0-9_]{0,47}$/;
const ANIM_RE = /^[a-z][a-z0-9_]{0,23}$/;

const CTRL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g;
export function cleanText(s, max) {
  return String(s ?? '').replace(CTRL, '').replace(/\s+/g, ' ').trim().slice(0, max);
}
export const cleanName = (s) => cleanText(s, NAME_MAX) || 'Unbekannt';
export const cleanChat = (s) => cleanText(s, CHAT_MAX);

const int = (v, lo, hi, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
// Höchststufe des Spiels (INTEGRATION.md §12). Steigt sie, hier mitziehen.
export const LEVEL_MAX = 40;
export const cleanLevel = (v) => int(v, 1, LEVEL_MAX, 1);

// Zustand prüfen und normalisieren (Server bei Empfang, Client beim Senden). -> Array oder null
export function cleanState(s) {
  if (!Array.isArray(s) || s.length < 6) return null;
  const a = typeof s[3] === 'string' && ANIM_RE.test(s[3]) ? s[3] : 'idle';
  return [int(s[0], -1000, 100_000), int(s[1], -1000, 100_000), s[2] < 0 ? -1 : 1, a, int(s[4], 0, 1e9), int(s[5], 0, 0xffff), int(s[6], 0, 2 ** 52)];
}

// Helden-Abbild (INTEGRATION §12.9, hero.snapshotLook()) als reine Daten; der Server prüft nur Form und Größe.
// { raceId, classId, appearance: { variant, dye, hairStyle }, gear, mountId, riding }
export function cleanLook(look) {
  if (!look || typeof look !== 'object' || Array.isArray(look)) return null;
  const id = (v) => (typeof v === 'string' && /^[a-z0-9_]{1,48}$/.test(v) ? v : null);
  const ap = look.appearance && typeof look.appearance === 'object' ? look.appearance : {};
  const out = {
    raceId: id(look.raceId), classId: id(look.classId),
    appearance: { variant: int(ap.variant, 0, 31), dye: id(ap.dye), hairStyle: id(ap.hairStyle) },
    gear: look.gear && typeof look.gear === 'object' && !Array.isArray(look.gear) ? look.gear : null,
    mountId: id(look.mountId), riding: !!look.riding,
  };
  let size = 0;
  try { size = JSON.stringify(out).length; } catch { return null; }
  if (size > LOOK_MAX_BYTES) out.gear = null;
  return out;
}
