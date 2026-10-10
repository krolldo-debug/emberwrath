import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { CONFIG } from '../config.js';
import { iconUrl, rarityRgb } from '../gfx/Icons.js';
import { fmtNum } from '../i18n/index.js';

// Belohnungs-Ebene im HUD (Belohnungsrunde 10.10., Thread D):
//  - Kill-Serie: Zähler links, der mit jedem Kill anschwillt; an Schwellen ein Titel
//    mit eigenem Klang. Rein darstellend, gibt keine Belohnung (kein Command).
//  - Fliegende Beute: Gold fliegt als Münzen zur Goldanzeige, Gegenstände fliegen
//    zum Inventarknopf; das Ziel federt beim Ankommen, das Gold zählt hoch (Hud).
//  - EP-Leiste glüht bei jedem EP-Gewinn, das Stufenabzeichen federt beim Aufstieg.
//  - Fähigkeit wieder bereit: Glanz über den Knopf und ein leises „Ting“.
// Liest nur Ereignisse und Zustand, schreibt nie.

const STREAK_WINDOW = 4;    // Sekunden bis zum nächsten Kill, sonst endet die Serie (Ablaufbalken)
const STREAK_LOUD = 1.4;    // so lange steht die Serie nach dem Auftritt/einer neuen Stufe groß da, dann dezent
const STREAK_SHOW = 3;      // ab so vielen Kills ist der Zähler sichtbar
const STREAK_TIERS = [
  { at: 5, name: 'Blutrausch' },
  { at: 10, name: 'Gemetzel' },
  { at: 20, name: 'Entfesselt' },
  { at: 35, name: 'Unaufhaltsam' },
  { at: 50, name: 'Glutzorn' },
];
// Gold und Gegenstände fliegen nur, wenn sie in der Welt gewonnen wurden (nicht beim Händler)
const FLY_GOLD = /^(loot|quest:|board:|trial:|sell:auto)/;
const FLY_ITEM = new Set(['loot', 'quest', 'trial', 'board', 'boss']);
const MAX_FLYING = 18;
const BIG_BANNERS = new Set(['level', 'boss', 'legendary']);
// Abstand, den .rw-streak ohnehin oben hat (--hud-gap), damit --rw-top nur den Zusatz enthält
const el0 = (hud) => parseFloat(getComputedStyle(hud.viewEl).getPropertyValue('--hud-gap')) || 0;

export class Rewards {
  constructor(session, hud) {
    this.s = session;
    this.hud = hud;
    this.t = 0;
    this.flying = 0;
    this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    // Kill-Serie
    this.streak = { n: 0, left: 0, tier: 0 };
    this.sNum = h('span.rw-streak-n');
    this.sLabel = h('span.rw-streak-label', 'Serie');
    this.sBar = h('i.rw-streak-bar');
    this.sTitle = h('div.rw-streak-title');
    this.streakEl = h('div.rw-streak', { 'aria-hidden': 'true' }, this.sTitle, h('div.rw-streak-row', this.sNum, this.sLabel), h('div.rw-streak-track', this.sBar));
    hud.viewEl.append(this.streakEl);

    // Ebene für fliegende Münzen und Gegenstände (über allem, ohne Eingaben)
    this.layer = h('div.rw-fly');
    hud.root.append(this.layer);

    this.cds = [0, 0, 0, 0];
    this.loud = 0;
    this.layoutT = 0; this.top = -1;
    this.#listen();
  }

  #listen() {
    const bus = this.s.bus, c = this.s.content;
    bus.on(EV.ENEMY_KILLED, () => this.#kill());
    bus.on(EV.PLAYER_DIED, () => this.#endStreak());
    bus.on(EV.ZONE_LEAVE, () => this.#endStreak(true));
    bus.on(EV.XP_GAINED, (e) => { if (e.amount > 0) this.#restart(this.hud.xpWrap, 'rw-gain'); });
    bus.on(EV.LEVEL_UP, () => {
      this.#restart(this.hud.pLevel, 'rw-lvl');
      this.#restart(this.hud.xpWrap, 'rw-full');
    });
    bus.on(EV.GOLD_CHANGED, (e) => {
      if (!(e.delta > 0) || !FLY_GOLD.test(e.source ?? '')) return;
      this.#flyGold(e.delta);
    });
    bus.on(EV.ITEM_ADDED, (e) => {
      if (!FLY_ITEM.has(String(e.source ?? '').split(':')[0])) return;
      const d = c.find('item', e.itemId);
      if (!d) return;
      this.#flyItem(d);
      // Legendäre Beute bekommt einen eigenen Moment (Banner-Warteschlange im Hud, nach dem Stufenaufstieg)
      if (d.rarity === 'legendary') bus.emit(EV.UI_BANNER, { title: d.name, sub: 'Legendäre Beute', color: '#ff9a2a', kind: 'legendary' });
    });
  }

  // ---------------------------------------------------------------- Kill-Serie
  #kill() {
    const st = this.streak;
    st.n += 1;
    st.left = STREAK_WINDOW;
    if (st.n < STREAK_SHOW) return;
    this.sNum.textContent = fmtNum(st.n);
    this.streakEl.classList.remove('end');
    if (!this.streakEl.classList.contains('show')) { this.streakEl.classList.add('show'); this.loud = STREAK_LOUD; }
    this.#restart(this.sNum, 'bump');
    // Neue Stufe erreicht (oder nach Glutzorn alle 25 Kills erneut)
    const next = STREAK_TIERS[st.tier];
    const again = st.tier >= STREAK_TIERS.length && st.n % 25 === 0;
    if ((next && st.n >= next.at) || again) {
      if (next) st.tier += 1;
      const tier = Math.min(st.tier, STREAK_TIERS.length);
      this.streakEl.dataset.tier = String(tier);
      this.sTitle.textContent = STREAK_TIERS[tier - 1].name;
      this.#restart(this.sTitle, 'pop');
      this.#restart(this.streakEl, 'surge');
      this.loud = STREAK_LOUD + 0.4;
      this.s.sfx.play?.('streak', { tier });
    }
  }

  #endStreak(silent = false) {
    const st = this.streak;
    if (st.n >= STREAK_SHOW && !silent) this.streakEl.classList.add('end');
    else this.streakEl.classList.remove('show', 'end');
    st.n = 0; st.left = 0; st.tier = 0; this.loud = 0;
    delete this.streakEl.dataset.tier;
    this.sTitle.textContent = '';
  }

  // ---------------------------------------------------------------- Fliegende Beute
  // Bildschirmposition des Helden (Mitte des Körpers) relativ zur Flug-Ebene
  #heroPoint() {
    const hero = this.s.world?.hero, cam = this.s.camera;
    if (!hero || !cam) return null;
    const v = this.hud.viewEl.getBoundingClientRect(), l = this.layer.getBoundingClientRect();
    if (!v.width) return null;
    const x = v.left + ((hero.x - cam.rx) / CONFIG.viewWidth) * v.width;
    const y = v.top + ((hero.y - (hero.bodyHeight ?? 16) * 0.7 - cam.ry) / CONFIG.viewHeight) * v.height;
    return { x: x - l.left, y: y - l.top };
  }

  #targetPoint(el) {
    if (!el || !el.offsetParent) return null;
    const r = el.getBoundingClientRect(), l = this.layer.getBoundingClientRect();
    return { x: r.left + r.width / 2 - l.left, y: r.top + r.height / 2 - l.top };
  }

  // Inventarziel: Desktop der Inventarknopf, Touch der (zugeklappte) Menüknopf
  #bagEl() {
    const inv = this.hud.menuList.querySelector('[data-action="inventory"]');
    return inv?.offsetParent && !this.s.input.usingTouch ? inv : this.hud.menuToggle;
  }

  #flyGold(amount) {
    const goldEl = this.hud.goldEl;
    const n = Math.max(3, Math.min(8, Math.round(Math.log2(amount + 1))));
    const arrive = this.#fly({ src: iconUrl('gold'), target: goldEl, count: n, size: 18, stagger: 0.05, spread: 26, glow: [255, 200, 80] });
    if (arrive == null) return;
    this.hud.goldHold = this.hud.t + arrive;   // Goldanzeige zählt erst hoch, wenn die Münzen ankommen
    setTimeout(() => { this.#restart(goldEl, 'rw-bump'); this.s.sfx.play?.('coinStack', { count: Math.min(5, n) }); }, arrive * 1000);
  }

  #flyItem(def) {
    const target = this.#bagEl();
    const r = def.rarity ?? 'common';
    const glow = r === 'common' ? null : rarityRgb(r);
    const arrive = this.#fly({ src: iconUrl(def.icon), target, count: 1, size: r === 'epic' || r === 'legendary' ? 30 : 24, glow, spread: 34 });
    if (arrive == null) return;
    setTimeout(() => this.#restart(target, 'rw-bump'), arrive * 1000);
  }

  // Startet count fliegende Bilder vom Helden zum Ziel. Rückgabe: Sekunden bis zur Ankunft des letzten (oder null)
  #fly({ src, target, count = 1, size = 20, stagger = 0.08, spread = 30, glow = null }) {
    if (this.reduced || this.s.paused) return null;
    const from = this.#heroPoint(), to = this.#targetPoint(target);
    if (!from || !to || this.flying >= MAX_FLYING) return null;
    const dur = 0.62;
    let last = 0;
    for (let i = 0; i < count && this.flying < MAX_FLYING; i++) {
      const delay = i * stagger;
      last = delay + dur;
      const img = h('img.rw-fly-item', { src, alt: '', width: size, height: size, draggable: 'false' });
      if (glow) img.style.filter = `drop-shadow(0 0 4px rgb(${glow.join(',')})) drop-shadow(0 0 1px #000)`;
      img.style.left = `${from.x - size / 2}px`;
      img.style.top = `${from.y - size / 2}px`;
      this.layer.append(img);
      this.flying++;
      // Bogen: erst seitlich hochspringen, dann beschleunigt ins Ziel
      const ox = (Math.random() - 0.5) * spread * 2, oy = -spread * (0.7 + Math.random() * 0.6);
      const dx = to.x - from.x, dy = to.y - from.y;
      const anim = img.animate([
        { transform: 'translate(0, 0) scale(0.4)', opacity: 0, easing: 'cubic-bezier(.2,.8,.3,1)' },
        { transform: `translate(${ox}px, ${oy}px) scale(1.15)`, opacity: 1, offset: 0.32, easing: 'cubic-bezier(.55,0,.85,.35)' },
        { transform: `translate(${dx}px, ${dy}px) scale(0.55)`, opacity: 0.9 },
      ], { duration: dur * 1000, delay: delay * 1000, fill: 'both' });
      const done = () => { img.remove(); this.flying--; };
      anim.onfinish = done; anim.oncancel = done;
    }
    return last;
  }

  // ---------------------------------------------------------------- Helfer
  // CSS-Animation neu starten (Klasse entfernen, Layout erzwingen, wieder setzen)
  #restart(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  update(dt) {
    this.t += dt;
    const st = this.streak, paused = this.s.paused;
    if (st.n > 0 && !paused) {
      st.left -= dt;
      if (st.left <= 0) this.#endStreak();
      else if (st.n >= STREAK_SHOW) this.sBar.style.transform = `scaleX(${(st.left / STREAK_WINDOW).toFixed(3)})`;
    }
    // nach dem großen Auftritt kleiner und ruhiger; der Titel blendet aus
    if (this.loud > 0 && !paused) this.loud -= dt;
    this.streakEl.classList.toggle('calm', st.n >= STREAK_SHOW && !(this.loud > 0));

    // Platz unter Boss-, Champion- und Prüfungsleiste (oben mittig) – nur selten messen
    if ((this.layoutT -= dt) <= 0) {
      this.layoutT = 0.1;
      const hud = this.hud;
      let top = 0;
      for (const el of [hud.bossEl, hud.champEl, hud.trialEl]) if (el.classList.contains('show')) top = Math.max(top, el.offsetTop + el.offsetHeight + 6);
      // Freischalt-Karte (ui/Unlocks.js) und große Ansagen (Stufe, Sieg, legendär) haben oben mittig Vorrang:
      // so lange tritt die Serie zurück (zählt weiter)
      const hide = !!(this.hud.unlocks?.showing || this.hud.unlocks?.fading) || BIG_BANNERS.has(this.hud.banner?.kind);
      this.streakEl.classList.toggle('yield', hide);
      if (top !== this.top) { this.top = top; this.streakEl.style.setProperty('--rw-top', `${Math.max(0, top - el0(hud))}px`); }
    }

    // Fähigkeit wieder bereit (nur längere Abklingzeiten, sonst wäre es Dauergeklingel)
    const hero = this.s.world?.hero;
    const abil = hero?.abilities ?? [];
    for (let i = 0; i < 4; i++) {
      const a = abil[i], cd = a && !a.locked ? a.cdLeft ?? 0 : 0;
      if (this.cds[i] > 0 && cd <= 0 && (a?.cooldown ?? 0) >= 2.5 && !hero.dead) {
        const slot = this.hud.slots.find((sl) => sl.action === `skill${i + 1}`);
        if (slot) this.#restart(slot.el, 'rw-ready');
        this.s.sfx.play?.('ready');
      }
      this.cds[i] = cd;
    }
  }

  dispose() { this.streakEl.remove(); this.layer.remove(); }
}
