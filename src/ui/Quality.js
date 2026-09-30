// Qualitätsstufe (Thread D): Einstellung 'quality' in game.prefs:
// 'auto' (Standard) | 'low' | 'medium' | 'high'. „Automatisch“ startet auf
// Touch-Geräten mittel, sonst hoch, und senkt die Stufe, wenn die Bildrate
// mehrere Sekunden unter 45 fällt (hebt sie nie selbst wieder an).
// Wirkt auf: Partikelbudget und -dichte, Leuchten (Bloom), Umgebungseffekte
// (Menge, Hitzeflimmern). Rein darstellend; Spielablauf bleibt gleich.
export const QUALITY_LEVELS = [
  { value: 'auto', label: 'Auto' },
  { value: 'low', label: 'Niedrig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
];
const PRESET = {
  low: { maxParticles: 350, density: 0.45, bloom: 0 },
  medium: { maxParticles: 800, density: 0.75, bloom: 0.7 },
  high: { maxParticles: 1400, density: 1, bloom: 1 },
};
const ORDER = ['low', 'medium', 'high'];

export class QualityControl {
  constructor(game) {
    this.game = game;
    this.autoLevel = document.documentElement.classList.contains('ef-touch') || window.matchMedia?.('(pointer: coarse)').matches ? 'medium' : 'high';
    this.slow = 0;
    this.frames = 0; this.acc = 0;
  }

  get setting() { return this.game.prefs?.get('quality', 'auto') ?? 'auto'; }
  get level() { const s = this.setting; return s === 'auto' ? this.autoLevel : (PRESET[s] ? s : 'high'); }

  // pro Frame aus dem Session-System: misst die Bildrate und wendet die Stufe an
  update(dt, session, weather) {
    if (this.setting === 'auto' && dt > 0 && dt < 0.5) {
      this.acc += dt; this.frames++;
      if (this.acc >= 1) {
        const fps = this.frames / this.acc; this.acc = 0; this.frames = 0;
        this.slow = fps < 45 && !session.paused ? this.slow + 1 : 0;
        const i = ORDER.indexOf(this.autoLevel);
        if (this.slow >= 4 && i > 0) { this.autoLevel = ORDER[i - 1]; this.slow = 0; }
      }
    }
    const lvl = this.level, P = PRESET[lvl];
    const w = session.world;
    if (w?.particles) { w.particles.max = P.maxParticles; w.particles.density = P.density; }
    if (w?.lighting) w.lighting.bloomScale = P.bloom;
    weather?.setQuality(lvl);
    document.documentElement.dataset.quality = lvl;
  }
}
