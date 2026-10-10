// Emberwrath – Titelbild der Startseite „Aufbruch zum Aschethron“ (Ebenen und Held aus tools/titel-held.mjs).
// Ein Standbild (img/titel.webp) steht sofort da; sobald alle Ebenen geladen sind, zeichnet dieses Skript dieselbe
// Szene lebendig auf ein Canvas darüber: Lavastrom und Glutfugen pulsieren, die Kamera schwebt langsam, auf dem
// Desktop gibt der Mauszeiger etwas Tiefe, an der Klinge züngeln Flammen, Glut treibt durch die Luft. Alle paar
// Sekunden ein Heldenmoment (Kriegsschrei oder Erdspalter) mit Lichtblitz in harten Stufen und einer Glutwelle über
// die Kruste. Gezeichnet in ganzen Gerätepixeln: d Gerätepixel je Heldenpixel (gerade), die hinteren Ebenen mit d/K.
// Ohne JavaScript oder bei reduzierter Bewegung bleibt das Standbild (hier pixelgenau ausgerichtet).
(() => {
  const box = document.querySelector('.hero-bg[data-titel]');
  const poster = box?.querySelector('img');
  if (!box || !poster) return;
  // <titel-held.mjs> – von tools/titel-held.mjs geschrieben, nicht von Hand ändern
  const META = {"szene":{"W":640,"H":272,"FY":212,"HX":330,"HOR":146,"FX":378,"LH":4,"K":2,"LT":291,"LH2":139,"NT":207},"held":{"w":205,"h":175,"fx":73,"fy":145,"ruhe":{"n":24,"ax":[[7.74,-42,-2.3,12.9,66],[7.74,-37.5,-2.3,12.9,66],[7.74,-37.5,-2.3,12.9,66],[7.74,-37.5,-2.3,12.9,66],[7.74,-37.5,-2.3,12.9,66],[7.74,-37.5,-2.3,12.9,66],[7.74,-42,-2.3,12.9,66],[7.74,-42,-2.3,12.9,66],[7.74,-42,-2.3,12.9,66],[7.74,-37.5,-2.3,12.9,66],[7.74,-37.5,-2.3,12.9,66],[7.74,-37.5,-2.3,12.9,66],[7.74,-37.5,-2.3,12.9,66],[7.74,-42,-2.3,12.9,66],[7.74,-42,-2.3,12.9,66],[7.74,-42,-2.3,12.9,66],[7.74,-42,-2.3,12.9,66],[7.74,-42,-2.3,12.9,66],[7.74,-37.5,-2.3,12.9,66],[7.74,-37.5,-2.3,12.9,66],[7.74,-37.5,-2.3,12.9,66],[7.74,-37.5,-2.3,12.9,66],[7.74,-42,-2.3,12.9,66],[7.74,-42,-2.3,12.9,66]]},"schrei":{"n":8,"ax":[[7.74,-42,-2.3,12.9,66],[12.24,-37.5,-1.2,12.9,66],[3.24,-73.5,-1.5,12.9,66],[0.24,-76.5,-1.55,12.9,66],[3.24,-73.5,-1.5,12.9,66],[9.24,-43.5,-1.1,12.9,66],[7.74,-42,-2.3,12.9,66],[7.74,-42,-2.3,12.9,66]],"hit":3},"schlag":{"n":18,"ax":[[7.74,-42,-2.3,12.9,66],[0.24,-43.5,-2.5,12.9,66],[-5.06,-91.37,-3,12.9,66],[30.24,-73.5,-0.9,12.9,66],[34.8,-19.83,1.2,12.9,66],[34.22,-19.08,1.25,12.9,66],[34.22,-19.08,1.25,12.9,66],[24.24,-28.5,0.8,12.9,66],[24.24,-28.5,0.8,12.9,66],[7.74,-42,-2.3,12.9,66],[7.74,-42,-2.3,12.9,66],[7.74,-37.5,-2.3,12.9,66],[7.74,-37.5,-2.3,12.9,66],[7.74,-37.5,-2.3,12.9,66],[7.74,-37.5,-2.3,12.9,66],[7.74,-42,-2.3,12.9,66],[7.74,-42,-2.3,12.9,66],[7.74,-42,-2.3,12.9,66]],"hit":4}}};
  // </titel-held.mjs>
  if (!META) return;
  const S = META.szene, HD = META.held, K = S.K;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = matchMedia('(max-width: 600px)'), narrow = matchMedia('(max-width: 820px)');
  const IMG = new URL('img/', document.querySelector('link[rel="icon"]')?.href ?? location.href).href;

  // ---------- Ausschnitt: Held bei ax der Breite, Fußlinie bei fy der Höhe. Am Handy rücken Aschethron und Strom
  // etwas näher an den Helden (far, in Heldenpixeln), damit beide ins schmale Bild passen.
  const frame = () => (phone.matches ? { ax: 0.38, fy: 0.72, far: 0, rows: 0, cols: 150 } : narrow.matches ? { ax: 0.64, fy: 0.6, far: 0, rows: 200, cols: 0 } : { ax: 0.725, fy: 0.845, far: 0, rows: 200, cols: 0 });
  let dpr = 1, cw = 0, ch = 0, d = 2, B = 1, vw = 0, vh = 0, camX = 0, camY = 0, far = 0;
  const layout = () => {
    dpr = devicePixelRatio || 1;
    cw = box.clientWidth; ch = box.clientHeight;
    const f = frame(), W = cw * dpr, H = ch * dpr;
    d = f.cols ? 2 * Math.max(1, Math.round(W / f.cols / 2)) : 2 * Math.max(1, Math.round(H / f.rows / 2));
    while (S.W * d < W) d += 2;   // Szene muss die Breite füllen
    B = d / K; vw = W / d; vh = H / d; far = f.far;
    // Ruhestellung auf ganze hintere Pixel, damit Standbild und Canvas deckungsgleich sind
    camX = Math.round((S.HX - f.ax * vw) * K) / K;
    camX = Math.max(0, Math.min(S.W - vw, camX));
    camY = Math.round((S.FY - f.fy * vh) * K) / K;
    Object.assign(poster.style, { width: `${(S.W * K * B) / dpr}px`, height: `${(S.H * K * B) / dpr}px`, left: `${(-camX * d) / dpr}px`, top: `${(-camY * d) / dpr}px` });
  };
  layout();
  addEventListener('resize', layout);
  if (reduced) return;
  // Datensparmodus: Standbild genügt
  const conn = navigator.connection;
  if (conn && (conn.saveData || /(^|-)2g/.test(conn.effectiveType ?? ''))) return;

  // ---------- Bilder
  const load = (n) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = `${IMG}${n}.webp`; });
  const NAMES = ['titel-fern', 'titel-fern-glut', 'titel-strom', 'titel-strom-glut', 'titel-mitte', 'titel-mitte-glut', 'titel-nah', 'titel-nah-glut', 'titel-nah-welle', 'titel-held-ruhe', 'titel-held-schrei', 'titel-held-schlag'];
  const start = () => Promise.all(NAMES.map(load)).then((im) => run(Object.fromEntries(NAMES.map((n, i) => [n.slice(6), im[i]]))), () => {});
  if (document.readyState === 'complete') setTimeout(start, 200); else addEventListener('load', () => setTimeout(start, 200), { once: true });

  function run(I) {
    const cv = document.createElement('canvas');
    cv.className = 'titel-live'; cv.setAttribute('aria-hidden', 'true');
    box.append(cv);
    const ctx = cv.getContext('2d');
    // Glutfugen des Vordergrunds (für Funken der Glutwelle)
    const seams = [];
    {
      const c = document.createElement('canvas'), g = I['nah-welle'];
      c.width = g.width; c.height = g.height;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(g, 0, 0);
      const a = x.getImageData(0, 0, c.width, c.height).data;
      for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) if (a[(y * c.width + xx) * 4 + 3] > 100) seams.push([xx, y + S.NT]);
    }
    const size = () => {
      layout();
      cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
      ctx.imageSmoothingEnabled = false;
    };
    size();
    removeEventListener('resize', layout);
    addEventListener('resize', size);

    // ---------- Kamera: langsames Schweben, auf dem Desktop etwas Tiefe zum Mauszeiger (klingt weich nach)
    let mx = 0, my = 0, tmx = 0, tmy = 0;
    addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; tmx = (e.clientX / innerWidth) * 2 - 1; tmy = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
    // Ebene mit Tiefe f (1 = Held und Vordergrund): Verschiebung in Heldenpixeln
    let sx = 0, sy = 0;
    const shift = (t) => {
      const e = Math.min(1, t / 3);   // Bewegung setzt sanft ein (Bild 0 = Standbild)
      sx = e * (5 * Math.sin((t * Math.PI * 2) / 26)) + mx * 4;
      sy = e * (1.5 * Math.sin((t * Math.PI * 2) / 19)) + my * 1.5;
    };
    // Bild zeichnen: (img, Quelle y/Höhe) an Szenenstelle (x, y in Heldenpixeln), Pixelgröße px, Tiefe f
    const blit = (img, sy0, sh, x, y, px, f, xoff = 0) => {
      const ox = Math.round((x + xoff - camX - sx * f) * d), oy = Math.round((y - camY - sy * f) * d);
      const s = px / d;   // Heldenpixel je Quellpixel
      // nur den sichtbaren Teil kopieren
      const x0 = Math.max(0, Math.floor(-ox / px)), x1 = Math.min(img.width, Math.ceil((cv.width - ox) / px));
      const y0 = Math.max(0, Math.floor(-oy / px)), y1 = Math.min(sh, Math.ceil((cv.height - oy) / px));
      if (x1 <= x0 || y1 <= y0) return;
      ctx.drawImage(img, x0, sy0 + y0, x1 - x0, y1 - y0, ox + x0 * px, oy + y0 * px, (x1 - x0) * px, (y1 - y0) * px);
      return s;
    };
    const stepped = (v, n) => Math.round(v * n) / n;

    // ---------- Held: Ruheschleife, dazwischen Momente
    const STRIPS = { ruhe: I['held-ruhe'], schrei: I['held-schrei'], schlag: I['held-schlag'] };
    const MOMENTS = ['schrei', 'schlag'];
    let cur = 'ruhe', fi = 0, facc = 0, nextMoment = 3.2, mi = 0, pending = null;
    // ---------- Teilchen in Heldenpixeln: Klingenflammen (wie Hero im Spiel), Glutregen, Funken der Welle
    const FIRE = ['#fff0b0', '#ffb640', '#f07a1c', '#c8420c', '#7a2208'];
    let parts = [], bladeAcc = 0, flash = 0, wave = null, beacon = 0;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const emitBlade = (dt) => {
      const a = HD[cur].ax[fi];
      if (!a) return;
      bladeAcc += dt * 30;
      const [ax, ay, ang, u0, u1] = a, dx = Math.cos(ang), dy = Math.sin(ang);
      while (bladeAcc >= 1) {
        bladeAcc -= 1;
        const u = u0 + Math.random() * (u1 - u0), side = (Math.random() * 2 - 1) * 3;
        parts.push({ x: S.HX + ax + dx * u - dy * side, y: S.FY + ay + dy * u + dx * side, vx: rnd(-12, 12), vy: 0, rise: rnd(54, 102), wob: 54, life: 0, max: rnd(0.25, 0.55), sz: 1, f: 1, c: FIRE, seed: Math.random() * 10 });
      }
    };
    // Glutregen: wenige Funken (hintere Pixel), die schräg durch die Szene sinken, in zwei Tiefen
    const ash = () => {
      const near = Math.random() < 0.35;
      return { x: camX + rnd(-20, vw + 20), y: camY - 4, vx: rnd(4, 10), vy: near ? rnd(9, 14) : rnd(5, 8), rise: 0, wob: 6, life: 0, max: rnd(6, 14), sz: 1 / K, f: near ? 0.8 : 0.4, c: near ? ['#ffb640', '#f07a1c', '#c8420c'] : ['#f07a1c', '#c8420c', '#7a2208'], seed: Math.random() * 10, rain: true };
    };
    for (let i = 0; i < 18; i++) { const q = ash(); q.y = camY + Math.random() * vh; q.life = Math.random() * q.max * 0.6; parts.push(q); }

    const hit = (name) => {
      flash = 1;
      if (name === 'schlag') wave = { t: 0, dir: [-1, 1], speed: 260, len: 300, str: 1 };
      else { wave = { t: 0, dir: [-1, 1], speed: 170, len: 170, str: 0.7 }; beacon = 1.2; }
    };
    const update = (dt, t) => {
      mx += (tmx - mx) * Math.min(1, dt * 2.5); my += (tmy - my) * Math.min(1, dt * 2.5);
      shift(t);
      // Bildfolge des Helden (12 Bilder/s)
      facc += dt * 12;
      while (facc >= 1) {
        facc -= 1;
        const n = HD[cur].n;
        if (cur === 'ruhe') {
          if (t >= nextMoment && fi === n - 1) { pending = MOMENTS[mi++ % MOMENTS.length]; }
          if (pending) { cur = pending; pending = null; fi = 0; continue; }
          fi = (fi + 1) % n;
        } else {
          fi++;
          if (fi === HD[cur].hit) hit(cur);
          if (fi >= n) { cur = 'ruhe'; fi = 0; nextMoment = t + 6 + Math.random() * 2; }
        }
      }
      emitBlade(dt);
      if (Math.random() < dt * 2.2) parts.push(ash());
      // Welle: Funken springen an der Front aus den Fugen
      if (wave) {
        wave.t += dt;
        const r = wave.t * wave.speed;
        if (r > wave.len + 30) wave = null;
        else for (const dir of wave.dir) for (let k = 0; k < 4; k++) {
          const p = seams[(Math.random() * seams.length) | 0], dist = (p[0] - S.HX) * dir;
          if (dist < r - 14 || dist > r || dist > wave.len) continue;
          parts.push({ x: p[0], y: p[1], vx: rnd(-8, 8) + dir * 10, vy: -rnd(30, 70), g: 160, rise: 0, wob: 0, life: 0, max: rnd(0.35, 0.7), sz: 1, f: 1, c: FIRE, seed: 0 });
        }
      }
      flash = Math.max(0, flash - dt * 4);
      beacon = Math.max(0, beacon - dt);
      for (const q of parts) {
        q.life += dt;
        if (q.wob) q.vx += Math.sin(q.life * 6 + q.seed) * q.wob * dt;
        if (q.g) q.vy += q.g * dt;
        q.x += q.vx * dt; q.y += q.vy * dt - q.rise * dt;
      }
      parts = parts.filter((q) => q.life < q.max && (!q.rain || q.y < S.FY + 30));
      if (parts.length > 400) parts.splice(0, parts.length - 400);
    };

    const pulse = (t) => stepped(0.8 + 0.2 * Math.sin((t * Math.PI * 2) / 3.4), 4);
    const draw = (t) => {
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#060309'; ctx.fillRect(0, 0, cv.width, cv.height);
      const fo = far;
      // Ferne (Tiefe 0,12): Himmel, Berge, Aschethron; Feuerschalen flackern in Stufen, beim Kriegsschrei auflodernd
      blit(I['fern'], 0, I['fern'].height, 0, 0, B, 0.12, fo);
      ctx.globalAlpha = Math.min(1, stepped(0.75 + 0.25 * Math.sin(t * 7.3) * Math.sin(t * 3.1), 3) + (beacon > 0 ? 0.5 : 0));
      blit(I['fern-glut'], 0, I['fern-glut'].height, 0, 0, B, 0.12, fo);
      if (beacon > 0.2) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = stepped(Math.min(1, beacon) * 0.6, 3); blit(I['fern-glut'], 0, I['fern-glut'].height, 0, 0, B, 0.12, fo); ctx.globalCompositeOperation = 'source-over'; }
      ctx.globalAlpha = 1;
      // Lavastrom (Tiefe 0,35): 4 Bilder der Spiel-Lava, langsam
      const lf = Math.floor(t * 2.5) % 4, lh = S.LH2, pl = pulse(t);
      blit(I['strom'], lf * lh, lh, 0, S.LT / K, B, 0.35, fo);
      ctx.globalAlpha = pl; blit(I['strom-glut'], lf * lh, lh, 0, S.LT / K, B, 0.35, fo); ctx.globalAlpha = 1;
      // Ebene (Tiefe 0,5)
      blit(I['mitte'], 0, I['mitte'].height, 0, 0, B, 0.5, fo);
      ctx.globalAlpha = stepped(0.7 + 0.3 * Math.sin((t * Math.PI * 2) / 4.1 + 1), 3); blit(I['mitte-glut'], 0, I['mitte-glut'].height, 0, 0, B, 0.5, fo); ctx.globalAlpha = 1;
      // Vordergrund (Tiefe 1): Kruste, Fugen pulsieren; Glutwelle als harte Bänder
      blit(I['nah'], 0, I['nah'].height, 0, S.NT, d, 1);
      ctx.globalAlpha = pl; blit(I['nah-glut'], 0, I['nah-glut'].height, 0, S.NT, d, 1); ctx.globalAlpha = 1;
      if (wave) {
        const r = wave.t * wave.speed;
        ctx.globalCompositeOperation = 'lighter';
        for (const dir of wave.dir) for (const [a, b, al] of [[r - 18, r, 1], [r - 18, r, 1], [r - 48, r - 18, 0.5]]) {
          const lo = Math.max(0, a), hi = Math.min(wave.len, b);
          if (hi <= lo) continue;
          const x0 = dir > 0 ? S.HX + lo : S.HX - hi, w = hi - lo;
          ctx.save();
          ctx.beginPath(); ctx.rect(Math.round((x0 - camX - sx) * d), 0, Math.round(w * d), cv.height); ctx.clip();
          ctx.globalAlpha = al * wave.str * (r > wave.len - 40 ? 0.5 : 1);
          blit(I['nah-welle'], 0, I['nah-welle'].height, 0, S.NT, d, 1);
          ctx.restore();
        }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
      // Held
      const st = STRIPS[cur];
      const hx = Math.round((S.HX - HD.fx - camX - sx) * d), hy = Math.round((S.FY - HD.fy - camY - sy) * d);
      ctx.drawImage(st, fi * HD.w, 0, HD.w, HD.h, hx, hy, HD.w * d, HD.h * d);
      // Teilchen
      for (const q of parts) {
        const k = q.life / q.max, a = Math.min(1, (1 - k) * 2.5);
        ctx.globalAlpha = q.rain ? a * Math.min(1, q.life * 2) : a;
        ctx.fillStyle = q.c[Math.min(q.c.length - 1, Math.floor(k * q.c.length))];
        const px = q.sz * d, x = Math.round(((q.x - camX - sx * q.f) * d) / px) * px, y = Math.round(((q.y - camY - sy * q.f) * d) / px) * px;
        ctx.fillRect(x, y, px, px);
      }
      ctx.globalAlpha = 1;
      // Lichtblitz beim Treffer: drei harte Stufen
      if (flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = flash > 0.66 ? 'rgba(255, 140, 60, 0.13)' : flash > 0.33 ? 'rgba(255, 110, 40, 0.07)' : 'rgba(255, 90, 30, 0.03)';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.globalCompositeOperation = 'source-over';
      }
    };

    // ---------- Schleife nur, solange das Bild sichtbar ist
    let on = false, vis = false, last = 0, T = 0;
    const tick = (now) => {
      if (!vis || document.hidden) { on = false; return; }
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; T += dt;
      update(dt, T); draw(T);
      requestAnimationFrame(tick);
    };
    const go = () => { if (vis && !document.hidden && !on) { on = true; last = 0; requestAnimationFrame(tick); } };
    draw(0);
    cv.classList.add('on');
    new IntersectionObserver(([e]) => { vis = e.isIntersecting; go(); }).observe(box);
    document.addEventListener('visibilitychange', go);
  }
})();
