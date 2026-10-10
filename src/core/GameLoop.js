import { CONFIG } from '../config.js';

// Fester Simulations-Takt (60 Hz) mit Akkumulator, Rendering so oft wie
// der Browser zeichnet. Hält Gameplay deterministisch und framerate-unabhängig.
// Höchstens CONFIG.maxStepsPerFrame Schritte pro Bild: kommt ein Gerät nicht mit, wird der Rückstand verworfen,
// statt dass jedes Bild noch mehr nachholen muss (sonst bleibt es dauerhaft bei wenigen Bildern pro Sekunde).
// onFatal(err) wird gerufen, wenn die Schleife über viele Bilder hinweg nur noch Fehler liefert.
// Online-Welt: Zeichnet der Browser nicht (Tab im Hintergrund, App gewechselt, Fenster minimiert), rechnet ein
// Zeitgeber in denselben festen Schritten weiter (höchstens CONFIG.backgroundCatchUp Sekunden je Aufruf nachholen).
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
    this.drawnAt = 0;      // letztes gezeichnetes Bild (performance.now)
    this.bgLast = null;    // Hintergrund-Takt aktiv: Zeitpunkt des letzten Hintergrund-Schritts
    this.bgAcc = 0;
    this.watch = null;
  }
  start() {
    this.running = true;
    this.last = this.drawnAt = performance.now();
    requestAnimationFrame(this.frame);
    this.watch ??= setInterval(() => this.#background(), 250);
  }
  frame(now) {
    if (!this.running) return;
    // Ein Fehler in einem Tick darf die Schleife nicht dauerhaft beenden.
    requestAnimationFrame(this.frame);
    this.drawnAt = performance.now();
    // Zurück aus dem Hintergrund: die Zeit dazwischen hat der Hintergrund-Takt schon gerechnet
    if (this.bgLast != null) { this.bgLast = null; this.bgAcc = 0; this.last = now; }
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
  // Hintergrund: nur wenn seit über 0,3 s kein Bild gezeichnet wurde
  #background() {
    if (!this.running) return;
    const now = performance.now();
    if (now - this.drawnAt < 300) return;
    if (this.bgLast == null) this.bgLast = this.drawnAt;
    const dt = Math.min((now - this.bgLast) / 1000, CONFIG.backgroundCatchUp);
    this.bgLast = now;
    this.bgAcc += dt;
    const step = CONFIG.fixedStep;
    try {
      while (this.bgAcc >= step) { this.bgAcc -= step; this.update(step); }
    } catch (err) { this.bgAcc = 0; this.#report(err); }
  }
  #report(err) {
    this.errors++;
    this.lastError = err;
    if (this.errors <= 5 || this.errors % 600 === 0) console.error('Fehler in der Spielschleife', err);
  }
}
