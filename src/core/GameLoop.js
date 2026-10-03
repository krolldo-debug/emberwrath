import { CONFIG } from '../config.js';

// Fester Simulations-Takt (60 Hz) mit Akkumulator, Rendering so oft wie
// der Browser zeichnet. Hält Gameplay deterministisch und framerate-unabhängig.
// Höchstens CONFIG.maxStepsPerFrame Schritte pro Bild: kommt ein Gerät nicht mit, wird der Rückstand verworfen,
// statt dass jedes Bild noch mehr nachholen muss (sonst bleibt es dauerhaft bei wenigen Bildern pro Sekunde).
// onFatal(err) wird gerufen, wenn die Schleife über viele Bilder hinweg nur noch Fehler liefert.
export class GameLoop {
  constructor({ update, render, onFatal = () => {} }) {
    this.update = update;
    this.render = render;
    this.onFatal = onFatal;
    this.acc = 0;
    this.last = 0;
    this.running = false;
    this.errors = 0;
    this.failing = 0;
    this.frame = this.frame.bind(this);
  }
  start() {
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }
  frame(now) {
    if (!this.running) return;
    // Ein Fehler in einem Tick darf die Schleife nicht dauerhaft beenden.
    requestAnimationFrame(this.frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > CONFIG.maxFrameTime) dt = CONFIG.maxFrameTime;
    this.acc += dt;
    const step = CONFIG.fixedStep;
    let ok = true;
    // Logik und Zeichnen getrennt absichern: ein Fehler in der Logik friert nicht auch das Bild ein.
    try {
      let steps = 0;
      while (this.acc >= step) {
        if (steps++ >= CONFIG.maxStepsPerFrame) { this.acc = 0; break; }
        this.acc -= step;
        this.update(step);
      }
    } catch (err) { ok = false; this.acc = 0; this.#report(err); }
    try { this.render(this.acc / step); } catch (err) { ok = false; this.#report(err); }
    if (ok) { this.failing = 0; return; }
    // Etwa zwei Sekunden lang nur Fehler: Hinweis anzeigen statt stumm hängen zu bleiben.
    if (++this.failing === 120) this.onFatal(this.lastError);
  }
  #report(err) {
    this.errors++;
    this.lastError = err;
    if (this.errors <= 5 || this.errors % 600 === 0) console.error('Fehler in der Spielschleife', err);
  }
}
