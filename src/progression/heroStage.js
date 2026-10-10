import { h } from '../core/dom.js';
import { getHeroSprites } from '../sprites/hero.js';
import { spriteStyle } from '../character/cosmetics.js';

// Bühne im Inventar: die eigene Figur mit der sichtbaren Ausrüstung (inkl. Garderobe), in Ruhe
// atmend auf einem kleinen Steinsockel. Antippen lässt sie eine kurze Schlagfolge zeigen.
// Gezeichnet in Weltpixeln: Heldenframes haben Auflösung 2, die Leinwand ebenso; die CSS-Größe
// ist ein ganzzahliges Vielfaches (progression.css: 4× bzw. 6×), damit nichts verschwimmt.
const W = 52, H = 50, RES = 2, FLOOR = H - 6;
const COMBO = [['atk1', 0.42, 13], ['atk2', 0.42, 13], ['atk3', 0.55, 11]];

export class HeroStage {
  constructor() {
    this.canvas = h('canvas.pg-stage-canvas', { 'aria-hidden': 'true' });
    this.canvas.width = W * RES; this.canvas.height = H * RES;
    this.ctx = this.canvas.getContext('2d');
    this.key = null; this.anims = null;
    this.t = 0; this.combo = null; this.raf = 0; this.last = 0;
    this.floor = floorArt();
    this.canvas.addEventListener('pointerdown', () => { if (this.anims?.atk1) this.combo = { t: 0 }; });
  }

  // c = character-Slice, gear = aufgelöstes Aussehen (game.character.previewGear()) oder null
  set(c, gear) {
    const style = spriteStyle(c?.appearance ?? {});
    const key = JSON.stringify([c?.raceId, c?.classId, c?.appearance?.variant ?? 0, gear, style]);
    if (key === this.key) return;
    this.key = key;
    try { this.anims = getHeroSprites(c?.raceId ?? 'human', c?.classId ?? 'warrior', c?.appearance?.variant ?? 0, gear, style, RES); } catch (err) {
      console.warn('Heldenbild fehlgeschlagen', err); this.anims = null;
    }
    this.draw();
  }

  // Läuft, solange die Leinwand im Dokument hängt (das Inventar baut sein DOM bei jeder Änderung neu,
  // die Bühne wird dabei nur umgehängt).
  start() {
    if (this.raf) return;
    this.last = performance.now();
    const step = (now) => {
      if (!this.canvas.isConnected) { this.raf = 0; return; }
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now; this.t += dt;
      if (this.combo) this.combo.t += dt;
      this.draw();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  #frame() {
    const a = this.anims;
    if (this.combo) {
      let t = this.combo.t;
      for (const [name, dur, fps] of COMBO) {
        if (t < dur && a[name]) return pick(a[name], t, fps);
        t -= dur;
      }
      this.combo = null;
    }
    return pick(a.idle, this.t, 6);
  }

  draw() {
    const { ctx } = this;
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.floor, 0, 0);
    if (!this.anims) return;
    const f = this.#frame();
    f?.draw(ctx, W / 2, FLOOR);
  }
}

function pick(anim, time, fps) {
  const n = anim.frames.length;
  const i = anim.loop === false ? Math.min(n - 1, Math.floor(time * fps)) : Math.floor(time * fps) % n;
  return anim.frames[Math.max(0, i)];
}

// Sockel: Steinscheibe mit Glutrand, gerastert statt weich verlaufen (einmal gezeichnet)
function floorArt() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const cx = W / 2 - 0.5, cy = FLOOR + 1, rx = 17, ry = 4.5;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry, d = Math.sqrt(dx * dx + dy * dy);
      const chk = (x + y) & 1;
      let col = null;
      if (d < 0.42) col = '#08050c';                                // Schatten unter der Figur
      else if (d < 0.86) col = dy < 0 ? '#2a1e2c' : '#1e1520';      // Steinplatte, oben heller
      else if (d < 1) col = dy < 0 ? '#45302e' : '#5a2a14';         // Kante, vorne glutwarm
      else if (d < 1.25 && dy > -0.3) col = chk ? '#2c120a' : null; // Glutschein, gerastert
      if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
    }
  }
  return c;
}

// Kleine Pixel-Symbole für die Werte unter der Figur (7×7, '.' = leer)
const GLYPHS = {
  hp: ['.rr.rr.', 'rRRrRRr', 'rRRRRRr', 'rRRRRRr', '.rRRRr.', '..rRr..', '...r...'],
  power: ['.....sS', '....sS.', '...sS..', 'g.sS...', '.gS....', '.bg....', 'b..g...'],
  armor: ['sssssss', 'sSSSSSs', 'sSSsSSs', 'sSsssSs', '.sSSSs.', '..sSs..', '...s...'],
  crit: ['...y...', '.y.Y.y.', '..YYY..', 'yYYwYYy', '..YYY..', '.y.Y.y.', '...y...'],
  sort: ['.S...S.', 'SSS..S.', '.S...S.', '.S...S.', '.S...S.', '.S..SSS', '.S...S.'],
  multi: ['SSS.SSS', 'S.S.S.S', 'SSS.SSS', '.......', 'SSS.SSS', 'S.S.S.S', 'SSS.SSS'],
  gear: ['...g...', '..gGg..', '.gGHGg.', 'gGHHHGg', '.gGHGg.', '..gGg..', '...g...'],
};
const GLYPH_PAL = { r: '#8a1a22', R: '#e0484a', s: '#6a7488', S: '#c8d0e0', g: '#8a5a18', G: '#e8c25a', H: '#fff4c0', b: '#5a3626', y: '#c8922a', Y: '#ffd66a', w: '#ffffff' };
const glyphCache = new Map();
export function statGlyph(id) {
  if (glyphCache.has(id)) return glyphCache.get(id);
  const rows = GLYPHS[id];
  const c = document.createElement('canvas');
  c.width = 7; c.height = 7;
  const g = c.getContext('2d');
  rows?.forEach((row, y) => [...row].forEach((ch, x) => { if (GLYPH_PAL[ch]) { g.fillStyle = GLYPH_PAL[ch]; g.fillRect(x, y, 1, 1); } }));
  const url = c.toDataURL();
  glyphCache.set(id, url);
  return url;
}
