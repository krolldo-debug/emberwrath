// Fortschrittsbuch (src/ledger/README.md): Der Server bestätigt Erfahrung, Gold, Gegenstände und Beute.
//
// game.ledger (für andere Bereiche):
//   roll(label)          Würfel für eine Belohnung ('loot', 'trial', 'daily', 'board'), siehe progression/index.js
//   ready                true, sobald Würfel des Servers da sind (oder das Buch hier nicht gilt: abgemeldet, nicht eingerichtet)
//   whenReady(fn)        fn sofort oder sobald ready (Beute direkt nach dem Laden, ProgressionSystem)
//   beforeUpload(row, { exists })  CloudSync vor dem Hochladen eines Charakters: Warteschlange aus dessen Spielstand an
//                        den Server schicken, dann ohne Warteschlange hochladen. → true (hochladen) | false (später)
//   uploaded(id, row)    CloudSync nach dem Hochladen
// Ablauf: Spielstart → POST /net/buch { open } → Sitzung (Würfel). Jeder Command landet als Eintrag in der Warteschlange
// des Spielstands (client.js). CloudSync schickt sie vor jedem Hochladen; die Datenbank kappt Spielstände auf das Buch.
// Neuer Held, oder erster Start mit Buch: Das Buch beginnt mit dem nächsten hochgeladenen Stand (Modus 'wait'), danach
// öffnet die Sitzung mit base und übernimmt nur die Einträge, die in diesem Stand noch nicht stecken.
import { EV } from '../core/events.js';
import { serverNow } from '../progression/clock.js';
import { LedgerTap } from './client.js';

const URL_BUCH = '/net/buch';
const CHUNK = 200;
const OFF_KEEP = 500;
const OFF_RECHECK_MS = 10 * 60 * 1000;
const RETRY_MS = [2000, 5000, 15000, 30000, 60000];

export function installLedger(game) {
  const state = game.state;
  let saveInside = null;
  const tap = new LedgerTap(state, { now: serverNow, onCommitted: () => resave() }).install();
  tap.enabled = false; // erst mit Online-Charakter (open)
  let mode = 'idle';       // idle | opening | open | wait | off
  let charId = null;
  let tries = 0, timer = 0;
  let waitU = null;        // wait: höchste Eintragsnummer im zuletzt hochgeladenen Stand
  let offAt = 0;
  const waiting = [];

  const online = () => game.online;
  const active = () => !!online()?.user && !!online()?.sync?.userId && game.account?.id === online().sync.accountId && !!state.meta.characterId;

  // Gespeichert mitten in einem Command (z. B. Postfach beim Zonenwechsel): danach mit dem fertigen Eintrag erneut
  game.bus.on(EV.GAME_SAVED, (e) => { if (tap.depth > 0) saveInside = e?.reason ?? 'ledger'; });
  function resave() {
    if (!saveInside) return;
    const reason = saveInside;
    saveInside = null;
    queueMicrotask(() => game.saveNow?.(reason));
  }

  async function post(body) {
    const token = await online().client.getAccessToken().catch(() => null);
    if (!token) throw Object.assign(new Error('auth'), { code: 'auth' });
    const r = await fetch(URL_BUCH, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (d?.off) return { off: true };
    if (r.status === 404 && d.error === 'nochar') return { nochar: true };
    if (r.status === 409) return { session: true };
    if (!r.ok) throw Object.assign(new Error(d.error ?? `http ${r.status}`), { code: 'server' });
    return d;
  }

  function release() {
    while (waiting.length) { try { waiting.shift()(); } catch (e) { console.error(e); } }
  }
  function retry() {
    clearTimeout(timer);
    timer = setTimeout(() => open(), RETRY_MS[Math.min(tries++, RETRY_MS.length - 1)]);
  }
  // Warten auf den ersten hochgeladenen Stand: bald speichern und hochladen
  function uploadSoon() {
    clearTimeout(timer);
    timer = setTimeout(() => { if (mode === 'wait' && game.scenes?.currentId === 'play') { game.saveNow?.('ledger'); online()?.sync?.flush().catch(() => {}); } }, 1500);
  }

  async function open(base = null) {
    clearTimeout(timer);
    tap.enabled = active();
    if (!active()) { mode = 'idle'; release(); return; }
    const cid = state.meta.characterId;
    if (mode === 'opening' && charId === cid) return;
    mode = 'opening'; charId = cid;
    try {
      const r = await post({ c: cid, open: true, ...(base != null ? { base: true } : {}) });
      if (charId !== cid || state.meta.characterId !== cid) return; // inzwischen anderer Held
      if (r.off) { mode = 'off'; offAt = Date.now(); tap.trimUnsent(OFF_KEEP); release(); return; }
      if (r.nochar || r.fresh) { mode = 'wait'; uploadSoon(); return; }
      tap.open({ sid: r.sid, seed: r.seed, baseU: base });
      mode = 'open'; tries = 0;
      release();
    } catch { if (charId === cid) { mode = 'idle'; retry(); } }
  }

  function close() {
    clearTimeout(timer);
    tap.close();
    mode = 'idle'; charId = null; tries = 0; waitU = null;
  }

  // Anderer Spielstand geladen oder neuer Held: Sitzung gehört zum vorigen
  const load = state.load.bind(state), reset = state.reset.bind(state);
  state.load = (snap) => { close(); return load(snap); };
  state.reset = (init) => { close(); return reset(init); };
  game.bus.on(EV.GAME_STARTED, () => { close(); open(); });
  game.bus.on(EV.ONLINE_CHANGED, () => {
    if (active() && mode === 'idle' && game.scenes?.currentId === 'play') open();
    else if (!active() && mode !== 'idle') { close(); tap.enabled = false; release(); }
  });

  async function sendQueue(cid, q) {
    const bySid = new Map();
    for (const e of q) if (e && e.s) { if (!bySid.has(e.s)) bySid.set(e.s, []); bySid.get(e.s).push(e); }
    for (const [sid, list] of bySid) {
      for (let i = 0; i < list.length; i += CHUNK) {
        const r = await post({ c: cid, s: sid, e: list.slice(i, i + CHUNK) });
        if (r.off) { mode = 'off'; offAt = Date.now(); release(); return true; }
        if (r.session) break; // Sitzung zu alt: diese Einträge kann der Server nicht mehr prüfen
        if (r.nochar || r.fresh) return false;
        if (cid === state.meta.characterId) tap.confirm(sid, r.k);
      }
    }
    return true;
  }

  const maxU = (q) => q.reduce((m, e) => Math.max(m, e?.u | 0), 0);
  const strip = (row) => { row.snapshot = { ...row.snapshot, meta: { ...row.snapshot.meta, ledger: undefined } }; };

  const api = game.ledger = {
    tap,
    roll: (label) => tap.roll(label),
    get ready() { return mode === 'open' || mode === 'off' || !active(); },
    get mode() { return mode; },
    whenReady(fn) { if (this.ready) fn(); else waiting.push(fn); },
    async beforeUpload(row, { exists = true } = {}) {
      if (!online()?.user) return true;
      const q = row.snapshot?.meta?.ledger?.q ?? [];
      const current = row.id === state.meta.characterId;
      // Ohne Buch, neuer Held, erster Start mit Buch: Stand hochladen, das Buch beginnt damit
      if (mode === 'off' || !exists || (current && mode === 'wait')) {
        if (current && mode !== 'off') waitU = maxU(q);
        if (current && mode === 'off') tap.trimUnsent(OFF_KEEP);
        strip(row);
        return true;
      }
      if (q.some((e) => e && e.s == null)) return false; // noch ohne Sitzung: erst öffnen
      try {
        if (!await sendQueue(row.id, q)) return false;
      } catch { return false; }
      strip(row);
      return true;
    },
    uploaded(id) {
      if (id !== state.meta.characterId) return;
      if (mode === 'wait' && waitU != null) { const base = waitU; waitU = null; mode = 'idle'; open(base); }
      else if (mode === 'off' && Date.now() - offAt > OFF_RECHECK_MS) { mode = 'idle'; open(); } // Buch inzwischen eingerichtet?
    },
  };
  if (game.online?.sync) game.online.sync.ledger = api;
}
