import { CONFIG } from '../config.js';
import { Prop } from '../entities/Prop.js';
import { Decor } from '../entities/Decor.js';
import { RuneGlow } from '../entities/Effects.js';
import { Chest, Gate, Portal, AreaTrigger, WorldObject } from '../entities/Interactive.js';
import { Npc } from '../entities/Npc.js';
import { SpikeTrap, JetTrap, Lever } from '../entities/Traps.js';
import { Light } from '../gfx/Lighting.js';
import { EV } from '../core/events.js';
import { hash2, pick } from '../core/math.js';

const T = CONFIG.tileSize;
const pickH = (arr, p, seed = 1) => arr[Math.floor(hash2(p.tx, p.ty, seed) * arr.length)];

// Setzt alle Objekte einer Karte in die Welt: Deko, Lichter, Truhen, Tor,
// Portale, Flächen und NPCs. Datenquelle: dungeon.placements + level.
export function placeObjects(world) {
  const d = world.dungeon, L = d.level, A = world.assets;
  const O = A.sprites.outdoor, C = A.sprites.crypt, P = A.props;
  const add = (x, y, opts) => { const o = new Decor(x, y, opts, world); world.props.push(o); return o; };
  const gates = [];

  // Deko-Satz des Bioms: Außen assets.sprites[level.decorSet], Dungeon biome_<biome>.props
  const decoSet = d.biome === 'outdoor' ? (L.decorSet ? A.sprites[L.decorSet] : null) : (L.biome ? A.sprites['biome_' + L.biome]?.props : null);
  const bdecor = (pl) => {
    let e = decoSet?.[pl.name];
    if (Array.isArray(e)) e = pickH(e, pl, 11);
    if (!e?.sprite) return null;
    const s = e.sprite, h = s.canvas.height;
    const opts = { sprite: s, glow: e.glow ?? null, box: e.box ?? null, low: e.low ?? (e.box ? e.box[1] > -8 : false), light: e.light ?? null, shadow: e.shadow ?? null };
    if (h > 36) opts.occlude = [-s.canvas.width / 2 + 2, -h + 4, s.canvas.width / 2 - 2, -8];
    if (e.smoke) opts.smoke = e.smoke;
    if (e.embers) opts.embers = e.embers;
    if (e.flames && e.flameAt) {
      // Biom-Format: Canvas-Frames + linke obere Ecke relativ zum Anker
      const f0 = e.flames[0];
      opts.flames = [{ frames: e.flames, dx: e.flameAt.dx + f0.width / 2, dy: e.flameAt.dy + f0.height - 1, fps: 10 }];
    } else if (e.flames) opts.flames = e.flames;
    if (!e.glow && d.biome === 'outdoor' && hash2(pl.tx, pl.ty, 4) < 0.5 && /Pine|Birch|Tree|tree/.test(pl.name)) opts.flip = true;
    if (e.steam) opts.smoke = { dx: e.steam.dx, dy: e.steam.dy, rate: 5 };
    // Mehrteilige Kollision (Tore, Ruinen): einzelne Pfeiler statt eines Kastens
    for (const [a, b, c, dd] of e.boxes ?? []) d.boxes.push({ x0: pl.x + a, y0: pl.y + b, x1: pl.x + c, y1: pl.y + dd, low: false });
    for (const l of e.lights ?? []) world.addLight(new Light({ x: pl.x + l.dx, y: pl.y + l.dy, radius: l.radius, color: l.color, intensity: l.intensity ?? 0.9, flicker: 0.2, bloom: 0.3 }));
    return add(pl.x, pl.y, opts);
  };

  for (const pl of d.placements) {
    switch (pl.type) {
      case 'bdecor': bdecor(pl); break;
      case 'trap': {
        const t = pl.trap, dmg = t.damage ?? L.trapDamage ?? 20;
        world.spawn(t.kind === 'jet' ? new JetTrap(pl.x, pl.y, { dir: t.dir, damage: dmg, offset: t.offset ?? hash2(pl.tx, pl.ty, 7) * 3, len: t.len }) : new SpikeTrap(pl.x, pl.y, { damage: dmg }));
        break;
      }
      // --- Dungeon (Bestand + neu)
      case 'torch': case 'brazier': case 'pillar': case 'candles':
        world.props.push(new Prop(pl.type, pl.x, pl.y, A, world)); break;
      case 'bones': world.decals.stampFrame(pick(P.bonePiles), pl.x, pl.y, Math.random() < 0.5); break;
      case 'rune':
        world.decals.stamp(P.rune.base, pl.x, pl.y);
        world.rune = new RuneGlow(pl.x, pl.y, P.rune);
        world.effects.push(world.rune);
        world.runeLight = world.addLight(new Light({ x: pl.x, y: pl.y, radius: 70, color: [140, 70, 255], intensity: 0.45, flicker: 0.1, bloom: 0.15 }));
        break;
      case 'stairs':
        if (!world.stairsLit) world.stairsLit = world.addLight(new Light({ x: pl.x + T, y: pl.y + 6, radius: 64, color: [120, 140, 210], intensity: 0.7, flicker: 0.05, bloom: 0.1 }));
        break;
      case 'chest': {
        const id = `${world.zone.id}_chest_${pl.tx}_${pl.ty}`;
        const persistent = !world.zone.instanced;
        const opened = persistent && !!world.state.slices.world?.flags?.[`chest:${id}`];
        const c = world.spawn(new Chest(pl.x, pl.y, { id, sprites: Chest.sprites(A), persistent, opened }));
        d.boxes.push({ x0: pl.x - 7, y0: pl.y - 4, x1: pl.x + 7, y1: pl.y + 1, low: true });
        world.interactables.push(c);
        break;
      }
      case 'gate': gates.push(pl); break;
      case 'cocoon': add(pl.x, pl.y, { sprite: pickH(C.cocoons, pl), box: [-4, -3, 4, 1], low: true, shadow: 10 }); break;
      case 'sarcophagus': add(pl.x, pl.y, { sprite: pickH(C.sarcophagi, pl), box: [-8, -22, 8, 0] }); break;
      case 'throne': add(pl.x, pl.y, { sprite: C.throne, box: [-17, -12, 17, 1] }); break;

      // --- Außen
      case 'pine': add(pl.x + (hash2(pl.tx, pl.ty, 2) - 0.5) * 6, pl.y, { sprite: pickH(O.pines, pl), box: [-3, -3, 3, 1], shadow: 18, occlude: [-14, -44, 14, 0], flip: hash2(pl.tx, pl.ty, 4) < 0.5 }); break;
      case 'deadtree': add(pl.x, pl.y, { sprite: pickH(O.deadTrees, pl), box: [-3, -3, 3, 1], shadow: 16, occlude: [-15, -38, 15, 0], flip: hash2(pl.tx, pl.ty, 4) < 0.5 }); break;
      case 'rock': add(pl.x, pl.y - 2, { sprite: pickH(O.rocks, pl), box: [-6, -5, 6, 1], low: true }); break;
      case 'bush': add(pl.x, pl.y - 2, { sprite: pickH(O.bushes, pl), shadow: 12 }); break;
      case 'grave': add(pl.x, pl.y - 2, { sprite: pickH(O.graves, pl), box: [-5, -3, 5, 1], low: true }); break;
      case 'crate': add(pl.x, pl.y - 2, { sprite: pickH(O.crates, pl), box: [-6, -4, 6, 1], low: true, shadow: 12 }); break;
      case 'well': add(pl.x, pl.y, { sprite: O.well, box: [-11, -9, 11, 1] }); break;
      case 'fence': {
        const horiz = 'f' === L.map[pl.ty]?.[pl.tx - 1] || 'f' === L.map[pl.ty]?.[pl.tx + 1];
        add(pl.x, pl.y - 2, { sprite: horiz ? O.fenceH : O.fenceV, low: true });
        break;
      }
      case 'lamp':
        add(pl.x, pl.y - 2, { sprite: O.lamp, glow: O.lampGlow, box: [-2, -2, 2, 1], shadow: 8, light: { dy: -26, radius: 78, color: [255, 170, 90], intensity: 0.9, flicker: 0.12, bloom: 0.35 } });
        break;
      case 'campfire':
        add(pl.x, pl.y - 2, {
          sprite: O.campfire, box: [-8, -3, 8, 2], low: true,
          flames: [{ frames: P.brazierFlame, dx: 0, dy: -3, fps: 12 }, { frames: P.torchFlame, dx: -4, dy: -2, fps: 10 }, { frames: P.torchFlame, dx: 4, dy: -2, fps: 11 }],
          light: { dy: -8, radius: 130, color: [255, 140, 60], intensity: 1, flicker: 0.3, bloom: 0.4 },
          embers: { dx: 0, dy: -10, rate: 5 },
        });
        break;
      case 'sign': {
        add(pl.x, pl.y - 2, { sprite: O.sign, box: [-2, -2, 2, 1] });
        world.interactables.push({
          x: pl.x, y: pl.y, interactRange: 20,
          canInteract: () => true, prompt: () => 'Wegweiser lesen', promptAnchor: () => ({ x: pl.x, y: pl.y - 26 }),
          interact: (w) => w.bus.emit(EV.UI_TOAST, { text: L.signText ?? 'Nordost: Die Katakomben · Ost: Der Aschenwald', kind: 'info' }),
        });
        break;
      }
    }
  }

  // Knochentor: zusammenhängende G-Zellen zu einem Tor
  if (gates.length) {
    const x0 = Math.min(...gates.map((g) => g.tx)), x1 = Math.max(...gates.map((g) => g.tx));
    const cx = ((x0 + x1 + 1) / 2) * T;
    world.gate = new Gate(cx, gates[0].y, (x1 - x0 + 1) * T, C.boneGate, world);
    world.spawn(world.gate);
  }

  // Gebäude
  for (const b of L.buildings ?? []) {
    const spr = O.buildings[b.kind];
    const x = b.x * T + (b.w * T) / 2, y = (b.y + b.h) * T;
    const s = spr.sprite;
    add(x, y, {
      sprite: s, glow: spr.glow,
      occlude: [-s.canvas.width / 2, -s.canvas.height + 2, s.canvas.width / 2, -b.h * T + 4],
      smoke: { dx: spr.chimney.x, dy: spr.chimney.y, rate: 3 },
      light: spr.forge ? { dx: spr.forge.x, dy: -12, radius: 110, color: [255, 120, 50], intensity: 1, flicker: 0.35, bloom: 0.45 } : { dx: 0, dy: 6, radius: 90, color: [255, 170, 90], intensity: 0.75, flicker: 0.1, bloom: 0.25 },
      embers: spr.forge ? { dx: spr.forge.x, dy: -20, rate: 4 } : null,
    });
  }

  // Katakomben-Eingang in der Klippe
  if (L.cryptGate) {
    const g = O.cryptGate, x = L.cryptGate.x * T + T / 2, y = (L.cryptGate.y + 1) * T;
    add(x, y, { sprite: g.sprite, glow: g.glow, sortOffset: -10000 });
    for (const side of [-1, 1]) world.props.push(new Prop('torch', x + side * 34, y - 30, A, world));
    world.addLight(new Light({ x, y: y - 12, radius: 60, color: [140, 80, 255], intensity: 0.5, flicker: 0.2, bloom: 0.2 }));
  }

  // Warmes Glühen entlang der Glutspalten
  (d.fissureCells ?? []).forEach((c, i) => {
    if (i % 3) return;
    world.addLight(new Light({ x: c.x, y: c.y, radius: 46, color: [255, 110, 40], intensity: 0.55, flicker: 0.25, bloom: 0.12 }));
  });

  // Lava-Glühen (Außen)
  (d.lavaCells ?? []).forEach((c) => {
    if (hash2(c.tx, c.ty, 17) > 0.14) return;
    world.addLight(new Light({ x: c.x, y: c.y, radius: 70, color: [255, 100, 30], intensity: 0.6, flicker: 0.25, bloom: 0.2 }));
  });

  // Schreine und aufhebbare Objekte (level.objects)
  for (const o of L.objects ?? []) {
    let looks = (o.set ? A.sprites[o.set] : decoSet)?.[o.decor];
    if (Array.isArray(looks)) looks = looks[0];
    if (!looks) continue;
    const obj = world.spawn(new WorldObject(o.x * T + T / 2, o.y * T + T - 2, { id: o.id, kind: o.kind, looks, prompt: o.prompt, pickup: o.kind === 'item' }));
    const s = (looks.off ?? looks).sprite;
    const bx = (looks.off ?? looks).box;
    if (o.kind !== 'item' && s) d.boxes.push(bx ? { x0: obj.x + bx[0], y0: obj.y + bx[1], x1: obj.x + bx[2], y1: obj.y + bx[3], low: true } : { x0: obj.x - 5, y0: obj.y - 4, x1: obj.x + 5, y1: obj.y + 1, low: true });
    world.interactables.push(obj);
  }

  // Hebel für verborgene Durchgänge (level.secrets)
  for (const sc of L.secrets ?? []) {
    const lever = world.spawn(new Lever(sc.lever.x * T + T / 2, sc.lever.y * T + T / 2 + 2, sc.id));
    world.interactables.push(lever);
  }

  // Portale
  for (const p of L.portals ?? []) {
    const zone = world.session.content.find('zone', p.to.zoneId);
    const subs = [];
    if (zone?.instanced) subs.push(`Instanz · bis ${zone.maxPlayers} Spieler`);
    if (p.requires?.level) subs.push(`Empfohlen ab Stufe ${p.requires.level}`);
    const sub = subs.length ? subs.join(' · ') : null;
    const portal = world.spawn(new Portal(p.x * T + T / 2, p.y * T + T / 2, { id: p.id, to: p.to, prompt: p.prompt, range: p.range, sub, visual: p.visual, dir: p.dir }));
    world.interactables.push(portal);
  }

  // Flächen
  for (const a of L.areas ?? []) {
    world.spawn(new AreaTrigger({ x0: a.x * T, y0: a.y * T, x1: (a.x + a.w) * T, y1: (a.y + a.h) * T }, a.id));
  }

  // NPCs
  for (const m of d.npcMarks) {
    const def = world.session.content.find('npc', m.npcId);
    if (!def) continue;
    const anims = A.sprites.npcs[m.npcId] ?? A.sprites.npcs2?.[m.npcId] ?? A.sprites.npcs3?.[m.npcId] ?? A.sprites.npcs2?.trader_vesk;
    if (!anims?.idle) continue;
    const npc = world.spawn(new Npc(m.npcId, m.x, m.y, def, anims, world));
    world.interactables.push(npc);
    world.npcs.push(npc);
  }
}
