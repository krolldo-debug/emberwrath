import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { MenuScene } from './TitleScene.js';
import { HeroPortrait, focusIfDesktop, requireOnlineAccount } from './ui.js';
import { deriveStats } from '../character/stats.js';
import { validateName, cleanName, NAME_MAX } from '../character/index.js';
import { nameProblem } from '../net/names.js';
import { RACE_LOOK } from '../sprites/hero.js';
import { iconEl, abilityIcon } from '../gfx/Icons.js';
import { resolveGear } from '../character/gearLook.js';
import { pick } from '../core/math.js';
import { hairStylesFor, HAIR_STYLES } from '../character/cosmetics.js';

// Charaktererstellung: Volk, Klasse, Aussehen, Name -> neues Spiel auf Stufe 1.
// Alle Werte in der Vorschau kommen aus deriveStats() – also genau das, was
// der Held im Spiel bekommt.
const STAT_ROWS = [
  { key: 'maxHp', label: 'Leben', fmt: (v) => v },
  { key: 'power', label: 'Angriffskraft', fmt: (v) => Math.round(v) },
  { key: 'armor', label: 'Rüstung', fmt: (v) => v },
  { key: 'critChance', label: 'Kritisch', fmt: (v) => `${Math.round(v * 100)} %` },
  { key: 'moveSpeed', label: 'Tempo', fmt: (v) => v },
];

// Beispielausrüstung für die Vorschau (nur Anzeige, wird nicht vergeben)
const GEAR_TIERS = [
  { id: 'start', label: 'Start', title: 'So beginnt dein Held' },
  { id: 'rare', label: 'Selten', title: 'Mit seltener Beute' },
  { id: 'epic', label: 'Episch', title: 'Mit epischer Beute' },
  { id: 'legendary', label: 'Legendär', title: 'Mit legendärer Beute' },
];
const PREVIEW_GEAR = {
  warrior: {
    rare: { weapon: 'borderwatch_broadsword', chest: 'knight_plate', head: 'iron_helm', hands: 'borderwatch_gauntlets', feet: 'ironshod_boots' },
    epic: { weapon: 'ashmaw', chest: 'cryptlord_plate', head: 'horned_helm', hands: 'ember_grips', feet: 'ironshod_boots' },
    legendary: { weapon: 'crown_of_embers_blade', chest: 'cryptlord_plate', head: 'cryptlord_crown', hands: 'ember_grips', feet: 'ironshod_boots' },
  },
  rogue: {
    rare: { weapon: 'desert_kris', chest: 'shadow_leather', feet: 'ranger_boots' },
    epic: { weapon: 'shadowstrike', chest: 'nightstalker_coat', feet: 'shadowstep_boots' },
    legendary: { weapon: 'nightwhisper', chest: 'nightstalker_coat', hands: 'ember_grips', feet: 'shadowstep_boots' },
  },
  ranger: {
    rare: { weapon: 'recurve_bow', chest: 'hunter_leather', feet: 'ranger_boots' },
    epic: { weapon: 'moonsong', chest: 'nightstalker_coat', head: 'shadow_hood', feet: 'shadowstep_boots' },
    legendary: { weapon: 'starfall', chest: 'hunter_leather', head: 'wanderer_hood', hands: 'borderwatch_gauntlets', feet: 'shadowstep_boots' },
  },
  mage: {
    rare: { weapon: 'crystal_staff', chest: 'circle_robe', hands: 'silk_gloves' },
    epic: { weapon: 'ember_staff', chest: 'arcane_robe', hands: 'silk_gloves' },
    legendary: { weapon: 'worldstaff', chest: 'arcane_robe', head: 'cryptlord_crown', hands: 'silk_gloves' },
  },
};

const NAME_PROBLEM = {
  reserviert: 'Dieser Name ist für das Team reserviert. Bitte wähle einen anderen.',
  anstoessig: 'Dieser Name ist nicht erlaubt. Bitte wähle einen anderen.',
};

export class CharacterCreateScene extends MenuScene {
  enter(params = {}) {
    const g = this.game;
    this.from = params.from ?? 'characters';
    this.root = h('div.ef-screen.acc-screen');
    if (!requireOnlineAccount(g)) return;
    this.races = g.content.all('race');
    this.classes = g.content.all('class');
    this.sel = { raceId: this.races[0].id, classId: this.classes[0].id, variant: 0, hair: 0, name: '' };
    this.nameTouched = false;
    // Maxima für die Vergleichsbalken (alle Kombinationen auf Stufe 1)
    this.max = {};
    for (const r of this.races) for (const c of this.classes) {
      const s = deriveStats({ raceId: r.id, classId: c.id, level: 1 }, g.content);
      for (const row of STAT_ROWS) this.max[row.key] = Math.max(this.max[row.key] ?? 0, s[row.key]);
    }
    this.#build();
    this.#refresh();
  }

  back() { this.game.scenes.go('characters'); }

  update(dt) {
    super.update(dt);
    this.preview?.update(dt);
    for (const p of this.minis ?? []) p.update(dt);
  }

  #build() {
    const g = this.game;
    this.minis = [];
    const option = (kind, def, extra) => {
      const mini = new HeroPortrait({ raceId: kind === 'race' ? def.id : this.sel.raceId, classId: kind === 'class' ? def.id : this.sel.classId, scale: 1, glow: true, backdrop: false });
      mini.kind = kind; mini.defId = def.id;
      this.minis.push(mini);
      const btn = h('button.acc-option', { type: 'button', 'aria-pressed': 'false', dataset: { kind, id: def.id }, onclick: () => this.#choose(kind, def.id) },
        h('span.acc-option-art', mini.canvas),
        h('span.acc-option-text',
          h('strong', extra ? h('span.acc-option-icon', extra) : null, def.name),
          h('small', def.tagline)));
      return btn;
    };
    this.raceBtns = this.races.map((r) => option('race', r));
    this.classBtns = this.classes.map((c) => option('class', c, iconEl(c.icon, 16)));

    this.preview = new HeroPortrait({ raceId: this.sel.raceId, classId: this.sel.classId, mode: 'showcase', scale: 3 });
    this.preview.canvas.classList.add('acc-preview-canvas');
    this.preview.canvas.title = 'Vorschau';
    this.swatches = h('div.acc-swatches', { role: 'radiogroup', 'aria-label': 'Aussehen' });
    // Frisur (kostenlos bei der Erstellung, später am Spiegel gegen Gold)
    this.hairBtn = h('button.acc-hair', { type: 'button', onclick: () => { this.sel.hair = (this.sel.hair + 1) % hairStylesFor(this.sel.raceId).length; this.#refresh(); } });
    // Ausrüstungs-Vorschau: zeigt, wie die Figur mit besserer Beute aussehen kann
    this.tier = 'start';
    this.tierBtns = GEAR_TIERS.map((t) => h('button.acc-tier', {
      type: 'button', 'data-tier': t.id, title: t.title, 'aria-pressed': t.id === this.tier ? 'true' : 'false',
      class: `acc-tier r-${t.id}${t.id === this.tier ? ' selected' : ''}`,
      onclick: () => { this.tier = t.id; this.#refresh(); },
    }, t.label));
    this.tierBox = h('div.acc-tiers', { role: 'group', 'aria-label': 'Ausrüstungs-Vorschau' }, h('span.acc-tiers-label', 'Beute-Vorschau'), this.tierBtns);

    this.nameInput = h('input.ef-input.acc-name-input', {
      type: 'text', maxlength: NAME_MAX, placeholder: 'Name deines Charakters', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Name des Charakters',
    });
    this.nameInput.addEventListener('input', () => { this.nameTouched = true; this.sel.name = this.nameInput.value; this.#validate(); });
    this.nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.#start(); });
    this.nameErr = h('p.acc-error', { role: 'alert' });
    const dice = h('button.ef-btn.acc-dice', { type: 'button', title: 'Zufälliger Name', 'aria-label': 'Zufälliger Name', onclick: () => this.#randomName() }, 'Zufall');

    this.summary = h('div.acc-summary');
    // Volk-Beschreibung links unter der Auswahl, Klasse und Fähigkeiten rechts: beide Spalten etwa gleich hoch
    this.raceInfo = h('div.acc-desc.acc-race-info');
    this.startBtn = h('button.ef-btn.primary.acc-start', { type: 'button', onclick: () => this.#start() }, 'Abenteuer beginnen');

    const panel = h('div.ef-panel.acc-panel.acc-create',
      h('header.acc-head',
        h('button.acc-back', { type: 'button', onclick: () => this.back(), 'aria-label': 'Zurück' }, '‹'),
        h('div', h('h2.ef-sub', 'Charakter erschaffen'), h('p.acc-step', `Konto „${g.account.name}“`))),
      this.grid = h('div.acc-create-grid', { onscroll: () => this.#scrollHint() },
        h('section.acc-choose',
          h('h3.acc-h', 'Volk'), h('div.acc-options', this.raceBtns),
          h('h3.acc-h', 'Klasse'), h('div.acc-options', this.classBtns),
          this.raceInfo),
        h('section.acc-preview',
          h('div.acc-stage', this.preview.canvas, this.swatches, this.hairBtn, this.tierBox),
          h('div.acc-namebox', h('div.acc-inline', this.nameInput, dice), this.nameErr)),
        this.summary),
      h('footer.acc-create-foot', this.startBtn));
    this.root.replaceChildren(panel);
    focusIfDesktop(this.nameInput);
    this.resizeObs?.disconnect();
    this.resizeObs = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.#scrollHint()) : null;
    this.resizeObs?.observe(this.grid);
  }

  #choose(kind, id) {
    if (kind === 'race') {
      const prevRace = this.sel.raceId;
      this.sel.raceId = id;
      // Zufallsnamen passend zum Volk nachziehen, solange der Spieler nichts getippt hat
      if (!this.nameTouched || this.#isSuggested(prevRace)) this.#randomName(false);
    } else this.sel.classId = id;
    this.#refresh();
  }

  #isSuggested(raceId) {
    const r = this.game.content.find('race', raceId);
    return !!r?.names?.includes(cleanName(this.sel.name));
  }

  #randomName(touch = true) {
    const race = this.game.content.get('race', this.sel.raceId);
    let n = pick(race.names);
    if (race.names.length > 1) while (n === this.sel.name) n = pick(race.names);
    this.sel.name = n;
    this.nameInput.value = n;
    if (touch) this.nameTouched = false;
    this.#validate();
  }

  #validate() {
    // Dieselben Namensregeln wie auf dem Welt-Server (src/net/names.js): Team-Namen und Anstößiges gar nicht erst vergeben.
    const err = validateName(this.sel.name) ?? NAME_PROBLEM[nameProblem(cleanName(this.sel.name))] ?? null;
    this.nameErr.textContent = this.sel.name.trim() && err ? err : '';
    this.startBtn.disabled = !!err;
    return !err;
  }

  exit() { super.exit(); this.resizeObs?.disconnect(); this.resizeObs = null; }

  // Weicher Ausblendrand unten, solange es im Auswahlbereich noch etwas zu lesen gibt.
  #scrollHint() {
    const el = this.grid;
    if (el) el.classList.toggle('more', el.scrollTop + el.clientHeight < el.scrollHeight - 8);
  }

  #refresh() {
    const g = this.game, { raceId, classId } = this.sel;
    for (const b of [...this.raceBtns, ...this.classBtns]) {
      const on = b.dataset.id === (b.dataset.kind === 'race' ? raceId : classId);
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    for (const m of this.minis) {
      if (m.kind === 'race') m.set(m.defId, classId, 0);
      else m.set(raceId, m.defId, this.sel.variant);
    }
    // Farbvarianten des Volkes
    const look = RACE_LOOK[raceId];
    this.sel.variant = Math.min(this.sel.variant, look.variants.length - 1);
    this.swatches.replaceChildren(...look.variants.map((v, i) => h('button.acc-swatch', {
      type: 'button', role: 'radio', title: v.label, 'aria-label': v.label, 'aria-checked': i === this.sel.variant ? 'true' : 'false',
      class: `acc-swatch${i === this.sel.variant ? ' selected' : ''}`,
      style: { background: `linear-gradient(135deg, ${v.hair[3]}, ${v.hair[1]} 60%, ${(v.accent ?? v.hair)[2]})` },
      onclick: () => { this.sel.variant = i; this.#refresh(); },
    })));
    const styles = hairStylesFor(raceId);
    this.sel.hair = Math.min(this.sel.hair, styles.length - 1);
    this.hairBtn.textContent = `Frisur: ${HAIR_STYLES[styles[this.sel.hair]]} ›`;
    this.hairBtn.setAttribute('aria-label', `Frisur wechseln, aktuell ${HAIR_STYLES[styles[this.sel.hair]]}`);
    for (const b of this.tierBtns) { const on = b.dataset.tier === this.tier; b.classList.toggle('selected', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    const sample = PREVIEW_GEAR[classId]?.[this.tier];
    const gear = sample ? resolveGear(sample, g.content) : null;
    const t = this.preview.t;
    this.preview.set(raceId, classId, this.sel.variant, gear, { hairStyle: this.sel.hair ? styles[this.sel.hair] : null });
    this.preview.t = t;

    const race = g.content.get('race', raceId), cls = g.content.get('class', classId);
    const stats = deriveStats({ raceId, classId, level: 1 }, g.content);
    const abilities = cls.abilities.map((id) => g.content.get('ability', id));
    const keys = ['Q', 'R', 'T', 'G'];
    this.summary.replaceChildren(
      h('h3.acc-combo', `${race.name} · ${cls.name}`, h('span.ef-badge', cls.role)),
      h('div.acc-stats',
        STAT_ROWS.map((row) => h('div.acc-stat',
          h('span.acc-stat-label', row.label),
          h('span.acc-bar', h('span', { style: { width: `${Math.round((stats[row.key] / this.max[row.key]) * 100)}%` } })),
          h('span.acc-stat-val', row.fmt(stats[row.key])))),
        h('div.acc-stat',
          h('span.acc-stat-label', stats.resourceName),
          h('span.acc-bar.res', h('span', { style: { width: '100%', background: stats.resourceColor } })),
          h('span.acc-stat-val', stats.resourceType === 'rage' ? `0–${stats.maxResource}` : stats.maxResource)),
        h('p.acc-attrs', `Stärke ${stats.attributes.str} · Geschick ${stats.attributes.agi} · Intelligenz ${stats.attributes.int} · Vitalität ${stats.attributes.vit}`)),
      h('div.acc-desc.acc-class-info', h('h4', cls.name), h('p', cls.desc),
        h('ul.acc-abilities',
          h('li', h('b', 'Angriff'), ` ${cls.attackDesc}`),
          abilities.map((a, i) => h('li', h('span.acc-ability-icon', iconEl(abilityIcon(a.id, a), 28)), h('b', `${a.name} (${keys[i]})`), ` ${a.desc}`, h('span.acc-cost', [a.level > 1 ? `ab Stufe ${a.level}` : null, a.cost ? `${a.cost} ${stats.resourceName}` : null, `${a.cooldown} s`].filter(Boolean).join(' · ')))))),
    );
    this.raceInfo.replaceChildren(h('h4', race.name), h('p', race.desc), h('ul.acc-traits', race.traits.map((t) => h('li', t))));
    if (!this.sel.name) this.#randomName(false);
    this.#validate();
    this.#scrollHint();
  }

  #start() {
    if (!this.#validate()) { this.nameInput.focus(); return; }
    const g = this.game;
    const character = { name: cleanName(this.sel.name), raceId: this.sel.raceId, classId: this.sel.classId, appearance: { variant: this.sel.variant, hairStyle: this.sel.hair ? hairStylesFor(this.sel.raceId)[this.sel.hair] : null } };
    this.startBtn.disabled = true;
    const characterId = g.newGame({ character });
    g.bus.emit(EV.CHARACTER_CREATED, { characterId, ...character });
  }
}
