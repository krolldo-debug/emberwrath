import { CONFIG } from '../config.js';
import { clamp, rand } from './math.js';

// Folgt einem Ziel mit Dämpfung und Blick-Vorlauf, begrenzt auf die Welt,
// und liefert Screenshake (trauma-basiert, klingt quadratisch ab).
export class Camera {
  constructor(worldW, worldH) {
    this.x = 0; this.y = 0;
    this.worldW = worldW; this.worldH = worldH;
    this.trauma = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.kickX = 0; this.kickY = 0;
    this.enabled = true; // Geräte-Einstellung screenShake (PlayScene setzt sie)
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
    this.x = clamp(this.x, 0, Math.max(0, this.worldW - CONFIG.viewWidth));
    this.y = clamp(this.y, 0, Math.max(0, this.worldH - CONFIG.viewHeight));
  }
  // Pixelgenaue Render-Position (inkl. Shake).
  get rx() { return Math.round(this.x + this.shakeX + this.kickX); }
  get ry() { return Math.round(this.y + this.shakeY + this.kickY); }
}
