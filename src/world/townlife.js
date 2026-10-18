import { CONFIG } from '../config.js';
import { hash2 } from '../core/math.js';
import { Townsfolk } from '../entities/Townsfolk.js';
import { folkAnims } from '../sprites/folk.js';

// Leben in den Städten: Bewohner mit eigenem Haus, die umhergehen, plaudern, ihre Häuser betreten und den Helden
// ansprechen. Rein auf dem Gerät gerechnet und ohne Spielstand: keine Quests, keine Beute, kein Kampf.
// Die Häuser, Plätze und NPCs liest spawnTownsfolk aus der fertig platzierten Karte (placeObjects).
//
// Bewohner: { outfit (sprites/folk.js), race, variant, role: 'home' | 'guard', say: [Sprüche] }
// Sprüche: Text oder { text, boss | quest | level } – ein Spruch mit Bedingung gilt erst, wenn der Boss (bossId)
// besiegt, die Quest abgeschlossen oder die Stufe erreicht ist, und geht dann den allgemeinen Sprüchen vor.

const T = CONFIG.tileSize;

// Eingang je Haus (Weltpixel relativ zum Fußpunkt der Deko): dorthin gehen Bewohner, bevor sie verschwinden.
// Stelzenhütte: Leiter rechts, Baumhaus: Leiter links. Wachtürme: Leiter in der Mitte (nur Wachen).
export const HOUSE_DOORS = {
  cottage: [-1, 3], cottageB: [-1, 3], tent: [0, 3], yurt: [0, 3], yurtSmall: [0, 3],
  stiltHut: [12, 3], longhouse: [0, 3], sodHut: [-3, 3], treePlatform: [-19, 3],
};
const TOWERS = { watchtower: [0, 3], fortTower: [0, 3] };
// Dinge, an denen man stehen bleibt (Feuer, Brunnen, Marktstand …)
const SPOT = /campfire|fire|brazier|well|market|stall|crate|barrel|woodpile|cart|sign|rack|anvil|totem|banner|stable|templeFacade|shrine|pyre|drying|hay/i;

const say = (text, cond) => ({ text, ...cond });

export const TOWNS = {
  ember_village: {
    boss: 'bonelord',
    folk: [
      { outfit: 'farmwife', race: 'human', variant: 0, say: ['Die Rüben wachsen schlecht dieses Jahr.', 'Asche im Brunnen, Asche im Brot.', say('Seit Varkhul fort ist, schlafe ich wieder.', { boss: 'bonelord' })] },
      { outfit: 'laborer', race: 'dwarf', variant: 1, say: ['Holz hacken, Asche fegen, Holz hacken.', 'Im Wolfsforst heulen sie wieder.', say('In den Katakomben ist es still. Gut so.', { boss: 'bonelord' })] },
      { outfit: 'maid', race: 'human', variant: 2, say: ['Brom hat den Ofen schon wieder glühen.', 'Pass auf dich auf da draußen.', say('Im ganzen Dorf reden sie von dir.', { level: 15 })] },
      { outfit: 'elder', race: 'human', variant: 2, say: ['Ich habe drei Glutwinter gesehen.', 'Früher war die Senke grün.', say('Die Toten liegen wieder still. Danke.', { boss: 'bonelord' })] },
      { outfit: 'merchant', race: 'elf', variant: 0, say: ['Ohne Geleit fahre ich nicht nach Osten.', 'Salz ist teurer als Silber geworden.', say('Die Straße ist frei, sagt man. Stimmt das?', { quest: 'q_road_east' })] },
      { outfit: 'guard', race: 'human', variant: 1, role: 'guard', say: ['Halt die Augen offen.', 'Nachts kommen die Wölfe bis an die Felder.', say('Ruhig heute. Endlich.', { boss: 'bonelord' })] },
    ],
  },
  ashwood_camp: {
    boss: 'drowned_priestess',
    folk: [
      { outfit: 'hunter', race: 'elf', variant: 1, say: ['Im Aschenwald singt kein Vogel mehr.', 'Die Spuren hier sind nicht von Wölfen.'] },
      { outfit: 'laborer', race: 'human', variant: 0, say: ['Die Palisade hält. Noch.', 'Wer Holz will, muss tief in den Wald.'] },
      { outfit: 'hunter', race: 'human', variant: 2, cloth: 'slate', say: ['Oben im Baumhaus schläft man sicherer.', 'Vesk kauft jedes Fell. Fragt nie, woher.'] },
      { outfit: 'maid', race: 'emberborn', variant: 2, say: ['Eintopf gibt es, wenn die Jäger zurück sind.', say('Die Tempelglocken läuten, obwohl niemand zieht.', { level: 9 }), say('Die Glocken schweigen. Endlich.', { boss: 'drowned_priestess' })] },
      { outfit: 'guard', race: 'dwarf', variant: 0, role: 'guard', say: ['Bleib auf dem Weg, wenn es dunkel wird.', 'Ilsa sieht mehr als wir alle zusammen.', say('Nerith ist fort? Dann trinke ich heute.', { boss: 'drowned_priestess' })] },
    ],
  },
  rookwatch: {
    boss: 'ember_tyrant',
    folk: [
      { outfit: 'laborer', race: 'dwarf', variant: 2, say: ['Die Schlacke frisst einem die Stiefel.', 'Erz gibt es genug. Nur keinen, der es holt.'] },
      { outfit: 'apprentice', race: 'human', variant: 1, say: ['Dunn sagt, ich darf bald an die Esse.', 'Hier oben ist die Luft so dünn.'] },
      { outfit: 'maid', race: 'human', variant: 0, say: ['Der Rauch geht nie aus den Kleidern.', say('Aus der Schmiede kommt nachts ein Brüllen.', { level: 15 }), say('Kein Brüllen mehr aus der Schmiede.', { boss: 'ember_tyrant' })] },
      { outfit: 'guard', race: 'emberborn', variant: 0, role: 'guard', say: ['Hale will die Wache doppelt besetzt.', 'Von hier oben sieht man die Glut atmen.', say('Ignaroth ist gefallen. Ich hab es gesehen!', { boss: 'ember_tyrant' })] },
      { outfit: 'guard', race: 'human', variant: 2, role: 'guard', say: ['Steinschlag am Pass. Wieder einmal.', 'Mein Schild ist schwerer als ich.'] },
    ],
  },
  steppe_outpost: {
    boss: 'barrow_king',
    folk: [
      { outfit: 'nomad', race: 'human', variant: 1, say: ['Der Wind trägt Asche von Süden.', 'Pferde spüren die Toten eher als wir.', say('Das Hügelgrab heult nicht mehr.', { boss: 'barrow_king' })] },
      { outfit: 'nomad', race: 'elf', variant: 2, cloth: 'teal', say: ['In der Steppe verirrt sich nur, wer nicht zuhört.', 'Orla gibt ihre Pferde nicht jedem.'] },
      { outfit: 'farmwife', race: 'human', variant: 2, say: ['Stutenmilch? Nein? Deine Sache.', 'Die Herden werden kleiner.'] },
      { outfit: 'hunter', race: 'dwarf', variant: 0, say: ['Kesh hat wieder Reiter am Horizont gesehen.', say('Ulgrims Krone? Ich will sie nicht mal sehen.', { boss: 'barrow_king' })] },
      { outfit: 'elder', race: 'human', variant: 1, say: ['Mein Großvater ritt bis ans Meer.', 'Die Hügel waren immer Gräber.'] },
      { outfit: 'guard', race: 'human', variant: 0, role: 'guard', say: ['Varra lässt keinen ohne Grund herein.', 'Halt dein Pferd vom Zaun fern.'] },
    ],
  },
  nomad_camp: {
    folk: [
      { outfit: 'nomad', race: 'emberborn', variant: 1, say: ['Wir ziehen weiter, wenn das Gras zu Asche wird.', 'Setz dich ans Feuer, Fremder.'] },
      { outfit: 'farmwife', race: 'elf', variant: 0, say: ['Die Kinder schlafen. Sprich leise.', 'Das Zelt riecht nach Rauch und Leder.'] },
    ],
  },
  mirefort: {
    boss: 'rot_mother',
    folk: [
      { outfit: 'marsh', race: 'human', variant: 0, say: ['Trink nie aus der Marsch.', 'Die Stege knarren. Das heißt, sie halten.'] },
      { outfit: 'marsh', race: 'elf', variant: 1, say: ['Die Sporen kriechen jede Nacht näher.', say('Die Luft riecht weniger nach Fäulnis.', { boss: 'rot_mother' })] },
      { outfit: 'laborer', race: 'dwarf', variant: 1, say: ['Hier steht alles auf Stelzen. Auch ich.', 'Brisa zahlt gut für Moorkraut.'] },
      { outfit: 'maid', race: 'human', variant: 1, say: ['Nasse Füße, jeden Tag.', 'Leuchtet da draußen etwas? Schau nicht hin.'] },
      { outfit: 'elder', race: 'emberborn', variant: 2, say: ['Die Marsch nimmt sich, was sie will.', say('Mutter Fäulnis ist tot? Dann wächst hier bald wieder etwas.', { boss: 'rot_mother' })] },
      { outfit: 'guard', race: 'human', variant: 2, role: 'guard', say: ['Von oben sieht man die Irrlichter.', 'Thane schläft nie, glaube ich.'] },
    ],
  },
  frosthold: {
    boss: 'frost_wyrm',
    folk: [
      { outfit: 'northman', race: 'human', variant: 2, say: ['Das Eis singt, wenn der Wurm atmet.', 'Met wärmt besser als jeder Mantel.', say('Skalvyr ist tot? Darauf trinken wir!', { boss: 'frost_wyrm' })] },
      { outfit: 'northman', race: 'dwarf', variant: 0, say: ['Kalt? Das hier ist ein milder Tag.', 'Eskil hört jedem zu. Fast jedem.'] },
      { outfit: 'farmwife', race: 'human', variant: 1, cloth: 'slate', say: ['Das Feuer darf nie ausgehen.', 'Fenn handelt mit allem, nur nicht mit Wärme.'] },
      { outfit: 'hunter', race: 'elf', variant: 2, say: ['Sigrun trifft auf zweihundert Schritt.', 'Weiße Wölfe sieht man erst, wenn es zu spät ist.'] },
      { outfit: 'guard', race: 'human', variant: 0, role: 'guard', say: ['Wer friert, bleibt wach.', say('Die Höhlen geben keinen Laut mehr von sich.', { boss: 'frost_wyrm' })] },
    ],
  },
  last_bastion: {
    boss: 'ash_sovereign',
    folk: [
      { outfit: 'pilgrim', race: 'human', variant: 0, say: ['Der Thron ruft. Hörst du ihn nicht?', 'Ich bete für alle, die nicht zurückkamen.'] },
      { outfit: 'pilgrim', race: 'elf', variant: 2, say: ['Jeder hier hat jemanden verloren.', say('Die Asche fällt leiser seit dem Thron.', { boss: 'ash_sovereign' })] },
      { outfit: 'laborer', race: 'emberborn', variant: 0, say: ['Die Mauer flicke ich jeden Tag neu.', 'Ryn rationiert sogar das Wasser.'] },
      { outfit: 'guard', race: 'dwarf', variant: 2, role: 'guard', say: ['Die letzte Bastion. Und sie hält.', 'Corvane hat seit Tagen nicht geschlafen.', say('Malgareth ist gefallen? Dann war es nicht umsonst.', { boss: 'ash_sovereign' })] },
    ],
  },
};

// Zusätzliche Stoffe für Bewohner, die sich vom Grundtyp abheben sollen
const CLOTH = {
  teal: ['#0e1a1c', '#18302f', '#244644', '#346260', '#4c807c'],
  slate: ['#16181e', '#262a34', '#3a404e', '#545c6c', '#727c8e'],
};

// Spruch, der jetzt passt: zuerst erfüllte Bedingungen (der neueste Stand zuerst), sonst ein allgemeiner
export function pickLine(lines, state, n) {
  const s = state?.slices;
  const met = (l) => (l.boss ? (s?.progress?.stats?.byType?.[l.boss] ?? 0) > 0
    : l.quest ? !!s?.quests?.completed?.includes(l.quest)
    : l.level ? (s?.progress?.level ?? 1) >= l.level : false);
  const special = lines.filter((l) => typeof l !== 'string' && met(l));
  const plain = lines.filter((l) => typeof l === 'string');
  // Besonderer Spruch beim ersten und dann jedem dritten Mal, damit er auffällt, aber nicht alles andere verdrängt
  if (special.length && (n % 3 === 0 || !plain.length)) return special[Math.floor(n / 3) % special.length].text;
  return plain[n % plain.length] ?? null;
}

// ------------------------------------------------------------------ Karte lesen
export function spawnTownsfolk(world) {
  const d = world.dungeon, L = d.level;
  if (d.biome !== 'outdoor' || !L.areas) return;
  const towns = L.areas.filter((a) => a.town && TOWNS[a.id]);
  for (const area of towns) {
    const town = new Town(world, area, TOWNS[area.id]);
    town.populate();
  }
}

// Sichtfläche eines Sprites in Weltpixeln (SpriteFrame: canvas, ax, ay in Texeln; Prop: Sprite je Art)
function spriteRect(o) {
  const s = o.kind && o.props ? o.props[o.kind] : o.sprite ?? o.look?.sprite ?? o.looks?.sprite;
  if (!s?.canvas || s.ax == null) return null;
  const r = s.res ?? 1, ax = (o.flip ? s.canvas.width - s.ax : s.ax) / r, x0 = o.x - ax, y0 = o.y - s.ay / r;
  return { x0, y0, x1: x0 + s.canvas.width / r, y1: y0 + s.canvas.height / r };
}

// Figuren in Leerlaufpausen vorab rastern (je Animation ein Schritt), damit das erste Losgehen am Handy nicht ruckelt
function warmFolk(getters) {
  const jobs = getters.flatMap((get) => ['idle', 'walk', 'talk'].map((k) => () => get()[k]));
  const idle = globalThis.requestIdleCallback ?? ((fn) => setTimeout(fn, 60));
  const step = () => { try { jobs.shift()?.(); } catch { jobs.length = 0; } if (jobs.length) idle(step, { timeout: 400 }); };
  idle(step, { timeout: 400 });
}

class Town {
  constructor(world, area, def) {
    this.world = world; this.area = area; this.def = def;
    const pad = 4;
    this.box = { x0: (area.x - pad) * T, y0: (area.y - pad) * T, x1: (area.x + area.w + pad) * T, y1: (area.y + area.h + pad) * T };
    this.houses = []; this.towers = []; this.spots = [];
    this.grid = null;
    this.folk = [];
    this.lastLine = -99;   // Zeit des letzten Spruchs im Ort (nicht alle auf einmal)
    this.pickLine = pickLine;
  }

  inside(x, y) { const b = this.box; return x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1; }

  populate() {
    const w = this.world, d = w.dungeon;
    for (const pl of d.placements) {
      if (pl.type !== 'bdecor' || !this.inside(pl.x, pl.y)) continue;
      const door = HOUSE_DOORS[pl.name], tower = TOWERS[pl.name];
      if (door) this.houses.push({ x: pl.x + door[0], y: pl.y + door[1], name: pl.name });
      else if (tower) this.towers.push({ x: pl.x + tower[0], y: pl.y + tower[1], name: pl.name });
      else if (SPOT.test(pl.name)) {
        // Am Feuer neben der Glut stehen, nicht davor (sonst steht die Figur optisch in den Flammen)
        const fire = /fire|brazier|pyre/i.test(pl.name), side = hash2(pl.x, pl.y, 9) < 0.5 ? -1 : 1;
        this.spots.push({ x: pl.x + (fire ? side * 22 : 0), y: pl.y + (fire ? 4 : 12), kind: pl.name });
      }
    }
    for (const n of w.npcs ?? []) if (this.inside(n.x, n.y)) this.spots.push({ x: n.x + (hash2(n.x, n.y, 3) < 0.5 ? -30 : 30), y: n.y + 6, npc: n });
    this.#buildGrid();
    // Stehplätze: mit etwas Abstand zu allem, was eine Kollisionsbox hat (Spiegel, Stand, Questgeber), sonst aufs nächste freie Feld
    // Fallen zwei Plätze aufs selbe freie Feld, bleibt nur einer (sonst stehen Bewohner übereinander)
    this.spots = this.spots.map((s) => ({ ...s, ...this.#roomy(s.x, s.y) }))
      .filter((s, i, all) => s.ok && !all.slice(0, i).some((o) => o.ok && Math.hypot(o.x - s.x, o.y - s.y) < 14));
    for (const h of [...this.houses, ...this.towers]) Object.assign(h, { step: this.free(h.x, h.y + 6) });
    // Haus direkt hinter einem Questgeber: Tür läge unter seinem Namensschild, also kein Zuhause
    this.houses = this.houses.filter((h) => h.step.ok && !this.#kept(h.x, h.y));
    this.towers = this.towers.filter((h) => h.step.ok && !this.#kept(h.x, h.y));
    const cx = (this.area.x + this.area.w / 2) * T, cy = (this.area.y + this.area.h / 2) * T;
    this.houses.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    // Ohne Plätze: ein paar freie Punkte im Ort
    for (let i = 0; this.spots.length < 4 && i < 40; i++) {
      const p = this.free(this.area.x * T + hash2(i, 1, 41) * this.area.w * T, this.area.y * T + hash2(i, 2, 41) * this.area.h * T);
      if (p.ok) this.spots.push({ x: p.x, y: p.y, kind: 'open' });
    }
    if (!this.spots.length) return;
    // Nur, was mit dem Ortskern verbunden ist (Häuser hinter Feuer oder Ständen können eingeschlossen sein)
    const hub = this.spots.reduce((a, s) => (Math.hypot(s.x - cx, s.y - cy) < Math.hypot(a.x - cx, a.y - cy) ? s : a));
    const linked = (p) => p === hub || !!this.path(p.x, p.y, hub.x, hub.y);
    this.spots = this.spots.filter(linked);
    this.houses = this.houses.filter((h) => linked(h.step));
    this.towers = this.towers.filter((h) => linked(h.step));
    let hi = 0;
    this.def.folk.forEach((f, i) => {
      const spec = f.cloth ? { ...f, cloth: CLOTH[f.cloth], clothKey: f.cloth } : f;
      const home = f.role === 'guard' ? (this.towers[i % Math.max(1, this.towers.length)] ?? null) : (this.houses.length ? this.houses[hi++ % this.houses.length] : null);
      const start = home?.step ?? this.spots[i % this.spots.length];
      const folk = new Townsfolk(start.x, start.y, { town: this, spec, home, anims: () => folkAnims(spec), seed: i * 7 + this.area.x });
      this.folk.push(this.world.spawn(folk));
    });
    warmFolk(this.folk.map((f) => f.getAnims));
  }

  // ---------------------------------------------------------------- Wegnetz (Kacheln im Ort, einmal je Zone)
  #buildGrid() {
    const d = this.world.dungeon, b = this.box;
    const tx0 = Math.max(0, Math.floor(b.x0 / T)), ty0 = Math.max(0, Math.floor(b.y0 / T));
    const tx1 = Math.min(d.w - 1, Math.floor(b.x1 / T)), ty1 = Math.min(d.h - 1, Math.floor(b.y1 / T));
    const w = tx1 - tx0 + 1, h = ty1 - ty0 + 1, blocked = new Uint8Array(w * h);
    const hide = this.#hidden(), keep = this.#npcZones();
    const inZone = (z, px, py) => px > z.x0 && px < z.x1 && py > z.y0 && py < z.y1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const px = (tx0 + x) * T + T / 2, py = (ty0 + y) * T + T / 2;
      blocked[y * w + x] = d.isWall(tx0 + x, ty0 + y) || d.collidesRect(px - 5, py - 4, px + 5, py + 3)
        || hide.some((z) => inZone(z, px, py)) || keep.some((z) => inZone(z, px, py)) ? 1 : 0;
    }
    this.grid = { tx0, ty0, w, h, blocked };
    this.keep = keep;
  }

  // Fußpunkte, an denen eine Figur hinter einem Haus, Turm, Obelisken oder Feuer stünde: dort ragte sie über das Dach
  // hinaus bzw. stünde in den Flammen (Flammen liegen im Leuchtpass über allem). Feld: Sprite-Fläche bis zur Grundlinie.
  #hidden() {
    const w = this.world, b = this.box, out = [];
    for (const o of [...w.props, ...w.entities]) {
      if (o.animator || o.x < b.x0 - 80 || o.x > b.x1 + 80 || o.y < b.y0 - 20 || o.y > b.y1 + 120) continue;
      const r = spriteRect(o);
      const fire = (o.o?.flames ?? o.flames)?.length > 0;
      if (!r || (r.y1 - r.y0 < 28 && !fire)) continue;   // niedriger als eine Figur (Kisten, Fässer, Zäune): dahinter wirkt natürlich
      out.push({ x0: r.x0 - 3, x1: r.x1 + 3, y0: r.y0 + 3 - (fire ? 12 : 0), y1: (o.sortY ?? o.y) + 2 });
    }
    return out;
  }

  // Abstand zu Questgebern: Körper und Namensschild (Npc.renderEmissive, Schild 29–45 px über dem Fußpunkt) bleiben frei
  #npcZones() {
    const font = this.world.session?.font, out = [];
    const wide = (t) => (t ? (font?.measure?.(t.toUpperCase()) ?? t.length * 4) : 0);
    for (const n of this.world.npcs ?? []) {
      if (!this.inside(n.x, n.y)) continue;
      const hw = Math.max(24, Math.max(wide(n.def?.name), wide(n.def?.title)) / 2 + 6);
      out.push({ x0: n.x - hw, x1: n.x + hw, y0: n.y - 50, y1: n.y - 2, npc: n });
      out.push({ x0: n.x - 20, x1: n.x + 20, y0: n.y - 4, y1: n.y + 12, npc: n });
    }
    return out;
  }

  #cell(x, y) {
    const g = this.grid, cx = Math.floor(x / T) - g.tx0, cy = Math.floor(y / T) - g.ty0;
    return cx < 0 || cy < 0 || cx >= g.w || cy >= g.h ? -1 : cy * g.w + cx;
  }

  #roomy(x, y) {
    const d = this.world.dungeon;
    for (const [dx, dy] of [[0, 0], [8, 0], [-8, 0], [0, 6], [12, 4], [-12, 4], [0, 12], [16, 0], [-16, 0]]) {
      const px = x + dx, py = y + dy, c = this.#cell(px, py);
      if (c >= 0 && !this.grid.blocked[c] && !d.collidesRect(px - 9, py - 7, px + 9, py + 3) && !this.#kept(px, py)) return { x: px, y: py, ok: true };
    }
    return this.free(x, y);
  }

  #kept(x, y) { return this.keep.some((z) => x > z.x0 && x < z.x1 && y > z.y0 && y < z.y1); }

  // Nächster freier Punkt um (x, y) innerhalb von 2 Kacheln
  free(x, y) {
    const g = this.grid;
    for (let r = 0; r <= 2; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const px = x + dx * T, py = y + dy * T, c = this.#cell(px, py);
      if (c < 0 || g.blocked[c]) continue;
      if (r === 0 && !this.#kept(x, y)) return { x, y, ok: true };
      const qx = (Math.floor(px / T) + 0.5) * T, qy = (Math.floor(py / T) + 0.5) * T;
      if (!this.#kept(qx, qy)) return { x: qx, y: qy, ok: true };
    }
    return { x, y, ok: false };
  }

  // A* über die Kacheln des Orts, danach geglättet (gerade Strecken, wo frei). Liefert Punkte ohne den Start.
  path(ax, ay, bx, by) {
    const g = this.grid, start = this.#cell(ax, ay), goal = this.#cell(bx, by);
    if (start < 0 || goal < 0) return null;
    if (start === goal || this.#clear(ax, ay, bx, by)) return [{ x: bx, y: by }];
    const n = g.w * g.h, cost = new Float32Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    const gx = goal % g.w, gy = (goal / g.w) | 0;
    const open = [start]; cost[start] = 0;
    const H = (c) => Math.hypot((c % g.w) - gx, ((c / g.w) | 0) - gy);
    let found = false;
    for (let it = 0; open.length && it < 4000; it++) {
      let bi = 0, bf = Infinity;
      for (let i = 0; i < open.length; i++) { const f = cost[open[i]] + H(open[i]); if (f < bf) { bf = f; bi = i; } }
      const c = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (c === goal) { found = true; break; }
      if (done[c]) continue;
      done[c] = 1;
      const cx = c % g.w, cy = (c / g.w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
        const k = ny * g.w + nx;
        if (g.blocked[k] && k !== goal) continue;
        if (dx && dy && (g.blocked[cy * g.w + nx] || g.blocked[ny * g.w + cx])) continue;   // keine Ecken schneiden
        const nc = cost[c] + (dx && dy ? 1.414 : 1);
        if (nc < cost[k]) { cost[k] = nc; from[k] = c; open.push(k); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = goal; c !== start && c >= 0; c = from[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => ({ x: (g.tx0 + (c % g.w) + 0.5) * T, y: (g.ty0 + ((c / g.w) | 0) + 0.5) * T }));
    pts[pts.length - 1] = { x: bx, y: by };
    // Glätten: vom aktuellen Punkt aus den weitesten frei erreichbaren nehmen
    const out = [];
    let px = ax, py = ay, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.#clear(px, py, pts[j].x, pts[j].y)) j--;
      out.push(pts[j]); px = pts[j].x; py = pts[j].y; i = j + 1;
    }
    return out;
  }

  #clear(ax, ay, bx, by) {
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 4);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, c = this.#cell(ax + (bx - ax) * t, ay + (by - ay) * t);
      if (c < 0 || (this.grid.blocked[c] && i < steps)) return false;
    }
    return true;
  }
}
