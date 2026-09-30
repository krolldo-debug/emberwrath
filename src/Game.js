import { CONFIG } from './config.js';
import { makeCanvas } from './gfx/PixelCanvas.js';
import { EventBus } from './core/EventBus.js';
import { EV } from './core/events.js';
import { GameLoop } from './core/GameLoop.js';
import { Input } from './core/Input.js';
import { Content } from './core/Content.js';
import { GameState } from './core/GameState.js';
import { LocalAuthority } from './core/Authority.js';
import { SaveStore } from './core/SaveStore.js';
import { Prefs } from './core/Prefs.js';
import { SceneManager } from './core/SceneManager.js';
import { PanelRegistry } from './core/PanelHost.js';
import { h } from './core/dom.js';
import { PixelFont } from './ui/PixelFont.js';
import { Sfx } from './audio/Sfx.js';
import { createAssets } from './Assets.js';

// Host des Spiels: besitzt die langlebigen Dienste (Bus, Input, Zustand,
// Speicher, Inhalte, Szenen) und die Präsentation (internes View-Canvas ->
// skaliertes Display-Canvas + HTML-UI-Layer). Spielinhalte kommen über die
// install()-Funktionen der Bereiche (siehe main.js und docs/INTEGRATION.md).
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.displayCtx = canvas.getContext('2d');
    this.view = makeCanvas(CONFIG.viewWidth, CONFIG.viewHeight);
    this.ctx = this.view.getContext('2d');

    this.bus = new EventBus();
    this.prefs = new Prefs(this.bus);
    this.content = new Content();
    this.authority = new LocalAuthority(this.content);
    this.state = new GameState(this.bus, this.authority, this.content);
    this.save = new SaveStore();
    this.save.bus = this.bus; // meldet save:character / save:deleted (z. B. für Cloud-Abgleich, src/online)
    this.font = new PixelFont();
    this.sfx = new Sfx();
    this.assets = createAssets();
    this.input = new Input(canvas, (x, y) => this.clientToView(x, y));
    this.input.viewW = CONFIG.viewWidth; this.input.viewH = CONFIG.viewHeight;

    this.ui = Game.#buildUiLayer();
    this.scenes = new SceneManager(this, this.ui);
    this.panels = new PanelRegistry();
    // Systeme, die in jeder Spielsitzung (PlayScene) laufen: { id, order, create(session) }
    this.sessionSystems = [];
    this.account = null; // eingeloggter lokaler Demo-Account { id, name }
    this.debug = false;
    this.fps = 0; this.#fpsAcc = 0; this.#fpsFrames = 0; this.#lastRender = performance.now();

    window.addEventListener('resize', () => this.resize());
    this.bus.on(EV.SCENE_CHANGE, () => this.resize());
    this.resize();
    this.loop = new GameLoop({ update: (dt) => this.update(dt), render: () => this.render() });
  }

  #fpsAcc; #fpsFrames; #lastRender; #quality = "";

  static #buildUiLayer() {
    let root = document.getElementById('ui');
    if (!root) { root = h('div'); root.id = 'ui'; document.body.append(root); }
    const layer = {
      root,
      scene: h('div.ui-scene'),   // DOM der aktuellen Szene (Titel, Account, Erstellung)
      hud: h('div.ui-hud'),       // HTML-HUD der Spielsitzung (Thread D)
      panels: h('div.ui-panels'), // Panels (Inventar, Quests …)
      toasts: h('div.ui-toasts'), // Meldungen
    };
    root.append(layer.scene, layer.hud, layer.panels, layer.toasts);
    return layer;
  }

  // Ein Bereich klinkt sich ein: install(game) registriert Slices, Commands,
  // Inhalte, Szenen, Panels und Sitzungssysteme.
  use(install) { install(this); return this; }

  addSessionSystem(id, create, order = 0) {
    this.sessionSystems.push({ id, create, order });
    this.sessionSystems.sort((a, b) => a.order - b.order);
  }

  start(sceneId = 'title') {
    this.scenes.go(sceneId);
    this.loop.start();
  }

  // --- Account & Spielstand (von Thread A aufgerufen)
  login(accountId) {
    const acc = this.save.getAccount(accountId);
    if (!acc) throw new Error('Account nicht gefunden');
    this.account = acc;
    this.bus.emit(EV.ACCOUNT_LOGIN, { accountId: acc.id, name: acc.name });
    return acc;
  }
  logout() { this.account = null; this.bus.emit(EV.ACCOUNT_LOGOUT, {}); }

  // Neuer Charakter: init wird an die create()-Funktionen der Slices gereicht,
  // z. B. { character: { name, raceId, classId } }.
  newGame(init) {
    if (!this.account) throw new Error('Kein Account eingeloggt');
    this.state.reset(init);
    const m = this.state.meta;
    m.accountId = this.account.id;
    m.characterId = `chr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    m.createdAt = Date.now();
    this.saveNow('create');
    // Nach dem ersten echten Spielstand (Klick = Nutzergeste) um dauerhaften Speicher bitten.
    this.save.requestPersistence();
    this.scenes.go('play', { isNew: true });
    return m.characterId;
  }

  loadGame(accountId, characterId) {
    // Fehlender Account oder Spielstand (z. B. teilweise gelöschter Browser-Speicher): kein Absturz, nur false.
    if (!this.save.getAccount(accountId)) return false;
    const snap = this.save.loadCharacter(accountId, characterId);
    if (!snap) return false;
    this.login(accountId);
    this.state.load(snap);
    this.state.meta.accountId = accountId;
    this.state.meta.characterId = characterId;
    this.scenes.go('play', { isNew: false });
    return true;
  }

  // "Fortsetzen" vom Titelbildschirm
  continueLast() {
    const last = this.save.getLast();
    if (!last) return false;
    const ok = this.loadGame(last.accountId, last.characterId);
    if (!ok) this.save.setLast(null);
    return ok;
  }

  saveNow(reason = 'manual') {
    const m = this.state.meta;
    if (!m.accountId || !m.characterId) return false;
    m.savedAt = Date.now();
    const s = this.state.slices;
    const summary = {
      name: s.character?.name ?? '?', raceId: s.character?.raceId ?? null, classId: s.character?.classId ?? null,
      level: s.progress?.level ?? 1, zoneId: s.world?.zoneId ?? null, variant: s.character?.appearance?.variant ?? null,
    };
    const ok = this.save.saveCharacter(m.accountId, m.characterId, this.state.snapshot(), summary);
    if (ok) this.bus.emit(EV.GAME_SAVED, { at: m.savedAt, reason });
    return ok;
  }

  // --- Schleife
  update(dt) {
    const inp = this.input;
    if (inp.pressed('mute')) this.sfx.toggleMute();
    if (inp.pressed('debug')) this.debug = !this.debug;
    this.scenes.update(dt);
    inp.endStep(dt);
  }

  render() {
    if ((document.documentElement.dataset.quality ?? '') !== this.#quality) this.resize();
    const now = performance.now();
    this.#fpsAcc += now - this.#lastRender; this.#lastRender = now; this.#fpsFrames++;
    if (this.#fpsAcc > 500) { this.fps = Math.round((this.#fpsFrames * 1000) / this.#fpsAcc); this.#fpsAcc = 0; this.#fpsFrames = 0; }
    const k = CONFIG.renderScale;
    this.ctx.setTransform(k, 0, 0, k, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.fillStyle = '#05020a';
    this.ctx.fillRect(0, 0, CONFIG.viewWidth, CONFIG.viewHeight);
    this.scenes.render(this.ctx);
    const d = this.displayCtx;
    d.imageSmoothingEnabled = false;
    d.drawImage(this.view, 0, 0, this.canvas.width, this.canvas.height);
  }

  // Ganzzahlige Skalierung für scharfe Pixel, solange sie mindestens 85 % der
  // möglichen Fläche nutzt; sonst (und unter 2x) wird frei eingepasst.
  // Die CSS-Variablen --view-w/--view-h/--view-scale erlauben der HTML-UI,
  // sich am Spielbild auszurichten.
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const aw = window.innerWidth * dpr, ah = window.innerHeight * dpr;
    this.#chooseView(aw, ah);
    const fit = Math.min(aw / CONFIG.viewWidth, ah / CONFIG.viewHeight);
    const scale = fit >= 2 && Math.floor(fit) / fit >= 0.85 ? Math.floor(fit) : fit;
    // Qualität „Niedrig“ (ui/Quality.js, auch automatisch): Zeichenfläche höchstens 2-fach,
    // der Browser vergrößert pixelgenau per CSS. Spart auf hochauflösenden Handys den teuren Blit.
    this.#quality = document.documentElement.dataset.quality ?? '';
    const backing = this.#quality === 'low' ? Math.min(scale, 2) : scale;
    this.canvas.width = Math.round(CONFIG.viewWidth * backing);
    this.canvas.height = Math.round(CONFIG.viewHeight * backing);
    // Überabtastung: nie mehr Bildpunkte je Weltpixel als die Anzeige zeigt, bei „Niedrig“ keine.
    // „Mittel“ (Standard auf Touch-Geräten) höchstens 2-fach; die automatische Qualität senkt bei Ruckeln weiter.
    const cap = this.#quality === 'low' ? 1 : this.#quality === 'medium' ? Math.min(2, CONFIG.spriteRes) : CONFIG.spriteRes;
    const k = Math.max(1, Math.min(cap, Math.floor(backing + 0.01)));
    this.#ensureView(k);
    const cssW = Math.round(CONFIG.viewWidth * scale) / dpr, cssH = Math.round(CONFIG.viewHeight * scale) / dpr;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.displayCtx.imageSmoothingEnabled = false;
    const rs = document.documentElement.style;
    rs.setProperty('--view-w', `${cssW}px`);
    rs.setProperty('--view-h', `${cssH}px`);
    rs.setProperty('--view-scale', `${cssW / CONFIG.viewWidth}`);
  }

  // Hochformat: schmales, hohes internes Bild (270 × bis 480), sonst 480 × 270.
  // Alle Systeme lesen CONFIG.viewWidth/viewHeight live; Lighting und ScreenFx passen sich selbst an.
  #chooseView(aw, ah) {
    const L = CONFIG.landscapeView, P = CONFIG.portraitView;
    const tall = ah > aw * 1.15 && CONFIG.portraitScenes.includes(this.scenes?.currentId);
    const w = tall ? P.width : L.width;
    const h = tall ? Math.max(P.minHeight, Math.min(P.maxHeight, Math.round((P.width * ah) / aw / 2) * 2)) : L.height;
    if (w === CONFIG.viewWidth && h === CONFIG.viewHeight) return;
    CONFIG.viewWidth = w; CONFIG.viewHeight = h;
    this.#ensureView(CONFIG.renderScale);
    this.input.viewW = w; this.input.viewH = h;
    document.documentElement.classList.toggle('ef-portrait', tall);
    this.bus.emit(EV.VIEW_RESIZED, { width: w, height: h, portrait: tall });
  }

  // Internes Bild: Weltgröße × Überabtastung k (siehe CONFIG.spriteRes).
  #ensureView(k) {
    const w = CONFIG.viewWidth * k, h = CONFIG.viewHeight * k;
    CONFIG.renderScale = k;
    if (this.view.width === w && this.view.height === h) return;
    this.view = makeCanvas(w, h);
    this.ctx = this.view.getContext('2d');
  }

  clientToView(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((cx - r.left) / r.width) * CONFIG.viewWidth, y: ((cy - r.top) / r.height) * CONFIG.viewHeight };
  }
}
