import { CONFIG } from '../config.js';

// Fester Simulations-Takt (60 Hz) mit Akkumulator, Rendering so oft wie
// der Browser zeichnet. Hält Gameplay deterministisch und framerate-unabhängig.
export class GameLoop {
  constructor({ update, render }) {
    this.update = update;
    this.render = render;
    this.acc = 0;
    this.last = 0;
    this.running = false;
    this.frame = this.frame.bind(this);
  }
  start() {
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }
  frame(now) {
    if (!this.running) return;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > CONFIG.maxFrameTime) dt = CONFIG.maxFrameTime;
    this.acc += dt;
    const step = CONFIG.fixedStep;
    // Ein Fehler in einem Tick darf die Schleife nicht dauerhaft beenden.
    requestAnimationFrame(this.frame);
    try {
      while (this.acc >= step) {
        this.acc -= step;
        this.update(step);
      }
      this.render(this.acc / step);
    } catch (err) {
      this.errors = (this.errors ?? 0) + 1;
      if (this.errors <= 5) console.error('Fehler in der Spielschleife', err);
    }
  }
}
