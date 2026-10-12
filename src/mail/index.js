import { EV } from '../core/events.js';
import { Decor } from '../entities/Decor.js';
import { drawGlowLayer } from '../gfx/Sprite.js';
import { TRADE_MIN_LEVEL } from '../market/rules.js';
import { PLACES } from './places.js';
import { createMailboxSprites } from './sprite.js';
import { mailPanel } from './panel.js';
import { KEEP_DAYS, LOOT_MAX, LOOT_ITEMS_MAX, LOOT_GOLD_MAX, DAY_MS } from './rules.js';

// Postfach: in jeder Stadt mit Wegstein ein bis zwei Briefkästen der Rabenpost (places.js). Dort liegt, was das
// Auktionshaus liefert (Erlöse, gekaufte und ersteigerte Ware, Rückgaben; verfällt nie), was andere Spieler schicken
// (Gold und/oder ein Gegenstand, ohne Absicherung; nach 30 Tagen zurück an den Absender) und Bossbeute, die liegen blieb.
//
// Post vom Server (Auktionshaus, Spieler) bucht die Datenbank wie das Auktionshaus im gespeicherten Spielstand
// (supabase/migrations/20261011150000_postfach.sql, erzeugt von src/mail/mailSql.mjs; Ablauf über game.market.book).
// Bossbeute entsteht im Browser wie jede Beute und liegt deshalb im eigenen Spielstand (Slice mail.loot).
//
// game.mail
//   letters             Post vom Server (nach refresh())
//   loot                Bossbeute im Spielstand [{ id, at, boss, zoneId, items: [{ itemId, qty }], gold }]
//   count               alles zusammen (Laterne am Briefkasten, Hinweis)
//   refresh(), take(ids|null), send({ to, key, itemId, qty, gold }), lookup(name) → { name, level, classId, many, key },
//   giveBack(id) (Brief an den Absender zurück), takeLoot(id) → Promise
//   onChange(fn)
// Panel 'mail' (am Briefkasten).
export class MailError extends Error {
  constructor(code, fallback) { super(ERRORS[code] ?? fallback ?? ERRORS.unknown); this.code = code; }
}

const ERRORS = {
  offline: 'Melde dich mit deinem Konto an, um Post zu verschicken.',
  setup: 'Die Rabenpost öffnet in Kürze.',
  nobody: 'Einen Helden mit diesem Namen gibt es nicht.',
  self: 'An dich selbst kannst du nichts schicken.',
  empty: 'Leg Gold oder einen Gegenstand bei.',
  nodeliver: 'Der Rabe kann diesen Brief gerade nicht zustellen.',
  unready: 'Dieser Held kann noch keine Post empfangen.',
  changed: 'Der Name gehört inzwischen einem anderen Helden. Prüf den Empfänger noch einmal.',
  sender: 'Den Absender gibt es nicht mehr.',
  gone: 'Diesen Brief gibt es nicht mehr.',
  item: 'Das lässt sich nicht verschicken.',
  young: `Post verschicken geht ab Stufe ${TRADE_MIN_LEVEL} und nach einer Stunde Spielzeit.`,
  frame: 'So viel Gold kannst du erst nach längerer Spielzeit verschicken.',
  budget: 'Du hast gerade viel eigene Beute weitergegeben. Mit mehr Spielzeit geht wieder mehr.',
  rate: 'Du hast gerade viele Briefe geschickt. Bitte warte etwas.',
  slow: 'Nicht so schnell. Bitte warte einen Moment.',
  blocked: 'Die Post ist für dein Konto gerade gesperrt. Bitte wende dich an den Support.',
  bag: 'Deine Tasche ist voll.',
  unknown: 'Das hat nicht geklappt. Bitte versuch es gleich noch einmal.',
};
// Fehler des Auktionshauses (gleiche Buchungen) behalten ihren Text, außer die Post sagt es passender
const toMailError = (e) => (e instanceof MailError ? e : new MailError(e?.code, e?.message));

const listOf = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const now = () => Date.now();

// Bossbeute im Spielstand: nur gültige Einträge, nichts Abgelaufenes, höchstens LOOT_MAX (die neuesten)
function cleanLoot(raw, content) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const l of raw) {
    if (!l || typeof l.id !== 'string' || !(Number(l.at) > now() - KEEP_DAYS * DAY_MS)) continue;
    // Grenzen wie die Spielstandprüfung (characters_post_check): sonst lehnt der Server den ganzen Spielstand ab
    const items = (Array.isArray(l.items) ? l.items : [])
      .map((it) => ({ itemId: String(it?.itemId ?? ''), qty: Math.min(999, Math.floor(Number(it?.qty) || 0)) }))
      .filter((it) => it.qty > 0 && content?.find('item', it.itemId)).slice(0, LOOT_ITEMS_MAX);
    const gold = Math.min(LOOT_GOLD_MAX, Math.max(0, Math.floor(Number(l.gold) || 0)));
    if (!items.length && !gold) continue;
    out.push({ id: l.id, at: Number(l.at), boss: typeof l.boss === 'string' ? l.boss : null, zoneId: typeof l.zoneId === 'string' ? l.zoneId : null, items, gold });
  }
  return out.slice(-LOOT_MAX);
}

let sprites = null;
const mailboxSprites = () => (sprites ??= createMailboxSprites());

// Briefkasten der Rabenpost. Die Laterne brennt, solange Post wartet; der Rabe bewegt sich ab und zu.
class Mailbox extends Decor {
  constructor(x, y, sp, world, mail) {
    super(x, y, {
      sprite: sp.poses[0], shadow: 14, box: sp.box,
      light: { dx: 10, dy: -26, radius: 38, color: [255, 176, 96], intensity: 0, flicker: 0.3, bloom: 0.35 },
    }, world);
    this.sp = sp; this.mail = mail; this.interactRange = 24; this.lit = 0; this.phase = Math.random() * 8;
    this.mailboxId = 'mailbox';
  }
  update(dt, world) {
    super.update(dt, world);
    this.lit += ((this.mail.count > 0 ? 1 : 0) - this.lit) * Math.min(1, dt * 3);
    if (this.light) this.light.intensity = 0.85 * this.lit;
    const seq = this.sp.seq;
    this.sprite = this.sp.poses[seq[Math.floor((this.t + this.phase) * this.sp.fps) % seq.length]];
  }
  renderEmissive(ctx, cx, cy) {
    if (this.lit < 0.02) return;
    const g = this.sp.glow, s = this.sprite;
    ctx.globalAlpha = this.lit * (0.85 + 0.15 * Math.sin(this.t * 2.3)) * this.alpha;
    drawGlowLayer(ctx, s, g, this.x - cx, this.y - cy);   // rechnet frame.res heraus (Feinraster)
    ctx.globalAlpha = 1;
  }
  canInteract(world) { return !world.hero.dead; }
  prompt() { return 'Postfach'; }
  promptAnchor() { return { x: this.x, y: this.y - 44 }; }
  interact(world) { world.session.panels?.open('mail'); }
}

export function installMail(game) {
  const state = game.state;
  state.defineSlice('mail', {
    create: () => ({ loot: [], next: 1 }),
    deserialize: (raw) => ({ loot: cleanLoot(raw?.loot, game.content), next: Math.max(1, Math.floor(Number(raw?.next) || 1)) }),
  });

  // Bossbeute, die beim Verlassen der Zone noch lag: ein Brief je Zone
  state.defineCommand('mail:loot', (s, { drops = [], zoneId = null }, ctx) => {
    const m = s.get('mail');
    const items = [];
    let gold = 0, boss = null;
    for (const d of drops) {
      if (typeof d.boss === 'string') boss ??= d.boss;
      if (d.gold) { gold += Math.max(0, d.gold | 0); continue; }
      if (!d.itemId || !ctx.content.find('item', d.itemId)) continue;
      const e = items.find((x) => x.itemId === d.itemId);
      if (e) e.qty += Math.max(1, d.qty | 0); else items.push({ itemId: d.itemId, qty: Math.max(1, d.qty | 0) });
    }
    if (!items.length && !gold) return { ok: false };
    // Ein Brief fasst höchstens LOOT_ITEMS_MAX Teile (je bis 999) und LOOT_GOLD_MAX Gold; mehr geht in weitere Briefe
    const parts = items.flatMap((it) => Array.from({ length: Math.ceil(it.qty / 999) }, (_, i) => ({ itemId: it.itemId, qty: Math.min(999, it.qty - i * 999) })));
    while (parts.length || gold > 0) {
      const g = Math.min(gold, LOOT_GOLD_MAX);
      gold -= g;
      m.loot.push({ id: `b${m.next++}`, at: now(), boss, zoneId, items: parts.splice(0, LOOT_ITEMS_MAX), gold: g });
    }
    while (m.loot.length > LOOT_MAX) m.loot.shift();
    return { ok: true };
  }, { authoritative: true });

  // Beutebrief nehmen: was in die Tasche passt; der Rest bleibt im Brief
  state.defineCommand('mail:takeLoot', (s, { id }) => {
    const m = s.get('mail');
    const i = m.loot.findIndex((l) => l.id === id);
    if (i < 0) return { ok: false, reason: 'gone' };
    const l = m.loot[i], rest = [];
    let got = 0;
    for (const it of l.items) {
      const r = s.commit('inventory:add', { itemId: it.itemId, qty: it.qty, source: 'mail' });
      const added = r?.added ?? 0;
      got += added;
      if (it.qty - added > 0) rest.push({ itemId: it.itemId, qty: it.qty - added });
    }
    if (l.gold) { s.commit('wallet:addGold', { amount: l.gold, source: 'loot' }); got++; l.gold = 0; }
    if (rest.length) { l.items = rest; return { ok: got > 0, reason: got ? 'partial' : 'full' }; }
    m.loot.splice(i, 1);
    return { ok: true };
  }, { authoritative: true });

  const listeners = new Set();
  const changed = () => listeners.forEach((fn) => fn());
  const market = () => game.market;

  async function book(fn, args, deltaOf) {
    if (!market()?.ready) throw new MailError('offline');
    try { return await market().book(fn, args, deltaOf); } catch (e) { throw toMailError(e); } finally { mail.refresh().catch(() => {}); }
  }

  const mail = {
    letters: [], loaded: false,
    get ready() { return !!market()?.ready; },
    get loot() { return (state.slices.mail?.loot ?? []).filter((l) => l.at > now() - KEEP_DAYS * DAY_MS); },
    get count() { return mail.letters.length + mail.loot.length; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    async refresh() {
      if (!mail.ready) { mail.letters = []; mail.loaded = false; changed(); return; }
      const charId = state.meta.characterId;
      let r;
      try { r = await market().rpc('mail_box', {}); } catch (e) { throw toMailError(e); }
      if (state.meta.characterId !== charId) return;
      mail.letters = r.mail ?? []; mail.loaded = true;
      changed();
    },
    take(ids = null) {
      return book('mail_take', { p_ids: ids }, (r) => ({ gold: r.gold, add: listOf(r.add), learn: listOf(r.learn) }));
    },
    send({ to, key, itemId = null, qty = null, gold = 0 }) {
      return book('mail_send', { p_to: to, p_key: key ?? null, p_item: itemId, p_qty: itemId ? qty : null, p_gold: gold || 0 },
        (r) => ({ gold: r.gold, remove: listOf(r.remove) }));
    },
    async lookup(name) {
      try { return await market().rpc('mail_lookup', { p_to: name }); } catch (e) {
        throw e?.code === 'rate' ? new MailError('slow') : toMailError(e);
      }
    },
    async giveBack(id) {
      try { await market().rpc('mail_return', { p_id: id }); } catch (e) { throw toMailError(e); } finally { mail.refresh().catch(() => {}); }
    },
    takeLoot(id) {
      const r = state.commit('mail:takeLoot', { id });
      if (r?.ok) game.saveNow('mail');
      changed();
      if (r?.reason === 'full') throw new MailError('bag');
      return r;
    },
    serverNow() { return market()?.serverNow?.() ?? now(); },
  };
  game.mail = mail;

  game.panels.register('mail', (s) => mailPanel(s, game, mail), { title: 'Postfach' });

  // Höchstens ein Hinweis auf Post je Sitzung beim Start; danach reicht die Laterne am Briefkasten.
  let hinted = false;

  // Bossbeute, die liegen blieb (Zone verlassen, Tasche voll): als Brief aufbewahren. Beim Beenden der Sitzung fällt
  // das Verlassen der Zone hinter das letzte Speichern, deshalb hier selbst speichern.
  game.bus.on('loot:left', ({ drops, zoneId }) => {
    if (!state.meta.characterId || !drops?.length) return;
    const r = state.commit('mail:loot', { drops, zoneId });
    if (!r?.ok) return;
    game.saveNow('mail');
    changed();
    hinted = true;
    game.bus.emit(EV.UI_TOAST, { text: 'Liegengebliebene Bossbeute wartet im Postfach.', kind: 'info', icon: 'bag' });
  });

  // Post vom Auktionshaus nach dessen Buchungen nachladen (Laterne), höchstens alle paar Sekunden
  let last = 0, timer = 0;
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { last = now(); mail.refresh().catch(() => {}); }, Math.max(0, 3000 - (now() - last)));
  };

  // Pro Sitzung: Briefkästen in die Stadt stellen; einmal nachsehen, ob Post wartet.
  game.addSessionSystem('mail', (sess) => {
    let alive = true;
    hinted = false;
    const offs = [
      sess.bus.on(EV.ZONE_ENTER, () => { try { placeMailboxes(sess.world, mail); } catch (err) { console.error('Briefkasten', err); } }),
      market()?.onChange?.(() => { if (alive && mail.loaded) soon(); }),
    ];
    const check = setTimeout(() => {
      const tell = () => {
        if (hinted || !alive || !mail.count) return;
        hinted = true;
        sess.bus.emit(EV.UI_TOAST, { text: 'Im Postfach liegt etwas für dich.', kind: 'info', icon: 'gold' });
      };
      if (!mail.ready) { tell(); return; }
      mail.refresh().then(tell, tell);
    }, 6000);
    return { dispose: () => { alive = false; clearTimeout(check); clearTimeout(timer); offs.forEach((off) => off?.()); } };
  }, 26);
}

// Briefkästen neben dem Wegstein der Stadt (Abstand in places.js)
function placeMailboxes(world, mail) {
  const list = world && !world.zone?.instanced && PLACES[world.zone?.id];
  const stone = world?.waystone;
  if (!list || !stone || world.props.some((p) => p.mailboxId)) return;
  const sp = mailboxSprites();
  for (const pl of list) {
    const p = world.dungeon.nearestFree(stone.x + pl.dx, stone.y + pl.dy, 7);
    const box = new Mailbox(p.x, p.y, sp, world, mail);
    world.props.push(box);
    world.interactables.push(box);
  }
  world.flow?.rebuildBlocked?.();
}
