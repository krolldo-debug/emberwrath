import { EV } from '../core/events.js';
import { Npc } from '../entities/Npc.js';
import { Decor } from '../entities/Decor.js';
import { mountItemId, MAX_ACTIVE, TRADE_MIN_LEVEL } from './rules.js';
import { PLACES } from './places.js';
import { createAuctioneerSprites } from './sprite.js';
import { marketPanel } from './panel.js';
import { checkVersion } from '../core/Version.js';

// Auktionshaus: in jeder Stadt ein Auktionator der Gilde der Glutwaage. Spieler stellen Gegenstände, Materialien und
// gelernte Reittiere ein (Startgebot und/oder Sofortkauf, 12/24/48 Stunden, 5 % Gebühr beim Verkauf).
//
// Alles, was Gold oder Gegenstände bewegt, bucht die Datenbank selbst im gespeicherten Spielstand
// (supabase/migrations/20261011090000_auktionshaus.sql, erzeugt von src/market/marketSql.mjs). Das Spiel übernimmt
// danach nur die gemeldete Änderung (Command 'market:apply') und lädt dann wie gewohnt hoch. Ein älterer Spielstand
// (zweites Fenster, Speicherplatz) wird vom Server abgelehnt: slices.market.seq zählt jede Buchung mit.
//
// game.market
//   ready              true mit einem Charakter im Online-Konto
//   mine, bids         eigene Angebote, eigene Höchstgebote (nach refresh()); Erlöse und Ware liegen im Postfach (src/mail)
//   refresh()          diese drei neu laden → Promise
//   browse(filter)     Angebote suchen → Promise<{ rows, more, now }>
//   list({ itemId, qty, startBid, buyout, hours, mount }), bid(id, amount), buyout(id), cancel(id)
//                      → Promise<Antwort>, Fehler als MarketError (message = Text für den Spieler)
//   rpc(fn, args), book(fn, args, deltaOf)   Abfrage bzw. Buchung (für das Postfach)
//   serverNow()        Uhrzeit des Servers (Restlaufzeiten)
//   onChange(fn)
// Panel 'market' (Gespräch mit dem Auktionator).
export class MarketError extends Error {
  constructor(code) { super(ERRORS[code] ?? ERRORS.unknown); this.code = code; }
}

const ERRORS = {
  offline: 'Melde dich mit deinem Konto an, um zu handeln.',
  setup: 'Das Auktionshaus öffnet in Kürze.',
  network: 'Keine Verbindung zum Server. Bitte versuch es gleich noch einmal.',
  storage: 'Der Browser-Speicher ist voll. Bitte Speicher freigeben.',
  busy: 'Einen Moment, die letzte Buchung läuft noch.',
  auth: 'Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.',
  blocked: 'Der Handel ist für dein Konto gerade gesperrt. Bitte wende dich an den Support.',
  rate: 'Zu viele Aktionen in kurzer Zeit. Bitte warte einen Moment.',
  character: 'Dein Charakter ist noch nicht gesichert. Bitte versuch es gleich noch einmal.',
  item: 'Das lässt sich nicht handeln.',
  hours: 'Bitte wähle eine Laufzeit.',
  price: 'Bitte gib einen gültigen Preis an.',
  qty: 'Bitte gib eine gültige Menge an.',
  limit: `Du hast schon ${MAX_ACTIVE} Angebote eingestellt.`,
  missing: 'Das ist nicht mehr in deinem Besitz.',
  gone: 'Diese Auktion ist schon beendet.',
  nobid: 'Hier geht nur der Sofortkauf.',
  own: 'Das ist dein eigenes Angebot.',
  low: 'Dein Gebot ist zu niedrig.',
  buyout: 'Dein Gebot erreicht den Sofortkaufpreis. Kauf es lieber gleich.',
  gold: 'Nicht genug Gold.',
  nobuyout: 'Hier gibt es keinen Sofortkauf.',
  bids: 'Auf dieses Angebot wurde schon geboten. Es läuft bis zum Ende.',
  young: `Handeln geht ab Stufe ${TRADE_MIN_LEVEL} und nach einer Stunde Spielzeit.`,
  level: 'Diese Beute liegt zu weit über deiner Stufe.',
  budget: 'Du hast gerade viel eigene Beute eingestellt. Mit mehr Spielzeit geht wieder mehr.',
  frame: 'So viel Gold kannst du im Auktionshaus erst nach längerer Spielzeit ausgeben.',
  outdated: 'Eine neue Version ist da. Bitte lade die Seite neu.',
  unknown: 'Das hat nicht geklappt. Bitte versuch es gleich noch einmal.',
};

const toMarketError = (e) => {
  if (e instanceof MarketError) return e;
  if (e?.code === 'network') return new MarketError('network');
  if (e?.code === 'PGRST202' || e?.status === 404) return new MarketError('setup');
  if (e?.status === 401 || e?.code === 'not_configured') return new MarketError(e.status === 401 ? 'auth' : 'offline');
  return new MarketError('unknown');
};

let sprites = null;
const auctioneerSprites = () => (sprites ??= createAuctioneerSprites());

const AUCTIONEER = { name: 'Auktionator', title: 'Gilde der Glutwaage', facing: -1 };

class Auctioneer extends Npc {
  prompt() { return 'Auktionshaus'; }
  // Name und Gilde über der Hutspitze (der hohe Hut reicht bis 37 px über die Füße, Npc setzt die Zeilen tiefer)
  renderEmissive(ctx, cx, cy) {
    const near = this.nearHero;
    this.nearHero = false;
    super.renderEmissive(ctx, cx, cy);
    this.nearHero = near;
    const font = this.world.session.font;
    if (!near || !font) return;
    const x = Math.round(this.x - cx), top = Math.round(this.y - cy - 46);
    font.draw(ctx, this.def.name.toUpperCase(), x, top - 8 - Math.min(1, font.ascent(this.def.title)), { color: '#e8c25a', align: 'center', shadow: true });
    font.draw(ctx, this.def.title.toUpperCase(), x, top - 1, { color: '#a89ab8', align: 'center', shadow: true });
  }
  interact(world) {
    this.talkTime = 2.5;
    this.animator.play('talk', true);
    this.facing = world.hero.x < this.x ? -1 : 1;
    world.session.panels?.open('market');
  }
}

export function installMarket(game) {
  const state = game.state;
  state.defineSlice('market', {
    create: () => ({ seq: 0 }),
    deserialize: (raw) => ({ seq: Math.max(0, Math.floor(Number(raw?.seq) || 0)) }),
  });

  // Vom Server gebuchte Änderung übernehmen. seq: Stand der Buchung; schon übernommen (Cloud-Stand geladen) → nichts tun.
  state.defineCommand('market:apply', (s, { seq, gold = 0, remove = [], add = [], forgetMount = null, learn = [] }, ctx) => {
    const m = s.get('market');
    if (!(seq > m.seq)) return { ok: false, reason: 'stale' };
    for (const it of remove ?? []) s.commit('inventory:remove', { itemId: it.itemId, qty: it.qty });
    if (forgetMount) {
      const mounts = s.get('character').mounts;
      mounts.owned = mounts.owned.filter((id) => id !== forgetMount);
      if (mounts.active === forgetMount) {
        mounts.active = mounts.owned[0] ?? null;
        if (mounts.riding) { mounts.riding = false; ctx.bus.emit(EV.MOUNT_CHANGED, { riding: false, mountId: mounts.active }); }
      }
    }
    if (gold) {
      const w = s.get('wallet');
      w.gold += gold | 0;
      ctx.bus.emit(EV.GOLD_CHANGED, { delta: gold | 0, total: w.gold, source: 'market' });
    }
    for (const it of add ?? []) {
      const r = s.commit('inventory:add', { itemId: it.itemId, qty: it.qty, source: 'market' });
      const left = it.qty - (r?.added ?? 0);
      if (left > 0) {
        // Kein Platz mehr (seit der Buchung Beute aufgehoben): in den Überlaufbeutel, nichts geht verloren.
        const inv = s.get('inventory');
        inv.questBag ??= [];
        const e = inv.questBag.find((x) => x.itemId === it.itemId);
        if (e) e.qty += left; else inv.questBag.push({ itemId: it.itemId, qty: left });
      }
    }
    for (const id of learn ?? []) s.commit('mount:learn', { mountId: id });
    m.seq = seq;
    return { ok: true };
  }, { authoritative: true });

  const online = () => game.online;
  const isOnlineChar = () => !!online()?.user && online().isOnlineAccount(state.meta.accountId) && !!state.meta.characterId;
  const listeners = new Set();
  const changed = () => listeners.forEach((fn) => fn());
  let busy = false;

  const rpc = async (fn, args) => {
    if (!isOnlineChar()) throw new MarketError('offline');
    let r;
    try { r = await online().client.rpc(fn, { p_character: state.meta.characterId, ...args }); } catch (e) { throw toMarketError(e); }
    if (!r?.ok) throw new MarketError(r?.error ?? 'unknown');
    if (r.now) market.skew = Date.parse(r.now) - Date.now();
    return r;
  };

  // Eine Buchung: Ausstehendes hochladen, Server bucht im Cloud-Stand, Änderung übernehmen, Cloud-Zeitstempel bestätigen.
  async function book(fn, args, deltaOf) {
    if (!isOnlineChar()) throw new MarketError('offline');
    if (busy) throw new MarketError('busy');
    busy = true;
    const sync = online().sync, charId = state.meta.characterId;
    try {
      // Alter Code lädt nichts mehr hoch (src/core/Version.js): Buchungen erst nach dem Neuladen
      if (await checkVersion({ maxAge: 0 })) throw new MarketError('outdated');
      game.saveNow('market');
      return await sync.exclusive(async () => {
        if (state.meta.characterId !== charId) throw new MarketError('character');
        const r = await rpc(fn, args);
        if (r.seq != null && state.meta.characterId === charId) {
          state.commit('market:apply', { seq: r.seq, ...deltaOf(r) });
          sync.acknowledge(charId, r.savedAt);
          game.saveNow('market');
        }
        return r;
      });
    } catch (e) {
      const err = toMarketError(e);
      // Antwort verloren: ob gebucht wurde, weiß nur der Server. Der Abgleich holt dann seinen Stand.
      if (err.code === 'network') sync.syncAll().catch(() => {});
      throw err;
    } finally {
      busy = false;
      sync.flush().catch(() => {});
      market.refresh().catch(() => {});
    }
  }

  const listOf = (x) => (Array.isArray(x) ? x : x ? [x] : []);

  const market = {
    mine: [], bids: [], skew: 0, loaded: false,
    get ready() { return isOnlineChar(); },
    get busy() { return busy; },
    serverNow() { return Date.now() + market.skew; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    async refresh() {
      if (!isOnlineChar()) { market.mine = []; market.bids = []; changed(); return; }
      const charId = state.meta.characterId;
      const r = await rpc('market_overview', {});
      if (state.meta.characterId !== charId) return;
      market.mine = r.mine ?? []; market.bids = r.bids ?? []; market.loaded = true;
      changed();
    },

    async browse({ category = null, minRarity = 0, maxLevel = null, classId = null, items = null, sort = 'new', offset = 0 } = {}) {
      const r = await rpc('market_browse', {
        p_category: category, p_min_rarity: minRarity, p_max_level: maxLevel, p_class: classId, p_items: items, p_sort: sort, p_offset: offset,
      });
      const rows = r.rows ?? [];
      return { rows: rows.slice(0, 40), more: rows.length > 40, now: r.now };
    },

    list({ itemId, qty = 1, startBid = null, buyout = null, hours, mount = false }) {
      return book('market_list', { p_item: itemId, p_qty: qty, p_start_bid: startBid, p_buyout: buyout, p_hours: hours, p_mount: mount },
        (r) => ({ remove: listOf(r.remove), forgetMount: r.forgetMount ?? null }));
    },
    bid(listingId, amount) { return book('market_bid', { p_listing: listingId, p_amount: amount }, (r) => ({ gold: r.gold })); },
    buyout(listingId) {
      return book('market_buyout', { p_listing: listingId }, (r) => ({ gold: r.gold, add: listOf(r.add), learn: listOf(r.learn) }));
    },
    cancel(listingId) { return book('market_cancel', { p_listing: listingId }, (r) => ({ add: listOf(r.add), learn: listOf(r.learn) })); },
    // Für das Postfach (src/mail): dieselben Buchungen und Abfragen, Fehler als MarketError mit code
    rpc: (fn, args) => rpc(fn, args),
    book,

    // Gelernte Reittiere, die man einstellen kann (Erfolge und Shop-Designs nie)
    sellableMounts() {
      const m = state.slices.character?.mounts;
      return (m?.owned ?? []).map((id) => ({ mountId: id, itemId: mountItemId(id) })).filter((x) => x.itemId);
    },
  };
  game.market = market;

  game.panels.register('market', (s) => marketPanel(s, game, market), { title: 'Auktionshaus' });

  // Pro Sitzung: Auktionator in die Stadt stellen. Erlöse und Ware meldet das Postfach (src/mail).
  game.addSessionSystem('market', (sess) => {
    const offs = [
      sess.bus.on(EV.ZONE_ENTER, () => { try { placeAuctioneer(sess.world); } catch (err) { console.error('Auktionator', err); } }),
    ];
    return { dispose: () => offs.forEach((off) => off?.()) };
  }, 25);
}

// Auktionator mit Pult neben dem Wegstein der Stadt
function placeAuctioneer(world) {
  const place = world && !world.zone?.instanced && PLACES[world.zone?.id];
  const stone = world?.waystone;
  if (!place || !stone || world.npcs.some((n) => n.npcId === 'auctioneer')) return;
  const sp = auctioneerSprites();
  const p = world.dungeon.nearestFree(stone.x + place.dx, stone.y + place.dy, 7);
  const side = place.lectern ?? -1;
  const lectern = new Decor(p.x + side * 16, p.y + 2, {
    sprite: sp.lectern, glow: sp.lecternGlow, shadow: 14, box: [-8, -5, 8, 1],
    light: { dx: -7, dy: -26, radius: 40, color: [255, 186, 110], intensity: 0.75, flicker: 0.25, bloom: 0.35 },
  }, world);
  world.props.push(lectern);
  const npc = world.spawn(new Auctioneer('auctioneer', p.x, p.y, { ...AUCTIONEER, facing: side }, sp, world));
  npc.markerY = 62;
  npc.lectern = lectern;
  world.interactables.push(npc);
  world.npcs.push(npc);
  world.flow?.rebuildBlocked?.();
}
