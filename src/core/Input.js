// Aktionsbasiertes Input: Gameplay fragt Aktionen ("attack", "dodge") ab,
// nicht Tasten. Tastatur, Maus und Touch speisen dieselben Aktionen –
// so bleibt der spätere Mobile-Ausbau ohne Gameplay-Änderungen möglich.
// Verbindliche Aktionsnamen (siehe docs/INTEGRATION.md). Neue Aktionen nur
// über den Architektur-Thread; die Tastenbelegung selbst darf Thread D anpassen.
// skill3/skill4/talents: Runde 4 (INTEGRATION.md §11.7, Fähigkeiten ab Stufe 4/12 und Talentbaum von Thread A).
// mount: Aufsitzen/Absitzen ab Stufe 20 (INTEGRATION.md §12.6, Logik in Thread A's Hero).
export const ACTIONS = ['up', 'down', 'left', 'right', 'attack', 'dodge', 'skill1', 'skill2', 'skill3', 'skill4', 'potion',
  'mount', 'interact', 'inventory', 'character', 'quests', 'talents', 'pause', 'mute', 'debug'];

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyJ: 'attack', Space: 'attack',
  KeyK: 'dodge', ShiftLeft: 'dodge', ShiftRight: 'dodge',
  KeyQ: 'skill1', Digit1: 'skill1',
  KeyR: 'skill2', Digit2: 'skill2',
  KeyT: 'skill3', Digit4: 'skill3',
  KeyG: 'skill4', Digit5: 'skill4',
  KeyH: 'potion', Digit3: 'potion',
  KeyV: 'mount', Digit6: 'mount',
  KeyE: 'interact', KeyF: 'interact',
  KeyI: 'inventory', KeyB: 'inventory',
  KeyC: 'character',
  KeyL: 'quests',
  KeyU: 'talents',
  KeyN: 'mute', // M öffnet die Zonenkarte (ui/Minimap.js)
  KeyP: 'pause', Escape: 'pause',
  F3: 'debug', Backquote: 'debug',
};

// Tastendrücke in Eingabefeldern (z. B. Charaktername) gehören dem Feld, nicht dem Spiel.
function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

export class Input {
  constructor(canvas, viewToCanvas) {
    this.canvas = canvas;
    this.viewToCanvas = viewToCanvas; // Funktion: Client-Koordinaten -> View-Pixel
    this.down = new Set();
    this.pressedQueue = new Set();
    this.pointer = { x: 0, y: 0, active: false, lastMove: -1e9 };
    this.touch = { stickId: null, cx: 0, cy: 0, x: 0, y: 0, active: false };
    this.usingTouch = false;
    this.time = 0;
    this.#bind();
    // Touch-Gerät ohne Maus: gleich im Touch-Modus starten (Menüs werden größer).
    if (window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches) this.#setTouch(true);
  }

  // Aktionen können auch von HTML-Knöpfen (Touch-UI, Menüs) ausgelöst werden.
  press(action) { this.#press(action); }
  release(action) { this.#release(action); }

  #press(action) {
    if (!this.down.has(action)) this.pressedQueue.add(action);
    this.down.add(action);
  }
  #release(action) {
    this.down.delete(action);
  }

  #bind() {
    window.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      // Beim Tippen in Eingabefeldern löst nur Escape eine Aktion aus (KeyP ist ebenfalls 'pause').
      if (!a || (isTyping(e) && e.code !== 'Escape')) return;
      e.preventDefault();
      if (!e.repeat) this.#press(a);
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) this.#release(a);
    });
    window.addEventListener('blur', () => this.down.clear());

    const c = this.canvas;
    c.addEventListener('mousemove', (e) => {
      const p = this.viewToCanvas(e.clientX, e.clientY);
      this.pointer.x = p.x; this.pointer.y = p.y;
      this.pointer.active = true;
      this.pointer.lastMove = this.time;
    });
    c.addEventListener('mousedown', (e) => {
      this.pointer.active = true;
      this.pointer.lastMove = this.time;
      if (e.button === 0) this.#press('attack');
      if (e.button === 2) this.#press('dodge');
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.#release('attack');
      if (e.button === 2) this.#release('dodge');
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    // --- Touch: virtueller Stick. Ein Finger, der auf freier Fläche in der
    // linken Bildschirmhälfte aufsetzt, wird zum Stick (auch im Randbereich
    // neben dem Spielbild). Knöpfe und Panels (HTML) behalten ihre Touches.
    // Koordinaten des Sticks sind CSS-Pixel des Fensters (HUD zeichnet ihn).
    const opts = { passive: false };
    document.addEventListener('touchstart', (e) => {
      this.#setTouch(true);
      for (const t of e.changedTouches) {
        if (this.touch.stickId !== null || !this.#isFreeSurface(t.target)) continue;
        if (t.clientX > window.innerWidth * 0.5) continue;
        e.preventDefault();
        Object.assign(this.touch, { stickId: t.identifier, cx: t.clientX, cy: t.clientY, x: t.clientX, y: t.clientY, active: true });
      }
    }, opts);
    document.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.touch.stickId) continue;
        e.preventDefault();
        this.touch.x = t.clientX; this.touch.y = t.clientY;
        // Stick-Basis folgt, wenn der Finger weit hinauszieht
        const dx = this.touch.x - this.touch.cx, dy = this.touch.y - this.touch.cy, l = Math.hypot(dx, dy), m = this.stickRadius * 1.6;
        if (l > m) { this.touch.cx += (dx / l) * (l - m); this.touch.cy += (dy / l) * (l - m); }
      }
    }, opts);
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touch.stickId) { this.touch.stickId = null; this.touch.active = false; }
      }
    };
    document.addEventListener('touchend', end, opts);
    document.addEventListener('touchcancel', end, opts);
    // Echte Maus oder Tastatur schaltet zurück in den Desktop-Modus.
    window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) this.#setTouch(false); });
    window.addEventListener('keydown', () => this.#setTouch(false));
  }

  #isFreeSurface(el) {
    if (!el || el === this.canvas || el === document.body || el === document.documentElement) return true;
    return !el.closest?.('button, input, select, textarea, a, .ef-panel, .ef-panel-host, .ef-screen, .ef-interactive');
  }

  #setTouch(on) {
    if (this.usingTouch === on) return;
    this.usingTouch = on;
    if (on) this.pointer.active = false;
    document.documentElement.classList.toggle('ef-touch', on);
  }

  viewW = 480;
  viewH = 270;
  stickRadius = 44; // CSS-Pixel bis Vollausschlag

  // Bewegungsachse, normalisiert (Länge <= 1).
  axis() {
    let x = 0, y = 0;
    if (this.down.has('left')) x -= 1;
    if (this.down.has('right')) x += 1;
    if (this.down.has('up')) y -= 1;
    if (this.down.has('down')) y += 1;
    if (this.touch.active) {
      const dx = this.touch.x - this.touch.cx, dy = this.touch.y - this.touch.cy;
      const len = Math.hypot(dx, dy);
      const max = this.stickRadius;
      if (len > 6) { x = dx / Math.max(len, max); y = dy / Math.max(len, max); }
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  isDown(action) { return this.down.has(action); }
  pressed(action) { return this.pressedQueue.has(action); }

  // Maus gilt als Zielgerät, solange sie kürzlich benutzt wurde.
  get aimWithPointer() {
    return this.pointer.active && !this.usingTouch && this.time - this.pointer.lastMove < 2.5;
  }

  endStep(dt) {
    this.time += dt;
    this.pressedQueue.clear();
  }
}
