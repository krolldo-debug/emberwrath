import { CONFIG } from '../config.js';
import { EV } from '../core/events.js';
import { Camera } from '../core/Camera.js';
import { PanelHost } from '../core/PanelHost.js';
import { World } from '../world/World.js';

// Die Spielsitzung: eine Zone ist geladen, der Held läuft.
// Dieses Objekt ist der "session"-Kontext, den alle Sitzungssysteme,
// Panels und die Welt erhalten. Es stellt bereit:
//   game, bus (Abo-Bereich dieser Sitzung), input, state, content, assets,
//   sfx, font, authority, world, camera, zone, panels, time
//   hitstop(t), slowmo(scale, dur), setPaused(reason, on), paused,
//   travel(zoneId, spawnId), hurtFlash, debug, fps
// Ablauf pro Tick: Panels/Pause -> Welt -> Sitzungssysteme -> Kamera.
// Zeichnen: Welt -> system.draw(ctx) (Pixel-Overlays) ; HTML-HUD liest selbst.
export class PlayScene {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.state = game.state;
    this.content = game.content;
    this.assets = game.assets;
    this.sfx = game.sfx;
    this.font = game.font;
    this.authority = game.authority;
    this.world = null;
    this.camera = null;
    this.zone = null;
    this.systems = [];
    this.pauseReasons = new Set();
    this.time = 0;
    this.hitstopTime = 0;
    this.slowmoTime = 0; this.slowmoScale = 1;
    this.hurtFlash = 0;
    this.deadTime = 0;
    this.autosaveTimer = CONFIG.autosaveInterval;
    this.pendingTravel = null;
  }

  get debug() { return this.game.debug; }
  get fps() { return this.game.fps; }
  get paused() { return this.pauseReasons.size > 0; }

  enter(params = {}) {
    const g = this.game;
    this.bus = g.bus.scope();
    this.panels = new PanelHost(this, g.panels, g.ui.panels);
    const ws = this.state.slices.world;
    this.#loadZone(ws?.zoneId, ws?.spawnId ?? 'start', ws?.pos ?? null);
    for (const s of g.sessionSystems) this.systems.push(s.create(this));

    // Automatisch speichern an sinnvollen Punkten
    const saveOn = (ev) => this.bus.on(ev, () => g.saveNow(ev));
    [EV.LEVEL_UP, EV.QUEST_ACCEPTED, EV.QUEST_COMPLETED, EV.BOSS_DEFEATED].forEach(saveOn);
    this.bus.on(EV.ZONE_TRAVEL, (e) => this.travel(e.zoneId, e.spawnId));
    this.bus.on(EV.BOSS_ENGAGED, (e) => { this.boss = { id: e.bossId, actor: null }; });
    this.bus.on(EV.PREFS_CHANGED, (e) => {
      if (e.key === 'screenShake' && this.camera) this.camera.enabled = e.value !== false;
    });
    this.onHide = () => {
      if (document.hidden) { this.setPaused('hidden', true); g.saveNow('hidden'); return; }
      this.setPaused('hidden', false);
      if (g.panels.defs.has('menu') && !this.panels.openId) this.panels.open('menu');
    };
    this.onPageHide = () => g.saveNow('pagehide');
    // Fenster verliert den Fokus (Alt-Tab, Klick auf zweiten Bildschirm), bleibt aber sichtbar: ebenfalls anhalten.
    this.onBlur = () => this.setPaused('blur', true);
    this.onFocus = () => this.setPaused('blur', false);
    document.addEventListener('visibilitychange', this.onHide);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('focus', this.onFocus);
    this.entered = true;

    this.bus.emit(EV.GAME_STARTED, { accountId: this.state.meta.accountId, characterId: this.state.meta.characterId, isNew: !!params.isNew });
    this.bus.emit(EV.ZONE_ENTER, { zoneId: this.zone.zoneId, instanceId: this.zone.instanceId, spawnId: this.spawnId });
  }

  // Jeder Schritt einzeln abgesichert: ein Fehler in einem System darf das Aufräumen der übrigen
  // (und vor allem das Lösen aller Bus-Abos) nicht verhindern. Auch nach fehlgeschlagenem enter() aufrufbar.
  exit() {
    const step = (what, fn) => { try { fn(); } catch (err) { console.error(`Spielsitzung beenden: ${what}`, err); } };
    // Nur speichern, wenn die Sitzung vollständig lief; ein halb geladener Stand soll den gespeicherten nicht ersetzen.
    if (this.entered) step('speichern', () => this.game.saveNow('exit'));
    document.removeEventListener('visibilitychange', this.onHide);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('focus', this.onFocus);
    for (const s of this.systems) step('System', () => s.dispose?.());
    this.systems = [];
    step('Panels', () => this.panels?.dispose());
    step('HUD', () => this.game.ui.hud.replaceChildren());
    step('Zone', () => { if (this.zone) this.bus?.emit(EV.ZONE_LEAVE, { zoneId: this.zone.zoneId }); });
    step('Zone', () => this.authority.leaveZone());
    step('Welt', () => this.world?.dispose?.());
    this.bus?.dispose();
  }

  // Zone laden. pos (Welt-Pixel) hat Vorrang vor spawnId (Fortsetzen an der Stelle).
  #loadZone(zoneId, spawnId, pos) {
    const def = this.content.find('zone', zoneId) ?? this.content.all('zone').find((z) => z.start) ?? this.content.all('zone')[0];
    if (!def) throw new Error('Keine Zone registriert');
    this.zone = { ...this.authority.joinZone(def.id), def };
    this.spawnId = spawnId;
    this.world = new World(this, def, { spawnId, pos });
    const hero = this.world.hero;
    this.camera = new Camera(this.world.pixelW, this.world.pixelH);
    this.camera.enabled = this.game.prefs.get('screenShake', true) !== false;
    this.camera.snapTo(hero.x, hero.y);
    this.deadTime = 0;
    this.boss = null;
    if (this.state.commands.has('world:enterZone')) this.state.commit('world:enterZone', { zoneId: def.id, spawnId });
  }

  // Zonenwechsel (Tür, Dungeon-Eingang, Respawn). Wird am Tick-Anfang ausgeführt.
  travel(zoneId, spawnId = 'start') { this.pendingTravel = { zoneId, spawnId }; }

  #doTravel() {
    const { zoneId, spawnId } = this.pendingTravel;
    this.pendingTravel = null;
    // Unbekanntes Ziel (z. B. Gebiet eines noch nicht eingespielten Bereichs): stehen bleiben statt neu zu laden.
    if (!this.content.find('zone', zoneId)) {
      this.bus.emit(EV.UI_TOAST, { text: 'Dieser Weg ist versiegelt.', kind: 'warn' });
      return;
    }
    this.bus.emit(EV.ZONE_LEAVE, { zoneId: this.zone.zoneId });
    this.authority.leaveZone();
    this.world.dispose?.();
    this.#loadZone(zoneId, spawnId, null);
    this.bus.emit(EV.ZONE_ENTER, { zoneId: this.zone.zoneId, instanceId: this.zone.instanceId, spawnId });
    this.game.saveNow('zone');
  }

  // Im Bosskampf das Bild nach oben schieben, damit hohe Bosse (Malgareth) nicht unter der Boss-Leiste verschwinden,
  // wenn der Held auf gleicher Höhe oder südlich steht. Der Held bleibt dabei sicher im Bild; die Kamera dämpft selbst.
  #cameraY(hero, y) {
    const b = this.boss;
    if (!b) return y;
    if (!b.actor || b.actor.removed || b.actor.dead) {
      b.actor = this.world.enemies?.find((e) => !e.dead && (e.def?.bossId === b.id || e.bossId === b.id || e.type === b.id || (e.def?.boss && !b.id))) ?? null;
      if (!b.actor) { this.boss = null; return y; }
    }
    const a = b.actor;
    if (Math.abs(a.x - hero.x) > 320 || Math.abs(a.y - hero.y) > 260) return y;
    const want = Math.min(y, (hero.y + a.y - (a.bodyHeight ?? 32) * 1.6) / 2);
    // Held hat Vorrang: Füße bleiben über der Aktionsleiste. Touch quer hat unten mittig nur die EP-Leiste (Tasten seitlich),
    // dort darf der Held tiefer stehen, damit über ihm im 270 hohen Bild Platz für den Boss bleibt.
    const cl = document.documentElement.classList;
    const margin = cl.contains('ef-touch') && !cl.contains('ef-portrait') ? 26 : 70;
    return Math.max(want, hero.y - CONFIG.viewHeight / 2 + margin);
  }

  hitstop(t) { this.hitstopTime = Math.max(this.hitstopTime, t); }
  slowmo(scale, duration) { this.slowmoScale = scale; this.slowmoTime = duration; }
  setPaused(reason, on) { if (on) this.pauseReasons.add(reason); else this.pauseReasons.delete(reason); }

  update(dt) {
    if (this.pendingTravel) this.#doTravel();
    const inp = this.input, hero = this.world.hero;
    this.panels.handleInput(inp);
    this.panels.update(dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
    for (const s of this.systems) s.update?.(dt, this);
    if (this.paused) return;

    this.time += dt;
    this.state.meta.playTime += dt;
    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) { this.autosaveTimer = CONFIG.autosaveInterval; this.game.saveNow('auto'); }

    // Hitstop: Welt friert ein, Eingaben bleiben gepuffert
    if (this.hitstopTime > 0) {
      this.hitstopTime -= dt;
      this.camera.update(dt, hero.x, hero.y - 10);
      return;
    }
    let scale = 1;
    if (this.slowmoTime > 0) { this.slowmoTime -= dt; scale = this.slowmoScale; }
    const sdt = dt * scale;

    this.world.aim = inp.aimWithPointer ? { x: inp.pointer.x + this.camera.x, y: inp.pointer.y + this.camera.y } : null;
    this.world.update(sdt);

    // Tod -> Wiederbelebung am Respawn-Punkt der Zone (oder deren respawnZone)
    if (hero.dead) {
      if (this.deadTime === 0) this.bus.emit(EV.PLAYER_DIED, { zoneId: this.zone.zoneId });
      this.deadTime += dt;
      if (this.deadTime > 2 && (inp.pressed('attack') || inp.pressed('interact'))) {
        const d = this.zone.def;
        this.travel(d.respawnZone ?? d.id, d.respawnSpawn ?? 'respawn');
        this.bus.emit(EV.PLAYER_RESPAWNED, { zoneId: d.respawnZone ?? d.id, spawnId: d.respawnSpawn ?? 'respawn' });
      }
    }

    // Kamera mit leichtem Vorlauf in Blick-/Bewegungsrichtung
    this.camera.update(dt, hero.x + hero.vx * 0.12 + hero.facing * 4, this.#cameraY(hero, hero.y - 10 + hero.vy * 0.12));
    this.authority.sendIntent({ type: 'pos', x: hero.x, y: hero.y });
  }

  render(ctx) {
    this.world.render(ctx, this.camera.rx, this.camera.ry, this.debug);
    for (const s of this.systems) s.draw?.(ctx, this);
  }
}
