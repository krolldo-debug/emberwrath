// Emberwrath – Seite „Welt“, Abschnitt Karte (welt.html .atlas): das Kartenbild (img/atlas.webp, site/tools/atlas.mjs)
// in ganzzahliger Vergrößerung, darüber eine Leinwand im selben Bildpunktraster: der Glutpfad glüht beim Scrollen
// Etappe für Etappe auf, Funken laufen ihn entlang, erreichte Gebiete bekommen ihren hellen Glutrahmen, hinter dem
// Riss funkeln Sterne über der Sternenglut. Ein Gebiet antippen springt zu seiner Etappe (Links in welt.html).
// Ohne JavaScript: Bild und Beschriftungen stehen ruhig, alle Links gehen. Bei reduzierter Bewegung: alles leuchtet, nichts läuft.
(() => {
  const box = document.querySelector('[data-atlas]');
  if (!box) return;
  // <atlas.mjs> – von tools/atlas.mjs geschrieben, nicht von Hand ändern
  const META = {"W":1000,"H":2590,"RISS":1620,"zonen":[{"id":"emberhollow","i":0,"box":[70,50,300,210],"name":"Glutsenke","stufe":"1–5","ziel":"glutsenke","stern":false},{"id":"ashwood","i":1,"box":[540,40,384,264],"name":"Der Aschenwald","stufe":"6–11","ziel":"aschenwald","stern":false},{"id":"cinder_peaks","i":2,"box":[576,480,384,264],"name":"Die Schlackenhöhen","stufe":"12–17","ziel":"schlackenhoehen","stern":false},{"id":"ashen_steppe","i":3,"box":[40,420,480,312],"name":"Die Aschensteppe","stufe":"20–25","ziel":"aschensteppe","stern":false},{"id":"blighted_marsh","i":4,"box":[40,850,456,312],"name":"Die Faulmarsch","stufe":"25–31","ziel":"faulmarsch","stern":false},{"id":"frostspire","i":5,"box":[516,850,456,312],"name":"Die Frostzinnen","stufe":"31–36","ziel":"frostzinnen","stern":false},{"id":"ember_wastes","i":6,"box":[480,1250,480,312],"name":"Die Glutöde","stufe":"36–40","ziel":"gluetoede","stern":false},{"id":"ashen_throne","i":7,"box":[130,1260,204,195],"name":"Der Aschethron","stufe":"40","ziel":"aschethron","stern":false},{"id":"splitterweiten","i":8,"box":[40,1720,600,390],"name":"Die Splitterweiten","stufe":"45–50","ziel":null,"stern":true},{"id":"drifting_gardens","i":9,"box":[360,2170,600,390],"name":"Die Treibenden Gärten","stufe":"40–45","ziel":null,"stern":true}],"wege":[{"von":0,"nach":1,"p":[[376,155],[455,155],[455,172],[534,172]],"stern":false},{"von":1,"nach":2,"p":[[732,314],[732,394],[768,394],[768,474]],"stern":false},{"von":2,"nach":3,"p":[[570,612],[548,612],[548,576],[526,576]],"stern":false},{"von":3,"nach":4,"p":[[280,742],[280,793],[268,793],[268,844]],"stern":false},{"von":4,"nach":5,"p":[[502,1006],[510,1006]],"stern":false},{"von":5,"nach":6,"p":[[744,1172],[744,1208],[720,1208],[720,1244]],"stern":false},{"von":6,"nach":7,"p":[[474,1406],[407,1406],[407,1357],[340,1357]],"stern":false},{"von":7,"nach":8,"p":[[232,1465],[232,1589],[340,1589],[340,1714]],"stern":true},{"von":8,"nach":9,"p":[[646,1915],[660,1915],[660,2164]],"stern":true}],"v":"105dba6f29"};
  // </atlas.mjs>
  const img = box.querySelector('.atlas-bild');
  const labels = [...box.querySelectorAll('.ort')];
  const W = META.W, H = META.H;

  // ---------- Größe: ganze Gerätepixel je Bildpunkt, sonst (schmale Handys mit kleiner Dichte) weich verkleinert
  let scale = 1;
  const layout = () => {
    const dpr = devicePixelRatio || 1;
    const cs = getComputedStyle(box.parentElement);
    const avail = box.parentElement.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const k = Math.floor((avail * dpr) / W);
    const w = k >= 1 ? (W * k) / dpr : avail;
    box.style.width = `${w}px`;
    box.classList.toggle('weich', k < 1);
    scale = w / W;
  };
  layout();
  addEventListener('resize', layout);

  // ---------- Pfad: Bogenlänge je Eckpunkt, Ende jeder Verbindung = Gebiet erreicht
  const segs = [];   // { x0, y0, x1, y1, s0, len, stern }
  let total = 0;
  const reach = [0];   // Bogenlänge, ab der Gebiet i erreicht ist (Gebiet 0 sofort)
  for (const w of META.wege) {
    for (let i = 1; i < w.p.length; i++) {
      const [x0, y0] = w.p[i - 1], [x1, y1] = w.p[i], len = Math.abs(x1 - x0) + Math.abs(y1 - y0);
      segs.push({ x0, y0, x1, y1, s0: total, len, stern: w.stern });
      total += len;
    }
    reach[w.nach] = total;
  }
  const at = (s) => {
    for (const g of segs) if (s <= g.s0 + g.len) { const u = g.len ? (s - g.s0) / g.len : 0; return [Math.round(g.x0 + (g.x1 - g.x0) * u), Math.round(g.y0 + (g.y1 - g.y0) * u), g.stern]; }
    const g = segs[segs.length - 1]; return [g.x1, g.y1, g.stern];
  };
  // Größte Bogenlänge, deren Punkt nicht unter der Bildzeile y liegt (der Pfad läuft fast nur abwärts)
  const upto = (y) => {
    let best = 0;
    for (const g of segs) {
      if (g.y0 <= y && g.y1 <= y) best = g.s0 + g.len;
      else if (g.y0 <= y) best = Math.max(best, g.s0 + (g.len * (y - g.y0)) / (g.y1 - g.y0));
      else break;
    }
    return best;
  };

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv = document.createElement('canvas');
  cv.className = 'atlas-live'; cv.width = W; cv.height = H; cv.setAttribute('aria-hidden', 'true');
  img.after(cv);
  const ctx = cv.getContext('2d');
  const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };

  // ---------- Zustand
  let lit = reduced ? total : 0, hover = -1, T = 0;
  const since = META.zonen.map(() => -1);   // Zeitpunkt des Erreichens (kurzes Aufblitzen)
  const twinkles = [];
  const STERN = META.zonen.filter((z) => z.stern);

  const frame = (z, bright, flash) => {
    const [x, y, w, h] = z.box;
    const cols = z.stern ? (flash ? ['#6a4ab0', '#c0a0ff', '#ffffff'] : bright ? ['#4a2690', '#a070f0', '#e8d8ff'] : ['#2a1660', '#7a48d8', '#c0a0ff'])
      : (flash ? ['#c8420c', '#ffd27a', '#ffffff'] : bright ? ['#7a2208', '#ff8a2a', '#fff0b0'] : ['#3a0e05', '#c8420c', '#ffb640']);
    cols.forEach((c, k) => { const o = 4 - k; rect(x - o, y - o, w + 2 * o, 1, c); rect(x - o, y + h + o - 1, w + 2 * o, 1, c); rect(x - o, y - o, 1, h + 2 * o, c); rect(x + w + o - 1, y - o, 1, h + 2 * o, c); });
  };

  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    // Pfad bis zur Glutspitze: Striche wie im Bild (8 an, 6 aus), 3 Bildpunkte breit mit hellem Kern
    for (const g of segs) {
      if (g.s0 >= lit) break;
      const n = Math.min(g.len, Math.floor(lit - g.s0)), dx = Math.sign(g.x1 - g.x0), dy = Math.sign(g.y1 - g.y0);
      const [edge, core] = g.stern ? ['#4a2690', '#c0a0ff'] : ['#7a2208', '#ffb640'];
      for (let k = 0; k <= n; k++) {
        if ((g.s0 + k) % 14 >= 8) continue;
        const x = g.x0 + dx * k, y = g.y0 + dy * k;
        rect(x - 1, y - 1, 3, 3, edge); rect(x, y, 1, 1, lit - (g.s0 + k) < 24 ? '#fff0b0' : core);
      }
    }
    // Glutspitze und Funken, die den erreichten Weg entlanglaufen
    if (lit > 0 && lit < total) { const [x, y] = at(lit); rect(x - 2, y - 2, 5, 5, '#ff8a2a'); rect(x - 1, y - 1, 3, 3, '#fff0b0'); }
    if (!reduced) for (let s = (T * 60) % 150; s < lit; s += 150) {
      const [x, y, st] = at(s), [px, py] = at(Math.max(0, s - 3)), [qx, qy] = at(Math.max(0, s - 6));
      rect(qx, qy, 1, 1, st ? '#7a48d8' : '#c8420c'); rect(px, py, 1, 1, st ? '#b088f8' : '#ffb640'); rect(x - 1, y - 1, 2, 2, st ? '#ffffff' : '#fff0b0');
    }
    // Rahmen der erreichten Gebiete
    META.zonen.forEach((z, i) => {
      if (lit < reach[i] && !reduced) return;
      const flash = since[i] >= 0 && T - since[i] < 0.18;
      frame(z, i === hover && Math.floor(T * 4) % 2 === 0, flash);
    });
    // Sternenfunkeln über der Sternenglut (Kreuz aus 5 Bildpunkten, zwei Stufen)
    for (const s of twinkles) {
      const k = s.t / s.max, c = k < 0.3 || k > 0.7 ? '#8a70d0' : '#ffffff';
      rect(s.x, s.y, 1, 1, c);
      if (k > 0.25 && k < 0.75) { rect(s.x - 1, s.y, 1, 1, '#a080e8'); rect(s.x + 1, s.y, 1, 1, '#a080e8'); rect(s.x, s.y - 1, 1, 1, '#a080e8'); rect(s.x, s.y + 1, 1, 1, '#a080e8'); }
    }
  };

  // ---------- Hervorheben: Beschriftung und Rahmen gehören zusammen; ein Klick auf die Karte folgt dem Link des Gebiets
  const setHover = (i) => { if (i === hover) return; hover = i; labels.forEach((l) => l.classList.toggle('an', +l.dataset.i === i)); if (reduced) draw(); };
  labels.forEach((l) => {
    l.addEventListener('pointerenter', () => setHover(+l.dataset.i));
    l.addEventListener('pointerleave', () => setHover(-1));
    l.addEventListener('focus', () => setHover(+l.dataset.i));
    l.addEventListener('blur', () => setHover(-1));
  });
  const hit = (e) => {
    const r = cv.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    return META.zonen.findIndex(({ box: [bx, by, bw, bh] }) => x >= bx && x < bx + bw && y >= by && y < by + bh);
  };
  box.addEventListener('pointermove', (e) => { if (e.target === cv || e.target === img) { const i = hit(e); setHover(i); box.classList.toggle('zeigt', i >= 0 && !META.zonen[i].stern); } });
  box.addEventListener('pointerleave', () => { setHover(-1); box.classList.remove('zeigt'); });
  box.addEventListener('click', (e) => {
    if (e.target !== cv && e.target !== img) return;
    const i = hit(e), l = labels.find((n) => +n.dataset.i === i);
    if (l?.href) l.click();
  });

  if (reduced) { draw(); return; }

  // ---------- Schleife: nur, solange die Karte sichtbar ist
  let on = false, vis = false, last = 0;
  const tick = (now) => {
    if (!vis || document.hidden) { on = false; return; }
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; T += dt;
    const r = box.getBoundingClientRect();
    const target = Math.max(0, upto((innerHeight * 0.62 - r.top) / scale));
    lit += (target - lit) * Math.min(1, dt * 4);
    if (Math.abs(target - lit) < 0.5) lit = target;
    META.zonen.forEach((z, i) => { const got = lit >= reach[i]; if (got && since[i] < 0) since[i] = T; if (!got) since[i] = -1; });
    if (Math.random() < dt * 40) {
      const z = STERN[Math.floor(Math.random() * STERN.length)], [x, y, w, h] = z.box;
      twinkles.push({ x: x + 2 + Math.floor(Math.random() * (w - 4)), y: y + 2 + Math.floor(Math.random() * (h - 4)), t: 0, max: 0.4 + Math.random() * 0.6 });
    }
    for (const s of twinkles) s.t += dt;
    for (let i = twinkles.length - 1; i >= 0; i--) if (twinkles[i].t >= twinkles[i].max) twinkles.splice(i, 1);
    draw();
    requestAnimationFrame(tick);
  };
  const go = () => { if (vis && !document.hidden && !on) { on = true; last = 0; requestAnimationFrame(tick); } };
  new IntersectionObserver(([e]) => { vis = e.isIntersecting; go(); }).observe(box);
  document.addEventListener('visibilitychange', go);
  draw();
})();
