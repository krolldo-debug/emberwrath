import { EV } from './events.js';
import { clear } from './dom.js';

// Szenen = Bildschirme des Spiels: 'title', 'account', 'characterCreate', 'play' …
// Eine Szene ist ein Objekt mit optionalen Methoden:
//   enter(params)   beim Betreten; darf this.root (DOM-Element) setzen
//   exit()          beim Verlassen (Abos lösen, Timer stoppen)
//   update(dt)      60-Hz-Logik
//   render(ctx)     zeichnet in das interne View-Canvas (Pixel-Welt)
//   root            DOM-Element, das im UI-Layer (#ui) angezeigt wird
// Registriert wird per game.scenes.register(id, factory), factory(game) -> Szene.
// Gewechselt wird per game.scenes.go(id, params).
export class SceneManager {
  constructor(game, uiLayer) {
    this.game = game;
    this.uiLayer = uiLayer;
    this.factories = new Map();
    this.current = null;
    this.currentId = null;
    this.pending = null;
  }

  register(id, factory) { this.factories.set(id, factory); }
  has(id) { return this.factories.has(id); }

  // Wechsel wird am Anfang des nächsten Updates ausgeführt (nie mitten im Frame).
  go(id, params = {}) {
    if (!this.factories.has(id)) throw new Error(`Szene ${id} nicht registriert`);
    this.pending = { id, params };
  }

  #apply() {
    const { id, params } = this.pending;
    this.pending = null;
    const from = this.currentId;
    if (this.current) { this.current.exit?.(); }
    clear(this.uiLayer.scene);
    this.current = this.factories.get(id)(this.game);
    this.currentId = id;
    this.current.enter?.(params);
    if (this.current.root) this.uiLayer.scene.append(this.current.root);
    this.uiLayer.root.dataset.scene = id;
    this.game.bus.emit(EV.SCENE_CHANGE, { from, to: id });
  }

  update(dt) {
    if (this.pending) this.#apply();
    this.current?.update?.(dt);
  }

  render(ctx) {
    this.current?.render?.(ctx);
  }
}
