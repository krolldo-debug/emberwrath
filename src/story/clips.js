import { Light } from '../gfx/Lighting.js';
import { bossBanner } from '../entities/Telegraph.js';
import { burnSigil, SIGIL_W, SIGIL_H } from './sigil.js';

// Story-Clips in Spielgrafik (Geschichte: /mnt/project-files/story/geschichte.md).
// trigger.kind 'bossGate': spielt, wenn der Held das Tor zur Bossarena durchschreitet und der Boss noch schläft.
// Der Boss erwacht im Clip; end() übergibt ihn danach in den normalen Kampf (auch beim Überspringen).
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (p, q, t) => ({ x: lerp(p.x, q.x, ease(t)), y: lerp(p.y, q.y, ease(t)) });
const span = (t, t0, t1) => (t - t0) / (t1 - t0);

// Glutfunken laufen einmal um den Runenkreis (harte Pixel, drei Farbstufen)
function drawRuneFire(ctx, x, y, r, sweep, t) {
  const n = Math.round(Math.PI * 2 * r);
  const cols = ['#7a1410', '#f08a24', '#ffd25a'];
  for (let i = 0; i < n * sweep; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const px = Math.round(x + Math.cos(a) * r), py = Math.round(y + Math.sin(a) * r * 0.62);
    const hot = n * sweep - i < 6;
    ctx.fillStyle = hot ? '#fff4c0' : cols[(i * 7 + Math.floor(t * 18)) % 3];
    ctx.fillRect(px, py, 1, 1);
  }
}

function flareBrazier(c, p) {
  const w = c.world;
  w.particles.embers(p.x, p.y - 16, 14);
  w.particles.burst(p.x, p.y - 16, { count: 10, speed: [30, 90], angle: -Math.PI / 2, spread: 1.2, colors: ['#fff4c0', '#ffd25a', '#f08a24'], life: [0.3, 0.6], size: 1 });
  w.addLight(new Light({ x: p.x, y: p.y - 16, radius: 150, color: [255, 150, 60], intensity: 1.2, ttl: 0.6, bloom: 0.5 }));
  c.shake(1.5);
  c.session.sfx?.play?.('ember');
}

export const CLIPS = {
  // Vor dem ersten Bosskampf: Varkhul wird von der Krone gerufen (Akt 1 der Geschichte)
  varkhul: {
    trigger: { kind: 'bossGate', zoneId: 'catacombs', bossId: 'bonelord' },
    duration: 12.6,
    voice: { Varkhul: 150 },
    start(c) {
      const w = c.world, b = w.boss, a = w.arena;
      c.state.boss = b;
      c.state.rune = w.rune ? { x: w.rune.x, y: w.rune.y } : { x: b.x, y: b.y - 84 };
      c.state.from = { x: c.hero.x, y: c.hero.y - 10 };
      // Kohlebecken der Arena, oben zuerst, dann unten
      c.state.braziers = w.props.filter((p) => p.kind === 'brazier' && p.x > a.x0 && p.x < a.x1 && p.y > a.y0 && p.y < a.y1 + 16)
        .sort((p, q) => p.y - q.y || p.x - q.x);
      c.hero.facing = Math.sign(b.x - c.hero.x) || c.hero.facing;
      c.session.sfx?.play?.('rumble');
    },
    beats: [
      [0.8, (c) => c.state.braziers[0] && flareBrazier(c, c.state.braziers[0])],
      [1.1, (c) => c.state.braziers[1] && flareBrazier(c, c.state.braziers[1])],
      [1.4, (c) => c.state.braziers[2] && flareBrazier(c, c.state.braziers[2])],
      [1.7, (c) => c.state.braziers[3] && flareBrazier(c, c.state.braziers[3])],
      [2.05, (c) => {
        const r = c.state.rune;
        c.state.runeLight = c.world.addLight(new Light({ x: r.x, y: r.y, radius: 110, color: [255, 120, 40], intensity: 1, flicker: 0.25, bloom: 0.5 }));
        c.world.particles.ring(r.x, r.y, 18, 26, ['#fff4c0', '#ffd25a', '#f08a24'], 30);
        c.shake(2);
        c.session.sfx?.play?.('bossChannel', { dur: 1.5 });
      }],
      [3.55, (c) => { c.session.sfx?.play?.('quake'); c.session.sfx?.play?.('bossCrownFall'); c.flash('#fff4c0', 1); c.flash('#f08a24', 1); c.shake(4); c.world.particles.ring(c.state.rune.x, c.state.rune.y, 24, 40, ['#ffffff', '#ffd25a', '#c8401a'], 90); }],
      [3.75, (c) => { const b = c.state.boss; if (!b.engaged && !b.dead) { b.animator.play('awaken', true); c.state.awakened = true; } }],
      [5.4, (c) => { const b = c.state.boss; if (c.state.awakened && !b.engaged && !b.dead) b.animator.play('idle'); }],
      [12.2, (c) => { if (c.state.runeLight) c.state.runeLight.dead = true; }],
    ],
    camera(c, t) {
      const b = c.state.boss, r = c.state.rune, from = c.state.from;
      const mid = { x: r.x, y: (r.y + b.y) / 2 - 6 };
      const face = { x: b.x, y: b.y - 40 };
      if (t < 0.4) return from;
      if (t < 2.0) return mix(from, mid, span(t, 0.4, 2.0));
      if (t < 3.7) return { x: r.x, y: r.y };
      if (t < 11.9) return mix({ x: b.x, y: b.y - 34 }, face, span(t, 3.7, 11.9));
      return mix(face, from, span(t, 11.9, 12.6));
    },
    closeups: [
      [2.0, 3.7, (c) => ({ x: c.state.rune.x, y: c.state.rune.y - 4 })],
      [10.85, 11.95, (c) => ({ x: c.state.boss.x, y: c.state.boss.y - 46 })],
    ],
    lines: [
      [5.4, 8.0, 'Varkhul', 'Dreihundert Jahre habe ich über die Toten der Senke gewacht.'],
      [8.2, 10.6, 'Varkhul', 'Jetzt ruft mich eine Krone aus Flammen. Ich kann nicht anders.'],
      [10.8, 12.2, 'Varkhul', 'Vergib mir, Lebender.'],
    ],
    drawWorld(c, ctx, cam) {
      const t = c.t, r = c.state.rune;
      if (t < 2.0 || t > 12.3) return;
      drawRuneFire(ctx, r.x - cam.x, r.y - cam.y, 21, Math.min(1, span(t, 2.0, 2.6)), t);
      const burn = Math.min(1, span(t, 2.3, 3.45));
      if (burn > 0) ctx.drawImage(burnSigil(burn), Math.round(r.x - cam.x - SIGIL_W / 2), Math.round(r.y - cam.y - SIGIL_H / 2 - 3));
    },
    end(c, skipped) {
      const w = c.world, b = c.state.boss;
      if (c.state.runeLight) c.state.runeLight.dead = true;
      if (!b || b.dead || b.engaged) return;
      // Im Clip ist Varkhul schon (ganz oder halb) aufgestanden: dort weitermachen, nicht noch einmal knien
      const rising = c.state.awakened ? { name: b.animator.name, time: b.animator.time } : null;
      b.engage(w);
      w.gate?.setClosed(true, w);
      if (rising) {
        const dur = b.animator.current.duration;
        if (rising.name === 'awaken' && rising.time < dur) { b.animator.time = rising.time; b.stateTime = rising.time; } else { b.animator.play('idle'); b.stateTime = 0.9; }
        b.lastFrame = b.animator.frame;
      }
      bossBanner(w, 'Varkhul', 'Der Knochenfürst');
    },
  },
};
