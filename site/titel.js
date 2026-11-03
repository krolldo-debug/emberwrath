// Emberwrath – Titelbild der Startseite „Der Himmel reißt auf“ (Ebenen und Helden aus tools/titel-riss.mjs).
// Ein Standbild (img/titel.webp) steht sofort da; sobald alle Ebenen geladen sind, zeichnet dieses Skript dieselbe
// Szene lebendig auf ein Canvas darüber. Feinraster wie im Spiel (docs/STYLE.md): alle Bilder in Feinpixeln
// (Q = 2 je Szenenpixel); eine Pixelgröße für alles: d Gerätepixel je Feinpixel (ganzzahlig), jede Ebene und die Helden
// 1:1, Verschiebungen (Schweben, Maus) in ganzen Feinpixeln, die Erschütterung in ganzen Szenenpixeln.
// Leben: Der Riss atmet (Kante, Splitter, Haarrisse, schwebende Inseln, ziehende Morgenwolken), der Lavastrom fließt,
// Fenster des Aschethrons und Fugen der Felsnase glühen in Stufen, Glutfunken steigen, Sternenstaub rieselt aus dem Riss.
// Alle 5–7 s zeigt reihum ein Held seinen Moment: Erdspalter (Einschlag, Glutwelle über die Felskante, Erschütterung),
// Pfeilhagel, Feuerball in den Riss, Ausfall. Alle 12–15 s flackert der Riss auf und wirft Sternenstaub ab.
// Ohne JavaScript oder bei reduzierter Bewegung bleibt das Standbild (hier pixelgenau ausgerichtet).
// Eingebunden direkt hinter dem Titelbild (nicht async): so richtet es das Standbild noch vor dem ersten Malen aus.
(() => {
  const box = document.querySelector('.hero-bg[data-titel]');
  const poster = box?.querySelector('img');
  if (!box || !poster) return;
  // <titel-riss.mjs> – von tools/titel-riss.mjs geschrieben, nicht von Hand ändern
  const META = {"szene":{"Q":2,"W":1280,"H":544,"HOR":328,"RB":[762,0,1134,272],"NR":8,"NL":4,"EY":332,"NT":372,"FY0":148,"FX":820,"FYP":410,"RX":960,"RY":120,"TX":952,"TY":250},"helden":{"ranger":{"w":44,"h":64,"fx":22,"fy":62,"ruhe":4,"ruheFps":6,"moment":"rainshot","n":5,"fps":12,"row":0,"x":744,"y":412},"mage":{"w":46,"h":88,"fx":14,"fy":78,"ruhe":4,"ruheFps":6,"moment":"cast","n":5,"fps":12,"row":64,"x":784,"y":410},"warrior":{"w":96,"h":110,"fx":46,"fy":84,"ruhe":4,"ruheFps":6,"moment":"slam","n":6,"fps":12,"row":152,"x":832,"y":414},"rogue":{"w":70,"h":66,"fx":24,"fy":60,"ruhe":4,"ruheFps":6,"moment":"lunge","n":6,"fps":12,"row":262,"x":876,"y":404}},"kante":{"x0":600,"y":[592,592,592,592,590,592,596,594,594,594,594,596,594,594,594,594,592,592,592,582,566,556,544,534,522,512,504,494,484,478,470,462,456,450,442,436,432,428,424,422,418,416,416,416,414,414,414,412,410,410,408,408,408,408,410,408,408,408,408,408,408,410,410,410,408,408,408,408,408,408,408,408,408,408,410,410,410,412,412,412,410,410,408,406,406,406,406,406,406,406,406,406,406,406,408,408,410,410,410,410,410,412,412,412,412,412,412,412,412,410,410,410,412,412,410,410,410,410,410,410,410,410,410,408,408,406,406,406,404,404,402,402,400,400,400,400,400,400,400,400,400,400,400,400,402,402,404,404,404,404,404,404,404,402,402,404,404,404,406,406,404,404,402,400,398,394,394,394,392,392,390,394,392,392,392,392,394,396,398,400,402,402,404,404,404,406,404,404,404,404,404,402,402,402,400,400,398,398,398,398,398,398,400,400,400,400,400,396,394,394,392,390,390,390,388,388,388,390,390,390,388,390,388,388,388,386,386,388,388,388,390,392,392,394,398,398,400,400,400,400,400,400,400,400,400,398,398,396,396,396,396,396,396,396,396,398,398,398,398,400,398,398,396,396,394,392,390,390,390,392,394,396,396,398,398,394,392,390,388,386,384,384,384,384,386,384,388,388,388,390,390,394,394,396,396,392,394,390,388,388,386,384,382,382,382,380,380,382,382,382,384,384,382,384,384,384,384,384,384,384,384,382,382,384,384,386,386,390,392,396,400,400,400,398,398,396,396,398,398,400]},"dims":{"titel-himmel":[1280,544],"titel-riss":[372,2176],"titel-fern":[1280,396],"titel-fern-glut":[1280,396],"titel-ebene":[1280,848],"titel-fels":[1280,172],"titel-fels-glut":[1280,172],"titel-helden":[960,328]},"v":"bb62c190d2"};
  // </titel-riss.mjs>
  if (!META) return;
  const S = META.szene, HD = META.helden, Q = S.Q;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = matchMedia('(max-width: 600px), (max-width: 820px) and (orientation: portrait)'), narrow = matchMedia('(max-width: 820px)'), quer = matchMedia('(max-height: 500px) and (orientation: landscape)');
  const IMG = new URL('img/', document.querySelector('link[rel="icon"]')?.href ?? location.href).href;

  // ---------- Ausschnitt: Heldengruppe bei ax der Breite, Fußlinie bei fy der Höhe; Größe nach Zeilen (rows) oder
  // Spalten (cols) in Szenenpixeln, d ganzzahlig je Feinpixel
  const frame = () => (quer.matches ? { ax: 0.64, fy: 0.84, rows: 200 } : phone.matches ? { ax: 0.42, fy: 0.8, cols: 230 } : narrow.matches ? { ax: 0.58, fy: 0.76, rows: 240 } : { ax: 0.66, fy: 0.76, rows: 240 });
  let dpr = 1, cw = 0, ch = 0, d = 1, vw = 0, vh = 0, camX = 0, camY = 0;
  // dpr: Leinwandpixel je CSS-Pixel. Höchstens 4096 je Kante und 16 MP (Safari zeichnet größere Leinwände still nicht)
  const layout = () => {
    const real = devicePixelRatio || 1;
    let k = 1;
    while (box.clientWidth * real > 4096 * k || box.clientHeight * real > 4096 * k || box.clientWidth * box.clientHeight * real * real > 16e6 * k * k) k++;
    dpr = real / k;
    cw = box.clientWidth; ch = box.clientHeight;
    const f = frame(), W = Math.round(cw * dpr), H = Math.round(ch * dpr);
    d = Math.max(1, Math.round(f.cols ? W / (f.cols * Q) : H / (f.rows * Q)));
    while (S.W * d < W || S.H * d < H) d++;   // Szene muss die Fläche füllen
    vw = W / d; vh = H / d;
    camX = Math.max(0, Math.min(S.W - Math.ceil(vw), Math.round(S.FX - f.ax * vw)));
    camY = Math.max(0, Math.min(S.H - Math.ceil(vh), Math.round(S.FYP - f.fy * vh)));
    Object.assign(poster.style, { width: `${(S.W * d) / dpr}px`, height: `${(S.H * d) / dpr}px`, left: `${(-camX * d) / dpr}px`, top: `${(-camY * d) / dpr}px` });
    poster.classList.add('da');
  };
  layout();
  addEventListener('resize', layout);
  if (reduced) return;
  const conn = navigator.connection;
  if (conn && (conn.saveData || /(^|-)2g/.test(conn.effectiveType ?? ''))) return;

  // ---------- Bilder mit Version, fertig dekodiert und in erwarteter Größe – sonst bleibt das Standbild stehen
  const load = (n) => new Promise((ok, no) => {
    const i = new Image();
    i.onload = () => {
      const want = META.dims[n];
      if (!want || i.naturalWidth !== want[0] || i.naturalHeight !== want[1]) { no(new Error(n)); return; }
      (i.decode ? i.decode() : Promise.resolve()).then(() => ok(i), no);
    };
    i.onerror = no;
    i.src = `${IMG}${n}.webp?v=${META.v}`;
  });
  const NAMES = ['titel-himmel', 'titel-riss', 'titel-fern', 'titel-fern-glut', 'titel-ebene', 'titel-fels', 'titel-fels-glut', 'titel-helden'];
  const start = () => Promise.all(NAMES.map(load)).then((im) => run(Object.fromEntries(NAMES.map((n, i) => [n.slice(6), im[i]]))), () => {});
  // Ebenen erst nach dem ersten Malen des Standbilds (LCP) laden
  let begun = false;
  const begin = () => { if (!begun) { begun = true; setTimeout(start, 200); } };
  const loaded = () => {
    if (!window.PerformanceObserver?.supportedEntryTypes?.includes('largest-contentful-paint')) { begin(); return; }
    new PerformanceObserver((l, o) => { if (l.getEntries().length) { o.disconnect(); requestAnimationFrame(begin); } }).observe({ type: 'largest-contentful-paint', buffered: true });
    setTimeout(begin, 3000);
  };
  if (document.readyState === 'complete') loaded(); else addEventListener('load', loaded, { once: true });

  function run(I) {
    try { live(I); } catch { stop(); }
  }
  let stop = () => { box.querySelector('.titel-live')?.remove(); poster.style.visibility = ''; };
  function live(I) {
    const cv = document.createElement('canvas');
    cv.className = 'titel-live'; cv.setAttribute('aria-hidden', 'true');
    box.append(cv);
    const ctx = cv.getContext('2d');
    const size = () => { layout(); cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); ctx.imageSmoothingEnabled = false; };
    size();
    removeEventListener('resize', layout);
    addEventListener('resize', size);
    let dead = false;
    stop = () => { dead = true; removeEventListener('resize', size); addEventListener('resize', layout); layout(); cv.remove(); poster.style.visibility = ''; };

    // ---------- Kamera: langsames Schweben, auf dem Desktop etwas Tiefe zum Mauszeiger; alles in ganzen Feinpixeln
    let mx = 0, my = 0, tmx = 0, tmy = 0, sx = 0, sy = 0, kx = 0, ky = 0;
    addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; tmx = (e.clientX / innerWidth) * 2 - 1; tmy = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
    const off = (f) => [Math.round(sx * f) + kx, Math.round(sy * f) + ky];
    const blit = (img, sx0, sy0, w, h, x, y, f) => {
      const [ox0, oy0] = off(f);
      const ox = (x - camX - ox0) * d, oy = (y - camY - oy0) * d;
      const x0 = Math.max(0, Math.floor(-ox / d)), x1 = Math.min(w, Math.ceil((cv.width - ox) / d), img.width - sx0);
      const y0 = Math.max(0, Math.floor(-oy / d)), y1 = Math.min(h, Math.ceil((cv.height - oy) / d), img.height - sy0);
      if (x1 <= x0 || y1 <= y0) return;
      ctx.drawImage(img, sx0 + x0, sy0 + y0, x1 - x0, y1 - y0, ox + x0 * d, oy + y0 * d, (x1 - x0) * d, (y1 - y0) * d);
    };
    const whole = (img, x, y, f) => blit(img, 0, 0, img.width, img.height, x, y, f);
    const stepped = (v, n) => Math.round(v * n) / n;
    const px = (x, y, c, f = 1, n = 1) => { const [ox, oy] = off(f); ctx.fillStyle = c; ctx.fillRect((Math.round(x) - camX - ox) * d, (Math.round(y) - camY - oy) * d, d * n, d * n); };

    // ---------- Teilchen (Feinpixel, harte Farbstufen; Geschwindigkeiten in Szenenpixeln/s × Q; s = Kantenlänge in Feinpixeln)
    const FIRE = ['#fff2c0', '#ffb648', '#e8641a', '#a8300a'];
    const STAR = ['#ffffff', '#e0b8ff', '#a060f0', '#6a2cb0'];
    const DUST = ['#6a5040', '#4e3a30', '#3a2a24'];
    const ARROW = ['#e8d8b0', '#b8a888', '#8a7a62'];
    let parts = [], shots = [], fx = [], welle = null, shakeT = -1, flare = 0;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const add = (x, y, o = {}) => parts.push({ x, y, vx: Q * (o.vx ?? rnd(-6, 6)), vy: Q * (o.vy ?? -rnd(18, 40)), g: Q * (o.g ?? 0), wob: Q * (o.wob ?? 8), life: 0, max: o.max ?? rnd(0.4, 0.9), c: o.c ?? FIRE, f: o.f ?? 1, seed: Math.random() * 9, tail: o.tail ?? true, s: o.s ?? 1 });
    // Glut steigt aus der Ebene und dem Strom, Sternenstaub sinkt aus dem Riss
    const ember = () => add(camX + rnd(0, vw), S.EY + rnd(10, 200), { vx: rnd(-4, 4), vy: -rnd(8, 20), max: rnd(2, 4), c: ['#ffb648', '#e8641a', '#a8300a'], f: 0.35, tail: false, wob: 5, s: Math.random() < 0.3 ? 2 : 1 });
    const mote = (burst) => { const u = Math.random(); add(S.RB[0] + u * (S.RB[2] - S.RB[0]), S.RB[1] + (0.15 + u * 0.7) * (S.RB[3] - S.RB[1]), { vx: rnd(-4, 4), vy: burst ? rnd(6, 26) : rnd(3, 8), max: burst ? rnd(1.2, 2.4) : rnd(3, 6), c: STAR, f: 0.08, tail: false, wob: 4, s: burst && Math.random() < 0.3 ? 2 : 1 }); };
    for (let i = 0; i < 26; i++) { ember(); const q = parts[parts.length - 1]; q.life = Math.random() * q.max * 0.8; }
    for (let i = 0; i < 18; i++) { mote(false); const q = parts[parts.length - 1]; q.life = Math.random() * q.max * 0.8; q.y += rnd(0, 60); }
    // Kurzlebige Formen: Lichtschein (gestufte Scheiben, addiert), Ring, Hiebbogen, Lichtstern
    const glow = (x, y, r, c, max, f = 1) => fx.push({ kind: 'glow', x, y, r, c, t: 0, max, f });
    const ring = (x, y, r0, r1, c, max, f = 1) => fx.push({ kind: 'ring', x, y, r0, r1, c, t: 0, max, f });

    // ---------- Helden: Ruhe mit eigenem Takt, Momente reihum
    const ORDER = ['warrior', 'mage', 'ranger', 'rogue'];
    const hero = Object.fromEntries(ORDER.map((k, i) => [k, { mode: 'ruhe', t0: 0, phase: i * 0.37, hit: false }]));
    let next = 2.5, oi = 0;
    const heroFrame = (k, t) => {
      const h = HD[k], s = hero[k];
      if (s.mode === 'ruhe') return Math.floor((t + s.phase) * h.ruheFps) % h.ruhe;
      const i = Math.floor((t - s.t0) * h.fps);
      return i < h.n ? h.ruhe + i : -1;
    };
    const K = META.kante;
    const edge = (x) => K.y[Math.max(0, Math.min(K.y.length - 1, Math.floor((x - K.x0) / Q)))];
    const effect = (k) => {
      const h = HD[k], x = h.x, y = h.y;
      if (k === 'warrior') {
        // Erdspalter: Lichtstern und Schein am Einschlag, Erschütterung, Glutwelle läuft die Kante entlang und reißt
        // unterwegs Flammensäulen aus den Fugen
        const ix = x + 16, iy = edge(x + 16);
        welle = { x0: ix, t: 0, done: 0 }; shakeT = 0;
        fx.push({ kind: 'stern', x: ix, y: iy - 2, t: 0, max: 0.22 });
        glow(ix, iy - 4, 22, '#ff8a2a', 0.45);
        ring(ix, iy - 2, 4, 46, FIRE, 0.35);
        for (let i = 0; i < 34; i++) add(ix + rnd(-3, 3) * Q, iy, { vx: rnd(-50, 50), vy: -rnd(50, 130), g: 280, wob: 0, max: rnd(0.5, 1), s: i < 12 ? 2 : 1 });
        for (let i = 0; i < 22; i++) add(ix + rnd(-8, 8) * Q, iy, { vx: rnd(-36, 36), vy: -rnd(15, 50), g: 70, wob: 0, max: rnd(0.7, 1.3), c: DUST, s: 2 });
      } else if (k === 'mage') {
        // Feuerball fliegt in den Riss und zerplatzt dort in Sternenfeuer
        const sx0 = x + 10, sy0 = y - 70;
        glow(sx0, sy0, 9, '#ff8a2a', 0.3);
        shots.push({ kind: 'feuer', x: sx0, y: sy0, vx: (S.RX - sx0) / 0.9, vy: (S.RY - sy0) / 0.9 - 40, g: 88, t: 0, max: 0.9 });
      } else if (k === 'ranger') {
        // Pfeilhagel: brennende Pfeile steigen auf und schlagen weit draußen in der Ebene ein
        for (let i = 0; i < 7; i++) shots.push({ kind: 'pfeil', x: x + 8, y: y - 44, vx: Q * rnd(80, 150), vy: -Q * rnd(130, 170), g: Q * 210, t: -i * 0.06, max: 3, gy: S.EY + rnd(30, 110) });
        glow(x + 8, y - 44, 6, '#ffb648', 0.2);
      } else {
        // Ausfall: Hiebbogen vor der Klinge, Funken und Staub
        fx.push({ kind: 'bogen', x: x + 30, y: y - 30, t: 0, max: 0.2 });
        glow(x + 36, y - 30, 10, '#ffb648', 0.2);
        for (let i = 0; i < 18; i++) add(x + 40 + rnd(-4, 4), y - 30 + rnd(-8, 8), { vx: rnd(20, 70), vy: -rnd(10, 50), g: 140, wob: 0, max: rnd(0.25, 0.55), s: i < 5 ? 2 : 1 });
        for (let i = 0; i < 14; i++) add(x + rnd(-10, 24), y, { vx: rnd(-28, 10), vy: -rnd(5, 24), g: 60, wob: 0, max: rnd(0.5, 1), c: DUST, s: 2 });
      }
    };

    const update = (dt, t) => {
      mx += (tmx - mx) * Math.min(1, dt * 2.5); my += (tmy - my) * Math.min(1, dt * 2.5);
      const e = Math.min(1, t / 3);
      sx = Q * (e * 5 * Math.sin((t * Math.PI * 2) / 26) + mx * 4);
      sy = Q * (e * 1.5 * Math.sin((t * Math.PI * 2) / 19) + my * 1.5);
      if (shakeT >= 0) { shakeT += dt; const s = [[0, 2 * Q], [0, -Q], [Q, 0], [0, Q]][Math.floor(shakeT / 0.05)]; if (s) [kx, ky] = s; else { kx = ky = 0; shakeT = -1; } }
      // Momente reihum
      if (t >= next) { const k = ORDER[oi++ % ORDER.length]; Object.assign(hero[k], { mode: 'moment', t0: t, hit: false }); next = t + 5 + Math.random() * 2; }
      for (const k of ORDER) {
        const s = hero[k];
        if (s.mode !== 'moment') continue;
        const i = Math.floor((t - s.t0) * HD[k].fps);
        if (!s.hit && i >= Math.floor(HD[k].n * 0.55)) { s.hit = true; effect(k); }
        if (i >= HD[k].n) { s.mode = 'ruhe'; s.phase = -t + Math.random(); }
      }
      // Aufflackern des Risses
      if (t > 4 && Math.random() < dt / 13) { flare = 0.5; for (let i = 0; i < 30; i++) mote(true); }
      flare = Math.max(0, flare - dt);
      if (Math.random() < dt * 3) ember();
      if (Math.random() < dt * 2) mote(false);
      // Glutwelle: alle 14 Feinpixel eine Flammensäule, solange sie läuft
      if (welle) {
        welle.t += dt;
        const r = welle.t * 260 * Q;
        while (welle.done * 14 < r && welle.done < 12) {
          welle.done++;
          const k = 1 - welle.done / 13;
          for (const dir of [-1, 1]) {
            const x = welle.x0 + dir * welle.done * 14, y = edge(x);
            for (let i = 0; i < 4; i++) add(x + rnd(-2, 2), y, { vx: rnd(-6, 6), vy: -rnd(40, 90) * k, g: 120, wob: 0, max: rnd(0.3, 0.6), s: i ? 1 : 2 });
          }
        }
        if (welle.t > 0.9) welle = null;
      }
      // Geschosse
      for (const s of shots) {
        s.t += dt; if (s.t < 0) continue;
        if (s.g) s.vy += s.g * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.kind === 'feuer') {
          add(s.x - rnd(0, 3), s.y + rnd(-2, 2), { vx: rnd(-10, 10) - s.vx / Q * 0.1, vy: rnd(-12, 4), max: rnd(0.2, 0.45), wob: 0, s: Math.random() < 0.5 ? 2 : 1 });
          if (s.t >= s.max) {
            for (let i = 0; i < 40; i++) { const a = rnd(0, Math.PI * 2), v = rnd(20, 70); add(s.x, s.y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 30, max: rnd(0.4, 1), wob: 0, c: i % 2 ? STAR : FIRE, s: i < 14 ? 2 : 1 }); }
            glow(s.x, s.y, 20, '#c080ff', 0.5); ring(s.x, s.y, 3, 34, STAR, 0.4); flare = Math.max(flare, 0.4);
          }
        } else if (s.kind === 'pfeil') {
          if (Math.random() < 0.5) add(s.x, s.y, { vx: 0, vy: 0, max: rnd(0.12, 0.25), wob: 0, c: ['#ffb648', '#e8641a', '#a8300a'], tail: false });
          if (s.vy > 0 && s.y >= s.gy) {
            s.t = s.max;
            glow(s.x, s.y, 5, '#ff8a2a', 0.25, 0.35);
            for (let i = 0; i < 8; i++) add(s.x, s.y, { vx: rnd(-25, 25), vy: -rnd(15, 45), g: 160, max: rnd(0.3, 0.6), wob: 0, f: 0.35 });
          }
        }
      }
      shots = shots.filter((s) => s.t < s.max);
      for (const o of fx) o.t += dt;
      fx = fx.filter((o) => o.t < o.max);
      for (const q of parts) { q.life += dt; if (q.wob) q.vx += Math.sin(q.life * 6 + q.seed) * q.wob * dt; q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
      parts = parts.filter((q) => q.life < q.max);
      if (parts.length > 420) parts.splice(0, parts.length - 420);
    };

    // Lichtstern beim Einschlag, Hiebbogen des Ausfalls (Feinpixel relativ zur Mitte)
    const SPARK = [];
    for (const [ax, ay, n] of [[1, 0, 11], [-1, 0, 11], [0, -1, 9], [1, -1, 4], [-1, -1, 4], [0, 1, 3]]) for (let i = 0; i <= n; i++) SPARK.push([ax * i, ay * i, i < 2 ? '#ffffff' : i < 4 ? '#fff2c0' : i < 7 ? '#ffb648' : i < 9 ? '#e8641a' : '#a8300a']);
    const BOGEN = [];
    for (let a = -70; a <= 70; a += 4) for (let w = 0; w < 3; w++) {
      const r = 15 - w, rad = (a * Math.PI) / 180;
      BOGEN.push([Math.round(Math.cos(rad) * r * 0.8), Math.round(Math.sin(rad) * r), w === 0 ? '#ffffff' : w === 1 ? '#fff2c0' : '#ffb648', Math.abs(a) / 70]);
    }
    // Scheibe in ganzen Feinpixel-Zeilen
    const disc = (x, y, r, f) => {
      const [ox, oy] = off(f), cx = Math.round(x) - camX - ox, cy = Math.round(y) - camY - oy;
      for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy)); ctx.fillRect((cx - w) * d, (cy + dy) * d, (2 * w + 1) * d, d); }
    };
    const drawFx = (o) => {
      const k = o.t / o.max;
      if (o.kind === 'glow') {
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = o.c;
        const a = stepped(1 - k, 3);
        for (const [rr, al] of [[1, 0.12], [0.68, 0.16], [0.38, 0.22]]) { ctx.globalAlpha = al * a; disc(o.x, o.y, Math.max(1, Math.round(o.r * rr * (0.7 + 0.3 * k))), o.f); }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      } else if (o.kind === 'ring') {
        const r = o.r0 + (o.r1 - o.r0) * (1 - (1 - k) * (1 - k)), c = o.c[Math.min(o.c.length - 1, Math.floor(k * o.c.length))];
        const n = Math.max(8, Math.round(r * 2.4)), gap = k > 0.5 ? 2 : 1;
        for (let i = 0; i < n; i += gap) { const a = (i / n) * Math.PI * 2; px(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r * 0.55, c, o.f); }
      } else if (o.kind === 'stern') {
        const lim = k < 0.5 ? 1 : 0.5;
        for (const [dx, dy, c] of SPARK) if (Math.max(Math.abs(dx), Math.abs(dy)) <= 11 * lim) px(o.x + dx, o.y + dy, c);
      } else if (o.kind === 'bogen') {
        for (const [dx, dy, c, edgeK] of BOGEN) if (edgeK <= 1 - k * 0.9) px(o.x + dx, o.y + dy, k < 0.5 ? c : '#e8641a');
      }
    };
    const draw = (t) => {
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#040209'; ctx.fillRect(0, 0, cv.width, cv.height);
      whole(I['himmel'], 0, 0, 0.04);
      // Riss: Bildfolge, beim Aufflackern addiert
      const rf = Math.floor(t / 0.16) % S.NR, RB = S.RB, rw = RB[2] - RB[0], rh = RB[3] - RB[1];
      blit(I['riss'], 0, rf * rh, rw, rh, RB[0], RB[1], 0.06);
      if (flare > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = stepped(Math.min(1, flare * 2.4), 3) * 0.6; blit(I['riss'], 0, rf * rh, rw, rh, RB[0], RB[1], 0.06); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      whole(I['fern'], 0, S.FY0, 0.15);
      ctx.globalAlpha = stepped(0.65 + 0.35 * Math.abs(Math.cos(t * 4.3) * Math.cos(t * 1.7)), 3); whole(I['fern-glut'], 0, S.FY0, 0.15); ctx.globalAlpha = 1;
      const lf = Math.floor(t * 3) % S.NL, eh = META.dims['titel-ebene'][1] / S.NL;
      blit(I['ebene'], 0, lf * eh, S.W, eh, 0, S.EY, 0.35);
      // Sternenstaub, Glut und Einschläge hinter der Felsnase
      for (const o of fx) if (o.f < 0.5) drawFx(o);
      for (const q of parts) if (q.f < 0.5) drawPart(q);
      whole(I['fels'], 0, S.NT, 1);
      ctx.globalAlpha = stepped(0.75 + 0.25 * Math.cos((t * Math.PI * 2) / 3.4), 3); whole(I['fels-glut'], 0, S.NT, 1); ctx.globalAlpha = 1;
      // Glutwelle des Erdspalters läuft über die Felskante (drei Zeilen, nach außen kühler)
      if (welle) {
        const r = welle.t * 260 * Q;
        for (const dir of [-1, 1]) for (let i = 0; i < 26; i++) {
          const x = Math.round(welle.x0 + dir * (r - i)), y = edge(x);
          const c = i < 4 ? '#fff2c0' : i < 10 ? '#ffb648' : i < 18 ? '#e8641a' : '#a8300a';
          px(x, y, c); if (i < 14) px(x, y + 1, i < 6 ? '#ffb648' : '#a8300a'); if (i < 6) px(x, y - 1, '#e8641a');
        }
      }
      // Helden
      for (const k of ORDER) {
        const h = HD[k]; let i = heroFrame(k, t);
        if (i < 0) i = 0;
        blit(I['helden'], i * h.w, h.row, h.w, h.h, h.x - h.fx, h.y - h.fy, 1);
      }
      for (const o of fx) if (o.f >= 0.5) drawFx(o);
      // Geschosse: Feuerball (Raute mit hellem Kern), Pfeile (Schaft gegen die Flugrichtung, glühende Spitze)
      for (const s of shots) {
        if (s.t < 0) continue;
        if (s.kind === 'feuer') {
          ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ff8a2a'; ctx.globalAlpha = 0.16; disc(s.x, s.y, 10, 1); ctx.globalAlpha = 0.22; disc(s.x, s.y, 6, 1);
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const m = Math.abs(dx) + Math.abs(dy); if (m <= 3) px(s.x + dx, s.y + dy, m === 0 ? '#ffffff' : m === 1 ? '#fff2c0' : m === 2 ? '#ffb648' : '#e8641a'); }
        } else {
          const sp = Math.hypot(s.vx, s.vy), ux = s.vx / sp, uy = s.vy / sp;
          px(s.x, s.y, '#fff2c0'); px(s.x - ux, s.y - uy, '#ffb648');
          for (let k = 2; k < 8; k++) px(s.x - ux * k, s.y - uy * k, ARROW[Math.min(2, (k - 2) >> 1)]);
        }
      }
      for (const q of parts) if (q.f >= 0.5) drawPart(q);
    };
    const drawPart = (q) => {
      const k = q.life / q.max, ci = Math.min(q.c.length - 1, Math.floor(k * q.c.length));
      const s = q.s > 1 && k < 0.6 ? q.s : 1;
      if (q.tail && ci + 1 < q.c.length && Math.abs(q.vx) + Math.abs(q.vy) > 30) {
        const sp = Math.max(Math.abs(q.vx), Math.abs(q.vy));
        px(q.x - Math.round(q.vx / sp) * s, q.y - Math.round(q.vy / sp) * s, q.c[ci + 1], q.f, s);
      }
      px(q.x, q.y, q.c[ci], q.f, s);
    };

    // ---------- Schleife nur, solange das Bild sichtbar ist
    let on = false, vis = false, last = 0, T = 0;
    const tick = (now) => {
      if (dead || !vis || document.hidden) { on = false; return; }
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; T += dt;
      try { update(dt, T); draw(T); } catch { stop(); return; }
      requestAnimationFrame(tick);
    };
    const go = () => { if (!dead && vis && !document.hidden && !on) { on = true; last = 0; requestAnimationFrame(tick); } };
    draw(0);
    cv.classList.add('on');
    poster.style.visibility = 'hidden';
    new IntersectionObserver(([e]) => { vis = e.isIntersecting; go(); }).observe(box);
    document.addEventListener('visibilitychange', go);
  }
})();
