import { h } from '../core/dom.js';
import { getHeroSprites } from '../sprites/hero.js';
import { resolveGear } from '../character/gearLook.js';
import { spriteStyle } from '../character/cosmetics.js';

// Gemeinsame Bausteine der Menü-Bildschirme (Thread A).

// Hinweis unter den Menüs: Spielstände liegen im Online-Konto. Andere Spieler gibt es noch nicht.
// (Früher: Hinweis zum lokalen Demo-Account; Demo-Accounts gibt es nicht mehr, gespielt wird nur mit Konto.)
export function localNotice(game, { compact = false } = {}) {
  const signedIn = !!game.online?.user;
  const lines = compact
    ? [signedIn ? 'In deinem Konto gespeichert · in der Cloud gesichert' : 'Zum Spielen brauchst du ein Emberwrath-Konto']
    : [
      signedIn
        ? 'Deine Charaktere sind in deinem Konto gespeichert und in der Cloud gesichert. Du kannst auf jedem Gerät weiterspielen.'
        : 'Melde dich an oder erstelle ein kostenloses Konto. Deine Charaktere werden in der Cloud gesichert und sind auf jedem Gerät spielbar.',
    ];
  return h(`div.acc-notice${signedIn ? '.acc-cloud' : ''}`, { role: 'note' },
    h('span.acc-notice-icon', { 'aria-hidden': 'true' }, signedIn ? '✓' : 'i'),
    h('div', lines.map((t) => h('p', t))));
}

// Gespielt wird nur mit Online-Konto. true, wenn game.account das angemeldete Konto ist;
// sonst wird das Konto eingeloggt (falls angemeldet) bzw. zur Anmeldung geleitet.
export function requireOnlineAccount(game) {
  const o = game.online;
  if (!o?.user) { if (o) o.open('login'); else game.scenes.go('title'); return false; }
  if (game.account?.id !== o.accountId) { o.sync.ensureLocalAccount(o.user); game.login(o.accountId); }
  return true;
}

export function formatAgo(ts) {
  if (!ts) return 'nie';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'gestern' : `vor ${d} Tagen`;
}

export function formatDate(ts) {
  try { return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return ''; }
}

// "Schattenelf · Waldläufer · Stufe 3"
export function characterLine(content, c) {
  const race = content.find('race', c.raceId)?.name ?? 'Mensch';
  const cls = content.find('class', c.classId)?.name ?? 'Krieger';
  return `${race} · ${cls} · Stufe ${c.level ?? 1}`;
}

// Farbvariante eines gespeicherten Charakters (steht nicht in der Kurzübersicht)
export function savedVariant(save, accountId, characterId) {
  return save.loadCharacter(accountId, characterId)?.slices?.character?.appearance?.variant ?? 0;
}

// Aussehen eines gespeicherten Charakters: Farbvariante, Kosmetik + angelegte Ausrüstung.
export function savedLook(save, content, accountId, characterId) {
  const snap = save.loadCharacter(accountId, characterId)?.slices;
  const a = snap?.character?.appearance;
  return { variant: a?.variant ?? 0, gear: resolveGear(snap?.inventory?.equipment, content), style: spriteStyle(a) };
}

export function zoneName(content, zoneId) {
  return zoneId ? content.find('zone', zoneId)?.name ?? null : null;
}

// Button, der beim ersten Klick nach Bestätigung fragt.
export function confirmButton(label, confirmLabel, onConfirm, cls = 'ef-btn.danger') {
  let armed = false, timer = 0;
  const btn = h(`button.${cls}`, {
    type: 'button',
    onclick: (e) => {
      e.stopPropagation();
      if (armed) { clearTimeout(timer); onConfirm(); return; }
      armed = true;
      btn.textContent = confirmLabel;
      btn.classList.add('armed');
      timer = setTimeout(() => { armed = false; btn.textContent = label; btn.classList.remove('armed'); }, 3000);
    },
  }, label);
  return btn;
}

// Pixelgenaues Porträt eines Charakters (Canvas, per CSS skaliert).
// update(dt) animiert; mode 'showcase' wechselt Laufen/Angriff/Fähigkeit.
const PORTRAIT_RES = 3;
export class HeroPortrait {
  constructor({ raceId, classId, variant = 0, gear = null, style = null, mode = 'idle', scale = 3, glow = true, backdrop = true }) {
    // Intern 3-fach aufgelöst (feine Heldenframes, frame.res = 3), gezeichnet in Weltpixeln
    this.canvas = h('canvas.acc-sprite');
    this.canvas.width = 72 * PORTRAIT_RES; this.canvas.height = 56 * PORTRAIT_RES;
    this.canvas.style.width = `${72 * scale}px`;
    this.canvas.style.height = `${56 * scale}px`;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.mode = mode; this.glow = glow; this.backdrop = backdrop;
    this.t = 0;
    this.set(raceId, classId, variant, gear, style);
  }

  set(raceId, classId, variant = 0, gear = null, style = null) {
    this.anims = getHeroSprites(raceId, classId, variant, gear, style, PORTRAIT_RES);
    this.t = 0;
    this.draw();
  }

  // Ablauf der Vorstellung: [Animation, Dauer, fps]
  static SHOW = [['idle', 2.4, 6], ['run', 1.6, 15], ['atk1', 0.5, 13], ['atk2', 0.5, 13], ['atk3', 0.6, 11], ['idle', 1.2, 6], ['cast', 0.7, 9], ['spin', 0.5, 16], ['idle', 0.6, 6], ['roll', 0.28, 22]];

  update(dt) { this.t += dt; this.draw(); }

  #pick() {
    if (this.mode !== 'showcase') return { anim: this.anims.idle, time: this.t, fps: 6 };
    const total = HeroPortrait.SHOW.reduce((s, x) => s + x[1], 0);
    let t = this.t % total;
    for (const [name, dur, fps] of HeroPortrait.SHOW) {
      if (t < dur) return { anim: this.anims[name], time: t, fps };
      t -= dur;
    }
    return { anim: this.anims.idle, time: 0, fps: 5 };
  }

  draw() {
    const { ctx } = this;
    const W = 72, H = 56;
    ctx.setTransform(PORTRAIT_RES, 0, 0, PORTRAIT_RES, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    if (this.backdrop) {
      const g = ctx.createRadialGradient(W / 2, H - 10, 2, W / 2, H - 10, 44);
      g.addColorStop(0, 'rgba(255,140,60,0.28)');
      g.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(4,2,8,0.55)';
      ctx.beginPath(); ctx.ellipse(W / 2, H - 9, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
    }
    const { anim, time, fps } = this.#pick();
    const n = anim.frames.length;
    const i = anim.loop === false ? Math.min(n - 1, Math.floor(time * fps)) : Math.floor(time * fps) % n;
    const f = anim.frames[Math.max(0, i)];
    const x = W / 2, y = H - 9;
    f.draw(ctx, x, y);
    if (this.glow && f.glows) {
      ctx.globalCompositeOperation = 'lighter';
      for (const gl of f.glows) {
        const r = Math.max(1, Math.round(gl.r));
        ctx.globalAlpha = 0.3; ctx.fillStyle = gl.color;
        ctx.fillRect(Math.round(x + gl.x) - r, Math.round(y + gl.y) - r + 1, r * 2 + 1, r * 2 - 1);
        ctx.fillRect(Math.round(x + gl.x) - r + 1, Math.round(y + gl.y) - r, r * 2 - 1, r * 2 + 1);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }
}

// Tastatur-Fokus nur auf Geräten mit echter Tastatur setzen (auf Handys
// würde sonst sofort die Bildschirmtastatur aufgehen).
export function focusIfDesktop(el) {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches || document.documentElement.classList.contains('ef-touch');
  if (!coarse) setTimeout(() => el.focus(), 30);
}
