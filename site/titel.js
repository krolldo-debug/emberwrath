// Emberwrath – Titelbild der Startseite „Aufbruch zum Aschethron“ (Ebenen und Held aus tools/titel-held.mjs).
// Ein Standbild (img/titel.webp) steht sofort da; sobald alle Ebenen geladen sind, zeichnet dieses Skript dieselbe
// Szene lebendig auf ein Canvas darüber. Eine Pixelgröße für alles: d Gerätepixel je Szenenpixel (ganzzahlig), jede
// Ebene und der Held 1:1, Verschiebungen (Schweben, Maus, Erschütterung) nur in ganzen Szenenpixeln.
// Leben: Atem (Brust und Schultern), Umhang, Klingenflammen und Krone in eigenen Zyklen; Lava, Fugen und Feuerschalen
// pulsieren in festen Stufen; Funken und Ascheregen als einzelne Pixel. Alle 6–8 s ein Heldenmoment, abwechselnd
// Schlachtruf (Klinge hoch, Feuerschalen lodern) und Erdspalter (Ausholen, Halten, Einschlag mit Erschütterung, ein
// Glutriss läuft die Bodenkante entlang, Staub und Funken).
// Ohne JavaScript oder bei reduzierter Bewegung bleibt das Standbild (hier pixelgenau ausgerichtet).
(() => {
  const box = document.querySelector('.hero-bg[data-titel]');
  const poster = box?.querySelector('img');
  if (!box || !poster) return;
  // <titel-held.mjs> – von tools/titel-held.mjs geschrieben, nicht von Hand ändern
  const META = {"szene":{"W":640,"H":272,"FY":212,"HX":330,"HOR":146,"FX":384,"LH":4,"LT":144,"LH2":76,"NT":206},"held":{"w":127,"h":130,"fx":54,"fy":125},"ruhe":{"atem":6,"atemMs":180,"umhang":8,"umhangMs":170,"flamme":6,"flammeMs":100,"klinge":[67,92,74,126]},"momente":{"schrei":{"f":[[0,110],[1,80],[2,80],[3,100],[4,100],[5,100],[6,100],[7,100],[8,100],[9,100],[10,100],[11,100],[12,100],[13,100],[14,100],[15,100],[16,100],[17,90],[18,90],[19,120]],"hit":3},"schlag":{"f":[[0,100],[1,70],[20,70],[21,80],[22,100],[23,100],[24,100],[25,100],[26,60],[27,104],[28,104],[29,104],[30,104],[31,104],[32,260],[33,150]],"hit":9}},"klingen":[[67,76,70,121],[79,64,114,93],[109,44,77,56],[105,15,75,46],[105,15,75,46],[105,15,75,46],[105,15,75,46],[105,15,75,46],[105,15,75,46],[105,15,75,46],[105,15,75,46],[105,15,75,46],[105,15,75,46],[105,15,75,46],[105,15,75,46],[105,15,75,46],[105,15,75,46],[109,44,77,56],[79,64,114,93],[67,76,70,121],[102,17,72,51],[20,15,50,49],[6,20,42,45],[6,20,42,45],[6,20,42,45],[6,20,42,45],[114,40,80,55],[82,92,112,126],[82,92,112,126],[82,92,112,126],[82,92,112,126],[82,92,112,126],[82,91,112,125],[67,76,70,121]],"riss":{"x":148,"y":208,"w":361,"h":18,"x0":388}};
  // </titel-held.mjs>
  if (!META) return;
  const S = META.szene, HD = META.held, RU = META.ruhe;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = matchMedia('(max-width: 600px)'), narrow = matchMedia('(max-width: 820px)');
  const IMG = new URL('img/', document.querySelector('link[rel="icon"]')?.href ?? location.href).href;

  // ---------- Ausschnitt: Held bei ax der Breite, Fußlinie bei fy der Höhe; Größe nach Zeilen (rows) oder Spalten (cols)
  const frame = () => (phone.matches ? { ax: 0.42, fy: 0.86, cols: 160 } : narrow.matches ? { ax: 0.6, fy: 0.66, rows: 215 } : { ax: 0.725, fy: 0.88, rows: 170 });
  let dpr = 1, cw = 0, ch = 0, d = 1, vw = 0, vh = 0, camX = 0, camY = 0;
  const layout = () => {
    dpr = devicePixelRatio || 1;
    cw = box.clientWidth; ch = box.clientHeight;
    const f = frame(), W = Math.round(cw * dpr), H = Math.round(ch * dpr);
    d = Math.max(1, Math.round(f.cols ? W / f.cols : H / f.rows));
    while (S.W * d < W) d++;   // Szene muss die Breite füllen
    vw = W / d; vh = H / d;
    camX = Math.max(0, Math.min(S.W - Math.ceil(vw), Math.round(S.HX - f.ax * vw)));
    camY = Math.max(0, Math.round(S.FY - f.fy * vh));
    Object.assign(poster.style, { width: `${(S.W * d) / dpr}px`, height: `${(S.H * d) / dpr}px`, left: `${(-camX * d) / dpr}px`, top: `${(-camY * d) / dpr}px` });
  };
  layout();
  addEventListener('resize', layout);
  if (reduced) return;
  // Datensparmodus: Standbild genügt
  const conn = navigator.connection;
  if (conn && (conn.saveData || /(^|-)2g/.test(conn.effectiveType ?? ''))) return;

  // ---------- Bilder
  const load = (n) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = `${IMG}${n}.webp`; });
  const NAMES = ['titel-fern', 'titel-fern-glut', 'titel-strom', 'titel-strom-glut', 'titel-mitte', 'titel-mitte-glut', 'titel-nah', 'titel-nah-glut', 'titel-riss',
    'titel-held-umhang', 'titel-held-koerper', 'titel-held-flamme', 'titel-held-klinge', 'titel-held-momente'];
  const start = () => Promise.all(NAMES.map(load)).then((im) => run(Object.fromEntries(NAMES.map((n, i) => [n.slice(6), im[i]]))), () => {});
  if (document.readyState === 'complete') setTimeout(start, 200); else addEventListener('load', () => setTimeout(start, 200), { once: true });

  function run(I) {
    const cv = document.createElement('canvas');
    cv.className = 'titel-live'; cv.setAttribute('aria-hidden', 'true');
    box.append(cv);
    const ctx = cv.getContext('2d');
    const size = () => {
      layout();
      cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
      ctx.imageSmoothingEnabled = false;
    };
    size();
    removeEventListener('resize', layout);
    addEventListener('resize', size);

    // ---------- Kamera: langsames Schweben, auf dem Desktop etwas Tiefe zum Mauszeiger; alles in ganzen Szenenpixeln
    let mx = 0, my = 0, tmx = 0, tmy = 0, sx = 0, sy = 0, kx = 0, ky = 0;
    addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; tmx = (e.clientX / innerWidth) * 2 - 1; tmy = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
    const off = (f) => [Math.round(sx * f) + kx, Math.round(sy * f) + ky];   // Verschiebung einer Ebene mit Tiefe f
    // Bildausschnitt (sx0, sy0, w, h) an Szenenstelle (x, y), Tiefe f; nur der sichtbare Teil wird kopiert
    const blit = (img, sx0, sy0, w, h, x, y, f) => {
      const [ox0, oy0] = off(f);
      const ox = (x - camX - ox0) * d, oy = (y - camY - oy0) * d;
      const x0 = Math.max(0, Math.floor(-ox / d)), x1 = Math.min(w, Math.ceil((cv.width - ox) / d));
      const y0 = Math.max(0, Math.floor(-oy / d)), y1 = Math.min(h, Math.ceil((cv.height - oy) / d));
      if (x1 <= x0 || y1 <= y0) return;
      ctx.drawImage(img, sx0 + x0, sy0 + y0, x1 - x0, y1 - y0, ox + x0 * d, oy + y0 * d, (x1 - x0) * d, (y1 - y0) * d);
    };
    const whole = (img, x, y, f) => blit(img, 0, 0, img.width, img.height, x, y, f);
    const stepped = (v, n) => Math.round(v * n) / n;

    // ---------- Held: Ruhe aus Ebenen (Umhang, Körper, Flammen, Schwert), Momente als ganze Bilder
    const HX0 = S.HX - HD.fx, HY0 = S.FY - HD.fy;   // Szenenstelle der Streifenbilder
    const MOMENTS = ['schlag', 'schrei'];
    let mode = 'ruhe', mT0 = 0, mi = 0, nextMoment = 3.5, capeT0 = 0, lastHit = -1;
    const momentFrame = (name, ms) => {
      const f = META.momente[name].f;
      let acc = 0;
      for (let i = 0; i < f.length; i++) { acc += f[i][1]; if (ms < acc) return i; }
      return -1;
    };
    // ---------- Teilchen (Szenenpixel, harte Farbstufen ohne Überblendung)
    const FIRE = ['#fff2c0', '#ffb648', '#e8641a', '#a8300a'];
    const DUST = ['#6a5040', '#4e3a30', '#3a2a24'];
    let parts = [], sparkAcc = 0, beacon = 0, riss = null, shakeT = -1, blitz = null;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const spark = (x, y, o = {}) => parts.push({ x, y, vx: o.vx ?? rnd(-6, 6), vy: o.vy ?? -rnd(18, 40), g: o.g ?? 0, wob: o.wob ?? 10, life: 0, max: o.max ?? rnd(0.35, 0.8), c: o.c ?? FIRE, f: 1, seed: Math.random() * 9 });
    const ash = () => {
      const near = Math.random() < 0.35;
      return { x: camX + rnd(-20, vw + 20), y: camY - 2, vx: rnd(3, 7), vy: near ? rnd(7, 11) : rnd(4, 6), g: 0, wob: 3, life: 0, max: rnd(8, 16), f: near ? 0.8 : 0.4, c: near ? ['#ffb648', '#e8641a'] : ['#a8300a', '#5a1206'], seed: Math.random() * 9, rain: true };
    };
    for (let i = 0; i < 16; i++) { const q = ash(); q.y = camY + Math.random() * vh; q.life = Math.random() * q.max * 0.6; parts.push(q); }
    // Klinge im aktuellen Bild: Strecke in Szenenpixeln
    const blade = (mf) => {
      if (mode === 'ruhe') { const [a, b, c, e] = RU.klinge; return [HX0 + a + (c - a) / 2, HY0 + b, HX0 + a + (c - a) / 2, HY0 + e]; }
      const k = META.klingen[META.momente[mode].f[mf][0]];
      return k && [HX0 + k[0], HY0 + k[1], HX0 + k[2], HY0 + k[3]];
    };
    const hit = (name, mf) => {
      const k = blade(mf);
      if (name === 'schlag') {
        const R = META.riss;
        riss = { t: 0 }; shakeT = 0; blitz = { x: R.x0, y: S.FY, t: 0 };
        for (let i = 0; i < 22; i++) spark(R.x0 + rnd(-3, 3), S.FY + 1, { vx: rnd(-40, 40), vy: -rnd(40, 110), g: 260, wob: 0, max: rnd(0.4, 0.9) });
        for (let i = 0; i < 16; i++) spark(R.x0 + rnd(-6, 6), S.FY, { vx: rnd(-30, 30), vy: -rnd(15, 45), g: 70, wob: 0, max: rnd(0.6, 1.2), c: DUST });
      } else {
        beacon = 1.4;
        if (k) for (let i = 0; i < 26; i++) { const u = Math.random(); spark(k[0] + (k[2] - k[0]) * u, k[1] + (k[3] - k[1]) * u, { vy: -rnd(30, 70), vx: rnd(-14, 14) }); }
      }
    };
    const update = (dt, t) => {
      mx += (tmx - mx) * Math.min(1, dt * 2.5); my += (tmy - my) * Math.min(1, dt * 2.5);
      const e = Math.min(1, t / 3);   // Bewegung setzt sanft ein (Bild 0 = Standbild)
      sx = e * 5 * Math.sin((t * Math.PI * 2) / 26) + mx * 4;
      sy = e * 1.5 * Math.sin((t * Math.PI * 2) / 19) + my * 1.5;
      // Erschütterung beim Einschlag: drei Bilder zu 50 ms, je ein Szenenpixel
      if (shakeT >= 0) { shakeT += dt; const s = [[0, 1], [0, -1], [1, 0]][Math.floor(shakeT / 0.05)]; if (s) [kx, ky] = s; else { kx = ky = 0; shakeT = -1; } }
      // Momente beginnen, wenn der Umhang wieder bei Bild 0 ist (die Momentbilder enthalten ihn ab dort)
      const um = RU.umhangMs / 1000;
      if (mode === 'ruhe' && t >= nextMoment) {
        const k = Math.floor((t - capeT0) / um);
        if (k % RU.umhang === 0) { mode = MOMENTS[mi++ % MOMENTS.length]; mT0 = capeT0 + k * um; lastHit = -1; }
      }
      let mf = 0;
      if (mode !== 'ruhe') {
        mf = momentFrame(mode, (t - mT0) * 1000);
        if (mf < 0) { mode = 'ruhe'; nextMoment = t + 6 + Math.random() * 2; }
        else if (mf >= META.momente[mode].hit && lastHit < 0) { lastHit = mf; hit(mode, mf); }
      }
      // Funken von der Klinge
      sparkAcc += dt * (mode === 'ruhe' ? 4 : 9);
      const k = blade(mf);
      while (sparkAcc >= 1) { sparkAcc -= 1; if (k) { const u = Math.random(); spark(k[0] + (k[2] - k[0]) * u + rnd(-2, 2), k[1] + (k[3] - k[1]) * u); } }
      if (Math.random() < dt * 2) parts.push(ash());
      // Riss: Front läuft nach beiden Seiten, an der Front Staub und Funken
      if (riss) {
        riss.t += dt;
        const R = META.riss, r = riss.t * 420;
        for (const dir of [-1, 1]) {
          const x = R.x0 + dir * r;
          if (x < R.x || x > R.x + R.w) continue;
          if (Math.random() < 0.7) spark(x, S.FY + 1, { vx: dir * rnd(5, 25), vy: -rnd(15, 40), g: 70, wob: 0, max: rnd(0.4, 0.9), c: DUST });
          if (Math.random() < 0.5) spark(x, S.FY + 1, { vx: dir * rnd(10, 30), vy: -rnd(30, 70), g: 200, wob: 0, max: rnd(0.3, 0.6) });
        }
        if (r > Math.max(R.x0 - R.x, R.x + R.w - R.x0) + 420 * 1.1) riss = null;
      }
      beacon = Math.max(0, beacon - dt);
      if (blitz && (blitz.t += dt) > 0.16) blitz = null;
      for (const q of parts) {
        q.life += dt;
        if (q.wob) q.vx += Math.sin(q.life * 6 + q.seed) * q.wob * dt;
        q.vy += q.g * dt;
        q.x += q.vx * dt; q.y += q.vy * dt;
      }
      parts = parts.filter((q) => q.life < q.max && (!q.rain || q.y < S.FY + 30) && (q.rain || q.g === 0 || q.y < S.FY + 3));
      if (parts.length > 300) parts.splice(0, parts.length - 300);
      return mf;
    };

    const pulse = (t) => stepped(0.8 + 0.2 * Math.cos((t * Math.PI * 2) / 3.4), 3);   // bei t = 0 voll (= Standbild)
    const draw = (t, mf = 0) => {
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#060309'; ctx.fillRect(0, 0, cv.width, cv.height);
      // Ferne (Tiefe 0,12): Himmel, Berge, Aschethron; Feuerschalen und Fenster flackern in Stufen, beim Schlachtruf lodernd
      whole(I['fern'], 0, 0, 0.12);
      ctx.globalAlpha = stepped(0.7 + 0.3 * Math.abs(Math.cos(t * 5.3) * Math.cos(t * 2.1)), 3);
      whole(I['fern-glut'], 0, 0, 0.12);
      if (beacon > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1; whole(I['fern-glut'], 0, 0, 0.12); if (beacon > 0.7) whole(I['fern-glut'], 0, 0, 0.12); ctx.globalCompositeOperation = 'source-over'; }
      ctx.globalAlpha = 1;
      // Lavastrom (Tiefe 0,35): 4 Bilder der Spiel-Lava
      const lf = Math.floor(t * 2.5) % S.LH, lh = S.LH2, pl = pulse(t);
      blit(I['strom'], 0, lf * lh, S.W, lh, 0, S.LT, 0.35);
      ctx.globalAlpha = pl; blit(I['strom-glut'], 0, lf * lh, S.W, lh, 0, S.LT, 0.35); ctx.globalAlpha = 1;
      // Ebene (Tiefe 0,5)
      whole(I['mitte'], 0, 0, 0.5);
      ctx.globalAlpha = stepped(0.7 + 0.3 * Math.cos((t * Math.PI * 2) / 4.1), 3); whole(I['mitte-glut'], 0, 0, 0.5); ctx.globalAlpha = 1;
      // Vordergrund (Tiefe 1): Kruste, Fugen pulsieren; beim Treffer kurz heller (harte Pixel, addiert)
      whole(I['nah'], 0, S.NT, 1);
      ctx.globalAlpha = pl; whole(I['nah-glut'], 0, S.NT, 1); ctx.globalAlpha = 1;
      // Riss: je Spalte nach Alter frisch (weißgelb), warm (orange), kühl (rot)
      if (riss) {
        const R = META.riss, r = riss.t * 420;
        let run = -1, rv = -1;
        const flush = (x) => { if (rv >= 0) blit(I['riss'], run - R.x, rv * R.h, x - run, R.h, run, R.y, 1); };
        for (let x = R.x; x <= R.x + R.w; x++) {
          const s = Math.abs(x - R.x0), age = (r - s) / 420;
          const v = x === R.x + R.w || s > r ? -1 : age < 0.08 ? 0 : age < 0.4 ? 1 : age < 1.0 ? 2 : -1;
          if (v !== rv) { flush(x); run = x; rv = v; }
        }
      }
      // Held
      if (mode === 'ruhe') {
        const ms = t * 1000;
        blit(I['held-umhang'], (Math.floor((ms - capeT0 * 1000) / RU.umhangMs) % RU.umhang) * HD.w, 0, HD.w, HD.h, HX0, HY0, 1);
        blit(I['held-koerper'], (Math.floor(ms / RU.atemMs) % RU.atem) * HD.w, 0, HD.w, HD.h, HX0, HY0, 1);
        blit(I['held-flamme'], (Math.floor(ms / RU.flammeMs) % RU.flamme) * HD.w, 0, HD.w, HD.h, HX0, HY0, 1);
        blit(I['held-klinge'], 0, 0, HD.w, HD.h, HX0, HY0, 1);
      } else {
        blit(I['held-momente'], META.momente[mode].f[mf][0] * HD.w, 0, HD.w, HD.h, HX0, HY0, 1);
      }
      // Einschlag: harter Lichtstern, dann ein Glutkranz (je ein Szenenpixel)
      if (blitz) {
        const [ox, oy] = off(1), r = blitz.t < 0.06 ? 0 : 1;
        const P = r === 0 ? [[0, 0, '#fff2c0'], [1, 0, '#fff2c0'], [-1, 0, '#fff2c0'], [0, -1, '#fff2c0'], [2, 0, '#ffb648'], [-2, 0, '#ffb648'], [0, -2, '#ffb648'], [3, 0, '#e8641a'], [-3, 0, '#e8641a'], [0, -3, '#e8641a'], [1, -1, '#ffb648'], [-1, -1, '#ffb648']]
          : [[0, -4, '#e8641a'], [3, -3, '#e8641a'], [-3, -3, '#e8641a'], [4, 0, '#a8300a'], [-4, 0, '#a8300a'], [2, -1, '#ffb648'], [-2, -1, '#ffb648'], [0, -1, '#ffb648']];
        for (const [dx, dy, c] of P) { ctx.fillStyle = c; ctx.fillRect((blitz.x + dx - camX - ox) * d, (blitz.y + dy - camY - oy) * d, d, d); }
      }
      // Teilchen: ein Szenenpixel, Farbe nach Alter in Stufen
      for (const q of parts) {
        const k = q.life / q.max;
        if (q.rain && q.life < 0.3) continue;
        ctx.fillStyle = q.c[Math.min(q.c.length - 1, Math.floor(k * q.c.length))];
        const [ox, oy] = off(q.f);
        ctx.fillRect((Math.round(q.x) - camX - ox) * d, (Math.round(q.y) - camY - oy) * d, d, d);
      }
    };

    // ---------- Schleife nur, solange das Bild sichtbar ist
    let on = false, vis = false, last = 0, T = 0;
    const tick = (now) => {
      if (!vis || document.hidden) { on = false; return; }
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; T += dt;
      draw(T, update(dt, T));
      requestAnimationFrame(tick);
    };
    const go = () => { if (vis && !document.hidden && !on) { on = true; last = 0; requestAnimationFrame(tick); } };
    draw(0);
    cv.classList.add('on');
    new IntersectionObserver(([e]) => { vis = e.isIntersecting; go(); }).observe(box);
    document.addEventListener('visibilitychange', go);
  }
})();
