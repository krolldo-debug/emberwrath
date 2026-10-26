import { EV } from '../core/events.js';
import { Decor } from '../entities/Decor.js';
import { drawGlowLayer } from '../gfx/Sprite.js';
import { frameUrl } from '../ui/pixelFrame.js';
import { createBoardSprites } from './sprite.js';
import { teaserPanel } from './panel.js';

// Ankündigung der Erweiterung „Sternenglut“: in jeder der sieben alten Städte eine Sternentafel, die das Fenster
// 'teaser' öffnet (panel.js). Dasselbe Fenster erscheint einmal nach dem Anmelden, bis der Spieler „Beim Anmelden nicht
// mehr zeigen“ anhakt (Gerät, game.prefs 'teaserHidden'). Neue Helden sehen es beim allerersten Start nicht (Einführung).
// Wenn die Erweiterung für alle offen ist (STARS_PUBLIC): installTeaser aus main.js nehmen oder Texte auf „Jetzt da“ ändern.
//
// Plätze: Abstand zum Wegstein in Spielpixeln. Neben dem Weg, nicht auf Questpfaden, nicht dicht an Händlern,
// Auktionator, Gewandmeisterin oder Briefkasten (Screenshots je Stadt geprüft).
const PLACES = {
  emberhollow: { dx: -192, dy: -50 },    // Nordwestecke des Dorfplatzes, auf dem Gras zwischen den Laternen
  ashwood: { dx: -232, dy: -126 },       // bei den Zelten unter dem westlichen Baumhaus
  cinder_peaks: { dx: -80, dy: 94 },     // Südwesten des Lagers, neben dem Zelt
  ashen_steppe: { dx: 240, dy: -34 },    // zwischen Jurte und Totempfahl, Ostseite
  blighted_marsh: { dx: -224, dy: -50 }, // auf festem Boden vor der westlichen Pfahlhütte
  frostspire: { dx: 112, dy: 14 },       // östlich des Wegsteins am Waldrand, neben dem Banner
  ember_wastes: { dx: -112, dy: 142 },   // Westseite des Bastionshofs
};
const PREF = 'teaserHidden';

class StarBoard extends Decor {
  constructor(x, y, sp, world) {
    super(x, y, { sprite: sp.frame, shadow: 14, box: sp.box, light: { ...sp.light, intensity: 0.7, flicker: 0.1, bloom: 0.35 } }, world);
    this.sp = sp; this.interactRange = 24; this.teaserBoard = true;
  }
  renderEmissive(ctx, cx, cy) {
    ctx.globalAlpha = (0.85 + 0.15 * Math.sin(this.t * 2.1)) * this.alpha;
    drawGlowLayer(ctx, this.sprite, this.sp.glow, this.x - cx, this.y - cy);
    ctx.globalAlpha = 1;
  }
  canInteract(world) { return !world.hero.dead; }
  prompt() { return 'Sternentafel lesen'; }
  promptAnchor() { return { x: this.x, y: this.y - this.sp.top }; }
  interact(world) { world.session.panels?.open('teaser'); }
}

export function installTeaser(game) {
  const prefs = {
    hidden: () => !!game.prefs.get(PREF, false),
    setHidden: (on) => game.prefs.set(PREF, !!on),
  };
  game.panels.register('teaser', (s) => {
    const p = teaserPanel(s, prefs);
    p.root.style.setProperty('--ts-frame', `url(${frameUrl(2, 'dawn')})`);
    return p;
  }, { title: 'Sternenglut' });

  // einmal je Anmeldung; nicht beim allerersten Start eines neuen Helden
  let pending = false;
  game.bus.on(EV.GAME_STARTED, ({ isNew }) => { pending = !isNew; });
  game.addSessionSystem('teaser', (sess) => {
    let timer = 0;
    const offs = [
      sess.bus.on(EV.ZONE_ENTER, () => {
        try { placeBoard(sess.world); } catch (err) { console.error('Sternentafel', err); }
        if (!pending || prefs.hidden()) return;
        pending = false;
        timer = setTimeout(() => { if (!sess.panels.openId && !sess.world?.hero?.dead) sess.panels.open('teaser'); }, 1200);
      }),
    ];
    return { dispose: () => { clearTimeout(timer); offs.forEach((off) => off?.()); } };
  }, 27);
}

function placeBoard(world) {
  const pl = world && !world.zone?.instanced && PLACES[world.zone?.id];
  const stone = world?.waystone;
  if (!pl || !stone || world.props.some((p) => p.teaserBoard)) return;
  const p = world.dungeon.nearestFree(stone.x + pl.dx, stone.y + pl.dy, 7);
  const board = new StarBoard(p.x, p.y, createBoardSprites(), world);
  world.props.push(board);
  world.interactables.push(board);
  world.flow?.rebuildBlocked?.();
}
