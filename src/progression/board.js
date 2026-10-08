// Auftragsbrett (Thread C, Nutzerwunsch 08.10., Idee 2). Reine Regeln + Slice/Commands, ohne DOM.
//
// Jeden Tag (UTC) hängen 3 Aufträge am Brett, für alle Spieler derselben Region gleich (Würfel aus Tag + Region,
// nicht aus Math.random). Wer 10 Aufträge in einer Woche (Montag bis Sonntag, UTC) abschließt, öffnet die Wochentruhe.
// Region = Spielerstufe (nicht die Stadt): Jedes Brett in jeder Stadt zeigt dieselben Aufträge, passend zur Stufe.
// Auf Stufe 40 kommen Prüfungen, Champions und Bosse aller Gebiete dazu; Belohnung dann Gold und Material statt Erfahrung.
// Belohnungen hängen nie am Gold-Shop (keine kaufbaren Werte, keine Reittiere).
//
// Zeit: `now` kommt als Parameter (ms). Lokal ist das Date.now(); mit Server-Autorität setzt der Server die Zeit,
// dann lässt sich die Rotation nicht über die Uhr des Geräts verschieben. Rückwärts gehen Tage nie (day bleibt max).
//
// B: Brett-Objekt `quest_board` in den Städten → EV 'board:open' { zoneId, boardId } (ProgressionSystem öffnet das Panel),
//    Leucht-Hinweis über game.progression.boardHasOffers(zoneId).
import { EV } from '../core/events.js';
import { questXp } from './xp.js';

export const BOARD_OFFERS = 3;
export const WEEK_GOAL = 10;
const DAY_MS = 86400000;

// Tag und Woche (UTC). Woche beginnt Montag: 01.01.1970 war ein Donnerstag → +3 Tage.
export function boardDay(now) { return Math.floor(now / DAY_MS); }
export function boardWeek(now) { return Math.floor((boardDay(now) + 3) / 7); }
export function msUntilNextDay(now) { return DAY_MS - (now % DAY_MS); }

// Regionen nach Spielerstufe. enemies/elites/mats/bosses: IDs aus §11.3/§12.4 und B's Liste vom 08.10.
export const BOARD_REGIONS = [
  { id: 'hollow', min: 1, max: 5, name: 'Glutsenke', enemies: ['wolf', 'ember_beetle'], elites: ['wolf_alpha'], mats: ['wolf_pelt', 'wolf_fang'], bosses: ['bonelord'] },
  { id: 'ashwood', min: 6, max: 11, name: 'Aschenwald', enemies: ['bandit', 'ash_boar', 'thorn_crawler', 'bandit_shieldbearer'], elites: ['bandit_chief'], mats: ['linen', 'thorn_sap'], bosses: ['bonelord', 'drowned_priestess'] },
  { id: 'peaks', min: 12, max: 19, name: 'Schlackenhöhen', enemies: ['fire_imp', 'magma_hound', 'ash_golem', 'cinder_sapper', 'cliff_harpy'], elites: ['magma_behemoth', 'forge_warden'], mats: ['ember_ore', 'obsidian_shard'], bosses: ['drowned_priestess', 'ember_tyrant'] },
  { id: 'steppe', min: 20, max: 24, name: 'Aschensteppe', enemies: ['steppe_raider', 'dust_hyena', 'ash_vulture', 'gnoll_trapper', 'dust_shaman'], elites: ['steppe_warlord'], mats: ['hyena_hide', 'vulture_feather', 'raider_arrowhead'], bosses: ['ember_tyrant', 'barrow_king'] },
  { id: 'marsh', min: 25, max: 30, name: 'Faulmarsch', enemies: ['bog_lurker', 'swamp_leech', 'plague_toad', 'bog_slime', 'marsh_hag'], elites: ['bog_horror'], mats: ['leech_ichor', 'toad_gland', 'bog_iron'], bosses: ['barrow_king', 'rot_mother'] },
  { id: 'frost', min: 31, max: 35, name: 'Frostzinnen', enemies: ['frost_wolf', 'snow_stalker', 'ice_troll', 'frost_revenant', 'snow_burrower'], elites: ['ice_troll_chief'], mats: ['frost_pelt', 'troll_fat', 'rime_crystal'], bosses: ['rot_mother', 'frost_wyrm'] },
  { id: 'wastes', min: 36, max: 39, name: 'Glutöde', enemies: ['ash_wraith', 'cinder_knight', 'magma_serpent', 'cinder_bombardier', 'phase_wraith'], elites: ['waste_colossus'], mats: ['pilgrim_relic', 'magma_scale'], bosses: ['frost_wyrm', 'ash_sovereign'] },
  { id: 'endgame', min: 40, max: 40, name: 'Ganz Emberwrath', enemies: ['ash_wraith', 'cinder_knight', 'phase_wraith', 'frost_revenant', 'marsh_hag', 'cinder_bombardier'], elites: ['waste_colossus', 'ice_troll_chief', 'bog_horror', 'steppe_warlord'], mats: ['magma_scale', 'rime_crystal', 'bog_iron'], bosses: ['barrow_king', 'rot_mother', 'frost_wyrm', 'ash_sovereign'], trials: true },
];
export function boardRegion(level) { return BOARD_REGIONS.find((r) => level >= r.min && level <= r.max) ?? BOARD_REGIONS[BOARD_REGIONS.length - 1]; }

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (rng, list) => list[Math.floor(rng() * list.length)];

// Auftragsarten. title/text sind ganze Sätze (Übersetzung: ein String je Satz).
const KINDS = [
  { kind: 'kill', w: 3, make: (r, rng) => { const t = pick(rng, r.enemies); return { target: [t], count: 12 + Math.floor(rng() * 7) }; } },
  { kind: 'gather', w: 2, make: (r, rng) => ({ target: [pick(rng, r.mats)], count: 6 + Math.floor(rng() * 5) }) },
  { kind: 'elite', w: 1, make: (r, rng) => ({ target: [pick(rng, r.elites)], count: 1 }) },
  { kind: 'champion', w: 1, make: () => ({ target: ['*'], count: 1 }) },
  { kind: 'boss', w: 1, make: (r, rng) => ({ target: [pick(rng, r.bosses)], count: 1 }) },
  { kind: 'trial', w: 1, only: (r) => r.trials, make: (_r, rng) => ({ target: ['*'], count: 1, tier: 3 + Math.floor(rng() * 6) }) },
];

// Die 3 Aufträge eines Tages für eine Stufe. Deterministisch; nie zweimal dieselbe Art.
export function boardOffers(day, level) {
  const region = boardRegion(level);
  const rng = mulberry(day * 7919 + BOARD_REGIONS.indexOf(region) * 104729 + 17);
  const pool = KINDS.filter((k) => !k.only || k.only(region));
  const out = [];
  while (out.length < BOARD_OFFERS && pool.length) {
    const total = pool.reduce((n, k) => n + k.w, 0);
    let x = rng() * total, i = 0;
    for (; i < pool.length - 1; i++) { x -= pool[i].w; if (x < 0) break; }
    const k = pool.splice(i, 1)[0];
    out.push({ id: `${day}_${out.length}`, kind: k.kind, region: region.id, ...k.make(region, rng) });
  }
  return out;
}

// Belohnung je Auftrag. Bis 39 Erfahrung (klein, das Brett ist eine Zugabe), ab 40 mehr Gold und Material.
export function offerRewards(offer, level) {
  const cap = level >= 40;
  const heavy = offer.kind === 'boss' || offer.kind === 'trial' || offer.kind === 'champion' ? 1.6 : offer.kind === 'elite' ? 1.3 : 1;
  const gold = Math.round((20 + level * 9) * heavy * (cap ? 2.5 : 1));
  const region = BOARD_REGIONS.find((r) => r.id === offer.region) ?? boardRegion(level);
  return { xp: cap ? 0 : Math.round(questXp(level, 0.06) * heavy), gold, items: cap ? [{ itemId: region.mats[0], qty: 3 }] : [] };
}

// Wochentruhe: Gold, Material der Region und ein Ausrüstungsteil (grün, 30 % blau) über loot.js (gewürfelt im Command).
export function weekChest(level) {
  const region = boardRegion(level);
  return { gold: Math.round(150 + level * 60), mats: region.mats.map((itemId) => ({ itemId, qty: 4 })), gear: { ilvl: level, rare: 0.3 } };
}

// Anzeigetexte: je String ein Satz (Übersetzung), note = optionaler zweiter Satz
export function offerText(offer, content) {
  const name = (id) => content.find('enemy', id)?.name ?? content.find('item', id)?.name ?? id;
  const t = offer.target[0];
  switch (offer.kind) {
    case 'kill': return { title: `Jagd: ${name(t)}`, text: `Erlege ${offer.count} Gegner der Art ${name(t)}.` };
    case 'gather': return { title: `Lieferung: ${name(t)}`, text: `Sammle ${offer.count}× ${name(t)} von Gegnern.` };
    case 'elite': return { title: `Kopfgeld: ${name(t)}`, text: `Ziel: ${name(t)}.`, note: 'Eliten tragen einen goldenen Namen.' };
    case 'champion': return { title: 'Champion-Jagd', text: 'Besiege einen Champion.', note: 'Champions erkennst du am leuchtenden Rand und am Beinamen „Champion“.' };
    case 'boss': return { title: `Bossjagd: ${name(t)}`, text: `Ziel: ${name(t)}.`, note: 'Der Boss wartet am Ende des Dungeons.' };
    case 'trial': return { title: `Glutprüfung ${offer.tier}`, text: `Schließe eine Glutprüfung ab Stufe ${offer.tier} ab.` };
    default: return { title: 'Auftrag', text: '' };
  }
}

// ---------------------------------------------------------------- Slice und Commands
// board = { day, level, week, taken: { offerId: n }, done: [offerId], weekDone, weekClaimed }
// level = Spielerstufe am Tagesbeginn: Wer am selben Tag aufsteigt, behält seine Aufträge (neue Region erst morgen).
export function registerBoardState(state, h) {
  const auth = { authoritative: true };
  const def = h.def;
  const fresh = (now) => ({ day: boardDay(now), level: 1, week: boardWeek(now), taken: {}, done: [], weekDone: 0, weekClaimed: false });
  state.defineSlice('board', {
    create: () => fresh(Date.now()),
    deserialize: (raw) => ({
      day: raw.day | 0, level: Math.max(1, Math.min(40, raw.level | 0 || 1)), week: raw.week | 0,
      taken: Object.fromEntries(Object.entries(raw.taken ?? {}).filter(([, v]) => Number.isFinite(v) && v >= 0)),
      done: Array.isArray(raw.done) ? raw.done.filter((x) => typeof x === 'string') : [],
      weekDone: Math.max(0, raw.weekDone | 0), weekClaimed: !!raw.weekClaimed,
    }),
  });

  // Neuer Tag / neue Woche: alte Aufträge verfallen. Nie rückwärts.
  const roll = (s, now) => {
    const b = s.get('board'), d = boardDay(now), w = boardWeek(now);
    if (w > b.week) { b.week = w; b.weekDone = 0; b.weekClaimed = false; }
    if (d > b.day) { b.day = d; b.taken = {}; b.done = []; b.level = s.get('progress').level; }
    else if (!Object.keys(b.taken).length && !b.done.length) b.level = s.get('progress').level;  // noch nichts angefangen: Stufe nachziehen
    return b;
  };
  h.boardRoll = roll;

  def('board:sync', (s, { now = Date.now() } = {}) => { roll(s, now); return { ok: true }; });
  def('board:accept', (s, { offerId, now = Date.now() }, ctx) => {
    const b = roll(s, now);
    const offer = boardOffers(b.day, b.level).find((o) => o.id === offerId);
    if (!offer || b.done.includes(offerId) || b.taken[offerId] != null) return { ok: false };
    b.taken[offerId] = 0;
    ctx.bus.emit('board:changed', { offerId });
    return { ok: true };
  });
  def('board:claim', (s, { offerId, now = Date.now() }, ctx) => {
    const b = roll(s, now), level = s.get('progress').level;
    const offer = boardOffers(b.day, b.level).find((o) => o.id === offerId);
    if (!offer || b.done.includes(offerId) || (b.taken[offerId] ?? -1) < offer.count) return { ok: false, reason: 'notReady' };
    const r = offerRewards(offer, level);
    delete b.taken[offerId];
    b.done.push(offerId);
    b.weekDone++;
    h.addGold(s, ctx, r.gold, `board:${offer.kind}`);
    for (const it of r.items) h.addItem(s, ctx, it.itemId, it.qty, 'quest', { overflow: true });
    if (r.xp) h.grantXp(s, ctx, r.xp, `board:${offer.kind}`);
    ctx.bus.emit('board:changed', { offerId, claimed: true });
    return { ok: true, rewards: r };
  }, auth);
  def('board:claimWeek', (s, { now = Date.now() }, ctx) => {
    const b = roll(s, now), level = s.get('progress').level;
    if (b.weekClaimed || b.weekDone < WEEK_GOAL) return { ok: false, reason: 'notReady' };
    const chest = weekChest(level);
    b.weekClaimed = true;
    h.addGold(s, ctx, chest.gold, 'board:week');
    for (const m of chest.mats) h.addItem(s, ctx, m.itemId, m.qty, 'quest', { overflow: true });
    const gear = h.pickEquipment({ level, rarity: h.rng() < chest.gear.rare ? 'rare' : 'uncommon', classId: s.slices.character?.classId ?? null, rng: h.rng });
    if (gear) h.addItem(s, ctx, gear, 1, 'quest', { overflow: true });
    ctx.bus.emit('board:changed', { week: true });
    return { ok: true, gold: chest.gold, gear };
  }, auth);
}

// Fortschritt (aus logic.js): kill / gather / champion / boss / trial. Zählt nur angenommene Aufträge.
export function boardProgress(s, ctx, event) {
  const b = s.slices.board;
  if (!b || !Object.keys(b.taken).length) return;
  const offers = boardOffers(b.day, b.level);
  for (const o of offers) {
    if (b.taken[o.id] == null || b.taken[o.id] >= o.count) continue;
    let n = 0;
    if (event.kind === 'kill') {
      if ((o.kind === 'kill' || o.kind === 'elite') && o.target.includes(event.type)) n = 1;
      else if (o.kind === 'champion' && event.champion) n = 1;
      else if (o.kind === 'boss' && event.boss && o.target.includes(event.bossId)) n = 1;
    } else if (event.kind === 'gather' && o.kind === 'gather' && o.target.includes(event.itemId)) n = event.qty;
    else if (event.kind === 'trial' && o.kind === 'trial' && event.tier >= (o.tier ?? 1)) n = 1;
    if (!n) continue;
    b.taken[o.id] = Math.min(o.count, b.taken[o.id] + n);
    ctx.bus.emit('board:progress', { offerId: o.id, current: b.taken[o.id], required: o.count });
    if (b.taken[o.id] >= o.count) ctx.bus.emit(EV.UI_TOAST, { text: 'Auftrag erfüllt. Hol dir die Belohnung am Auftragsbrett.', kind: 'quest', icon: 'letter' });
  }
}

// Leucht-Hinweis für B: gibt es etwas zu tun (offen, fertig oder Wochentruhe)?
export function boardHasOffers(state, now = Date.now()) {
  const b = state.slices.board;
  if (!b) return false;
  if (boardDay(now) > b.day) return true;
  if (b.weekDone >= WEEK_GOAL && !b.weekClaimed && boardWeek(now) === b.week) return true;
  return boardOffers(b.day, b.level).some((o) => !b.done.includes(o.id) && (b.taken[o.id] == null || b.taken[o.id] >= o.count));
}
