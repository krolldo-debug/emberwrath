// Emberwrath – Startseite, Abschnitt „Jetzt da“ (index.html .sterne): Sternenglut, Stufe 40–50.
// Bühne und Bosse aus site/tools/sterne.mjs. Die drei neuen Bosse stehen als Schattenrisse im Morgenschimmer, reihum
// enthüllt ein Lichtstreif einen von ihnen (Name darunter hebt sich), Sterne funkeln, Blütenblätter treiben vorbei.
// Ausschnitt und Vergrößerung in ganzen Gerätepixeln je Feinpixel wie beim Titelbild; ohne JavaScript oder bei
// reduzierter Bewegung bleibt das Standbild (teaser.webp, Kaldris enthüllt).
(() => {
  const box = document.querySelector('[data-sterne]');
  if (!box) return;
  // <sterne.mjs> – von tools/sterne.mjs geschrieben, nicht von Hand ändern
  const META = {"W":1280,"H":440,"FY":356,"bosse":[{"w":188,"h":272,"n":8,"fps":6,"x":547,"y":90,"row":0},{"w":162,"h":258,"n":8,"fps":6,"x":781,"y":120,"row":816},{"w":182,"h":268,"n":8,"fps":6,"x":1003,"y":110,"row":1590}],"wort":[139,24],"dims":{"teaser-buehne":[1280,440],"teaser-bosse":[1504,2394]},"v":"f65249b051"};
  // </sterne.mjs>
  const poster = box.querySelector('img');
  const names = [...document.querySelectorAll('[data-sterne-name]')];
  const B = META.bosse, SW = META.W, SH = META.H;
  const MID = Math.round((B[0].x + B[2].x + B[2].w) / 2);   // Mitte der Gruppe

  // ---------- Ausschnitt: d Gerätepixel je Feinpixel (ganzzahlig, so groß, dass die Bühne in die Breite passt; am Handy 1
  // und dafür ein Ausschnitt um die Gruppe), Höhe höchstens 70 % des Bildschirms, die Insel bleibt unten ganz im Bild
  let dpr = 1, d = 1, vw = 0, vh = 0, camX = 0, camY = 0;
  const layout = () => {
    dpr = devicePixelRatio || 1;
    const avail = Math.round(box.parentElement.clientWidth * dpr);
    d = Math.max(1, Math.round(avail / SW));
    const Wd = Math.min(avail, SW * d);
    box.style.width = `${Wd / dpr}px`;
    vw = Wd / d;
    const Hd = Math.min(SH * d, Math.round(innerHeight * 0.7 * dpr));
    vh = Hd / d;
    box.style.height = `${Hd / dpr}px`;
    camX = Math.max(0, Math.min(SW - Math.ceil(vw), Math.round(MID - vw / 2)));
    camY = Math.max(0, SH - Math.ceil(vh));
    Object.assign(poster.style, { width: `${(SW * d) / dpr}px`, height: `${(SH * d) / dpr}px`, left: `${(-camX * d) / dpr}px`, top: `${(-camY * d) / dpr}px` });
  };
  layout();
  addEventListener('resize', layout);
  const mark = (i) => names.forEach((n, k) => n.classList.toggle('an', k === i));
  mark(1);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const IMG = new URL('img/', document.querySelector('link[rel="icon"]')?.href ?? location.href).href;
  const load = (n) => new Promise((ok, no) => {
    const i = new Image();
    i.onload = () => { const want = META.dims[n]; if (i.naturalWidth !== want[0] || i.naturalHeight !== want[1]) { no(new Error(n)); return; } (i.decode ? i.decode() : Promise.resolve()).then(() => ok(i), no); };
    i.onerror = no; i.src = `${IMG}${n}.webp?v=${META.v}`;
  });
  let started = false;
  const start = () => { if (started) return; started = true; Promise.all([load('teaser-buehne'), load('teaser-bosse')]).then(([stage, sheet]) => { try { live(stage, sheet); } catch { /* Standbild bleibt */ } }, () => {}); };
  new IntersectionObserver(([e], o) => { if (e.isIntersecting) { o.disconnect(); start(); } }, { rootMargin: '300px' }).observe(box);

  function live(stage, sheet) {
    const cv = document.createElement('canvas');
    cv.className = 'sterne-live'; cv.setAttribute('aria-hidden', 'true');
    box.append(cv);
    const ctx = cv.getContext('2d');
    const size = () => { layout(); cv.width = Math.round(vw * d); cv.height = Math.round(vh * d); ctx.imageSmoothingEnabled = false; };
    size();
    removeEventListener('resize', layout);
    addEventListener('resize', size);
    const blit = (img, sx, sy, w, h, x, y) => {
      const ox = (x - camX) * d, oy = (y - camY) * d;
      const x0 = Math.max(0, Math.floor(-ox / d)), x1 = Math.min(w, Math.ceil((cv.width - ox) / d));
      const y0 = Math.max(0, Math.floor(-oy / d)), y1 = Math.min(h, Math.ceil((cv.height - oy) / d));
      if (x1 > x0 && y1 > y0) ctx.drawImage(img, sx + x0, sy + y0, x1 - x0, y1 - y0, ox + x0 * d, oy + y0 * d, (x1 - x0) * d, (y1 - y0) * d);
    };
    const px = (x, y, c, n = 1) => { ctx.fillStyle = c; ctx.fillRect((Math.round(x) - camX) * d, (Math.round(y) - camY) * d, d * n, d * n); };

    // Enthüllen reihum: Lichtstreif läuft in 0,5 s von links über den Boss (hell davor, Schatten dahinter)
    const SWEEP = 0.5, HOLD = 4.2;
    const reveal = B.map((_, i) => (i === 1 ? 1 : 0));   // 0 = Schatten, 1 = enthüllt
    const dir = B.map(() => 0);
    let cur = 1, next = 3.2;
    const STAR = ['#ffffff', '#ffe8d0', '#e0b8ff', '#a060f0'];
    const PETAL = ['#ffd8ea', '#eca0c0', '#c86a98'];
    let parts = [];
    const rnd = (a, b) => a + Math.random() * (b - a);
    const add = (o) => parts.push({ life: 0, wob: 0, g: 0, ...o });
    const burst = (i) => {
      const b = B[i];
      for (let k = 0; k < 26; k++) add({ x: b.x + rnd(0, b.w), y: b.y + rnd(0, b.h * 0.8), vx: rnd(-20, 20), vy: rnd(-50, -10), g: 20, max: rnd(0.5, 1.2), c: STAR, s: k < 8 ? 2 : 1 });
    };

    const update = (dt, t) => {
      if (t >= next) {
        dir[cur] = -1;
        cur = (cur + 1) % B.length; dir[cur] = 1; next = t + HOLD;
        mark(cur); setTimeout(() => burst(cur), SWEEP * 600);
      }
      B.forEach((_, i) => { if (dir[i]) { reveal[i] = Math.max(0, Math.min(1, reveal[i] + (dir[i] * dt) / SWEEP)); if (reveal[i] === 0 || reveal[i] === 1) dir[i] = 0; } });
      // Funkeln am Himmel, treibende Blüten
      if (Math.random() < dt * 9) add({ x: camX + rnd(0, vw), y: rnd(4, SH * 0.45), vx: 0, vy: 0, max: rnd(0.4, 0.9), c: STAR, s: 1, star: true });
      if (Math.random() < dt * 1.6) add({ x: camX + vw + 4, y: rnd(SH * 0.25, SH * 0.8), vx: -rnd(30, 60), vy: rnd(4, 14), wob: 10, max: rnd(8, 14), c: PETAL, s: Math.random() < 0.4 ? 2 : 1, seed: rnd(0, 9) });
      for (const q of parts) { q.life += dt; if (q.wob) q.vy += Math.sin(q.life * 3 + q.seed) * q.wob * dt; q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
      parts = parts.filter((q) => q.life < q.max && q.x > camX - 8);
    };

    const draw = (t) => {
      ctx.fillStyle = '#151638'; ctx.fillRect(0, 0, cv.width, cv.height);
      blit(stage, 0, 0, SW, SH, 0, 0);
      for (const q of parts) if (q.star) {
        const k = q.life / q.max, c = k < 0.25 || k > 0.75 ? '#b8b8e8' : '#ffffff';
        px(q.x, q.y, c);
        if (k > 0.3 && k < 0.7) { px(q.x - 1, q.y, '#b8b8e8'); px(q.x + 1, q.y, '#b8b8e8'); px(q.x, q.y - 1, '#b8b8e8'); px(q.x, q.y + 1, '#b8b8e8'); }
      }
      B.forEach((b, i) => {
        const f = Math.floor((t + i * 0.41) * b.fps) % b.n, sx = f * b.w, r = reveal[i];
        const LIT = b.row, SIL = b.row + b.h, HELL = b.row + 2 * b.h;
        if (r <= 0) { blit(sheet, sx, SIL, b.w, b.h, b.x, b.y); return; }
        if (r >= 1) { blit(sheet, sx, LIT, b.w, b.h, b.x, b.y); return; }
        const cut = Math.round(r * b.w);
        blit(sheet, sx + cut, SIL, b.w - cut, b.h, b.x + cut, b.y);
        blit(sheet, sx, LIT, cut, b.h, b.x, b.y);
        const e0 = Math.max(0, cut - 4);
        blit(sheet, sx + e0, HELL, cut - e0, b.h, b.x + e0, b.y);
      });
      for (const q of parts) if (!q.star) { const ci = Math.min(q.c.length - 1, Math.floor((q.life / q.max) * q.c.length)); px(q.x, q.y, q.c[ci], q.s); }
    };

    let on = false, vis = false, last = 0, T = 0;
    const tick = (now) => {
      if (!vis || document.hidden) { on = false; return; }
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; T += dt;
      try { update(dt, T); draw(T); } catch { cv.remove(); poster.style.visibility = ''; return; }
      requestAnimationFrame(tick);
    };
    const go = () => { if (vis && !document.hidden && !on) { on = true; last = 0; requestAnimationFrame(tick); } };
    draw(0);
    poster.style.visibility = 'hidden';
    new IntersectionObserver(([e]) => { vis = e.isIntersecting; go(); }).observe(box);
    document.addEventListener('visibilitychange', go);
  }
})();
