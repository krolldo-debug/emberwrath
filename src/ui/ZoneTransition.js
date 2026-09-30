import { h } from '../core/dom.js';
import { EV } from '../core/events.js';

// Zonenübergang / Ladebildschirm (Thread D): Beim Betreten einer Zone liegt kurz
// eine Karte über dem Bild – Zonenname, Untertitel, empfohlene Stufe, ein Tipp –
// und blendet dann aus. Beim Verlassen blendet sie sofort ein, damit der
// Wechsel nicht springt. Rein darstellend, liest nur Zonendaten.
const TIPS = [
  'Tippe oder klicke auf die Minimap (Taste M), um die Karte der Zone zu öffnen.',
  'Antippen einer Quest im Tracker zeigt dir den Weg am Boden.',
  'Ausweichen (K / Stiefel-Knopf) macht dich kurz unverwundbar.',
  'Seltenheit erkennst du am Rahmen: grün, blau, lila, orange.',
  'Heiltränke (H) haben eine kurze Abklingzeit – nicht zu spät trinken.',
  'Gegner mit rotem Warnkreis holen gleich zum Schlag aus.',
  'Dein Spielstand wird lokal auf diesem Gerät gespeichert.',
  'Elite-Gegner (orange auf der Karte) lassen bessere Beute fallen.',
];

export class ZoneTransition {
  constructor(session) {
    this.s = session;
    this.title = h('div.zt-title');
    this.sub = h('div.zt-sub');
    this.meta = h('div.zt-meta');
    this.tip = h('div.zt-tip');
    this.el = h('div.zt', { 'aria-live': 'polite' },
      h('div.zt-embers', Array.from({ length: 14 }, (_, i) => h('i', { style: `--i:${i}` }))),
      h('div.zt-card', h('div.zt-crest'), this.title, this.sub, this.meta, h('div.zt-line', h('i')), this.tip));
    session.game.ui.root.append(this.el);
    this.hideAt = 0;
    this.t = 0;
    this.tipIndex = Math.floor(Math.random() * TIPS.length);
    const bus = session.bus;
    bus.on(EV.ZONE_LEAVE, () => this.#cover());
    bus.on(EV.ZONE_ENTER, () => this.#show());
  }

  #cover() {
    this.el.classList.add('show', 'instant');
    this.hideAt = Infinity;
  }

  #show() {
    const def = this.s.zone?.def ?? {};
    this.title.textContent = def.name ?? 'Unbekanntes Gebiet';
    this.sub.textContent = def.subtitle ?? '';
    const bits = [];
    if (def.recommendedLevel) bits.push(`Empfohlene Stufe ${def.recommendedLevel}`);
    const subSaysInstance = /instanz/i.test(def.subtitle ?? '');
    if (def.instanced) bits.push(subSaysInstance ? `max. ${def.maxPlayers ?? 1} Spieler` : `Lokale Instanz · max. ${def.maxPlayers ?? 1} Spieler`);
    else bits.push('Lokales Gebiet · nur du');
    this.meta.textContent = bits.join(' · ');
    this.tip.textContent = `Tipp: ${TIPS[this.tipIndex++ % TIPS.length]}`;
    this.el.classList.toggle('dungeon', !!def.instanced || def.kind === 'dungeon');
    this.el.classList.add('show');
    // Ein Frame später die "instant"-Klasse lösen, damit das Ausblenden animiert
    requestAnimationFrame(() => this.el.classList.remove('instant'));
    this.hideAt = this.t + 1.5;
  }

  update(dt) {
    this.t += dt;
    if (this.t >= this.hideAt) { this.el.classList.remove('show'); this.hideAt = Infinity; }
  }

  dispose() { this.el.remove(); }
}
