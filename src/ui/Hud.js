import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { iconUrl, abilityIcon } from '../gfx/Icons.js';
import { xpToNext } from '../progression/xp.js';
import { trackedQuestId, questFilterHere } from '../progression/selectors.js';
import { talentPointsTotal, spentPoints } from '../character/talents.js';
import { tr, fmtNum } from '../i18n/index.js';
import { DeathScreen } from './DeathScreen.js';

// HTML-HUD der Spielsitzung (liest nur Zustand, Held und Inhalte; schreibt nie).
// Aufbau:
//   .hud-view   – deckungsgleich über dem Spielbild (--view-w/--view-h):
//                 Boss-Leiste, Banner, Interaktionshinweis, Todesbildschirm
//   .hud-frame  – Spielerrahmen, Zone/Gold, Questverfolgung, EP-Leiste; über dem
//                 Bild, im Hochformat (Handy) oben/unten im freien Bereich
//   .hud-bar    – Aktionsleiste: Desktop unten mittig nur Q R T G + Trank (Angriff und
//                 Ausweichen über Maus/Tasten), Touch unten rechts mit Angriff und
//                 Ausweichen als zwei großen Hauptknöpfen
//   .hud-menu   – Inventar, Charakter, Quests, Talente, Menü (Touch: ein Knopf, klappt auf)
//   .hud-stick  – virtueller Stick (nur Touch, Position aus input.touch)
// Werte werden nur bei Änderung ins DOM geschrieben (kein Layout-Flattern).

const RES_NAMES = { mana: 'Mana', rage: 'Wut', energy: 'Energie' };

// Kleiner Helfer: Text/Stil nur setzen, wenn sich etwas ändert.
// tr() schon hier: sonst unterscheidet sich der übersetzte Text jedes Bild vom deutschen und wird neu gesetzt.
function setText(el, v) { v = tr(String(v)); if (el.textContent !== v) el.textContent = v; }
function setVar(el, name, v) { const s = String(v); if (el._v?.[name] !== s) { (el._v ??= {})[name] = s; el.style.setProperty(name, s); } }
function toggle(el, cls, on) { if (el.classList.contains(cls) !== !!on) el.classList.toggle(cls, !!on); }
const num = (v) => Math.round(v ?? 0).toLocaleString();
function frac(a, b) { return b > 0 ? Math.max(0, Math.min(1, a / b)) : 0; }

function bar(cls, label) {
  const fill = h('div.hud-bar-fill'), lag = h('div.hud-bar-lag'), text = h('span.hud-bar-text');
  const el = h(`div.hud-meter.${cls}`, { role: 'meter', 'aria-label': label }, lag, fill, text);
  return { el, fill, lag, text, shown: 1, lagv: 1 };
}

const SKILL_INDEX = { skill1: 0, skill2: 1, skill3: 2, skill4: 3 };
// Rang der Banner in der Warteschlange; Freischalt-Karten (Unlocks) warten immer auf Banner,
// ab Rang 2 räumt ein Banner eine gerade gezeigte Karte (sie kommt danach wieder)
const BANNER_PRIO = { level: 3, boss: 2, legendary: 2, trial: 2, quest: 1, info: 1 };

export class Hud {
  constructor(session) {
    this.s = session;
    this.game = session.game;
    this.input = session.input;
    this.t = 0;
    this.bannerQueue = [];
    this.banner = null;
    this.prompt = null;
    this.boss = null;
    this.savedFlash = 0;
    this.#build();
    this.#listen();
  }

  // ---------------------------------------------------------------- Aufbau
  #build() {
    const el = (sel, ...c) => h(sel, ...c);

    // Spielerrahmen
    this.portrait = el('canvas.hud-portrait', { width: 32, height: 32 });
    this.pName = el('div.hud-name');
    this.pLevel = el('div.hud-level');
    this.hp = bar('hp', 'Leben');
    this.res = bar('res', 'Ressource');
    this.sta = bar('sta', 'Ausdauer');
    this.xp = bar('xp', 'Erfahrung');
    const player = el('div.hud-player.ef-panel-lite',
      el('div.hud-portrait-wrap', this.portrait, this.pLevel),
      el('div.hud-player-main', this.pName, this.hp.el, this.res.el, this.sta.el),
    );

    // Zone, Instanz, Gold, Speichern
    this.zName = el('div.hud-zone-name');
    this.zSub = el('div.hud-zone-sub');
    this.gold = el('span.hud-gold-val', '0');
    this.saved = el('div.hud-saved', 'Gespeichert');
    const zone = el('div.hud-zone',
      this.zName, this.zSub,
      this.goldEl = el('div.hud-gold', {
        title: 'Gold',
        onclick: () => { if (this.game.shop?.visible) { this.s.sfx.play?.('ui'); this.s.panels?.open?.('goldshop'); } },
      }, el('img.ef-icon', { src: iconUrl('gold'), alt: '', width: 20, height: 20 }), this.gold),
      this.saved,
    );

    // Questverfolgung
    this.tracker = el('div.hud-tracker', { 'aria-live': 'polite' });
    this.trackerKey = '';

    // Boss
    this.bossName = el('div.hud-boss-name');
    this.bossBar = bar('boss', 'Boss');
    this.bossEl = el('div.hud-boss', { style: `--boss-skull: url(${iconUrl('relic')})` }, this.bossName, this.bossBar.el);
    // Champion (Vertrag B): enemy.champion { affixes, labels, color }, enemy.displayName
    this.champName = el('div.hud-champ-name');
    this.champAff = el('div.hud-champ-aff');
    this.champBar = bar('champ', 'Champion');
    this.champEl = el('div.hud-champ', this.champName, this.champBar.el, this.champAff);
    this.champ = null;

    // Banner, Hinweis, Tod
    this.bTitle = el('div.hud-banner-title');
    this.bSub = el('div.hud-banner-sub');
    this.bannerEl = el('div.hud-banner', this.bTitle, this.bSub);
    this.promptEl = el('div.hud-prompt', el('kbd.hud-key', 'E'), el('span'));
    // Tod: eigene Tafel bzw. Leiste (ui/DeathScreen.js), die Welt läuft dahinter weiter
    this.death = new DeathScreen(this.s);
    this.deadEl = this.death.el;
    this.xpWrap = el('div.hud-xp-wrap', this.xp.el);

    // .hud-frame: Info-Elemente (im Hochformat am Bildschirmrand statt über dem Bild)
    // .hud-view:  immer deckungsgleich mit dem Spielbild (Boss, Banner, Hinweis, Tod)
    this.frame = el('div.hud-frame', player, zone, this.tracker, this.xpWrap);
    // Glutprüfung (Endgame von C): Stufe, Timer, Fortschritt – nur während eines Laufs sichtbar
    this.trialTitle = el('span.hud-trial-title');
    this.trialTime = el('span.hud-trial-time');
    this.trialBar = bar('trial', 'Fortschritt der Prüfung');
    this.trialAff = el('div.hud-trial-aff');
    this.trialEl = el('div.hud-trial', el('div.hud-trial-head', this.trialTitle, this.trialTime), this.trialBar.el, this.trialAff);
    // Wirkbalken (Aufsitzen, §12.6): liest hero.mountCast { t, dur } von Thread A
    this.castFill = el('div.hud-cast-fill');
    this.castText = el('span.hud-cast-text', 'Aufsitzen');
    this.castEl = el('div.hud-cast', el('div.hud-cast-bar', this.castFill), this.castText);
    this.viewEl = el('div.hud-view', this.bossEl, this.champEl, this.trialEl, this.bannerEl, this.promptEl, this.castEl, this.deadEl);

    // Aktionsleiste
    this.slots = [
      this.#slot('attack', 'J', 'Angriff', 'sword', true),
      this.#slot('dodge', 'K', 'Ausweichen', 'ui_dodge'),
      this.#slot('skill1', 'Q', 'Fähigkeit 1', null),
      this.#slot('skill2', 'R', 'Fähigkeit 2', null),
      this.#slot('skill3', 'T', 'Fähigkeit 3', null),
      this.#slot('skill4', 'G', 'Fähigkeit 4', null),
      this.#slot('potion', 'H', 'Heiltrank', 'potion_hp'),
      this.#slot('mount', 'V', 'Reittier', 'ui_mount'),
      this.#slot('interact', 'E', 'Interagieren', 'ui_interact'),
    ];
    this.barEl = el('div.hud-actions', this.slots.map((s) => s.el));

    // Menüknöpfe
    const menuBtn = (action, key, label, icon) => el('button.hud-menu-btn', {
      type: 'button', title: `${label} (${key})`, 'aria-label': label, dataset: { action },
      onclick: (e) => { e.currentTarget.blur(); this.s.sfx.play?.('ui'); this.#openMenu(false); this.#tap(action); },
    }, el('img.ef-icon.hud-menu-icon', { src: iconUrl(icon), alt: '', width: 30, height: 30, draggable: 'false' }),
      el('span.hud-menu-label', label), el('kbd.hud-key', key));
    // Touch: ein einzelner Menüknopf klappt die Liste auf (spart Platz auf dem Handy);
    // Desktop: die Liste steht offen als Knopfreihe (.hud-menu-list mit display: contents).
    this.menuList = el('div.hud-menu-list',
      menuBtn('inventory', 'I', 'Inventar', 'ui_bag'),
      menuBtn('character', 'C', 'Charakter', 'ui_character'),
      menuBtn('quests', 'L', 'Quests', 'ui_quests'),
      menuBtn('talents', 'U', 'Talente', 'ui_talents'),
      menuBtn('pause', 'Esc', 'Menü', 'ui_menu'),
    );
    this.menuToggle = el('button.hud-menu-toggle', {
      type: 'button', 'aria-label': 'Menü öffnen', 'aria-expanded': 'false',
      onclick: () => { this.s.sfx.play?.('ui'); this.#openMenu(!this.menuOpen); },
    }, el('span.hud-burger', el('i'), el('i'), el('i')), el('span.hud-dot'));
    this.talentBtn = this.menuList.querySelector('[data-action="talents"]');
    this.talentBtn.append(el('span.hud-dot'));
    this.menuEl = el('div.hud-menu', this.menuToggle, this.menuList);
    this.menuOpen = false;
    this.menuAge = 0;
    this.talentCheck = 0;
    // Tippen außerhalb schließt die aufgeklappte Liste
    this.outside = (e) => { if (this.menuOpen && !this.menuEl.contains(e.target)) this.#openMenu(false); };
    document.addEventListener('pointerdown', this.outside, true);

    // Stick
    this.stickKnob = el('div.hud-stick-knob');
    this.stickEl = el('div.hud-stick', this.stickKnob);
    this.stickHint = el('div.hud-stick-hint', 'Hier ziehen zum Laufen');

    this.root = el('div.ef-hud', this.viewEl, this.frame, this.barEl, this.menuEl, this.stickEl, this.stickHint);
    this.game.ui.hud.replaceChildren(this.root);
    this.#refreshStatic();
  }

  #slot(action, key, label, icon, big = false) {
    const img = h('img.ef-icon', { alt: '', width: 32, height: 32, draggable: 'false' });
    if (icon) img.src = iconUrl(icon);
    const txt = h('span.hud-slot-txt');
    const count = h('span.hud-slot-count');
    const lock = h('span.hud-lock', h('i.hud-lock-icon'), h('span.hud-lock-lvl'));
    const btn = h(`button.hud-slot${big ? '.big' : ''}`, { type: 'button', 'aria-label': label, title: `${label} (${key})`, dataset: { action } },
      img, txt, h('span.hud-cd'), count, lock, h('kbd.hud-key', key));
    // Halten statt Klicken: Angriff/Ausweichen reagieren sofort und dauerhaft.
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture?.(e.pointerId);
      btn.classList.add('down');
      // Trank direkt über Thread C (wie Taste H), ohne zusätzlichen Tastendruck
      if (action === 'potion' && this.game.progression?.usePotion) { this.game.progression.usePotion(); return; }
      this.input.press(action);
    });
    const up = () => { if (action !== 'potion' || !this.game.progression?.usePotion) this.input.release(action); btn.classList.remove('down'); };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    return { action, key, el: btn, img, txt, count, lock, lockLvl: lock.lastChild, icon, label };
  }

  #openMenu(on) {
    this.menuOpen = !!on; this.menuAge = 0;
    toggle(this.menuEl, 'open', this.menuOpen);
    this.menuToggle.setAttribute('aria-expanded', String(this.menuOpen));
    this.menuToggle.setAttribute('aria-label', this.menuOpen ? 'Menü schließen' : 'Menü öffnen');
  }

  // Freie Talentpunkte (Thread A: Stufe − 1 Punkte gesamt): Punkt am Talente- und am Menüknopf
  #updateMenu(dt) {
    if (this.menuOpen) {
      this.menuAge += dt;
      if (this.menuAge > 6 || this.s.panels?.openId) this.#openMenu(false);
    }
    this.talentCheck -= dt;
    if (this.talentCheck > 0) return;
    this.talentCheck = 0.5;
    const sl = this.s.state.slices;
    let free = 0;
    try { free = talentPointsTotal(sl.progress?.level ?? 1) - spentPoints(sl.character?.talents ?? {}); } catch { free = 0; }
    toggle(this.menuEl, 'has-talent', free > 0);
  }

  #tap(action) {
    this.input.press(action);
    setTimeout(() => this.input.release(action), 60);
  }

  // ---------------------------------------------------------------- Events
  #listen() {
    const bus = this.s.bus;
    bus.on(EV.UI_BANNER, (e) => this.#queueBanner(e.title, e.sub ?? '', e.color, e.kind ?? 'info'));
    bus.on(EV.UI_PROMPT, (e) => { this.prompt = e && e.text ? e : null; });
    bus.on(EV.ZONE_ENTER, () => {
      const z = this.s.zone;
      this.#refreshStatic();
      // Zonenname zeigt die Übergangskarte (ZoneTransition) – kein zweites Banner
      this.boss = null;
      this.prompt = null;
    });
    bus.on(EV.LEVEL_UP, (e) => { this.#queueBanner(`Stufe ${e.level}`, 'Deine Werte sind gestiegen', '#ffd66a', 'level'); this.xpLevelFlash = 0.2; this.#refreshStatic(); });
    bus.on('trial:started', (e) => this.#queueBanner(`Glutprüfung ${e?.tier ?? ''}`.trim(), 'Säubere die Instanz, bevor die Zeit abläuft', '#ff9a4a', 'trial'));
    bus.on('trial:boss', () => this.#queueBanner('Der Wächter erscheint', 'Besiege ihn, um die Prüfung abzuschließen', '#ff5a40', 'trial'));
    bus.on('trial:completed', (e) => this.#queueBanner('Prüfung bestanden!', e?.tier ? `Stufe ${e.tier} gemeistert` : 'Belohnung erhalten', '#ffd66a', 'trial'));
    bus.on('trial:failed', () => this.#queueBanner('Prüfung gescheitert', 'Die Zeit ist abgelaufen – versuch es erneut', '#c04040', 'trial'));
    bus.on(EV.QUEST_COMPLETED, (e) => this.#queueBanner('Quest abgeschlossen', this.#questTitle(e.questId), '#9cff8a', 'quest'));
    bus.on(EV.BOSS_ENGAGED, (e) => { this.boss = { id: e.bossId, actor: null }; });
    bus.on(EV.BOSS_RESET, () => { this.boss = null; });
    bus.on(EV.BOSS_DEFEATED, () => { this.#queueBanner('Sieg!', `${this.boss?.actor?.def?.name ?? 'Der Boss'} ist besiegt`, '#ffd66a', 'boss'); this.boss = null; });
    bus.on(EV.GAME_SAVED, () => { this.savedFlash = 1.6; });
    bus.on(EV.ITEM_EQUIPPED, () => this.#refreshStatic());
  }

  #instanceText() {
    const z = this.s.zone;
    if (!z) return '';
    return z.def?.instanced ? `Dungeon-Instanz · bis ${z.def.maxPlayers ?? 5} Spieler` : 'Offenes Gebiet';
  }

  #questTitle(id) { return this.s.content.find('quest', id)?.title ?? this.s.content.find('quest', id)?.name ?? ''; }

  // Für Unlocks: solange ein Banner läuft oder wartet, hält die Freischalt-Karte zurück
  get bannerBusy() { return !!this.banner || this.bannerQueue.length > 0; }

  #queueBanner(title, sub, color, kind = 'info') {
    // Gleichartige Banner ersetzen sich (z. B. zwei Zonenwechsel kurz nacheinander).
    this.bannerQueue = this.bannerQueue.filter((b) => b.kind !== kind);
    // Große Ansagen nacheinander, wichtigste zuerst: Stufe > Boss/Legendär/Prüfung > Rest
    const prio = BANNER_PRIO[kind] ?? 1;
    const at = this.bannerQueue.findIndex((b) => (BANNER_PRIO[b.kind] ?? 1) < prio);
    this.bannerQueue.splice(at < 0 ? this.bannerQueue.length : at, 0, { title, sub, color, kind });
  }

  // Werte, die sich selten ändern (Name, Klasse, Zone, Porträt).
  #refreshStatic() {
    const st = this.s.state.slices, c = this.s.content;
    const ch = st.character ?? {};
    const race = c.find('race', ch.raceId)?.name, cls = c.find('class', ch.classId)?.name;
    setText(this.pName, ch.name ?? 'Held');
    this.pName.title = [race, cls].filter(Boolean).join(' · ');
    const z = this.s.zone;
    setText(this.zName, z?.def?.name ?? '');
    setText(this.zSub, z ? (z.def?.instanced ? 'Dungeon-Instanz' : 'Offenes Gebiet') : '');
    this.zSub.title = '';
    this.portraitDirty = true;
  }

  #drawPortrait(hero) {
    const frame = hero?.animator?.anims?.idle?.frames?.[0];
    const r = frame?.res ?? 1; // Texel je Weltpixel (§11.12): Porträt zeigt die volle Detailtiefe
    if (this.portrait.width !== 32 * r) { this.portrait.width = 32 * r; this.portrait.height = 32 * r; }
    const ctx = this.portrait.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.portrait.width, this.portrait.height);
    if (!frame) return;
    const img = frame.canvas;
    // Kopf und Oberkörper zentriert, 1:1-Texel
    const sx = Math.round(frame.ax - 16 * r), sy = Math.round(frame.ay - ((hero.bodyHeight ?? 16) + 14) * r);
    ctx.drawImage(img, sx, sy, 32 * r, 32 * r, 0, 0, 32 * r, 32 * r);
    this.portraitDirty = false;
  }

  // ---------------------------------------------------------------- Update
  update(dt) {
    this.t += dt;
    const s = this.s, hero = s.world?.hero;
    if (!hero) return;
    if (this.portraitDirty) this.#drawPortrait(hero);
    const touch = this.input.usingTouch;
    toggle(this.root, 'touch', touch);

    // Leben (mit nachlaufendem Schadensbalken), Ressource, Ausdauer
    this.#meter(this.hp, hero.hp, hero.maxHp, dt, `${Math.max(0, Math.ceil(hero.hp))} / ${Math.round(hero.maxHp)}`);
    const hasRes = (hero.maxResource ?? 0) > 0;
    toggle(this.res.el, 'hidden', !hasRes);
    if (hasRes) {
      this.res.el.dataset.kind = hero.resourceType ?? 'mana';
      this.#meter(this.res, hero.resource, hero.maxResource, dt, `${Math.floor(hero.resource)} ${RES_NAMES[hero.resourceType] ?? ''}`);
    }
    this.#meter(this.sta, hero.stamina ?? 0, hero.maxStamina ?? 100, dt, '');
    toggle(this.root, 'low-hp', !hero.dead && hero.hp / hero.maxHp < 0.3);

    // Stufe und Erfahrung
    // Erfahrung relativ zur aktuellen Stufe (progress.xp ist Gesamt-EP, siehe progression/README.md)
    const prog = s.state.slices.progress ?? { level: 1, xp: 0 };
    const xi = this.game.progression?.xpInfo?.() ?? { level: prog.level, into: prog.xp, need: xpToNext(prog.level), capped: false };
    setText(this.pLevel, xi.level ?? prog.level);
    const capped = xi.capped || !Number.isFinite(xi.need);
    this.#meter(this.xp, capped ? 1 : xi.into, capped ? 1 : xi.need, dt,
      capped ? `Stufe ${xi.level} · Höchststufe` : `Stufe ${xi.level} · ${num(xi.into)} / ${num(xi.need)} EP`);
    // Stufenaufstieg: Leiste kurz voll, dann von 0 neu füllen (statt rückwärts zu laufen)
    if (this.xpLevelFlash > 0) {
      this.xpLevelFlash -= dt;
      setVar(this.xp.fill, '--f', '1'); setVar(this.xp.lag, '--f', '1');
      this.xp.shown = 0; this.xp.lagv = 0;
      toggle(this.xpWrap, 'lvl-full', this.xpLevelFlash > 0);
    }

    // Gold: zählt sichtbar hoch (Rewards lässt Münzen zur Anzeige fliegen und hält das Hochzählen
    // bis zur Ankunft an: goldHold); Ausgaben springen sofort auf den neuen Wert
    const gold = s.state.slices.wallet?.gold ?? 0;
    if (this.goldShown == null || gold < this.goldShown) this.goldShown = gold;
    else if (gold > this.goldShown && this.t >= (this.goldHold ?? 0)) {
      this.goldShown = Math.min(gold, this.goldShown + Math.max(1, Math.ceil((gold - this.goldShown) * Math.min(1, dt * 4.5))));
    }
    toggle(this.goldEl, 'rolling', this.goldShown < gold && this.t >= (this.goldHold ?? 0));
    setText(this.gold, fmtNum(this.goldShown));
    toggle(this.goldEl, 'shop', !!this.game.shop?.visible);

    // Gespeichert-Anzeige
    this.savedFlash = Math.max(0, this.savedFlash - dt);
    toggle(this.saved, 'show', this.savedFlash > 0);

    this.#updateTracker();
    this.#updateBoss(dt);
    this.#updateChampion(dt, hero);
    this.#updateTrial(dt);
    this.#updateBanner(dt);
    this.#updatePrompt();
    this.#updateSlots(hero);
    this.#updateCast(hero);
    toggle(this.root, 'riding', !!this.game.character?.mounts?.()?.riding);
    this.#updateStick();
    this.#updateMenu(dt);

    this.death.update(hero);
  }

  #meter(m, v, max, dt, text) {
    const f = frac(v, max);
    if (!m.ready) { m.ready = true; m.shown = m.lagv = f; }
    m.shown += (f - m.shown) * Math.min(1, dt * 18);
    m.lagv = f < m.lagv ? Math.max(f, m.lagv - dt * 0.35) : f;
    setVar(m.fill, '--f', m.shown.toFixed(4));
    setVar(m.lag, '--f', m.lagv.toFixed(4));
    setText(m.text, text);
  }

  // Tracker: verfolgte Quest (quests.tracked, Thread C) steht oben und ist hervorgehoben.
  // Antippen/Klicken verfolgt eine Quest, erneutes Antippen hebt das Verfolgen auf
  // (Command 'quest:track'; der Pfad am Boden kommt von Thread B).
  // Im Dungeon nur Quests, die dort etwas zu erledigen haben (selectors.questFilterHere).
  #updateTracker() {
    const st = this.s.state.slices.quests, c = this.s.content;
    const active = st?.active ?? {};
    const chosen = st?.tracked ?? null;
    // Effektiv verfolgt = gewählte Quest, sonst C's Standard (erste Hauptquest) – derselbe Wert wie der Bodenpfad
    const tracked = st ? (trackedQuestId(this.s.state, c, { here: true }) ?? null) : null;
    const here = st ? questFilterHere(this.s.state, c) : null;
    const key = JSON.stringify(active) + '|' + chosen + '|' + tracked + '|' + (here ? this.s.state.slices.world?.zoneId : '');
    if (key === this.trackerKey) return;
    this.trackerKey = key;
    const canTrack = this.s.state.commands.has('quest:track');
    const ids = Object.keys(active).filter((id) => !here || here(id)).sort((a, b) => (b === tracked) - (a === tracked));
    const rows = [];
    for (const qid of ids) {
      const q = active[qid], def = c.find('quest', qid);
      if (!def) continue;
      const ready = q.status === 'ready';
      const objs = (def.objectives ?? []).map((o) => {
        const need = o.count ?? o.required ?? 1, have = Math.min(need, q.progress?.[o.id] ?? 0);
        const done = have >= need;
        return h(`li.hud-obj${done ? '.done' : ''}`, h('span.hud-obj-text', o.text ?? o.label ?? o.id), need > 1 ? h('span.hud-obj-n', `${have}/${need}`) : null);
      });
      const giver = c.find('npc', def.turnIn ?? def.giver)?.name;
      const isTracked = qid === tracked;
      const row = h(`div.hud-quest${ready ? '.ready' : ''}${isTracked ? '.tracked' : ''}`, {
        role: canTrack ? 'button' : null, tabindex: canTrack ? '0' : null,
        title: canTrack ? (qid === chosen ? 'Verfolgen beenden' : 'Quest verfolgen – der Weg wird am Boden angezeigt') : null,
        'aria-pressed': canTrack ? String(isTracked) : null,
      },
        h('div.hud-quest-title', def.title ?? def.name ?? qid),
        ready ? h('div.hud-quest-turnin', giver ? `Abgeben bei ${giver}` : 'Bereit zur Abgabe') : h('ul.hud-objs', objs),
      );
      if (canTrack) {
        const act = (e) => { e.preventDefault(); e.stopPropagation(); this.#track(qid === chosen ? null : qid); };
        row.addEventListener('click', act);
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') act(e); });
      }
      rows.push(row);
    }
    toggle(this.tracker, 'empty', rows.length === 0);
    const hint = canTrack && !chosen && rows.length > 1 ? h('div.hud-quest-hint', this.input.usingTouch ? 'Quest antippen: Weg anzeigen' : 'Quest anklicken: Weg anzeigen') : null;
    this.tracker.replaceChildren(...(rows.length ? [h('div.hud-tracker-head', 'Quests'), ...rows.slice(0, 4), hint] : []).filter(Boolean));
  }

  #track(questId) {
    try { this.s.state.commit('quest:track', { questId }); } catch (err) { console.warn(err); }
    this.s.sfx.play?.('ui');
  }

  #updateTrial(dt) {
    const info = this.game.progression?.trialInfo?.() ?? null;
    toggle(this.trialEl, 'show', !!info);
    if (!info) return;
    const phaseText = info.phase === 'boss' ? 'Wächter' : info.phase === 'done' ? 'Geschafft' : info.phase === 'failed' ? 'Gescheitert' : 'Säubern';
    setText(this.trialTitle, `${info.name ?? `Glutprüfung ${info.tier ?? ''}`} · ${phaseText}`);
    // Affixe (C: trialInfo().affixes) – Namen als Liste unter der Leiste
    const aff = (info.affixes ?? []).map((a) => (typeof a === 'string' ? a : a?.name)).filter(Boolean).join(' · ');
    setText(this.trialAff, aff);
    const tl = Math.max(0, info.timeLeft ?? 0);
    setText(this.trialTime, `${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, '0')}`);
    toggle(this.trialEl, 'hurry', tl > 0 && tl < 30 && info.phase !== 'done');
    toggle(this.trialEl, 'boss', info.phase === 'boss');
    const target = info.target || 1;
    this.#meter(this.trialBar, Math.min(info.value ?? 0, target), target, dt, `${Math.round(Math.min(1, (info.value ?? 0) / target) * 100)} %`);
  }

  #updateBoss(dt) {
    const b = this.boss;
    toggle(this.bossEl, 'show', !!b);
    if (!b) return;
    if (!b.actor || b.actor.removed) {
      b.actor = this.s.world.enemies.find((e) => !e.dead && (e.def?.bossId === b.id || e.bossId === b.id || e.type === b.id || (e.def?.boss && !b.id))) ?? null;
      if (!b.actor) return;
      setText(this.bossName, b.actor.def?.name ?? b.actor.name ?? 'Boss');
    }
    const a = b.actor;
    this.#meter(this.bossBar, Math.max(0, a.hp), a.maxHp, dt, `${Math.max(0, Math.ceil(a.hp))} / ${a.maxHp}`);
    toggle(this.bossEl, 'enraged', !!a.enraged || a.phase > 1);
  }

  // Nächster lebender Champion in Reichweite (angegriffen oder nah); Leiste blendet sich sonst aus
  #updateChampion(dt, hero) {
    const w = this.s.world;
    let best = null, bd = Infinity;
    if (w?.enemies && hero && !hero.dead) for (const e of w.enemies) {
      if (!e.champion || e.dead || e.removed) continue;
      const d = Math.hypot(e.x - hero.x, e.y - hero.y);
      const range = e.aggroed || e.hp < e.maxHp ? 300 : 170;
      if (d < range && d < bd) { best = e; bd = d; }
    }
    toggle(this.champEl, 'show', !!best);
    if (!best) return;
    if (best !== this.champ) {
      this.champ = best;
      this.champBar.ready = false;
      const c = best.champion;
      setText(this.champName, best.displayName ?? best.def?.name ?? 'Champion');
      setText(this.champAff, (c.labels ?? []).join(' · '));
      setVar(this.champEl, '--champ', c.color ?? '#ff8a3a');
    }
    this.#meter(this.champBar, Math.max(0, best.hp), best.maxHp, dt, '');
  }

  #updateBanner(dt) {
    if (!this.banner && this.bannerQueue.length && this.unlocks?.fading) return;
    if (!this.banner && this.bannerQueue.length && this.unlocks?.showing) {
      if ((BANNER_PRIO[this.bannerQueue[0].kind] ?? 1) >= 2) this.unlocks.yieldTo();
      else return;
    }
    if (!this.banner && this.bannerQueue.length) {
      const b = this.bannerQueue.shift();
      this.banner = { ...b, t: 0, dur: b.kind === 'zone' ? 3.2 : 2.6 };
      setText(this.bTitle, b.title);
      setText(this.bSub, b.sub);
      this.bannerEl.style.setProperty('--banner-color', b.color ?? '');
      this.bannerEl.dataset.kind = b.kind;
      this.bannerEl.classList.remove('show');
      void this.bannerEl.offsetWidth; // Animation neu starten
      this.bannerEl.classList.add('show');
    }
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.dur) { this.banner = null; this.bannerEl.classList.remove('show'); }
    }
  }

  #updatePrompt() {
    const p = this.prompt, s = this.s;
    toggle(this.promptEl, 'show', !!p && !s.paused);
    if (!p) return;
    setText(this.promptEl.lastChild, p.text);
    setText(this.promptEl.firstChild, this.input.usingTouch ? '✋' : 'E');
    if (p.x != null && s.camera) {
      const sx = (p.x - s.camera.rx) / 480, sy = (p.y - s.camera.ry) / 270;
      setVar(this.promptEl, '--px', (sx * 100).toFixed(2) + '%');
      setVar(this.promptEl, '--py', (sy * 100).toFixed(2) + '%');
    }
  }

  #updateSlots(hero) {
    const inv = this.s.state.slices.inventory, c = this.s.content;
    const abil = hero.abilities ?? [];
    for (const sl of this.slots) {
      let cd = 0, disabled = false, hidden = false;
      switch (sl.action) {
        case 'attack': {
          // Symbol der ausgerüsteten Waffe, sonst Klassensymbol, sonst Schwert
          const eq = inv?.equipment?.weapon;
          const wid = typeof eq === 'string' ? eq : eq?.itemId;
          const icon = c.find('item', wid)?.icon ?? c.find('class', this.s.state.slices.character?.classId)?.icon ?? 'sword';
          if (sl.icon !== icon) { sl.icon = icon; sl.img.src = iconUrl(icon); }
          break;
        }
        case 'dodge': {
          const cost = hero.dodgeCost ?? 30;
          disabled = (hero.stamina ?? 100) < cost;
          break;
        }
        case 'skill1': case 'skill2': case 'skill3': case 'skill4': {
          // hero.abilities[i] (Thread A): { id, name, cost, cooldown, cdLeft, desc, level, locked }
          const a = abil[SKILL_INDEX[sl.action]];
          hidden = !a;
          if (!a) break;
          const locked = !!a.locked;
          if (sl.abilityId !== a.id || sl.locked !== locked) {
            sl.abilityId = a.id; sl.locked = locked;
            const cost = a.cost ? ` · ${a.cost} ${RES_NAMES[hero.resourceType] ?? ''}` : '';
            sl.el.title = locked
              ? `${a.name} (${sl.key}) · ab Stufe ${a.level}${a.desc ? `\n${a.desc}` : ''}`
              : `${a.name} (${sl.key})${cost}${a.cooldown ? ` · ${a.cooldown} s` : ''}${a.desc ? `\n${a.desc}` : ''}`;
            sl.el.setAttribute('aria-label', locked ? `${a.name}, gesperrt bis Stufe ${a.level}` : a.name);
            sl.img.src = iconUrl(abilityIcon(a.id, a)); setText(sl.txt, '');
            sl.img.classList.add('hud-skill-emblem');
            setText(sl.lockLvl, `St. ${a.level ?? '?'}`);
            toggle(sl.el, 'locked', locked);
          }
          if (locked) break;
          cd = frac(a.cdLeft ?? 0, a.cooldown ?? 1);
          disabled = (a.cost ?? 0) > (hero.resource ?? 0);
          break;
        }
        case 'potion': {
          const pr = this.game.progression;
          let n = pr?.potionCount?.();
          if (n == null) {
            n = 0;
            for (const slot of inv?.slots ?? []) {
              const d = slot && c.find('item', slot.itemId);
              if (d?.type === 'consumable' && d.use?.heal) n += slot.qty ?? 1;
            }
          }
          setText(sl.count, n > 0 ? n : '');
          disabled = n === 0;
          cd = frac(hero.potionCd ?? 0, hero.potionCooldown ?? 1);
          break;
        }
        case 'mount': {
          // Erst sichtbar, wenn Reiten grundsätzlich erreichbar ist (ab Stufe 20, §12.6)
          const ch = this.game.character;
          const cm = ch?.canMount?.() ?? { ok: false, reason: 'level' };
          const riding = !!ch?.mounts?.()?.riding;
          hidden = cm.reason === 'level';
          disabled = !riding && !cm.ok;
          toggle(sl.el, 'active', riding);
          const tip = riding ? 'Absitzen (V)' : cm.ok ? 'Aufsitzen (V)' : `Reittier (V) · ${ch?.mountReasonText?.(cm.reason) ?? ''}`;
          if (sl.el.title !== tip) sl.el.title = tip;
          break;
        }
        case 'interact':
          hidden = !this.prompt;
          break;
      }
      toggle(sl.el, 'hidden', hidden);
      toggle(sl.el, 'disabled', disabled);
      setVar(sl.el, '--cd', cd.toFixed(3));
      toggle(sl.el, 'cooling', cd > 0);
    }
  }

  #updateCast(hero) {
    const c = hero.mountCast;
    const on = !!c && c.dur > 0 && !hero.dead;
    toggle(this.castEl, 'show', on);
    if (on) setVar(this.castFill, '--f', frac(c.t, c.dur).toFixed(3));
  }

  #slotGlyph(sl, text) { sl.img.removeAttribute('src'); setText(sl.txt, text); }

  #updateStick() {
    const t = this.input.touch, on = this.input.usingTouch && t.active;
    toggle(this.stickEl, 'show', on);
    if (on) this.stickUsed = true;
    toggle(this.stickHint, 'show', this.input.usingTouch && !t.active && !this.stickUsed && this.t < 20 && !this.s.paused);
    if (!on) return;
    const r = this.input.stickRadius;
    const dx = t.x - t.cx, dy = t.y - t.cy, l = Math.hypot(dx, dy), m = Math.min(l, r);
    const kx = l ? (dx / l) * m : 0, ky = l ? (dy / l) * m : 0;
    this.stickEl.style.transform = `translate(${t.cx}px, ${t.cy}px)`;
    this.stickKnob.style.transform = `translate(${kx}px, ${ky}px)`;
  }

  dispose() { document.removeEventListener('pointerdown', this.outside, true); this.root.remove(); }
}
