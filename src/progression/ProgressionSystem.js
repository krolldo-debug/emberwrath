import { EV } from '../core/events.js';
import { PixelCanvas, outlineCanvas } from '../gfx/PixelCanvas.js';
import { findPotionSlot, npcMarker } from './selectors.js';
import { LootDrop } from './LootDrop.js';
import { TRIAL_EV } from './endgame.js';
import { TRIAL_ZONE } from './trials.js';
import { serverNow, clockReady, syncClock } from './clock.js';
import { boardDay } from './board.js';
import { fmtNum } from '../i18n/index.js';

// Tagesbelohnung: Abstand der Ansage nach dem Spielstart (s) und Prüfintervall für den Tageswechsel (s)
const DAILY_DELAY = 4;
const DAILY_CHECK = 30;

export const POTION_COOLDOWN = 1.5;
// Im Kampf (Treffer gegeben oder erhalten in den letzten COMBAT_LINGER s) wirkt der nächste Trank
// erst nach 10 s: sonst lässt sich jeder Bosskampf mit gekauften Tränken aussitzen (Messung B 08.10.).
export const POTION_COOLDOWN_COMBAT = 10;
export const COMBAT_LINGER = 5;

// Sitzungssystem von Thread C (order 10). Übersetzt Spielereignisse in Commands:
//   enemy:killed    -> progress:kill (XP, Quests) + loot:roll (Beute in die Welt)
//   boss:defeated / area:reached / zone:enter -> quest:event
//   object:interact kind 'chest' -> loot:roll ; andere Arten (shrine, item …) -> quest:event 'interact'
//   npc:interact    -> quest:event 'talk' + Questdialog öffnen
//   Aktion 'potion' -> bester Heiltrank (inventory:use)
// Wendet Wirkungen am Helden an (Heilen, Ressource, volle HP nach Levelaufstieg) und zeichnet
// Questmarkierungen (! / ?) über NPC-Entities, die ein Feld `npcId` tragen.
export class ProgressionSystem {
  // opts.lastRareSpawns() -> zuletzt an Thread B ausgegebene seltene Gegner [{ zoneId, name, … }]
  constructor(session, opts = {}) {
    this.s = session;
    this.potionCd = 0;
    this.potionCdMax = POTION_COOLDOWN;
    this.combatT = 0;
    this.pendingLevelHeal = false;
    this.toastCd = 0;
    this.trialTime = 0;
    const { bus } = session;
    const commit = (t, p) => session.state.commit(t, p);

    bus.on('hit', (e) => {
      const hero = this.hero;
      if (hero && e && (e.target === hero || e.attacker === hero) && e.attacker !== e.target) this.combatT = COMBAT_LINGER;
    });

    bus.on(EV.ENEMY_KILLED, (e) => {
      const bossId = e.bossId ?? (e.isBoss ? e.type : undefined);
      commit('progress:kill', { type: e.type, level: e.level, isBoss: e.isBoss, bossId, elite: e.elite, summoned: e.summoned, trialTime: this.trialTime, rareId: e.rareId, champion: e.champion ?? null, now: serverNow() });
      if (!e.summoned) this.#rollLoot({ source: 'kill', id: e.type, level: e.level, elite: e.elite, isBoss: e.isBoss, bossId, family: e.family, rareId: e.rareId, champion: !!e.champion }, e.x, e.y);
    });
    bus.on(EV.BOSS_DEFEATED, (e) => { commit('quest:event', { kind: 'boss', target: e.bossId }); commit('quest:bossReward', { bossId: e.bossId }); });
    bus.on(EV.AREA_REACHED, (e) => commit('quest:event', { kind: 'reach', target: e.areaId }));
    bus.on(EV.ZONE_ENTER, (e) => commit('quest:event', { kind: 'reach', target: `zone:${e.zoneId}` }));
    bus.on(EV.ZONE_LEAVE, () => commit('loot:reset'));
    // Auftragsbrett (B: Objekt quest_board)
    bus.on(EV.BOARD_OPEN ?? 'board:open', (e) => { commit('board:sync', { now: serverNow() }); commit('daily:sync', { now: serverNow() }); session.panels.open('board', { zoneId: e.zoneId }); });
    // Eskorte/Verteidigen (B): { kind: 'escort'|'defend'|'escortFailed'|'defendFailed', target }
    bus.on(EV.QUEST_OBJECTIVE ?? 'quest:objective', (e) => commit('quest:event', { kind: e.kind, target: e.target }));
    bus.on(EV.OBJECT_INTERACT, (e) => {
      if (e.kind === 'chest') this.#rollLoot({ source: 'chest', id: e.objectId, level: e.level }, e.x, e.y);
      else if (e.kind === 'bank') session.panels.open('bank');
      else if (e.kind === 'trial') session.panels.open('trials');
      else commit('quest:event', { kind: 'interact', target: e.objectId });
    });
    // Glutprüfungen: Reise hinein, Zeit, Tod, Verlassen
    bus.on(TRIAL_EV.STARTED, () => {
      this.trialTime = 0;
      if (session.content.find('zone', TRIAL_ZONE)) queueMicrotask(() => bus.emit(EV.ZONE_TRAVEL, { zoneId: TRIAL_ZONE, spawnId: 'start' }));
      else {
        // Zone von Thread B fehlt noch: Lauf nicht hängen lassen
        queueMicrotask(() => commit('trial:leave', {}));
        bus.emit(EV.UI_TOAST, { text: 'Die Glutprüfung lässt sich gerade nicht betreten. Versuch es gleich noch einmal.', kind: 'warn' });
      }
    });
    bus.on(EV.PLAYER_DIED, () => { if (this.#trialActive()) commit('trial:fail', { reason: 'death' }); });
    bus.on(EV.ZONE_ENTER, (e) => {
      const run = session.state.slices.trials?.run;
      if (run && e.zoneId !== TRIAL_ZONE) {
        if (run.phase === 'clear' || run.phase === 'boss') commit('trial:fail', { reason: 'left' });
        commit('trial:leave', {});
      }
    });
    bus.on(TRIAL_EV.COMPLETED, (e) => bus.emit(EV.UI_BANNER, { title: `Glutprüfung ${e.tier} bestanden`, sub: `${Math.floor(e.time / 60)}:${String(e.time % 60).padStart(2, '0')} · ${e.rewards.gold.toLocaleString('de-DE')} Gold · ${e.rewards.shards} Glutsplitter`, color: '#ffb040' }));
    bus.on(TRIAL_EV.FAILED, (e) => bus.emit(EV.UI_BANNER, { title: `Glutprüfung ${e.tier} gescheitert`, sub: e.reason === 'time' ? 'Die Zeit ist abgelaufen' : e.reason === 'death' ? 'Du bist gefallen' : 'Du hast die Esse verlassen', color: '#ff6a5a' }));
    // Seltene Weltgegner: Hinweis beim Betreten, Banner beim Sieg
    bus.on(EV.ZONE_ENTER, (e) => {
      const here = (opts.lastRareSpawns?.() ?? []).filter((r) => r.zoneId === e.zoneId);
      if (here.length) bus.emit(EV.UI_TOAST, { text: `Etwas Seltenes streift hier umher: ${here.map((r) => r.name).join(', ')}`, kind: 'warn', icon: 'charm_skull' });
    });
    bus.on('rare:killed', (e) => bus.emit(EV.UI_BANNER, { title: `${e.name} ist gefallen`, sub: 'Seltener Gegner besiegt', color: '#c8a0ff' }));
    // Auto-Verkauf beim Aufsammeln: gesammelt als ein Toast
    this.autoSold = null;
    bus.on('item:autoSold', (e) => {
      this.autoSold ??= { n: 0, gold: 0, t: 1.2 };
      this.autoSold.n += e.qty; this.autoSold.gold += e.gold; this.autoSold.t = 1.2;
    });
    bus.on(EV.NPC_INTERACT, (e) => {
      commit('quest:event', { kind: 'talk', target: e.npcId });
      session.panels.open('questDialog', { npcId: e.npcId });
    });
    bus.on(EV.ITEM_USED, (e) => { this.#applyEffect(e.effect); if (e.effect?.heal) commit('daily:mark', { potion: true }); });
    // Tagesbelohnung, erster Sieg, Wochenherausforderung (daily.js). Höchstens eine Ansage am Tag.
    this.dailyT = DAILY_DELAY;
    this.dailyNew = false;
    syncClock();
    bus.on(EV.GAME_STARTED, (e) => { this.dailyNew = !!e?.isNew; this.dailyT = DAILY_DELAY; });
    bus.on(EV.BOSS_ENGAGED, (e) => commit('daily:engage', { now: serverNow(), bossId: e.bossId }));
    bus.on(TRIAL_EV.STARTED, () => commit('daily:engage', { now: serverNow() }));
    bus.on(EV.PLAYER_DIED, () => commit('daily:mark', { died: true }));
    bus.on('daily:reward', (e) => bus.emit(EV.UI_BANNER, { title: 'Tagesbelohnung', sub: e.gold ? `Tag ${e.streak} von 7 · ${fmtNum(e.gold)} Gold` : `Tag ${e.streak} von 7`, color: '#ffb040', kind: 'daily' }));
    bus.on('daily:firstWin', (r) => bus.emit(EV.UI_TOAST, { text: r.xp ? `Erster Sieg des Tages: ${fmtNum(r.xp)} EP und ${fmtNum(r.gold)} Gold extra` : `Erster Sieg des Tages: ${fmtNum(r.gold)} Gold und 2 Glutsplitter extra`, kind: 'loot', icon: 'gold' }));
    bus.on(EV.LEVEL_UP, () => { this.pendingLevelHeal = true; });
  }

  get hero() { return this.s.world?.hero; }

  // Neuer Spieltag (Serverzeit): Tagesbelohnung vergeben. Wartet, bis die Serverzeit bekannt ist.
  #daily(dt, session) {
    if ((this.dailyT -= dt) > 0) return;
    this.dailyT = DAILY_CHECK;
    if (!clockReady()) { syncClock(); this.dailyT = 5; return; }
    const d = session.state.slices.daily, now = serverNow();
    if (!d || boardDay(now) <= d.day) return;
    // Ruhiger Moment für die Ansage: kein Fenster offen, kein Einstiegshinweis sichtbar, Held am Leben
    if (this.hero?.dead || session.panels?.openId || globalThis.document?.querySelector('.ef-guide.show')) { this.dailyT = 2; return; }
    session.state.commit('daily:login', { now, isNew: this.dailyNew });
    this.dailyNew = false;
  }

  #trialActive() {
    const run = this.s.state.slices.trials?.run;
    return !!run && (run.phase === 'clear' || run.phase === 'boss') && this.s.state.slices.world?.zoneId === TRIAL_ZONE;
  }

  #rollLoot(payload, x, y) {
    const r = this.s.state.commit('loot:roll', { ...payload, x, y });
    for (const d of r?.drops ?? []) if (d.dropId) this.s.world.spawn(new LootDrop(this.s, d, x, y - 4));
  }

  #applyEffect(effect) {
    const hero = this.hero;
    if (!hero || !effect) return;
    if (effect.heal) {
      const amount = Math.min(effect.heal, hero.maxHp - hero.hp);
      hero.hp += amount;
      this.s.bus.emit('heal', { actor: hero, amount: Math.round(amount) });
    }
    if (effect.resource && hero.maxResource && hero.resourceType !== 'rage') {
      hero.resource = Math.min(hero.maxResource, (hero.resource ?? 0) + effect.resource);
    }
    if (effect.heal) this.potionCd = this.potionCdMax = this.combatT > 0 ? POTION_COOLDOWN_COMBAT : POTION_COOLDOWN;
  }

  #toast(text, kind = 'warn') {
    if (this.toastCd > 0) return;
    this.toastCd = 1.2;
    this.s.bus.emit(EV.UI_TOAST, { text, kind });
  }

  // Heiltrank per Taste H / Touch-Knopf
  usePotion() {
    const hero = this.hero, st = this.s.state;
    if (!hero || hero.dead || this.potionCd > 0) return false;
    if (hero.riding ?? st.slices.character?.mounts?.riding) { this.#toast('Nicht beritten'); return false; }
    if (hero.hp >= hero.maxHp) { this.#toast('Du bist unverletzt'); return false; }
    const slot = findPotionSlot(st, this.s.content, hero.maxHp - hero.hp);
    if (slot < 0) { this.#toast('Keine Heiltränke im Inventar'); return false; }
    return st.commit('inventory:use', { slot }).ok;
  }

  update(dt, session) {
    this.toastCd = Math.max(0, this.toastCd - dt);
    if (this.autoSold && (this.autoSold.t -= dt) <= 0) {
      const { n, gold } = this.autoSold;
      this.autoSold = null;
      this.s.bus.emit(EV.UI_TOAST, { text: `Automatisch verkauft: ${n} ${n === 1 ? 'Teil' : 'Teile'} (+${gold.toLocaleString('de-DE')} Gold)`, kind: 'loot', icon: 'gold' });
    }
    this.#daily(dt, session);
    const hero = this.hero;
    if (this.pendingLevelHeal && hero && !hero.dead) { hero.hp = hero.maxHp; this.pendingLevelHeal = false; }
    if (session.paused) return;
    this.potionCd = Math.max(0, this.potionCd - dt);
    this.combatT = Math.max(0, this.combatT - dt);
    if (this.#trialActive()) {
      this.trialTime += dt;
      const run = session.state.slices.trials.run;
      if (this.trialTime >= run.timeLimit) session.state.commit('trial:fail', { reason: 'time' });
    }
    if (hero) { hero.potionCd = this.potionCd; hero.potionCooldown = this.potionCdMax; }
    if (session.input.pressed('potion')) this.usePotion();
  }

  draw(ctx, session) {
    const w = session.world, cam = session.camera;
    if (!w || !cam) return;
    const t = session.time;
    for (const list of [w.entities, w.actors]) {
      for (const e of list ?? []) {
        if (!e.npcId || e.removed) continue;
        const m = npcMarker(session.state, session.content, e.npcId);
        if (!m) continue;
        const img = MARKERS[m]();
        const top = e.markerY ?? (e.bodyHeight ?? 24) + 8;
        const bob = Math.round(Math.sin(t * 3 + e.x * 0.1) * 1.5);
        ctx.drawImage(img, Math.round(e.x - cam.rx - img.width / 2), Math.round(e.y - cam.ry - top - img.height + bob));
      }
    }
  }
}

// Questmarkierungen als kleine Pixel-Glyphen mit Umriss (einmal erzeugt).
const GLYPHS = {
  '!': ['.##.', '.##.', '.##.', '.##.', '.##.', '....', '.##.', '.##.'],
  '?': ['.###.', '##.##', '...##', '..##.', '.##..', '.....', '.##..', '.##..'],
};
function glyph(ch, main, light) {
  let c;
  return () => {
    if (c) return c;
    const rows = GLYPHS[ch], p = new PixelCanvas(rows[0].length, rows.length);
    rows.forEach((r, y) => [...r].forEach((k, x) => { if (k === '#') p.px(x, y, y < 2 ? light : main); }));
    c = outlineCanvas(p.canvas);
    return c;
  };
}
const MARKERS = {
  available: glyph('!', '#f0b030', '#fff0a8'),
  repeatable: glyph('!', '#4a9aff', '#bfe0ff'),
  ready: glyph('?', '#f0b030', '#fff0a8'),
  active: glyph('?', '#8a8398', '#c8c0d4'),
};
