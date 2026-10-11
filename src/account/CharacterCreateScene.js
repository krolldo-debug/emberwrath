import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { MenuScene } from './TitleScene.js';
import { focusIfDesktop, requireOnlineAccount, backButton } from './ui.js';
import { CreateStage, TilePortrait, stageHero, swatchArt } from './CreateStage.js';
import { deriveStats } from '../character/stats.js';
import { validateName, cleanName, NAME_MAX } from '../character/index.js';
import { nameProblem } from '../net/names.js';
import { RACE_LOOK, getHeroSprites } from '../sprites/hero.js';
import { iconEl, abilityIcon } from '../gfx/Icons.js';
import { pick } from '../core/math.js';
import { hairStylesFor, HAIR_STYLES } from '../character/cosmetics.js';

// Charaktererstellung: Volk, Klasse, Aussehen, Name -> neues Spiel auf Stufe 1.
// Der neue Held steht groß in der Szene des Website-Titelbilds (CreateStage), davor nur das Nötigste:
// links Volk und Klasse als Bildkacheln, unter dem Helden die Aussehen-Tafel (Farbsteine, Frisur) und der Name, rechts
// Klasse, Rolle und Fähigkeiten (antippen zeigt die Beschreibung; am Handy ersetzt sie dort die Klassenbeschreibung).
// Jede Auswahl spielt eine kurze Vorführung. Kosten der Fähigkeiten aus deriveStats().

const TILE_RES = 2;   // Feinpixel je Weltpixel der Kachelbilder, wie im Spiel (sprites/hero.js HERO_MAX_RES)

// Überschrift einer Fähigkeit: Name, bei Fähigkeiten mit Taste (ganzer Text für die Übersetzung); auf Touch ohne Taste
const keyHints = () => !window.matchMedia?.('(hover: none)').matches;
const skillTitle = (sk) => (sk.key && keyHints() ? `${sk.name} (Taste ${sk.key})` : sk.name);
const SKILL_PX = 48;   // Embleme 48 × 48 (gfx/SkillArt.js), 1:1 in CSS-Pixeln

const NAME_PROBLEM = {
  reserviert: 'Dieser Name ist für das Team reserviert. Bitte wähle einen anderen.',
  anstoessig: 'Dieser Name ist nicht erlaubt. Bitte wähle einen anderen.',
};

// Pfeil der Frisurwahl als Pixelbild (5 × 9), nach links gespiegelt per CSS
const CHEVRON_SVG = '<svg viewBox="0 0 5 9" width="10" height="18" shape-rendering="crispEdges" aria-hidden="true">'
  + '<path d="M0 0h2v1h1v1h1v1h1v3H4v1H3v1H2v1H0V7h1V6h1V5h1V4H2V3H1V2H0z" fill="currentColor"/></svg>';

// Würfel als Pixelbild (Zufallsname)
const DICE_SVG = '<svg viewBox="0 0 12 12" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true">'
  + '<path d="M2 1h8v1h1v8h-1v1H2v-1H1V2h1z" fill="#14060a"/><path d="M2 2h8v8H2z" fill="#e8dcc4"/><path d="M2 9h8v1H2zM9 2h1v8H9z" fill="#a89a7c"/>'
  + '<path d="M3 3h2v2H3zM7 7h2v2H7zM5 5h2v2H5z" fill="#7a1e1c"/></svg>';

export class CharacterCreateScene extends MenuScene {
  enter(params = {}) {
    const g = this.game;
    this.from = params.from ?? 'characters';
    this.root = h('div.ef-screen.acc-screen.cc-screen');
    if (!requireOnlineAccount(g)) return;
    this.races = g.content.all('race');
    this.classes = g.content.all('class');
    this.sel = { raceId: this.races[0].id, classId: this.classes[0].id, variant: 0, hair: 0, name: '' };
    this.nameTouched = false;
    this.skill = 0; // angetippte Fähigkeit (0 = Grundangriff)
    this.skillPicked = false; // erst nach dem Antippen ersetzt am Handy die Fähigkeit die Klassenbeschreibung
    this.#build();
    this.#refresh();
    g.warmup?.character(null); // Startzone schon jetzt im Hintergrund vorbereiten (world/warmup.js)
  }

  // Ohne Helden geht es von der Titelseite direkt hierher (CharacterListScene) – zurück dann zum Titel
  back() { this.game.scenes.go(this.from === 'title' ? 'title' : 'characters'); }

  update(dt) {
    super.update(dt);
    this.stage?.update(dt);
  }

  // Die Bühne verdeckt das Spiel-Canvas ganz: dort nur schwarz statt des Menü-Hintergrunds
  render(ctx) { ctx.fillStyle = '#060309'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); }

  #build() {
    this.tiles = [];
    const tile = (kind, def) => {
      const art = new TilePortrait();
      // Lange Namen (z. B. „Glutgeborene“) bekommen auf kleinen Handys eine Spur kleinere Schrift
      const btn = h(`button.cc-tile${def.name.length > 11 ? '.cc-tile-long' : ''}`, { type: 'button', 'aria-pressed': 'false', dataset: { kind, id: def.id }, onclick: () => this.#choose(kind, def.id) },
        h('span.cc-tile-art-box', art.canvas),
        h('span.cc-tile-name', def.name));
      btn.art = art;
      this.tiles.push(btn);
      return btn;
    };
    this.raceBtns = this.races.map((r) => tile('race', r));
    this.classBtns = this.classes.map((c) => tile('class', c));

    // Aussehen: Farbvarianten des Volkes und Frisur (kostenlos bei der Erstellung, später am Spiegel gegen Gold)
    this.swatches = h('div.cc-swatches', { role: 'radiogroup', 'aria-label': 'Aussehen' });
    const hairStep = (dir) => { const n = hairStylesFor(this.sel.raceId).length; this.sel.hair = (this.sel.hair + dir + n) % n; this.#refresh('look'); };
    const arrow = (dir, label) => {
      const b = h(`button.cc-arrow${dir < 0 ? '.cc-arrow-prev' : ''}`, { type: 'button', 'aria-label': label, onclick: () => hairStep(dir) });
      b.innerHTML = CHEVRON_SVG;
      return b;
    };
    this.hairLabel = h('span.cc-hair-label');
    this.hairPips = h('span.cc-hair-pips');
    this.hairName = h('button.cc-hair-name', { type: 'button', tabindex: '-1', 'aria-hidden': 'true', onclick: () => hairStep(1) }, this.hairLabel, this.hairPips);
    this.hair = h('div.cc-hair', { role: 'group' }, arrow(-1, 'Vorherige Frisur'), this.hairName, arrow(1, 'Nächste Frisur'));

    this.nameInput = h('input.cc-name', {
      type: 'text', maxlength: NAME_MAX, placeholder: 'Name deines Charakters', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Name des Charakters', translate: 'no',
    });
    this.nameInput.addEventListener('input', () => { this.nameTouched = true; this.sel.name = this.nameInput.value; this.#validate(); });
    this.nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.#start(); });
    this.nameErr = h('p.cc-error', { role: 'alert' });
    const dice = h('button.cc-dice', { type: 'button', title: 'Zufälliger Name', 'aria-label': 'Zufälliger Name', onclick: () => { this.#randomName(); this.stage?.moment('look'); } });
    dice.innerHTML = DICE_SVG;

    this.summary = h('div.cc-summary');
    this.startBtn = h('button.cc-start', { type: 'button', onclick: () => this.#start() }, 'Abenteuer beginnen');

    this.slot = h('div.cc-slot');
    this.left = h('section.cc-left',
      h('h3.cc-h', 'Volk'), h('div.cc-tiles', this.raceBtns),
      h('h3.cc-h', 'Klasse'), h('div.cc-tiles', this.classBtns));
    this.right = h('section.cc-right', this.summary, h('div.cc-foot', this.startBtn));
    this.stage = new CreateStage({ slot: this.slot });

    this.root.replaceChildren(
      this.stage.canvas,
      h('div.cc-layout',
        h('header.cc-top', backButton(() => this.back()), h('h2.cc-title', 'Charakter erschaffen')),
        this.left,
        h('div.cc-center',
          this.slot,
          h('div.cc-look', this.swatches, this.hair),
          h('div.cc-plate', this.nameInput, dice),
          this.nameErr),
        this.right));
    focusIfDesktop(this.nameInput);
  }

  #choose(kind, id) {
    if (kind === 'race') {
      if (this.sel.raceId === id) return this.stage?.moment('race');
      const prevRace = this.sel.raceId;
      this.sel.raceId = id;
      // Zufallsnamen passend zum Volk nachziehen, solange der Spieler nichts getippt hat
      if (!this.nameTouched || this.#isSuggested(prevRace)) this.#randomName(false);
    } else {
      if (this.sel.classId !== id) { this.skill = 0; this.skillPicked = false; }
      this.sel.classId = id;
    }
    this.#refresh(kind);
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

  exit() { super.exit(); this.stage?.destroy(); this.stage = null; }

  #style() { const styles = hairStylesFor(this.sel.raceId); return { hairStyle: this.sel.hair ? styles[this.sel.hair] : null }; }

  #refresh(moment = null) {
    const g = this.game, { raceId, classId } = this.sel;
    for (const b of this.tiles) {
      const race = b.dataset.kind === 'race';
      const on = b.dataset.id === (race ? raceId : classId);
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.art.set(race ? getHeroSprites(b.dataset.id, classId, 0, null, null, TILE_RES) : getHeroSprites(raceId, b.dataset.id, this.sel.variant, null, this.#style(), TILE_RES));
    }
    // Farbvarianten des Volkes
    const look = RACE_LOOK[raceId];
    this.sel.variant = Math.min(this.sel.variant, look.variants.length - 1);
    this.swatches.replaceChildren(...look.variants.map((v, i) => h('button.cc-swatch', {
      type: 'button', role: 'radio', title: v.label, 'aria-label': v.label, 'aria-checked': i === this.sel.variant ? 'true' : 'false',
      class: `cc-swatch${i === this.sel.variant ? ' selected' : ''}`,
      onclick: () => { if (this.sel.variant === i) return; this.sel.variant = i; this.#refresh('look'); },
    }, swatchArt(v))));
    const styles = hairStylesFor(raceId);
    this.sel.hair = Math.min(this.sel.hair, styles.length - 1);
    this.hairLabel.textContent = HAIR_STYLES[styles[this.sel.hair]];
    this.hairPips.replaceChildren(...styles.map((_, i) => h(`i${i === this.sel.hair ? '.on' : ''}`)));
    this.hair.setAttribute('aria-label', `Frisur wechseln, aktuell ${HAIR_STYLES[styles[this.sel.hair]]}`);
    this.stage.setHero(stageHero(raceId, classId, this.sel.variant, this.#style()));
    if (moment) this.stage.moment(moment);

    const race = g.content.get('race', raceId), cls = g.content.get('class', classId);
    const stats = deriveStats({ raceId, classId, level: 1 }, g.content);
    const keys = ['Q', 'R', 'T', 'G'];
    // Grundangriff + vier Fähigkeiten als Symbolleiste; die angetippte wird darunter beschrieben.
    const skills = [
      { name: 'Angriff', key: null, desc: cls.attackDesc, meta: null, icon: iconEl(`attack_${classId}`, SKILL_PX) },
      ...cls.abilities.map((id, i) => {
        const a = g.content.get('ability', id);
        const meta = [a.level > 1 ? `ab Stufe ${a.level}` : null, a.cost ? `${a.cost} ${stats.resourceName}` : null, `${a.cooldown} s Abklingzeit`].filter(Boolean).join(' · ');
        return { name: a.name, key: keys[i], desc: a.desc, meta, icon: iconEl(abilityIcon(a.id, a), SKILL_PX) };
      }),
    ];
    this.skill = Math.min(this.skill, skills.length - 1);
    const cur = skills[this.skill];
    this.summary.replaceChildren(h(`div.cc-card${this.skillPicked ? '.cc-picked' : ''}`,
      h('p.cc-race', race.name),
      h('h3.cc-class', cls.name),
      h('p.cc-role', cls.role),
      h('p.cc-desc', cls.desc),
      h('div.cc-skills', { role: 'group', 'aria-label': 'Fähigkeiten' },
        skills.map((sk, i) => h(`button.cc-skill${i === this.skill ? '.selected' : ''}`, {
          type: 'button', title: sk.name, 'aria-label': sk.name, 'aria-pressed': i === this.skill ? 'true' : 'false',
          onclick: () => { this.skill = i; this.skillPicked = true; this.#refresh(); },
        }, sk.icon, sk.key && keyHints() ? h('span.cc-skill-key', { 'aria-hidden': 'true' }, sk.key) : null))),
      h('div.cc-skill-info',
        h('h4', skillTitle(cur)),
        h('p', cur.desc),
        cur.meta ? h('p.cc-cost', cur.meta) : null),
    ));
    if (!this.sel.name) this.#randomName(false);
    this.#validate();
  }

  #start() {
    if (!this.#validate()) { this.nameInput.focus(); return; }
    const g = this.game;
    const character = { name: cleanName(this.sel.name), raceId: this.sel.raceId, classId: this.sel.classId, appearance: { variant: this.sel.variant, hairStyle: this.sel.hair ? hairStylesFor(this.sel.raceId)[this.sel.hair] : null } };
    if (this.startBtn.disabled) return;
    this.startBtn.disabled = true;
    // Erst den gedrückten Knopf zeigen, dann die Welt aufbauen (sonst wirkt er am Handy kurz wie tot)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const characterId = g.newGame({ character });
      g.bus.emit(EV.CHARACTER_CREATED, { characterId, ...character });
    }));
  }
}
