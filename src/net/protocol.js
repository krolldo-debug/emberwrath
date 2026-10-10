// Mehrspieler-Protokoll (Client und Welt-Server teilen diese Datei; siehe src/net/README.md).
//
// Transport: eine WebSocket-Verbindung je Spieler zu genau einem Shard = (Zone, Welt).
// Nachrichten sind JSON-Objekte mit Feld t (Typ). Zahlen sind ganze Weltpixel.
//
// Client -> Server
//   hello { v, token, zone, world, char: { id, name, level }, look, s }   erste Nachricht, sonst nichts
//   s     { s: [x, y, f, a, n, fl, t], fx?: [Kampf, …] }                   eigener Zustand (höchstens SEND_HZ, nur bei Änderung),
//                                                                          fx: Angriffe/Fähigkeiten seit dem letzten Zustand
//   look  { level, look }                                                   Stufe/Aussehen/Ausrüstung/Reittier geändert
//   chat  { text }                                                          Zonen-Chat (Server filtert, chatFilter.js)
//   report { id, reason, note, goodFaith }                                  Spieler melden (DSA Art. 16), reason: REPORT_REASONS
//   'ping' (reiner Text)                                                    Lebenszeichen, Server antwortet 'pong'
// Server -> Client
//   welcome { v, id, k, zone, world, cap, players: [Spieler] }              Spieler = { id, k, name, level, look, s }
//                                                                          k = dauerhafter Schlüssel des Kontos (Ignorieren)
//   join    { p: Spieler }      leave { id }
//   u       { s: [[id, x, y, f, a, n, fl, t], …], fx?: [[id, Kampf, …], …] }  geänderte Zustände seit dem letzten Paket
//   look    { id, level, look } chat { id, name, text, at }
//   full    { zone, world }     Shard voll -> Client fragt die nächste Welt an
//   reported { id, ok, error }  Eingangsbestätigung einer Meldung ('rate' | 'reason' | 'target')
//   notice  { kind: 'muted', until, reason }   Chatsperre (Nachricht wurde nicht verteilt)
//   notice  { kind: 'name', reason, name }     Name nicht erlaubt ('zeichen'|'reserviert'|'anstoessig'), andere sehen `name`
//   bye     { reason }          'replaced' (neue Verbindung desselben Kontos) | 'auth' | 'version' | 'kick'
//
// Zustand s = [x, y, f, a, n, fl, t]
//   x, y  Fußpunkt in Weltpixeln        f  Blickrichtung (1 | -1)
//   a     Animationsname ('idle', 'run', 'atk1', 'roll', …)   n  Zähler, erhöht bei jedem Neustart einer Animation
//   fl    Bitfeld FLAG_*                 t  Uhr des Senders in ms (für gleichmäßige Interpolation beim Empfänger)
//
// Kampf = [k, t, id, ang, fl, tx, ty, th, tr]  (nur zur Anzeige: jeder kämpft gegen seine eigenen Gegner)
//   k     'a' Grundangriff (id = Kombo-Schlag 0..7) | 'k' Fähigkeit (id = Fähigkeits-ID)
//   t     Uhr des Senders in ms (wie s[6]; der Empfänger spielt es zeitgleich mit der Animation ab)
//   ang   Zielrichtung in Milliradiant     fl  Bitfeld FX_*
//   tx, ty, th, tr  anvisierter Gegner beim Sender (Fußpunkt, Höhe der Körpermitte, Trefferradius), tr = 0: keiner.
//         Geschosse enden beim Empfänger dort, Flächenzauber landen dort.
// Kampf reist mit dem Zustand, der die neue Animation meldet: keine zusätzlichen Nachrichten.
//
// Stufe 2 (serverseitige Gegner/Beute) ergänzt nur neue Typen (e = Gegner-Zustände, hit, loot, …) und neue Flag-Bits;
// bestehende Felder bleiben. Unbekannte Typen ignorieren beide Seiten.

export const NET_VERSION = 2; // 2: Aussehen mit Gegenstands-IDs (items) statt fertiger Optik (gear)
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

export const FX_UPGRADED = 1;   // Fähigkeit auf Rang 2 (Talent)
export const FX_MULTISHOT = 2;  // Waldläufer: Mehrfachschuss
export const FX_INFERNO = 4;    // Glutmagier: Glutbolzen explodiert
export const FX_INFERNO_BIG = 8;
export const FX_PIERCE = 16;    // Pfeil durchschlägt einen Gegner
export const FX_MAX = 6;        // höchstens so viele Kampfereignisse je Zustand (Client) bzw. je Spieler und Paket (Server)

export const CHAT_MAX = 160;
export const REPORT_NOTE_MAX = 500;
export const REPORT_REASON_LABELS = {
  beleidigung: 'Beleidigung oder Belästigung', hass: 'Hass, Hetze oder Drohung', spam: 'Spam oder Werbung',
  betrug: 'Betrug oder Schummeln', name: 'Anstößiger Name', sonstiges: 'Etwas anderes (bitte beschreiben)',
};
export const NAME_MAX = 24;

// Shard-Name für Durable Objects: '<zoneId>~<welt>'. Neue Zonen brauchen keine Codeänderung.
export const shardName = (zoneId, world) => `${zoneId}~${world}`;
export const ZONE_ID_RE = /^[a-z][a-z0-9_]{0,47}$/;
const ANIM_RE = /^[a-z][a-z0-9_]{0,23}$/;

// Steuerzeichen, Richtungswechsel und unsichtbare/leere Zeichen (weiches Trennzeichen, Nullbreite, Wortverbinder,
// Hangul-Füller, Mongolischer Vokaltrenner, BOM, Braille-Leerzeichen, Kurzschrift-Steuerzeichen, Tag-Zeichen und
// Variantenwähler der Ergänzungsebene). Danach NFC, damit gleiche Buchstaben gleich kodiert sind.
const CTRL = /[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\u2800\u3164\ufe00-\ufe0f\ufeff\uffa0\u{1bca0}-\u{1bca3}\u{1d173}-\u{1d17a}\u{e0000}-\u{e007f}\u{e0100}-\u{e01ef}]/gu;
export function cleanText(s, max) {
  return String(s ?? '').normalize('NFC').replace(CTRL, '').replace(/\s+/g, ' ').trim().slice(0, max);
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

// Kampfereignisse prüfen und normalisieren (Server bei Empfang, Client beim Senden). -> Array (evtl. leer)
const FX_ID_RE = /^[a-z][a-z0-9_]{0,31}$/;
export function cleanFx(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const e of list.slice(0, FX_MAX)) {
    if (!Array.isArray(e) || (e[0] !== 'a' && e[0] !== 'k')) continue;
    const id = e[0] === 'a' ? int(e[2], 0, 7) : typeof e[2] === 'string' && FX_ID_RE.test(e[2]) ? e[2] : null;
    if (id == null) continue;
    const tr = int(e[8], 0, 64);
    out.push([e[0], int(e[1], 0, 2 ** 52), id, int(e[3], -3142, 3142), int(e[4], 0, 0xff),
      tr ? int(e[5], -1000, 100_000) : 0, tr ? int(e[6], -1000, 100_000) : 0, tr ? int(e[7], 0, 96) : 0, tr]);
  }
  return out;
}

// Helden-Abbild als reine Daten. Ausrüstung reist nur als Gegenstands-IDs der sichtbaren Plätze; die Optik daraus
// berechnet jeder Empfänger selbst (resolveGear). Der Server prüft die IDs gegen den Katalog (isItem), der Client
// nur die Form. { raceId, classId, appearance: { variant, dye, hairStyle }, items: { weapon, chest, head, hands, feet },
// mountId, riding }
export const LOOK_SLOTS = ['weapon', 'chest', 'head', 'hands', 'feet'];
export const LOOK_MIN_MS = 1500; // Aussehen höchstens so oft je Spieler (Client sendet, Server verteilt)
export function cleanLook(look, isItem = null) {
  if (!look || typeof look !== 'object' || Array.isArray(look)) return null;
  const id = (v) => (typeof v === 'string' && /^[a-z0-9_]{1,48}$/.test(v) ? v : null);
  const ap = look.appearance && typeof look.appearance === 'object' ? look.appearance : {};
  const src = look.items && typeof look.items === 'object' && !Array.isArray(look.items) ? look.items : {};
  const items = {};
  for (const slot of LOOK_SLOTS) {
    const v = id(src[slot]);
    items[slot] = v && (!isItem || isItem(slot, v)) ? v : null;
  }
  return {
    raceId: id(look.raceId), classId: id(look.classId),
    appearance: { variant: int(ap.variant, 0, 31), dye: id(ap.dye), hairStyle: id(ap.hairStyle) },
    items, mountId: id(look.mountId), riding: !!look.riding,
  };
}
