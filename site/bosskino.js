// Emberwrath – Bosskino der Startseite (Abschnitt #bosse; Bilder und Maße aus tools/bosskino.mjs).
// Eine breite Bühne zeigt die Bosse nacheinander, jeden riesig in seinem Gebiet: Ebenen mit Parallaxe in ganzen
// Szenenpixeln, Ruhe aus Teilen mit eigenen Zyklen, dann seine Signatur-Attacke: gestufte Warnmarke am Boden → Ausholen →
// Halten → Einschlag (Treffer-Einfrieren „stopp“, abklingendes Beben „beben“) → Effekt durch die Bodenfugen und den Raum → Ausklingen.
// Eine Pixelgröße für alles: d Gerätepixel je Szenenpixel (ganzzahlig). Wechsel als Ascheauflösung in Blöcken.
// Die Bildatlanten werden erst geladen, wenn der Abschnitt naht; die Schleife läuft nur, solange die Bühne sichtbar ist.
// Ohne JavaScript bleibt das Standbild (Malgareth); bei reduzierter Bewegung keine Wiedergabe, ein Klick zeigt das
// Standbild des gewählten Bosses.
(() => {
  const root = document.querySelector('[data-kino]');
  const stage = root?.querySelector('.kino-buehne');
  const poster = stage?.querySelector('img');
  if (!root || !stage || !poster) return;
  // <bosskino.mjs> – von tools/bosskino.mjs geschrieben, nicht von Hand ändern
  const META = {"szene":{"W":560,"H":216,"FY":190},"bosse":{"malgareth":{"name":"malgareth","glut":["#fff2c0","#ffb648","#c8420c"],"fokus":[300,318],"fig":{"x":201,"y":25,"w":272,"h":169},"ruhe":[{"r":"hinten","n":8,"ms":170},{"r":"koerper","seq":[0,0,0,1,1,2,2,2,1,1],"ms":210},{"r":"krone","n":6,"ms":100,"dy":[0,-1,-2],"von":"koerper"},{"r":"flamme","n":6,"ms":100}],"moment":{"f":[[0,130],[1,110],[2,110],[3,80],[4,80],[5,80],[6,80],[7,80],[8,80],[9,80],[10,60],[11,50],[12,60],[13,70],[14,90],[15,110],[16,140],[17,140],[18,140],[19,150],[20,200]],"hit":12},"stopp":80,"beben":[[0,3],[2,-2],[-1,1],[1,0]],"warn":{"x0":8,"x1":240,"y":187,"h":7,"dir":-1,"vor":760,"c":["#7a1a08","#c8420c","#ffb648"]},"ereignisse":[{"k":"bild","r":"welle","at":0,"x":0,"y":187,"w":253,"h":29,"n":27,"ms":60,"z":"boden"},{"k":"bild","r":"blitz","at":0,"x":226,"y":159,"w":41,"h":34,"n":5,"ms":60,"quer":true,"z":"vorn"},{"k":"wand","r":"wand","r2":"wand2","r3":"wand3","at":30,"x":242,"y":193,"dir":-1,"v":300,"weg":328,"w":74,"h":100,"w2":40,"h2":58,"w3":18,"h3":28,"n":6,"ms":70,"abst":8,"nach":680,"z":"vorn"},{"k":"funken","at":0,"x":246,"y":188,"n":34,"r":5,"vx":60,"vy":140,"g":300,"c":["#fff2c0","#ffb648","#e8641a","#a8300a"]},{"k":"funken","at":0,"x":246,"y":189,"n":20,"r":9,"vx":40,"vy":50,"g":80,"c":["#6a5040","#4e3a30","#3a2a24"]}],"schalen":[[70,131],[436,131]],"schale":{"w":16,"h":20,"n":6,"ms":90},"schaleNach":"mitte-glut","teilchen":"asche","dichte":2.2,"nach":"boden-glut","dauer":9.5,"start":2.4,"layers":[{"name":"fern","x":0,"y":0,"f":0.15,"r":[253,0,560,216]},{"name":"fern-glut","x":286,"y":0,"f":0.15,"glow":{"per":3.6,"lo":0.55,"steps":3},"r":[0,1121,169,161]},{"name":"mitte","x":0,"y":0,"f":0.45,"r":[813,0,560,216]},{"name":"mitte-glut","x":73,"y":149,"f":0.45,"glow":{"per":4.1,"lo":0.66,"steps":3},"r":[613,1121,377,66]},{"name":"boden","x":0,"y":186,"f":1,"r":[1435,1121,560,30]},{"name":"boden-glut","x":230,"y":187,"f":1,"glow":{"per":3.4,"lo":0.6,"steps":3},"r":[2103,1121,244,22]},{"name":"vorn","x":0,"y":0,"f":1.35,"r":[1373,0,560,216]}],"figur":{"fx":151,"fy":165,"r":{"hinten":[1933,0,2176,169],"koerper":[4109,0,816,169],"krone":[0,783,1632,169],"flamme":[1632,783,1632,169],"moment":[0,952,5712,169]}},"fxr":{"welle":[0,0,253,783],"wand":[169,1121,444,100],"wand2":[990,1121,240,58],"wand3":[1995,1121,108,28],"schale":[2347,1121,96,20],"blitz":[1230,1121,205,34]}},"faeulnis":{"glut":["#dcdca0","#a8b05a","#3e4a1e"],"fokus":[300,332],"teilchen":"sporen","dichte":3.4,"dauer":9.5,"start":2.2,"name":"faeulnis","fig":{"x":229,"y":23,"w":340,"h":168},"ruhe":[{"n":6,"ms":150,"r":"arm-h"},{"n":8,"ms":170,"r":"koerper"},{"n":6,"ms":150,"r":"arm-v"}],"moment":{"f":[[0,110],[1,100],[2,120],[3,120],[4,120],[5,120],[6,60],[7,60],[8,100],[9,110],[10,130],[11,110],[12,120],[13,140],[14,140],[15,140],[16,200],[17,160]],"hit":8},"nach":"boden-glut","ereignisse":[{"k":"bild","r":"welle","at":0,"x":0,"y":188,"w":257,"h":28,"n":36,"ms":60,"z":"boden"},{"k":"bild","r":"blitz","at":0,"x":238,"y":172,"w":25,"h":22,"n":4,"ms":60,"quer":true,"z":"vorn"},{"k":"funken","at":0,"x":250,"y":188,"n":22,"r":6,"vx":40,"vy":90,"g":200,"c":["#dcdca0","#a8b05a","#6e7a34","#3e4a1e"]},{"k":"funken","at":0,"x":250,"y":189,"n":16,"r":8,"vx":30,"vy":40,"g":80,"c":["#584c36","#3e3626","#28231a"]},{"k":"bild","r":"dorn","at":100,"x":204,"y":114,"w":40,"h":78,"n":9,"ms":80,"quer":true,"z":"vorn"},{"k":"funken","at":180,"x":224,"y":188,"n":8,"r":5,"vx":26,"vy":60,"g":220,"c":["#584c36","#3e3626","#464e2a"]},{"k":"bild","r":"dorn2","at":215,"x":179,"y":139,"w":30,"h":54,"n":9,"ms":80,"quer":true,"z":"vorn"},{"k":"funken","at":295,"x":194,"y":188,"n":8,"r":5,"vx":26,"vy":60,"g":220,"c":["#584c36","#3e3626","#464e2a"]},{"k":"bild","r":"wolke","at":355,"x":154,"y":128,"w":80,"h":64,"n":11,"ms":100,"quer":true,"z":"vorn"},{"k":"funken","at":275,"x":194,"y":184,"n":10,"r":6,"vx":18,"vy":30,"g":0,"c":["#dcdca0","#a8b05a","#6e7a34","#3e4a1e"]},{"k":"bild","r":"dorn","at":330,"x":144,"y":116,"w":40,"h":78,"n":9,"ms":80,"quer":true,"z":"vorn"},{"k":"funken","at":410,"x":164,"y":188,"n":8,"r":5,"vx":26,"vy":60,"g":220,"c":["#584c36","#3e3626","#464e2a"]},{"k":"bild","r":"dorn2","at":446,"x":119,"y":138,"w":30,"h":54,"n":9,"ms":80,"quer":true,"z":"vorn"},{"k":"funken","at":526,"x":134,"y":188,"n":8,"r":5,"vx":26,"vy":60,"g":220,"c":["#584c36","#3e3626","#464e2a"]},{"k":"bild","r":"wolke","at":586,"x":94,"y":128,"w":80,"h":64,"n":11,"ms":100,"quer":true,"z":"vorn"},{"k":"funken","at":506,"x":134,"y":184,"n":10,"r":6,"vx":18,"vy":30,"g":0,"c":["#dcdca0","#a8b05a","#6e7a34","#3e4a1e"]},{"k":"bild","r":"dorn","at":561,"x":84,"y":115,"w":40,"h":78,"n":9,"ms":80,"quer":true,"z":"vorn"},{"k":"funken","at":641,"x":104,"y":188,"n":8,"r":5,"vx":26,"vy":60,"g":220,"c":["#584c36","#3e3626","#464e2a"]},{"k":"bild","r":"dorn2","at":676,"x":59,"y":140,"w":30,"h":54,"n":9,"ms":80,"quer":true,"z":"vorn"},{"k":"funken","at":756,"x":74,"y":188,"n":8,"r":5,"vx":26,"vy":60,"g":220,"c":["#584c36","#3e3626","#464e2a"]},{"k":"bild","r":"wolke","at":816,"x":34,"y":128,"w":80,"h":64,"n":11,"ms":100,"quer":true,"z":"vorn"},{"k":"funken","at":736,"x":74,"y":184,"n":10,"r":6,"vx":18,"vy":30,"g":0,"c":["#dcdca0","#a8b05a","#6e7a34","#3e4a1e"]},{"k":"bild","r":"dorn","at":792,"x":24,"y":114,"w":40,"h":78,"n":9,"ms":80,"quer":true,"z":"vorn"},{"k":"funken","at":872,"x":44,"y":188,"n":8,"r":5,"vx":26,"vy":60,"g":220,"c":["#584c36","#3e3626","#464e2a"]}],"stopp":70,"beben":[[0,3],[2,-2],[-2,1],[1,-1],[-1,1],[1,0],[0,1]],"warn":{"x0":12,"x1":246,"y":187,"h":7,"dir":-1,"vor":650,"c":["#1e2410","#3e4a1e","#a8b05a"]},"layers":[{"name":"fern","x":0,"y":0,"f":0.15,"r":[257,0,560,216]},{"name":"fern-glut","x":0,"y":1,"f":0.15,"glow":{"per":3.4,"lo":0.45,"steps":3},"r":[0,1344,559,131]},{"name":"mitte","x":0,"y":97,"f":0.45,"r":[559,1344,560,119]},{"name":"mitte-glut","x":6,"y":134,"f":0.45,"glow":{"per":2.9,"lo":0.4,"steps":3},"r":[3950,1344,502,27]},{"name":"boden","x":0,"y":186,"f":1,"r":[3390,1344,560,30]},{"name":"boden-glut","x":46,"y":194,"f":1,"glow":{"per":2.6,"lo":0.4,"steps":3},"r":[4452,1344,435,17]},{"name":"vorn","x":0,"y":174,"f":1.35,"r":[2629,1344,556,42]}],"figur":{"r":{"arm-h":[817,0,2040,168],"koerper":[2857,0,2720,168],"arm-v":[0,1008,2040,168],"moment":[0,1176,6120,168]}},"fxr":{"blitz":[3185,1344,205,34],"dorn":[1119,1344,360,78],"dorn2":[2359,1344,270,54],"wolke":[1479,1344,880,64],"welle":[0,0,257,1008]}},"skalvyr":{"glut":["#ffffff","#9aeefc","#34b8e4"],"fokus":[292,298],"teilchen":"schnee","dichte":5,"dauer":9.5,"start":2.2,"beben":[[0,4],[3,-3],[-3,2],[2,-2],[-2,1],[1,-1],[0,1],[1,0]],"stopp":80,"name":"skalvyr","fig":{"x":167,"y":20,"w":390,"h":171},"ruhe":[{"n":12,"ms":150,"r":"koerper"}],"moment":{"f":[[0,150],[1,170],[2,100],[3,110],[4,110],[5,110],[6,110],[7,110],[8,150],[9,170],[10,190],[11,170]],"hit":8},"nach":"boden-glut","ereignisse":[{"k":"bild","r":"schatten","at":-770,"x":62,"y":176,"w":260,"h":26,"n":20,"ms":40,"quer":true,"z":"boden"},{"k":"bild","r":"reste","at":270,"x":62,"y":176,"w":260,"h":26,"n":11,"ms":150,"quer":true,"z":"boden"},{"k":"bild","r":"welle","at":0,"x":0,"y":187,"w":523,"h":29,"n":41,"ms":60,"z":"boden"},{"k":"zapfen","r":"zapfen-s","r2":"steckt-s","at":-20,"x":174,"y":187,"vor":640,"w":18,"h":62,"n":5,"ms":16,"sw":54,"sh":68,"mr":1,"z":"vorn"},{"k":"zapfen","r":"zapfen-m","r2":"steckt-m","at":-70,"x":226,"y":188,"vor":640,"w":24,"h":82,"n":5,"ms":26,"sw":60,"sh":88,"mr":1,"z":"vorn"},{"k":"zapfen","r":"zapfen-m","r2":"steckt-m","at":-110,"x":160,"y":190,"vor":640,"w":24,"h":82,"n":5,"ms":34,"sw":60,"sh":88,"mr":1,"z":"vorn"},{"k":"zapfen","r":"zapfen-s","r2":"steckt-s","at":-130,"x":252,"y":194,"vor":640,"w":18,"h":62,"n":5,"ms":38,"sw":54,"sh":68,"mr":1,"z":"vorn"},{"k":"zapfen","r":"zapfen-l","r2":"steckt-l","at":0,"x":190,"y":195,"vor":640,"w":30,"h":104,"n":5,"ms":12,"sw":66,"sh":110,"mr":1,"z":"vorn"},{"k":"zapfen","r":"zapfen-s","r2":"steckt-s","at":-40,"x":138,"y":196,"vor":640,"w":18,"h":62,"n":5,"ms":20,"sw":54,"sh":68,"mr":1,"z":"vorn"},{"k":"zapfen","r":"zapfen-s","r2":"steckt-s","at":-90,"x":208,"y":197,"vor":640,"w":18,"h":62,"n":5,"ms":30,"sw":54,"sh":68,"mr":1,"z":"vorn"},{"k":"bild","r":"kranz","at":0,"x":62,"y":52,"w":260,"h":150,"n":12,"ms":60,"quer":true,"z":"vorn"},{"k":"funken","at":-520,"x":200,"y":10,"n":10,"r":16,"vx":6,"vy":-30,"g":140,"c":["#ffffff","#9aeefc","#34b8e4","#1670a0"]},{"k":"funken","at":-460,"x":150,"y":10,"n":10,"r":16,"vx":6,"vy":-30,"g":140,"c":["#ffffff","#9aeefc","#34b8e4","#1670a0"]},{"k":"funken","at":-400,"x":250,"y":10,"n":10,"r":16,"vx":6,"vy":-30,"g":140,"c":["#ffffff","#9aeefc","#34b8e4","#1670a0"]},{"k":"funken","at":-340,"x":120,"y":10,"n":10,"r":16,"vx":6,"vy":-30,"g":140,"c":["#ffffff","#9aeefc","#34b8e4","#1670a0"]},{"k":"funken","at":-280,"x":228,"y":10,"n":10,"r":16,"vx":6,"vy":-30,"g":140,"c":["#ffffff","#9aeefc","#34b8e4","#1670a0"]},{"k":"funken","at":-220,"x":176,"y":10,"n":10,"r":16,"vx":6,"vy":-30,"g":140,"c":["#ffffff","#9aeefc","#34b8e4","#1670a0"]}],"warn":null,"layers":[{"name":"fern","x":0,"y":0,"f":0.15,"r":[523,0,560,216]},{"name":"fern-glut","x":264,"y":7,"f":0.15,"glow":{"per":3.8,"lo":0.55,"steps":3},"r":[2203,0,110,171]},{"name":"mitte","x":0,"y":0,"f":0.45,"r":[1083,0,560,216]},{"name":"mitte-glut","x":6,"y":0,"f":0.45,"glow":{"per":3.1,"lo":0.5,"steps":3},"r":[2313,0,525,171]},{"name":"boden","x":0,"y":186,"f":1,"r":[4092,1531,560,30]},{"name":"boden-glut","x":341,"y":192,"f":1,"glow":{"per":3.3,"lo":0.4,"steps":3},"r":[2860,1707,102,10]},{"name":"vorn","x":0,"y":0,"f":1.35,"r":[1643,0,560,216]}],"figur":{"r":{"koerper":[0,1189,4680,171],"moment":[0,1360,4680,171]}},"fxr":{"zapfen-l":[3450,1531,30,104],"steckt-l":[3120,1531,330,110],"zapfen-m":[3780,1531,24,82],"steckt-m":[3480,1531,300,88],"zapfen-s":[4074,1531,18,62],"steckt-s":[3804,1531,270,68],"kranz":[0,1531,3120,150],"schatten":[0,1681,5200,26],"reste":[0,1707,2860,26],"welle":[0,0,523,1189]}}}};
  // </bosskino.mjs>
  if (!META) return;
  const S = META.szene;
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const texts = [...root.querySelectorAll('[data-text]')];
  const ORDER = tabs.map((t) => t.dataset.boss).filter((n) => META.bosse[n]);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrow = matchMedia('(max-width: 820px)');
  const IMG = new URL('img/', document.querySelector('link[rel="icon"]')?.href ?? location.href).href;
  let cur = Math.max(0, ORDER.indexOf('malgareth'));

  // ---------- Auswahl (Reiter): Klick, Pfeiltasten, Pos1/Ende
  const mark = (i) => {
    tabs.forEach((t) => {
      const on = t.dataset.boss === ORDER[i];
      t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
      t.classList.toggle('on', on);
      if (on) stage.setAttribute('aria-labelledby', t.id);
    });
    texts.forEach((p) => { p.hidden = p.dataset.text !== ORDER[i]; });
  };
  mark(cur);
  tabs.forEach((t) => {
    t.addEventListener('click', () => pick(ORDER.indexOf(t.dataset.boss), true));
    t.addEventListener('keydown', (e) => {
      const i = ORDER.indexOf(t.dataset.boss);
      const j = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: ORDER.length - 1 }[e.key];
      if (j === undefined) return;
      e.preventDefault();
      const k = (j + ORDER.length) % ORDER.length;
      tabs.find((q) => q.dataset.boss === ORDER[k])?.focus();
      pick(k, true);
    });
  });

  // ---------- Ausschnitt: d Gerätepixel je Szenenpixel (ganzzahlig). Desktop: die Szene deckt die Breite (mit Rand für die
  // Parallaxe), volle Höhe, nur wenn der Bildschirm zu niedrig ist, fällt oben Himmel weg. Handy: ≥ 380 Szenenpixel breit,
  // damit Boss und Attacke ganz im Bild sind; Ausschnitt je Boss (fokus[1]). Die Bühnenhöhe folgt aus d.
  let dpr = 1, cw = 0, ch = 0, d = 1, vw = 0, vh = 0, camX = 0, camY = 0;
  const layout = (m) => {
    dpr = devicePixelRatio || 1;
    cw = stage.clientWidth;
    const W = Math.round(cw * dpr);
    d = narrow.matches ? Math.max(1, Math.floor(W / 380)) : Math.max(1, Math.ceil(W / (S.W - 16)));
    vw = W / d;
    vh = Math.min(S.H, Math.floor((innerHeight * (narrow.matches ? 0.8 : 0.86) * dpr) / d));
    ch = (vh * d) / dpr;
    stage.style.height = `${ch}px`;
    const fx = m.fokus[narrow.matches ? 1 : 0];
    camX = Math.max(6, Math.min(S.W - 6 - Math.ceil(vw), Math.round(fx - vw / 2)));
    camY = S.H - vh;
  };
  const placePoster = () => {
    layout(META.bosse[ORDER[cur]]);
    Object.assign(poster.style, { width: `${(S.W * d) / dpr}px`, height: `${(S.H * d) / dpr}px`, left: `${(-camX * d) / dpr}px`, top: `${(-camY * d) / dpr}px` });
  };
  placePoster();
  let live = null;   // gesetzt, sobald das Canvas zeichnet
  addEventListener('resize', () => (live ? live.size() : placePoster()));

  // ---------- Bilder: ein Atlas je Boss, erst bei Bedarf
  const atlases = {};
  const load = (n) => (atlases[n] ??= new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = `${IMG}bosskino-${n}.webp`; }));
  const conn = navigator.connection;
  const lean = conn && (conn.saveData || /(^|-)2g/.test(conn.effectiveType ?? ''));
  let wanted = false;
  const want = () => {
    if (wanted || lean) return; wanted = true;
    load(ORDER[cur]).then(() => start(), () => {});
  };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { want(); o.disconnect(); } }, { rootMargin: '900px 0px' }).observe(stage);
  }

  let pick = (i, user) => {
    // vor dem Start (oder ohne Atlas): nur Auswahl merken; das Standbild bleibt Malgareth, bis das Canvas zeichnet
    cur = i; mark(i);
    if (!lean) { wanted = false; want(); }
  };

  function start() {
    if (live) return;
    const cv = document.createElement('canvas');
    cv.className = 'kino-live'; cv.setAttribute('aria-hidden', 'true');
    stage.append(cv);
    const ctx = cv.getContext('2d');
    const rnd = (a, b) => a + Math.random() * (b - a);
    const stepped = (v, n) => Math.round(v * n) / n;
    let B = null, img = null, T = 0, t = 0, parts = [], kx = 0, ky = 0, shakeT = -1, freeze = 0, mx = 0, my = 0, tmx = 0, tmy = 0, sx = 0, sy = 0;
    let fired = new Set(), lastHit = false, trans = null, nextIdx = -1, busy = false;
    const size = () => { layout(B?.m ?? META.bosse[ORDER[cur]]); cv.width = Math.round(cw * dpr); cv.height = vh * d; ctx.imageSmoothingEnabled = false; if (reduced || !on) draw(); };
    live = { size };
    addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; tmx = (e.clientX / innerWidth) * 2 - 1; tmy = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });

    // ---------- Zeichnen in Szenenpixeln
    const off = (f) => [Math.round(sx * f) + kx, Math.round(sy * f) + ky];
    const blit = (r, ox0, oy0, w, h, x, y, f) => {   // Ausschnitt (ox0, oy0, w, h) aus Atlasrechteck r an Szenenstelle x, y, Tiefe f
      const [px, py] = off(f);
      const X = (x - camX - px) * d, Y = (y - camY - py) * d;
      const x0 = Math.max(0, Math.floor(-X / d)), x1 = Math.min(w, Math.ceil((cv.width - X) / d));
      const y0 = Math.max(0, Math.floor(-Y / d)), y1 = Math.min(h, Math.ceil((cv.height - Y) / d));
      if (x1 <= x0 || y1 <= y0) return;
      ctx.drawImage(img, r[0] + ox0 + x0, r[1] + oy0 + y0, x1 - x0, y1 - y0, X + x0 * d, Y + y0 * d, (x1 - x0) * d, (y1 - y0) * d);
    };
    const dot = (x, y, c, f = 1) => { const [px, py] = off(f); ctx.fillStyle = c; ctx.fillRect((Math.round(x) - camX - px) * d, (Math.round(y) - camY - py) * d, d, d); };
    const run = (x, y, w, c, f = 1) => { const [px, py] = off(f); ctx.fillStyle = c; ctx.fillRect((Math.round(x) - camX - px) * d, (Math.round(y) - camY - py) * d, w * d, d); };

    const frameAt = (list, ms) => { let acc = 0; for (let i = 0; i < list.length; i++) { acc += list[i][1]; if (ms < acc) return i; } return -1; };
    const momentLen = (m) => m.moment.f.reduce((s, q) => s + q[1], 0);
    const hitMs = (m) => m.moment.f.slice(0, m.moment.hit).reduce((s, q) => s + q[1], 0);

    // ---------- Teilchen je Gebiet (ein Szenenpixel, Farbe nach Alter in Stufen)
    const KIND = {
      asche: () => { const near = Math.random() < 0.35; return { x: camX + rnd(-20, vw + 20), y: camY - 2, vx: rnd(2, 6), vy: near ? rnd(7, 11) : rnd(4, 6), g: 0, wob: 3, max: rnd(8, 16), f: near ? 1.2 : 0.4, c: near ? ['#ffb648', '#e8641a'] : ['#7a2a14', '#4a1a10'], rain: true }; },
      geist: () => ({ x: camX + rnd(0, vw), y: S.FY + rnd(-4, 14), vx: rnd(-2, 2), vy: -rnd(5, 12), g: 0, wob: 8, max: rnd(3, 6), f: Math.random() < 0.4 ? 1.2 : 0.6, c: ['#e8fff8', '#7ef0d6', '#22b0a4', '#127272'] }),
      sporen: () => ({ x: camX + rnd(0, vw), y: camY + rnd(vh * 0.2, vh), vx: rnd(-3, 3), vy: -rnd(2, 6), g: 0, wob: 6, max: rnd(4, 8), f: Math.random() < 0.4 ? 1.2 : 0.5, c: Math.random() < 0.6 ? ['#a8b05a', '#6e7a34', '#3e4a1e'] : ['#8a6e9a', '#5e4670', '#3e2a4a'] }),
      schnee: () => { const near = Math.random() < 0.3; return { x: camX + rnd(-20, vw + 30), y: camY - 2, vx: -rnd(3, 8), vy: near ? rnd(14, 20) : rnd(6, 10), g: 0, wob: 4, max: rnd(8, 16), f: near ? 1.3 : 0.5, c: near ? ['#ffffff', '#d8ecff'] : ['#a8d0ff', '#6a8ea6'], rain: true }; },
    };
    const spawn = (q) => parts.push(Object.assign({ life: 0, seed: Math.random() * 9 }, q));
    const burst = (e) => {
      for (let i = 0; i < e.n; i++) spawn({ x: e.x + rnd(-e.r, e.r), y: e.y + rnd(-2, 1), vx: rnd(-e.vx, e.vx) + (e.dx ?? 0), vy: -rnd(e.vy * 0.4, e.vy), g: e.g ?? 220, wob: 0, max: rnd(0.4, 1.0), f: 1, c: e.c });
    };
    const ambient = (n) => {
      parts = [];
      const k = KIND[B.m.teilchen];
      if (!k) return;
      for (let i = 0; i < n; i++) { const q = k(); q.life = 0; q.y = q.rain ? camY + Math.random() * vh : q.y; q.max *= 0.4 + Math.random() * 0.6; spawn(q); }
    };

    // ---------- Boss zeigen
    const show = (i) => {
      cur = i; mark(i);
      B = { m: META.bosse[ORDER[i]] };
      T = 0; fired = new Set(); lastHit = false; shakeT = -1; freeze = 0; kx = ky = 0;
      layout(B.m);
      ambient(18);
    };
    // nächsten Atlas schon laden
    const prefetch = () => load(ORDER[(cur + 1) % ORDER.length]).catch(() => {});

    let on = false, vis = false, last = 0;
    const go = (i, user) => {
      if (busy) { nextIdx = i; return; }
      if (B && ORDER[i] === ORDER[cur] && !user) return;
      busy = true;
      load(ORDER[i]).then((im) => {
        busy = false;
        if (B && !reduced) {
          const prev = document.createElement('canvas'); prev.width = cv.width; prev.height = cv.height;
          prev.getContext('2d').drawImage(cv, 0, 0);
          trans = { prev, t: 0, c: B.m.glut ?? ['#ffd890', '#f07a1c', '#a8300a'], seed: Math.random() * 99, sparks: 0 };
        }
        img = im; show(i); B.img = im;
        if (reduced) draw(); else prefetch();
        if (nextIdx >= 0) { const n = nextIdx; nextIdx = -1; go(n, true); }
      }, () => { busy = false; });
    };
    pick = (i, user) => go(i, user);

    const BEBEN = [[0, 1], [1, -1], [-1, 0], [0, 1]];
    const update = (dt) => {
      const m = B.m;
      // Treffer-Einfrieren: Welt, Teilchen und Effekte halten auf dem Einschlagbild an, dann setzt das Beben ein
      if (freeze > 0) { freeze -= dt; if (freeze <= 0) shakeT = 0; return; }
      T += dt; t += dt;
      mx += (tmx - mx) * Math.min(1, dt * 2.5); my += (tmy - my) * Math.min(1, dt * 2.5);
      sx = 3 * Math.sin((t * Math.PI * 2) / 23) + mx * 3;
      sy = camY >= 3 ? 1 * Math.sin((t * Math.PI * 2) / 17) + my * 1 : 0;
      if (shakeT >= 0) { shakeT += dt; const s = (m.beben ?? BEBEN)[Math.floor(shakeT / 0.05)]; if (s) [kx, ky] = s; else { kx = ky = 0; shakeT = -1; } }
      // Attacke: Ereignisse relativ zum Einschlag
      const mt = (T - m.start) * 1000, hm = hitMs(m);
      if (mt >= hm && !lastHit) { lastHit = true; if (m.stopp) freeze = m.stopp / 1000; else shakeT = 0; }
      for (const [k, e] of m.ereignisse.entries()) {
        if (fired.has(k) || mt < hm + e.at) continue;
        fired.add(k);
        if (e.k === 'funken') burst(e);
        if (e.k === 'zapfen') { shakeT = 0; burst({ x: e.x, y: e.y - 1, n: 24, r: 4, vx: 60, vy: 110, g: 300, c: m.glut }); }
      }
      // Umgebung
      const kind = KIND[m.teilchen];
      if (kind && Math.random() < dt * (m.dichte ?? 2.2)) spawn(kind());
      for (const [x, y] of m.schalen ?? []) if (Math.random() < dt * 3) spawn({ x: x + m.schale.w / 2 + rnd(-2, 2), y: y + 4, vx: rnd(-4, 4), vy: -rnd(16, 34), g: 0, wob: 10, max: rnd(0.5, 1.1), f: 0.45, c: m.glut });
      for (const q of parts) {
        q.life += dt;
        if (q.wob) q.vx += Math.sin(q.life * 6 + q.seed) * q.wob * dt;
        q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      }
      parts = parts.filter((q) => q.life < q.max && (!q.rain || q.y < S.H) && (q.g === 0 || q.y < S.FY + 4));
      if (parts.length > 320) parts.splice(0, parts.length - 320);
      if (trans && (trans.t += dt) > 0.8) trans = null;
      // Fortschritt und automatischer Wechsel
      const p = Math.min(1, T / m.dauer);
      const bar = tabs.find((q) => q.dataset.boss === ORDER[cur])?.querySelector('.kino-lauf');
      if (bar) bar.style.transform = `scaleX(${stepped(p, 60)})`;
      if (T >= m.dauer && !busy) go((cur + 1) % ORDER.length);
    };

    const pulse = (g, tt) => (g ? stepped(g.lo + (1 - g.lo) * (0.5 + 0.5 * Math.cos((tt * Math.PI * 2) / g.per)), g.steps) : 1);
    const drawFigure = (m, mt) => {
      const F = m.figur, R = F.r, x = m.fig.x, y = m.fig.y, w = m.fig.w, h = m.fig.h;
      const mf = mt >= 0 ? frameAt(m.moment.f, mt) : -1;
      if (mf >= 0) { blit(R.moment, m.moment.f[mf][0] * w, 0, w, h, x, y, 1); return; }
      // Ruhe: Teile mit eigenen Zyklen (n Bilder zu ms, oder feste Folge seq); dy: Versatz je Bild eines anderen Teils
      const ms = T * 1000, cur_ = {};
      for (const p of m.ruhe) {
        const k = p.seq ? p.seq[Math.floor(ms / p.ms) % p.seq.length] : Math.floor(ms / p.ms) % p.n;
        cur_[p.r] = k;
        blit(R[p.r], k * w, 0, w, h, x, y + (p.dy ? p.dy[cur_[p.von]] ?? 0 : 0), 1);
      }
    };
    const drawWarn = (m, mt) => {
      const W_ = m.warn, hm = hitMs(m);
      if (!W_ || mt < -W_.vor || mt >= hm) return;
      const p = Math.min(1, (mt + W_.vor) / ((hm + W_.vor) * 0.7));
      const blink = p >= 1 && Math.floor(mt / 90) % 2 === 0;
      const len = W_.x1 - W_.x0, fill = Math.floor((p * len) / 8) * 8;
      const dir = W_.dir ?? -1;
      const a = dir < 0 ? W_.x1 - fill : W_.x0, b = dir < 0 ? W_.x1 : W_.x0 + fill;
      const C = W_.c;
      for (let yy = 0; yy < W_.h; yy++) {
        const y = W_.y + yy;
        if (yy === 0 || yy === W_.h - 1) { run(a, y, b - a, blink ? C[2] : C[1]); continue; }
        // gefüllt: Schrägstreifen in zwei Stufen, die im Takt wandern
        const sh = Math.floor(mt / 80);
        for (let x = a; x < b; x++) dot(x, y, (x + yy + sh) % 6 < 3 ? C[1] : C[0]);
      }
      // Front der Füllung hell
      const fx = dir < 0 ? a : b - 1;
      for (let yy = 0; yy < W_.h; yy++) dot(fx, W_.y + yy, C[2]);
    };
    // Eiszapfen: Schattenmarke wächst in Stufen (vor ms vor dem Aufschlag), der Zapfen fällt beschleunigt, beim Aufschlag Splitter
    const drawZapfen = (m, e, et, z) => {
      if (et < 0 || et >= e.vor + e.n * e.ms) return;
      if (z === 'boden') {
        if (et >= e.vor) return;
        const p = et / e.vor, r = Math.max(1, Math.round(e.mr * Math.min(1, p * 1.25) * 2) / 2), ry = Math.max(1, Math.round(r / 3));
        const blink = p > 0.75 && Math.floor(et / 70) % 2 === 0;
        for (let yy = -ry; yy <= ry; yy++) for (let xx = -Math.ceil(r); xx <= Math.ceil(r); xx++) {
          const q = (xx * xx) / (r * r) + (yy * yy) / (ry * ry);
          if (q > 1) continue;
          if (q > 0.55) { if (q > 0.75 || ((xx + yy) & 1) === 0) dot(e.x + xx, e.y + yy - 1, blink ? m.glut[0] : m.glut[1]); }
          else if (q > 0.2 || ((xx + yy) & 1) === 0) dot(e.x + xx, e.y + yy - 1, '#04070e');
        }
        return;
      }
      const r = m.fxr[e.r];
      if (et < e.vor) {
        const f0 = e.vor * 0.45;
        if (et < f0) return;
        const p = (et - f0) / (e.vor - f0), top = camY - e.h - 4;
        const y = Math.round(top + (e.y - e.h - top) * p * p);
        blit(r, 0, 0, e.w, e.h, e.x - (e.w >> 1), y, 1);
        // Reifspur hinter dem Zapfen
        for (let k = 1; k < 4; k++) if (p > 0.2) dot(e.x + ((k & 1) ? -1 : 1), y - k * 3, k < 2 ? m.glut[0] : m.glut[2]);
      } else {
        const k = Math.floor((et - e.vor) / e.ms);
        blit(m.fxr[e.r2], k * e.sw, 0, e.sw, e.sh, e.x - (e.sw >> 1), e.y - e.sh + 2, 1);
      }
    };
    const drawEvents = (m, mt, z) => {
      const hm = hitMs(m);
      for (const e of m.ereignisse) {
        if (e.k === 'zapfen') { drawZapfen(m, e, mt - hm - e.at + e.vor, z); continue; }
        if (e.z !== z) continue;
        const et = mt - hm - e.at;
        if (et < 0) continue;
        const r = m.fxr[e.r];
        if (e.k === 'bild') {   // Bildfolge an fester Stelle (ganze Bilder untereinander oder nebeneinander)
          let k = Math.floor(et / e.ms);
          if (k >= e.n) continue;
          if (e.loop) k %= e.loop;
          if (e.quer) blit(r, k * e.w, 0, e.w, e.h, e.x, e.y, 1); else blit(r, 0, k * e.h, e.w, e.h, e.x, e.y, 1);
        } else if (e.k === 'wand') {   // Flammenwand läuft in ganzen Pixeln über den Boden, dahinter brennt eine Spur nieder
          const dist = Math.floor((et / 1000) * e.v), R2 = m.fxr[e.r2], R3 = m.fxr[e.r3];
          // Spur: alle e.abst Pixel eine Flamme, groß -> mittel -> klein, versetzt im Takt
          for (let q = e.abst, i = 1; q < Math.min(dist, e.weg); q += e.abst, i++) {
            const age = et - (q / e.v) * 1000;
            if (age >= e.nach) continue;
            const k = (Math.floor(age / e.ms) + i * 2) % e.n, x = e.x + e.dir * q;
            if (age < e.nach * 0.45) blit(R2, k * e.w2, 0, e.w2, e.h2, x - (e.w2 >> 1), e.y - e.h2, 1);
            else blit(R3, k * e.w3, 0, e.w3, e.h3, x - (e.w3 >> 1), e.y - e.h3, 1);
          }
          if (dist > e.weg) continue;
          const k = Math.floor(et / e.ms) % e.n, x = e.x + e.dir * dist - (e.w >> 1);
          blit(r, ((k + 3) % e.n) * e.w, 0, e.w, e.h, x - e.dir * 12, e.y - e.h + 6, 1);   // zweite Säule dahinter, etwas kleiner
          blit(r, k * e.w, 0, e.w, e.h, x, e.y - e.h, 1);
          if (Math.random() < 0.7) spawn({ x: x + e.w / 2 + rnd(-8, 8), y: e.y - rnd(6, e.h * 0.8), vx: rnd(-10, 10), vy: -rnd(24, 60), g: 0, wob: 10, max: rnd(0.3, 0.8), f: 1, c: m.glut });
          if (Math.random() < 0.4) spawn({ x: x + e.w / 2 + rnd(-6, 6), y: e.y - 1, vx: rnd(-20, 20) + e.dir * 10, vy: -rnd(10, 30), g: 80, wob: 0, max: rnd(0.4, 0.8), f: 1, c: ['#6a5040', '#4e3a30', '#3a2a24'] });
        }
      }
    };
    const draw = () => {
      if (!B || !img) return;
      const m = B.m;
      const mt = reduced ? -1e9 : (T - m.start) * 1000;
      const inMoment = mt >= 0 && mt < momentLen(m);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#05020a'; ctx.fillRect(0, 0, cv.width, cv.height);
      for (const L of m.layers) {
        ctx.globalAlpha = reduced ? 1 : pulse(L.glow, t);
        blit(L.r, 0, 0, L.r[2], L.r[3], L.x, L.y, L.f);
        ctx.globalAlpha = 1;
        if (L.name === m.schaleNach) {
          const sc = m.schale, k = reduced ? 0 : Math.floor((t * 1000) / sc.ms) % sc.n;
          for (const [x, y] of m.schalen) blit(m.fxr.schale, k * sc.w, 0, sc.w, sc.h, x, y, L.f);
        }
        if (L.name === m.nach) {
          drawEvents(m, mt, 'boden');
          drawWarn(m, mt);
          drawFigure(m, inMoment ? mt : -1);
          drawEvents(m, mt, 'vorn');
          for (const q of parts) {
            if (q.f > 1) continue;
            const k = q.life / q.max; if (q.rain && q.life < 0.3) continue;
            dot(q.x, q.y, q.c[Math.min(q.c.length - 1, Math.floor(k * q.c.length))], q.f);
          }
        }
      }
      for (const q of parts) {
        if (q.f <= 1) continue;
        const k = q.life / q.max; if (q.rain && q.life < 0.3) continue;
        dot(q.x, q.y, q.c[Math.min(q.c.length - 1, Math.floor(k * q.c.length))], q.f);
      }
      // Wechsel: das alte Bild zerfällt in Blöcken von unten nach oben, mit glühender Kante
      if (trans) {
        const P = trans.t / 0.8, bs = 6 * d, cols = Math.ceil(cv.width / bs), rows = Math.ceil(cv.height / bs);
        const thr = (i, j) => { const h = Math.sin(i * 12.9898 + j * 78.233 + trans.seed) * 43758.5453; return (h - Math.floor(h)) * 0.5 + (1 - j / rows) * 0.5; };
        for (let j = 0; j < rows; j++) {
          let a = -1;
          for (let i = 0; i <= cols; i++) {
            const v = i < cols ? thr(i, rows - 1 - j) * 1.08 - 0.04 : -1;
            const keep = v > P + 0.06;
            if (keep && a < 0) a = i;
            if (!keep && a >= 0) { ctx.drawImage(trans.prev, a * bs, j * bs, (i - a) * bs, bs, a * bs, j * bs, (i - a) * bs, bs); a = -1; }
            if (i < cols && !keep && v > P) { ctx.fillStyle = v > P + 0.03 ? trans.c[2] : trans.c[1]; ctx.fillRect(i * bs, j * bs, bs, bs); }
          }
        }
      }
    };

    const tick = (now) => {
      if (!vis || document.hidden) { on = false; return; }
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      if (B && img) { update(dt); draw(); }
      requestAnimationFrame(tick);
    };
    const run_ = () => { if (!reduced && vis && !document.hidden && !on) { on = true; last = 0; requestAnimationFrame(tick); } };
    load(ORDER[cur]).then((im) => {
      img = im; show(cur); B.img = im; size();
      draw(); cv.classList.add('on');
      if (!reduced) prefetch();
      new IntersectionObserver(([e]) => { vis = e.isIntersecting; run_(); }).observe(stage);
      document.addEventListener('visibilitychange', run_);
    }, () => {});
  }
})();
