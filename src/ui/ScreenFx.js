import { CONFIG } from '../config.js';
import { makeCanvas } from '../gfx/PixelCanvas.js';

// Bildgröße wird live gelesen: im Hochformat ist das Spielbild höher als breit.
function radial(W, H, inner, outer, c0, c1) {
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * inner, W / 2, H / 2, Math.max(W, H) * outer);
  g.addColorStop(0, c0); g.addColorStop(1, c1);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  return c;
}

// Bildschirm-Effekte im Pixel-Canvas (unter dem HTML-HUD): Vignette,
// Treffer-Rand, Puls bei wenig Leben, Abdunkeln bei Tod/Pause, Debug-Zeile.
export class ScreenFx {
  constructor(session) {
    this.s = session;
    this.t = 0;
    this.size = '';
  }
  #build(W, H) {
    this.size = `${W}x${H}`;
    this.vignette = radial(W, H, 0.38, 0.64, 'rgba(0,0,0,0)', 'rgba(6,2,12,0.72)');
    // Farbstimmung: oben kühles Violett, unten warme Glut (soft-light)
    this.grade = makeCanvas(W, H);
    const gctx = this.grade.getContext('2d');
    const lg = gctx.createLinearGradient(0, 0, 0, H);
    lg.addColorStop(0, 'rgba(70,40,130,0.55)');
    lg.addColorStop(0.55, 'rgba(128,128,128,0)');
    lg.addColorStop(1, 'rgba(200,110,50,0.4)');
    gctx.fillStyle = lg; gctx.fillRect(0, 0, W, H);
    this.hurt = radial(W, H, 0.3, 0.6, 'rgba(160,10,20,0)', 'rgba(170,12,24,0.8)');
  }
  update(dt) { this.t += dt; }
  draw(ctx) {
    const W = CONFIG.viewWidth, H = CONFIG.viewHeight;
    if (this.size !== `${W}x${H}`) this.#build(W, H);
    const s = this.s, hero = s.world.hero;
    ctx.globalCompositeOperation = 'soft-light';
    ctx.drawImage(this.grade, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.vignette, 0, 0);
    const low = !hero.dead && hero.hp / hero.maxHp < 0.3;
    const a = Math.max(s.hurtFlash, low ? 0.22 + 0.18 * Math.sin(this.t * 6) : 0);
    if (a > 0) { ctx.globalAlpha = a; ctx.drawImage(this.hurt, 0, 0); ctx.globalAlpha = 1; }
    // Tod: die Welt bleibt sichtbar (sie läuft weiter), nur gedämpft
    if (hero.dead && s.deadTime > 0.6) {
      ctx.globalAlpha = Math.min(0.5, (s.deadTime - 0.6) * 0.5);
      ctx.fillStyle = '#0a0308'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
    if (s.debug) {
      const w = s.world;
      s.font.draw(ctx, `FPS ${s.fps}  ENT ${w.actors.length}  PRT ${w.particles.active.length}  LGT ${w.lights.length}`, 8, H - 10, { color: '#9cff8a', shadow: true });
    }
  }
}
