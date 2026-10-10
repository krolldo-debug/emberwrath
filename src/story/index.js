import { Cinematic } from './Cinematic.js';
import { CLIPS } from './clips.js';

// Story-Clips (Geschichte: /mnt/project-files/story/geschichte.md, Vertrag: src/story/README.md).
// Eine Sitzungs-Erweiterung: prüft Auslöser, spielt einen Clip in Spielgrafik und merkt sich je Charakter,
// welche Clips schon liefen (Weltflag clip:<id>). Die Welt hält nie an.
export function installStory(game) {
  game.addSessionSystem('story', (session) => new StoryDirector(session), 90);
}

const flagKey = (id) => `clip:${id}`;

export class StoryDirector {
  constructor(session) {
    this.session = session;
    this.playing = null;
  }

  seen(id) { return !!this.session.state.slices.world?.flags?.[flagKey(id)]; }

  play(id) {
    const clip = CLIPS[id];
    if (!clip || this.playing) return false;
    this.playing = new Cinematic(this.session, clip);
    this.playing.id = id;
    this.session.state.commit('world:setFlag', { key: flagKey(id) });
    this.#hud(false);
    this.playing.start();
    return true;
  }

  update(dt, session) {
    const c = this.playing;
    if (c) {
      // Welt gewechselt (Tod, Portal) oder Boss anderweitig geweckt: Clip sofort beenden
      if (c.world !== session.world || c.hero.dead) c.finish(true);
      else if (c.state.boss?.engaged) c.finish(true);
      else c.update(dt);
      if (!c.done) this.#hud(false);
      if (c.done) { this.playing = null; this.#hud(true); }
      return;
    }
    if (session.paused) return;
    for (const [id, clip] of Object.entries(CLIPS)) if (!this.seen(id) && this.#triggered(clip.trigger, session.world)) { this.play(id); break; }
  }

  #triggered(tr, w) {
    if (!tr || !w?.hero || w.hero.dead) return false;
    if (tr.zoneId && w.zone?.id !== tr.zoneId) return false;
    if ((w.hero.combatTime ?? 99) < 2) return false;
    if (tr.kind === 'bossGate') {
      const b = w.boss, a = w.arena, h = w.hero;
      if (!b || !a || b.engaged || b.dead || (tr.bossId && b.bossId !== tr.bossId)) return false;
      return h.x > a.x0 && h.x < a.x1 && h.y > a.y0 - 14 && h.y <= a.y0 + 8;
    }
    return false;
  }

  // Während des Clips alles Überlagernde ausblenden (HUD, Hinweise, neue Fähigkeiten), Menüs bleiben bedienbar.
  // Jeden Schritt erneut, weil Hinweise auch während des Clips entstehen können.
  #hud(on) {
    const ui = this.session.game.ui;
    if (!ui?.root) return;
    for (const el of ui.root.children) {
      if (el === ui.panels) continue;
      if (!on && el.style.visibility !== 'hidden') { el.dataset.storyHidden = '1'; el.style.visibility = 'hidden'; }
      if (on && el.dataset.storyHidden) { delete el.dataset.storyHidden; el.style.visibility = ''; }
    }
  }

  draw(ctx) { this.playing?.draw(ctx); }

  dispose() {
    if (this.playing) { this.playing.finish(true); this.playing = null; }
    this.#hud(true);
  }
}
