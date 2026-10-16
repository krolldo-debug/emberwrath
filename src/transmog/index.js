import { EV } from '../core/events.js';
import { Npc } from '../entities/Npc.js';
import { Decor } from '../entities/Decor.js';
import { PLACES } from './places.js';
import { createTransmogSprites } from './sprite.js';

// Gewandmeisterin (wie der Transmogrifizierer in WoW): steht in jeder Wegstein-Stadt nahe Auktionator und Rabenpost.
// Ansprechen öffnet das Fenster 'transmog' (ui/WardrobePanel.js, gleicher Aufbau wie die Sammlung): gesammeltes
// Aussehen über die getragene Ausrüstung legen, bezahlt mit Gold (Command wardrobe:transmog, character/wardrobe.js).
// Die Sammlung selbst (Menü) zeigt nur an.

let sprites = null;
const transmogSprites = () => (sprites ??= createTransmogSprites());

const MISTRESS = { name: 'Gewandmeisterin', title: 'Haus der Spiegel' };

class Mistress extends Npc {
  prompt() { return 'Aussehen wechseln'; }
  // Name und Haus über dem Haarknoten, nur in der Nähe (wie der Auktionator)
  renderEmissive(ctx, cx, cy) {
    const near = this.nearHero;
    this.nearHero = false;
    super.renderEmissive(ctx, cx, cy);
    this.nearHero = near;
    const font = this.world.session.font;
    if (!near || !font) return;
    const x = Math.round(this.x - cx), top = Math.round(this.y - cy - 38);
    font.draw(ctx, this.def.name.toUpperCase(), x, top - 8 - Math.min(1, font.ascent(this.def.title)), { color: '#e8c25a', align: 'center', shadow: true });
    font.draw(ctx, this.def.title.toUpperCase(), x, top - 1, { color: '#a89ab8', align: 'center', shadow: true });
  }
  interact(world) {
    this.talkTime = 2.5;
    this.animator.play('talk', true);
    this.facing = world.hero.x < this.x ? -1 : 1;
    world.session.panels?.open('transmog');
  }
}

export function installTransmog(game) {
  game.addSessionSystem('transmog', (sess) => {
    const offs = [
      sess.bus.on(EV.ZONE_ENTER, () => { try { placeMistress(sess.world); } catch (err) { console.error('Gewandmeisterin', err); } }),
    ];
    return { dispose: () => offs.forEach((off) => off?.()) };
  }, 25);
}

// Gewandmeisterin mit Standspiegel neben dem Wegstein der Stadt
function placeMistress(world) {
  const place = world && !world.zone?.instanced && PLACES[world.zone?.id];
  const stone = world?.waystone;
  if (!place || !stone || world.npcs.some((n) => n.npcId === 'transmog')) return;
  const sp = transmogSprites();
  const p = world.dungeon.nearestFree(stone.x + place.dx, stone.y + place.dy, 7);
  const side = place.mirror ?? -1;
  const mirror = new Decor(p.x + side * 15, p.y + 1, {
    sprite: sp.mirror, glow: sp.mirrorGlow, shadow: 10, box: [-6, -4, 6, 1],
    light: { dx: 0, dy: -36, radius: 30, color: [255, 170, 100], intensity: 0.6, flicker: 0.2, bloom: 0.3 },
  }, world);
  world.props.push(mirror);
  const npc = world.spawn(new Mistress('transmog', p.x, p.y, { ...MISTRESS, facing: -side }, sp, world));
  npc.markerY = 54;
  npc.mirror = mirror;
  world.interactables.push(npc);
  world.npcs.push(npc);
  world.flow?.rebuildBlocked?.();
}
