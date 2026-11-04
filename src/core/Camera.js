import { CONFIG } from '../config.js';
import { clamp, rand } from './math.js';

// Folgt einem Ziel mit Dämpfung und Blick-Vorlauf, begrenzt auf die Welt,
// und liefert Screenshake (trauma-basiert, klingt quadratisch ab).
// Render-Position: gerastert auf das Feinraster der Zeichenfläche (1/CONFIG.renderScale Weltpixel), aufgeteilt in den
// ganzzahligen Teil rx/ry (Weltpixel, wie alle Zeichner ihn erwarten) und den Feinversatz fx/fy (0 ≤ f < 1), um den
// PlayScene die ganze Welt verschiebt. So rollt der Boden bei 2-facher Zeichenfläche in halben statt ganzen Weltpixeln.
// anchor (der Held): Die Render-Position rastet relativ zu ihm ein. Ohne das runden Held und Kamera unabhängig, und
// beim Laufen springt der Held jedes Bild um einen Weltpixel vor und zurück (1,47 px je Bild bei 88 px/s) – auf
// großen Bildschirmen (Mac: 3 CSS-Pixel je Weltpixel) sieht das Bild dann unruhig aus, obwohl die Bildrate stimmt.
export class Camera {
  constructor(worldW, worldH) {
    this.x = 0; this.y = 0;
    this.worldW = worldW; this.worldH = worldH;
    this.trauma = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.kickX = 0; this.kickY = 0;
    this.enabled = true; // Geräte-Einstellung screenShake (PlayScene setzt sie)
    // Sichtbarer Bereich (Weltpixel { x0, y0, x1, y1 }) statt der ganzen Welt, z. B. ohne die Innenräume der Häuser
    // (world/interiors.js). Ist er kleiner als das Bild, steht er in der Bildmitte.
    this.bounds = null;
    this.anchor = null;   // { x, y }, siehe oben
    this.edgeX = false; this.edgeY = false; // am Rand festgehalten: dann ohne Einrasten am Helden (sonst wackelt der Boden)
  }
  snapTo(tx, ty) {
    this.x = tx - CONFIG.viewWidth / 2;
    this.y = ty - CONFIG.viewHeight / 2;
    this.#clamp();
  }
  shake(amount) { if (!this.enabled) return; this.trauma = Math.min(this.trauma + amount, 8); }
  kick(dx, dy) { if (!this.enabled) return; this.kickX += dx; this.kickY += dy; }

  update(dt, tx, ty) {
    const gx = tx - CONFIG.viewWidth / 2, gy = ty - CONFIG.viewHeight / 2;
    const k = 1 - Math.exp(-dt * 7);
    this.x += (gx - this.x) * k;
    this.y += (gy - this.y) * k;
    this.#clamp();
    this.trauma = Math.max(0, this.trauma - dt * 18);
    const s = this.trauma * this.trauma * 0.12;
    this.shakeX = rand(-s, s); this.shakeY = rand(-s, s);
    this.kickX *= Math.exp(-dt * 20); this.kickY *= Math.exp(-dt * 20);
  }
  #clamp() {
    const b = this.bounds, W = CONFIG.viewWidth, H = CONFIG.viewHeight, x = this.x, y = this.y;
    if (!b) {
      this.x = clamp(this.x, 0, Math.max(0, this.worldW - W));
      this.y = clamp(this.y, 0, Math.max(0, this.worldH - H));
    } else {
      this.x = b.x1 - b.x0 < W ? (b.x0 + b.x1 - W) / 2 : clamp(this.x, b.x0, b.x1 - W);
      this.y = b.y1 - b.y0 < H ? (b.y0 + b.y1 - H) / 2 : clamp(this.y, b.y0, b.y1 - H);
    }
    this.edgeX = this.x !== x; this.edgeY = this.y !== y;
  }
  // Render-Position (inkl. Shake) im Feinraster: Abstand zum Anker gerastert, nicht die Position selbst.
  #snap(v, a, edge) {
    const q = CONFIG.renderScale || 1, s = (n) => Math.round(n * q) / q;
    return a == null || edge ? s(v) : s(a) - s(a - v);
  }
  get px() { return this.#snap(this.x + this.shakeX + this.kickX, this.anchor?.x, this.edgeX); }
  get py() { return this.#snap(this.y + this.shakeY + this.kickY, this.anchor?.y, this.edgeY); }
  // Ganzzahliger Teil (Weltpixel) und Feinversatz
  get rx() { return Math.floor(this.px); }
  get ry() { return Math.floor(this.py); }
  get fx() { const p = this.px; return p - Math.floor(p); }
  get fy() { const p = this.py; return p - Math.floor(p); }
}
