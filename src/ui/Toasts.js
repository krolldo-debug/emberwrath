import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { iconUrl, itemIconEl } from '../gfx/Icons.js';

// Meldungen am Bildschirmrand: Beute, Gold, Quest-Fortschritt, Hinweise.
// Quellen: EV.UI_TOAST ({ text, kind, icon? }) von allen Bereichen sowie
// automatisch aus den Fortschritts-Events von Thread C (ITEM_ADDED, GOLD_CHANGED,
// QUEST_*). Thread C muss dafür keine eigenen Toasts senden.
// Runde 5: kompakt und einzeilig am linken Rand, kurz sichtbar. Gewöhnliche und
// ungewöhnliche Beute kurz hintereinander wird zu einer Zeile „4 Gegenstände“
// zusammengefasst; ab selten bekommt jeder Fund eine eigene Zeile.
const MAX = 4;
const LIFE = { loot: 2.2, gold: 2.0, quest: 3.2, info: 3.0, warn: 3.4, rare: 3.0, epic: 4.2, legendary: 5.0 };
const BATCH_WINDOW = 2.4;
const BATCH_ICONS = 4;
const RARITY_LABEL = { epic: 'Episch', legendary: 'Legendär' };
const UNLOCK_TEXT = /^Neue (Fähigkeit|Passive|Talentreihe):/;
const QUIET_SOURCES = new Set(['equip', 'unequip', 'move', 'swap', 'load', 'sort']);
const life = (it) => LIFE[it.life] ?? LIFE[it.kind] ?? LIFE.info;

export class Toasts {
  constructor(session) {
    this.s = session;
    this.root = h('div.ef-toasts', { 'aria-live': 'polite' });
    session.game.ui.toasts.replaceChildren(this.root);
    this.items = [];
    this.gold = null;
    const bus = session.bus, c = session.content;
    const qTitle = (id) => c.find('quest', id)?.title ?? c.find('quest', id)?.name ?? 'Quest';

    // Erfolge zeigt ui/Unlocks.js als eigene Karte; C's Begleit-Toast („Erfolg: …“) nicht doppeln
    let lastAch = null;
    bus.on(EV.ACHIEVEMENT_UNLOCKED, (e) => { lastAch = e.name; });
    bus.on(EV.UI_TOAST, (e) => {
      if (lastAch && typeof e.text === 'string' && e.text.startsWith(`Erfolg: ${lastAch}`)) { lastAch = null; return; }
      // Freischaltungen zeigt ui/Unlocks.js als Karte; A's Begleit-Toasts nicht doppeln
      if (typeof e.text === 'string' && UNLOCK_TEXT.test(e.text)) return;
      this.push(e.text, e.kind ?? 'info', e.icon);
    });
    bus.on(EV.ITEM_ADDED, (e) => {
      if (QUIET_SOURCES.has(e.source)) return;
      const d = c.find('item', e.itemId);
      if (!d) return;
      this.#loot(d, e.qty ?? 1);
    });
    bus.on(EV.GOLD_CHANGED, (e) => {
      if (!(e.delta > 0)) return;
      // Kurz aufeinanderfolgende Goldfunde zu einer Meldung zusammenfassen
      if (this.gold && this.gold.age < 1.5 && this.items.includes(this.gold)) {
        this.gold.sum += e.delta; this.gold.age = 0; this.gold.el.classList.remove('out');
        this.gold.el.querySelector('.ef-toast-text').textContent = `+${this.gold.sum.toLocaleString('de-DE')} Gold`;
        return;
      }
      this.push(`+${e.delta.toLocaleString('de-DE')} Gold`, 'gold', 'gold');
      this.gold = this.items[this.items.length - 1]; this.gold.sum = e.delta;
    });
    bus.on(EV.QUEST_ACCEPTED, (e) => this.push(`Neue Quest: ${qTitle(e.questId)}`, 'quest', 'scroll'));
    bus.on(EV.QUEST_PROGRESS, (e) => {
      const def = c.find('quest', e.questId);
      const obj = def?.objectives?.find((o) => o.id === e.objectiveId);
      this.push(`${obj?.text ?? qTitle(e.questId)}: ${e.current}/${e.required}`, 'quest');
    });
    bus.on(EV.QUEST_READY, (e) => {
      const def = c.find('quest', e.questId);
      const npc = c.find('npc', def?.turnIn ?? def?.giver)?.name;
      this.push(`${qTitle(e.questId)} erfüllt${npc ? ` – zurück zu ${npc}` : ''}`, 'quest', 'scroll');
    });
  }

  // Beute: selten und besser einzeln (mit animiertem Icon), sonst gesammelt
  #loot(d, qty) {
    const r = d.rarity ?? 'common';
    const high = r === 'rare' || r === 'epic' || r === 'legendary';
    const batch = !high && this.items.find((it) => it.batch && it.age < BATCH_WINDOW && !it.el.classList.contains('out'));
    if (batch) {
      batch.n += qty; batch.age = 0;
      if (batch.icons.childElementCount < BATCH_ICONS) batch.icons.append(itemIconEl({ ...d, name: null }, 16));
      batch.el.querySelector('.ef-toast-text').replaceChildren(h('span.r-uncommon', `${batch.n} Gegenstände`));
      return;
    }
    const el = this.push('', `loot.r-${r}`);
    const it = this.items[this.items.length - 1];
    it.life = high ? r : 'loot';
    const icons = h('span.ef-toast-icons', itemIconEl({ ...d, name: null }, high && r !== 'rare' ? 22 : 16));
    el.prepend(icons);
    el.querySelector('.ef-toast-text').replaceChildren(
      RARITY_LABEL[r] ? h('span.ef-toast-rarity', RARITY_LABEL[r]) : '',
      h(`span.r-${r}`, d.name), qty > 1 ? ` × ${qty}` : '');
    if (!high) { it.batch = true; it.n = qty; it.icons = icons; }
    if (r === 'epic' || r === 'legendary') this.s.sfx?.play?.('rareLoot', { tier: r });
  }

  push(text, kind = 'info', icon = null) {
    // Gleiche Meldung kurz hintereinander: zusammenfassen (× 2, × 3 …) statt stapeln
    if (text) {
      const same = this.items.find((it) => it.text === text && it.full === kind && it.age < life(it));
      if (same) {
        same.n = (same.n ?? 1) + 1; same.age = 0; same.el.classList.remove('out');
        same.el.querySelector('.ef-toast-text').textContent = `${text} × ${same.n}`;
        return same.el;
      }
    }
    const el = h(`div.ef-toast.k-${kind}`,
      icon ? h('img.ef-icon', { src: iconUrl(icon), alt: '', width: 16, height: 16 }) : null,
      h('span.ef-toast-text', text));
    this.root.append(el);
    const item = { el, age: 0, text, full: kind, kind: kind.split('.')[0] };
    this.items.push(item);
    while (this.items.length > MAX) this.items.shift().el.remove();
    return el;
  }

  update(dt) {
    for (const it of this.items) {
      it.age += dt;
      if (it.age > life(it) && !it.el.classList.contains('out')) it.el.classList.add('out');
    }
    this.items = this.items.filter((it) => { if (it.age > life(it) + 0.3) { it.el.remove(); return false; } return true; });
  }

  dispose() { this.root.remove(); }
}
