import { EV } from '../core/events.js';
import { Decor } from '../entities/Decor.js';
import { drawGlowLayer } from '../gfx/Sprite.js';
import { frameUrl } from '../ui/pixelFrame.js';
import { createBoardSprites } from './sprite.js';
import { teaserPanel } from './panel.js';

// Ankündigung der Erweiterung „Sternenglut“: in jeder Stadt eine Sternentafel neben dem Wegstein, die das Fenster
// 'teaser' öffnet; dasselbe Fenster erscheint einmal nach dem Anmelden, bis der Spieler „nicht mehr zeigen“ anhakt.
// VORSCHAU: Entwurf über localStorage 'emberwrath:teaser:variant' (A | B | C), Standard A.
const PLACES = {
  emberhollow: { dx: -172, dy: -22 },
  ashwood: { dx: 48, dy: -150 },
  cinder_peaks: { dx: 190, dy: -20 },
  ashen_steppe: { dx: 220, dy: -30 },
  blighted_marsh: { dx: 48, dy: 40 },
  frostspire: { dx: -80, dy: -60 },
  ember_wastes: { dx: -40, dy: 80 },
};
const KEY = 'emberwrath:teaser:sternenglut:hide';
const VARIANT = 'emberwrath:teaser:variant';
const variant = () => { try { return localStorage.getItem(VARIANT) || 'A'; } catch { return 'A'; } };

class StarBoard extends Decor {
  constructor(x, y, sp, world) {
    super(x, y, { sprite: sp.frames[0], shadow: 14, box: sp.box, light: { ...sp.light, intensity: 0.7, flicker: 0.1, bloom: 0.35 } }, world);
    this.sp = sp; this.interactRange = 24; this.teaserBoard = true;
  }
  update(dt, world) {
    super.update(dt, world);
    const i = this.sp.seq[Math.floor(this.t * this.sp.fps) % this.sp.seq.length];
    this.sprite = this.sp.frames[i]; this.glowIndex = i;
  }
  renderEmissive(ctx, cx, cy) {
    ctx.globalAlpha = (0.85 + 0.15 * Math.sin(this.t * 2.1)) * this.alpha;
    drawGlowLayer(ctx, this.sprite, this.sp.glows[this.glowIndex ?? 0] ?? this.sp.glows[0], this.x - cx, this.y - cy);
    ctx.globalAlpha = 1;
  }
  canInteract(world) { return !world.hero.dead; }
  prompt() { return 'Sternentafel lesen'; }
  promptAnchor() { return { x: this.x, y: this.y - this.sp.top }; }
  interact(world) { world.session.panels?.open('teaser'); }
}

export function installTeaser(game) {
  const prefs = {
    hidden: () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } },
    setHidden: (on) => { try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* egal */ } },
  };
  game.panels.register('teaser', (s) => {
    const p = teaserPanel(s, prefs, variant());
    p.root.style.setProperty('--ts-frame', `url(${frameUrl(2, 'dawn')})`);
    return p;
  }, { title: 'Sternenglut' });

  let shown = false;
  game.addSessionSystem('teaser', (sess) => {
    const offs = [
      sess.bus.on(EV.ZONE_ENTER, () => {
        try { placeBoard(sess.world); } catch (err) { console.error('Sternentafel', err); }
        // einmal je Anmeldung, wenn kein anderes Fenster offen ist
        if (shown || prefs.hidden()) return;
        shown = true;
        setTimeout(() => { if (!sess.panels.openId) sess.panels.open('teaser'); }, 1200);
      }),
    ];
    return { dispose: () => offs.forEach((off) => off?.()) };
  }, 27);
}

function placeBoard(world) {
  const pl = world && !world.zone?.instanced && PLACES[world.zone?.id];
  const stone = world?.waystone;
  if (!pl || !stone || world.props.some((p) => p.teaserBoard)) return;
  const sp = createBoardSprites(variant());
  const p = world.dungeon.nearestFree(stone.x + pl.dx, stone.y + pl.dy, 7);
  const board = new StarBoard(p.x, p.y, sp, world);
  world.props.push(board);
  world.interactables.push(board);
  world.flow?.rebuildBlocked?.();
}
