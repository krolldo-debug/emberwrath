// Emberwrath – Bosskino der Startseite (Abschnitt #bosse; Bilder und Maße aus tools/bosskino.mjs).
// Eine breite Bühne zeigt die Bosse nacheinander, jeden riesig in seinem Gebiet: Ebenen mit Parallaxe in ganzen
// Szenenpixeln, Ruhe aus Teilen mit eigenen Zyklen, dann seine Signatur-Attacke: gestufte Warnmarke am Boden → Ausholen →
// Halten → Einschlag (Treffer-Einfrieren „stopp“, abklingendes Beben „beben“) → Effekt durch die Bodenfugen und den Raum → Ausklingen.
// Ziel der Attacke ist ein Held (echte Spielfigur, klein gegenüber dem Boss, META held): Kampfhaltung in Ruhe, beim Treffer
// ein harter Blitz und kurzes Zurückweichen; die Spur der Feuer-/Wasserwand brennt hinter ihm, die Wand selbst rollt über ihn.
// Bilder im Feinraster wie im Spiel (META.szene.F Feinpixel je Szenenpixel), gezeichnet mit e Gerätepixeln je Feinpixel
// (ganzzahlig); Lagen und Bewegungen in Szenenpixeln. Wechsel als Ascheauflösung in Blöcken.
// Die Bildatlanten werden erst geladen, wenn der Abschnitt naht; die Schleife läuft nur, solange die Bühne sichtbar ist.
// Ohne JavaScript bleibt das Standbild (Malgareth); bei reduzierter Bewegung keine Wiedergabe, ein Klick zeigt das
// Standbild des gewählten Bosses.
(() => {
  const root = document.querySelector('[data-kino]');
  const stage = root?.querySelector('.kino-buehne');
  const poster = stage?.querySelector('img');
  if (!root || !stage || !poster) return;
  // <bosskino.mjs> – von tools/bosskino.mjs geschrieben, nicht von Hand ändern
  const META = {"szene":{"W":560,"H":216,"FY":190,"F":2,"X0":-152,"X1":712},"reihe":["nerith","skalvyr","malgareth"],"bosse":{"nerith":{"glut":["#e4fff9","#3cc8b8","#0d5f5a"],"fokus":[300,290],"teilchen":"geist","dichte":3,"dauer":9.5,"start":2.2,"stopp":80,"beben":[[0,3],[2,-2],[-2,1],[1,-1],[0,1],[1,0]],"name":"nerith","fig":{"x":216,"y":22,"w":285,"h":169},"ruhe":[{"n":12,"ms":160,"r":"koerper"}],"moment":{"f":[[0,150],[1,130],[2,120],[3,120],[4,120],[5,120],[6,60],[7,70],[8,80],[9,110],[10,160],[11,220],[12,150],[13,150]],"hit":7},"nach":"boden-glut","ereignisse":[{"k":"bild","r":"welle","at":0,"x":-152,"y":187,"w":400,"h":29,"n":37,"ms":60,"z":"boden"},{"k":"bild","r":"krone","at":0,"x":209,"y":100,"w":64,"h":92,"n":9,"ms":70,"quer":true,"z":"vorn"},{"k":"wand","r":"wand","r2":"wand2","r3":"wand3","at":60,"x":227,"y":193,"dir":-1,"v":260,"weg":373,"w":76,"h":72,"w2":30,"h2":22,"w3":18,"h3":12,"n":6,"ms":80,"abst":9,"nach":620,"z":"vorn","einzeln":true,"staub":["#c6eaf6","#6cb8da","#3384ae"]},{"k":"funken","at":0,"x":241,"y":188,"n":36,"r":6,"vx":70,"vy":160,"g":320,"c":["#c6eaf6","#76bcdc","#3886b2","#1a4f78"]},{"k":"funken","at":40,"x":241,"y":189,"n":18,"r":12,"vx":20,"vy":40,"g":0,"c":["#e4fff9","#8cf0e2","#3cc8b8","#0d5f5a"]}],"warn":{"x0":10,"x1":233,"y":187,"h":7,"dir":-1,"vor":700,"c":["#063a48","#0e7888","#a0fff0"]},"schalen":[[84,127],[460,127]],"schale":{"w":16,"h":20,"n":6,"ms":90},"schaleNach":"mitte-glut","held":{"x":106,"y":158,"w":27,"h":33,"fx":12,"ruhe":{"n":4,"ms":167},"treffer":{"at":283,"f":[[6,70,-1],[7,70,-2],[4,110,-2],[5,160,-2],[4,90,-2],[5,170,-2],[5,130,-1]]}},"blaetter":2,"dims":[[4026,1948],[3872,804]],"layers":[{"name":"fern","x":-152,"y":0,"f":0.15,"r":[1728,432,[1,0,0,1,1]]},{"name":"fern-glut","x":126,"y":19,"f":0.15,"glow":{"per":4.2,"lo":0.45,"steps":3},"r":[992,262,[1,1728,432,1,1]]},{"name":"mitte","x":-152,"y":30,"f":0.45,"r":[1728,372,[1,0,432,1,1]]},{"name":"mitte-glut","x":36,"y":70,"f":0.45,"glow":{"per":3.7,"lo":0.55,"steps":3},"r":[954,152,[1,2720,616,1,1]]},{"name":"boden","x":-152,"y":186,"f":1,"r":[1728,60,[0,1344,1804,1,1]]},{"name":"boden-glut","x":267,"y":187,"f":1,"glow":{"per":2.8,"lo":0.45,"steps":3},"r":[360,58,[0,3072,1804,1,1]]},{"name":"vorn","x":-152,"y":0,"f":1.35,"r":[1714,432,[1,1728,0,1,1]]}],"figur":{"r":{"koerper":[366,332,[0,0,676,11,12]],"moment":[570,338,[0,0,0,7,14]]},"o":{"koerper":[85,3,183,166],"moment":[0,0,285,169]}},"fxr":{"wand":[152,144,[0,0,1804,6,6]],"wand2":[60,44,[0,3432,1804,6,6]],"wand3":[36,24,[0,3792,1844,6,6]],"schale":[32,40,[0,3792,1804,6,6]],"krone":[128,184,[1,2720,432,9,9]],"welle":[800,58,[0,0,1340,5,37]],"held":[54,66,[0,912,1804,8,8]]}},"skalvyr":{"glut":["#ffffff","#9aeefc","#34b8e4"],"fokus":[296,298],"teilchen":"schnee","dichte":5,"dauer":9.5,"start":2.2,"beben":[[0,4],[3,-3],[-3,2],[2,-2],[-2,1],[1,-1],[0,1],[1,0]],"stopp":80,"name":"skalvyr","fig":{"x":167,"y":20,"w":356,"h":171},"ruhe":[{"n":12,"ms":150,"r":"koerper"}],"moment":{"f":[[0,150],[1,170],[2,100],[3,110],[4,110],[5,110],[6,110],[7,110],[8,150],[9,170],[10,190],[11,170]],"hit":8},"nach":"boden-glut","ereignisse":[{"k":"bild","r":"schatten","at":-770,"x":62,"y":176,"w":260,"h":26,"n":20,"ms":40,"quer":true,"z":"boden"},{"k":"bild","r":"reste","at":270,"x":62,"y":176,"w":260,"h":26,"n":11,"ms":150,"quer":true,"z":"boden"},{"k":"bild","r":"welle","at":0,"x":-138,"y":187,"w":661,"h":29,"n":41,"ms":60,"z":"boden"},{"k":"zapfen","r":"zapfen-s","r2":"steckt-s","at":-20,"x":166,"y":187,"vor":640,"w":18,"h":62,"n":5,"ms":16,"sw":54,"sh":68,"mr":1,"z":"vorn"},{"k":"zapfen","r":"zapfen-m","r2":"steckt-m","at":-70,"x":230,"y":188,"vor":640,"w":24,"h":82,"n":5,"ms":26,"sw":60,"sh":88,"mr":1,"z":"vorn"},{"k":"zapfen","r":"zapfen-m","r2":"steckt-m","at":-110,"x":150,"y":190,"vor":640,"w":24,"h":82,"n":5,"ms":34,"sw":60,"sh":88,"mr":1,"z":"vorn"},{"k":"zapfen","r":"zapfen-s","r2":"steckt-s","at":-130,"x":252,"y":194,"vor":640,"w":18,"h":62,"n":5,"ms":38,"sw":54,"sh":68,"mr":1,"z":"vorn"},{"k":"zapfen","r":"zapfen-l","r2":"steckt-l","at":0,"x":190,"y":195,"vor":640,"w":30,"h":104,"n":5,"ms":12,"sw":66,"sh":110,"mr":1,"z":"vorn"},{"k":"zapfen","r":"zapfen-s","r2":"steckt-s","at":-40,"x":134,"y":196,"vor":640,"w":18,"h":62,"n":5,"ms":20,"sw":54,"sh":68,"mr":1,"z":"vorn"},{"k":"zapfen","r":"zapfen-s","r2":"steckt-s","at":-90,"x":214,"y":197,"vor":640,"w":18,"h":62,"n":5,"ms":30,"sw":54,"sh":68,"mr":1,"z":"vorn"},{"k":"bild","r":"kranz","at":0,"x":62,"y":52,"w":260,"h":150,"n":12,"ms":60,"quer":true,"z":"vorn"},{"k":"funken","at":-520,"x":200,"y":10,"n":10,"r":16,"vx":6,"vy":-30,"g":140,"c":["#ffffff","#9aeefc","#34b8e4","#1670a0"]},{"k":"funken","at":-460,"x":150,"y":10,"n":10,"r":16,"vx":6,"vy":-30,"g":140,"c":["#ffffff","#9aeefc","#34b8e4","#1670a0"]},{"k":"funken","at":-400,"x":250,"y":10,"n":10,"r":16,"vx":6,"vy":-30,"g":140,"c":["#ffffff","#9aeefc","#34b8e4","#1670a0"]},{"k":"funken","at":-340,"x":120,"y":10,"n":10,"r":16,"vx":6,"vy":-30,"g":140,"c":["#ffffff","#9aeefc","#34b8e4","#1670a0"]},{"k":"funken","at":-280,"x":228,"y":10,"n":10,"r":16,"vx":6,"vy":-30,"g":140,"c":["#ffffff","#9aeefc","#34b8e4","#1670a0"]},{"k":"funken","at":-220,"x":176,"y":10,"n":10,"r":16,"vx":6,"vy":-30,"g":140,"c":["#ffffff","#9aeefc","#34b8e4","#1670a0"]}],"warn":null,"held":{"x":176,"y":158,"w":27,"h":33,"fx":12,"ruhe":{"n":4,"ms":167},"treffer":{"at":40,"f":[[6,70,-1],[7,70,-2],[4,110,-2],[5,160,-2],[4,90,-2],[5,170,-2],[5,130,-1]]}},"blaetter":3,"dims":[[4074,1942],[4056,1936],[3640,588]],"layers":[{"name":"fern","x":-152,"y":0,"f":0.15,"r":[1728,432,[1,0,1284,1,1]]},{"name":"fern-glut","x":264,"y":7,"f":0.15,"glow":{"per":3.8,"lo":0.55,"steps":3},"r":[220,342,[1,3640,0,1,1]]},{"name":"mitte","x":-152,"y":0,"f":0.45,"r":[1728,432,[1,1728,1284,1,1]]},{"name":"mitte-glut","x":-140,"y":0,"f":0.45,"glow":{"per":3.1,"lo":0.5,"steps":3},"r":[1696,342,[2,1728,0,1,1]]},{"name":"boden","x":-152,"y":186,"f":1,"r":[1728,60,[1,660,1716,1,1]]},{"name":"boden-glut","x":341,"y":192,"f":1,"glow":{"per":3.3,"lo":0.4,"steps":3},"r":[204,20,[0,3640,1904,1,1]]},{"name":"vorn","x":-152,"y":0,"f":1.35,"r":[1728,432,[2,0,0,1,1]]}],"figur":{"r":{"koerper":[598,342,[1,0,0,6,12]],"moment":[712,342,[0,0,0,5,12]]},"o":{"koerper":[57,0,299,171],"moment":[0,0,356,171]}},"fxr":{"zapfen-l":[60,208,[0,3966,0,1,1]],"steckt-l":[132,220,[1,0,1716,5,5]],"zapfen-m":[48,164,[0,4026,0,1,1]],"steckt-m":[120,176,[1,3456,1284,5,5]],"zapfen-s":[36,124,[0,4026,164,1,1]],"steckt-s":[108,136,[1,3456,1460,5,5]],"kranz":[520,300,[1,0,684,7,12]],"schatten":[520,52,[2,0,432,7,20]],"reste":[520,52,[0,0,1838,7,11]],"welle":[1322,58,[0,0,1026,3,41]],"held":[54,66,[0,3640,1838,8,8]]}},"malgareth":{"name":"malgareth","glut":["#fff2c0","#ffb648","#c8420c"],"fokus":[300,290],"fig":{"x":209,"y":23,"w":272,"h":171},"ruhe":[{"r":"hinten","n":8,"ms":170},{"r":"koerper","seq":[0,0,0,1,1,2,2,2,1,1],"ms":210},{"r":"krone","n":6,"ms":100,"dy":[0,-1,-2],"von":"koerper"},{"r":"flamme","n":6,"ms":100}],"moment":{"f":[[0,130],[1,110],[2,110],[3,80],[4,80],[5,80],[6,80],[7,80],[8,80],[9,80],[10,60],[11,50],[12,60],[13,70],[14,90],[15,110],[16,140],[17,140],[18,140],[19,110],[20,130],[21,110],[22,130],[23,120]],"hit":12},"stopp":80,"beben":[[0,3],[2,-2],[-1,1],[1,0]],"warn":{"x0":8,"x1":242,"y":187,"h":7,"dir":-1,"vor":760,"c":["#7a1a08","#c8420c","#ffb648"]},"ereignisse":[{"k":"bild","r":"welle","at":0,"x":-152,"y":187,"w":407,"h":29,"n":36,"ms":60,"z":"boden"},{"k":"bild","r":"blitz","at":0,"x":228,"y":159,"w":41,"h":34,"n":5,"ms":60,"quer":true,"z":"vorn"},{"k":"wand","r":"wand","r2":"wand2","r3":"wand3","at":30,"x":244,"y":193,"dir":-1,"v":300,"weg":330,"w":74,"h":100,"w2":40,"h2":58,"w3":18,"h3":28,"n":6,"ms":70,"abst":8,"nach":680,"z":"vorn"},{"k":"funken","at":0,"x":248,"y":188,"n":34,"r":5,"vx":60,"vy":140,"g":300,"c":["#fff2c0","#ffb648","#e8641a","#a8300a"]},{"k":"funken","at":0,"x":248,"y":189,"n":20,"r":9,"vx":40,"vy":50,"g":80,"c":["#6a5040","#4e3a30","#3a2a24"]}],"schalen":[[70,131],[436,131]],"schale":{"w":16,"h":20,"n":6,"ms":90},"schaleNach":"mitte-glut","teilchen":"asche","dichte":2.2,"nach":"boden-glut","dauer":9.5,"start":2.4,"held":{"x":128,"y":158,"w":27,"h":33,"fx":12,"ruhe":{"n":4,"ms":167},"treffer":{"at":210,"f":[[6,70,-1],[7,70,-2],[4,110,-2],[5,160,-2],[4,90,-2],[5,170,-2],[5,130,-1]]}},"blaetter":2,"dims":[[4078,1948],[4002,1194]],"layers":[{"name":"fern","x":-152,"y":0,"f":0.15,"r":[1728,432,[1,0,0,1,1]]},{"name":"fern-glut","x":286,"y":0,"f":0.15,"r":[336,322,[1,3456,0,1,1]]},{"name":"mitte","x":-152,"y":0,"f":0.45,"r":[1728,432,[1,1728,0,1,1]]},{"name":"mitte-glut","x":73,"y":149,"f":0.45,"glow":{"per":4.1,"lo":0.66,"steps":3},"r":[754,132,[1,3232,836,1,1]]},{"name":"boden","x":-152,"y":186,"f":1,"r":[1728,60,[0,1322,1832,1,1]]},{"name":"boden-glut","x":230,"y":187,"f":1,"glow":{"per":3.4,"lo":0.6,"steps":3},"r":[488,44,[0,3266,1832,1,1]]},{"name":"vorn","x":-152,"y":0,"f":1.35,"r":[1386,432,[1,0,432,1,1]]}],"figur":{"fx":143,"fy":167,"r":{"hinten":[374,330,[1,0,864,8,8]],"koerper":[182,314,[1,3456,322,3,3]],"krone":[54,44,[0,3754,1832,6,6]],"flamme":[40,148,[1,2992,836,6,6]],"moment":[544,342,[0,0,0,7,24]]},"o":{"hinten":[51,3,187,165],"koerper":[98,11,91,157],"krone":[131,5,27,22],"flamme":[134,94,20,74],"moment":[0,0,272,171]}},"fxr":{"welle":[814,58,[0,0,1368,5,36]],"wand":[148,200,[1,2992,636,6,6]],"wand2":[80,116,[0,0,1832,6,6]],"wand3":[36,56,[0,3050,1832,6,6]],"schale":[32,40,[0,3266,1876,6,6]],"blitz":[82,68,[0,480,1832,5,5]],"held":[54,66,[0,890,1832,8,8]]}}},"v":"86e29c4792"};
  // </bosskino.mjs>
  if (!META) return;
  const S = META.szene;
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const texts = [...root.querySelectorAll('[data-text]')];
  tabs.forEach((t) => { if (!META.bosse[t.dataset.boss]) t.hidden = true; });   // Reiter ohne Bilder (noch nicht gebaut) ausblenden
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

  // ---------- Ausschnitt: Atlanten im Feinraster (F Feinpixel je Szenenpixel, wie im Spiel), e Gerätepixel je Feinpixel
  // (ganzzahlig), d = e·F Gerätepixel je Szenenpixel. Desktop: die Szene deckt die Breite (mit Rand für die Parallaxe), aber
  // die Figur (Szene ab y 20) muss in die Höhe passen – sonst eine Stufe kleiner, dann zeigt die Bühne die Szene mittig und
  // die seitlich verlängerten Hintergründe (X0 … X1) füllen den Rest; dunkler Rand erst jenseits davon. Handy: ≥ 380 Szenenpixel breit, damit Boss und Attacke ganz im Bild sind; Ausschnitt je Boss (fokus[1]).
  // Die Bühnenhöhe folgt aus d.
  const F = S.F ?? 1;
  const X0 = S.X0 ?? 0, X1 = S.X1 ?? S.W, XW = X1 - X0;   // Hintergründe reichen seitlich über die Szene hinaus (X0 … X1)
  // Leinwand höchstens 4096 Gerätepixel breit und 8 Megapixel groß (WebKit/Safari zeichnet größere still nicht);
  // sonst eine Stufe kleiner, eine Leinwand schmaler als die Bühne bekommt den dunklen Rand
  const CMAX = 4096, CPIX = 8e6;
  let dpr = 1, cw = 0, ch = 0, d = 1, e = 1, vw = 0, vh = 0, camX = 0, camY = 0, pw = 0, ox = 0, cut = false;
  const layout = (m) => {
    dpr = devicePixelRatio || 1;
    cw = stage.clientWidth;
    const W = Math.round(cw * dpr);
    // Flache Fenster (Handy quer): Bühne und Boss-Auswahl passen zusammen unter die feste Kopfleiste, damit Krone und Kopf
    // nicht hinter ihr liegen; dafür zeigt die Bühne mindestens 176 Szenenzeilen (Krone bis Boden) und kürzt unten
    const flat = innerHeight < 640;
    let avail = (narrow.matches ? innerHeight * 0.8 : innerHeight - 180) * dpr;   // Desktop: Platz für Kopfleiste und Boss-Auswahl
    if (flat) {
      const bar = document.querySelector('.top')?.offsetHeight ?? 0;
      const wahl = root.querySelector('.kino-wahl');
      const below = wahl ? wahl.offsetHeight + (parseFloat(getComputedStyle(wahl).marginTop) || 0) : 0;
      avail = Math.max(innerHeight * 0.55, innerHeight - bar - below - 2) * dpr;
    }
    const eh = Math.max(1, Math.floor(avail / (F * (flat ? 176 : S.H - 20))));
    const ew = narrow.matches ? Math.max(1, Math.floor(W / (F * 380))) : Math.max(1, Math.ceil(W / (F * (S.W - 16))));
    e = Math.min(ew, eh) + 1;
    do { e--; d = e * F; pw = Math.min(W, XW * d, CMAX); vh = Math.min(S.H, Math.max(flat ? 176 : 0, Math.floor(avail / d))); } while (e > 1 && pw * vh * d > CPIX);
    ox = Math.floor((W - pw) / 2); cut = pw < Math.min(W, XW * d);
    vw = pw / d;
    ch = (vh * d) / dpr;
    stage.style.height = `${ch}px`;
    const fx = m.fokus[narrow.matches ? 1 : 0];
    // breiter als die Szene (Laptops mit e = 1): auf die Szenenmitte, die verlängerten Hintergründe füllen die Bühne;
    // schmaler: Ausschnitt um den Boss (fokus) innerhalb der Szene
    camX = vw >= S.W - 12 ? Math.max(X0, Math.floor((S.W - vw) / 2)) : Math.max(6, Math.min(S.W - 6 - Math.ceil(vw), Math.round(fx - vw / 2)));
    if (m.held && vw < S.W - 12) camX = Math.max(6, Math.min(camX, m.held.x - 6));   // der Held bleibt im Bild
    // niedriger als die Szene: unten zuerst kürzen (unter dem Boden), Krone und Kopf (fig.y) bleiben im Bild
    camY = Math.max(0, Math.min(S.H - vh, (m.fig?.y ?? 20) - 4));
  };
  const placePoster = () => {
    layout(META.bosse[ORDER[cur]]);
    Object.assign(poster.style, { width: `${(XW * d) / dpr}px`, height: `${(S.H * d) / dpr}px`, left: `${(ox - (camX - X0) * d) / dpr}px`, top: `${(-camY * d) / dpr}px` });   // Standbild X0 … X1
  };
  if (META.v && !/[?&]v=/.test(poster.getAttribute('src'))) poster.src = `${IMG}bosskino.webp?v=${META.v}`;   // Standbild passend zur Version
  placePoster();
  let live = null;   // gesetzt, sobald das Canvas zeichnet
  addEventListener('resize', () => (live ? live.size() : placePoster()));

  // ---------- Bilder: je Boss einige Atlasblätter (je ≤ 4096 px Kante, ≤ 8 MP), erst bei Bedarf. Ein Boss zeichnet erst,
  // wenn alle seine Blätter geladen und dekodiert sind; fehlt eines, bleibt das Standbild bzw. der bisherige Boss.
  const atlases = {};
  // Mit Version (?v=; alte Bilder aus dem Zwischenspeicher passen nicht zu neuen Maßen), in der erwarteten Größe und fertig dekodiert.
  const sheet = (n, s) => new Promise((ok, no) => {
    const i = new Image(), want = META.bosse[n].dims?.[s];
    i.onerror = no;
    i.onload = () => {
      if (!want || i.naturalWidth !== want[0] || i.naturalHeight !== want[1]) { no(new Error(`${n}-${s}`)); return; }
      (i.decode ? i.decode() : Promise.resolve()).then(() => ok(i), no);
    };
    i.src = `${IMG}bosskino-${n}-${s}.webp?v=${META.v}`;
  });
  const load = (n) => (atlases[n] ??= Promise.all(Array.from({ length: META.bosse[n].blaetter }, (_, s) => sheet(n, s)))
    .catch((er) => { delete atlases[n]; throw er; }));   // Fehlschlag: beim nächsten Mal neu laden
  const conn = navigator.connection;
  const lean = conn && (conn.saveData || /(^|-)2g/.test(conn.effectiveType ?? ''));
  let wanted = false;
  const want = () => {
    if (wanted || lean) return; wanted = true;
    load(ORDER[cur]).then(() => start(), () => {});
  };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es, o) => { if (es.some((e) => e.isIntersecting)) { want(); o.disconnect(); } }, { rootMargin: '900px 0px' }).observe(stage);
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
    let B = null, imgs = null, T = 0, t = 0, parts = [], kx = 0, ky = 0, shakeT = -1, freeze = 0, mx = 0, my = 0, tmx = 0, tmy = 0, sx = 0, sy = 0;
    let fired = new Set(), lastHit = false, trans = null, nextIdx = -1, busy = false;
    let edge = null;
    const mkEdge = () => {
      if (vw < XW - 12 && !cut) { edge = null; return; }   // Rand nur, wo die Leinwand vor der Bühnenkante endet
      edge = document.createElement('canvas'); edge.width = 4 * d + 4 * F * e; edge.height = cv.height;
      const g = edge.getContext('2d'); g.fillStyle = '#05020a'; g.fillRect(0, 0, 4 * d, cv.height);
      for (let j = 0; j < cv.height / e; j++) for (let i = 0; i < 4 * F; i++) if (!((i + j) & 1)) g.fillRect(4 * d + i * e, j * e, e, e);
    };
    const size = () => { layout(B?.m ?? META.bosse[ORDER[cur]]); cv.width = pw; cv.height = vh * d; Object.assign(cv.style, { width: `${pw / dpr}px`, left: `${ox / dpr}px` }); mkEdge(); ctx.imageSmoothingEnabled = false; if (reduced || !on) draw(); };
    live = { size };
    addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; tmx = (e.clientX / innerWidth) * 2 - 1; tmy = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });

    // ---------- Zeichnen in Szenenpixeln
    const off = (f) => [Math.round(sx * f) + kx, Math.round(sy * f) + ky];
    const blit = (r, ox0, oy0, w, h, x, y, f) => {   // Ausschnitt (ox0, oy0, w, h; Szenenpixel) aus Atlaseintrag r an Szenenstelle x, y, Tiefe f
      // r = [Bildbreite, Bildhöhe, [Blatt, x, y, Bilder je Reihe, Anzahl], …] (Feinpixel); ox0/oy0 wählen das Bild
      // einer waagrechten bzw. senkrechten Folge und den Versatz darin
      const [px, py] = off(f);
      const X = (x - camX - px) * d, Y = (y - camY - py) * d;
      const x0 = Math.max(0, Math.floor(-X / d)), x1 = Math.min(w, Math.ceil((cv.width - X) / d));
      const y0 = Math.max(0, Math.floor(-Y / d)), y1 = Math.min(h, Math.ceil((cv.height - Y) / d));
      if (x1 <= x0 || y1 <= y0) return;
      const fw = r[0], fh = r[1], ix = Math.floor((ox0 * F) / fw), iy = Math.floor((oy0 * F) / fh);
      let i = ix + iy, c = 2;
      while (c < r.length - 1 && i >= r[c][4]) { i -= r[c][4]; c++; }
      const [s, bx, by, per] = r[c], im = imgs[s];
      if (!im) return;
      const sx = bx + (i % per) * fw + (ox0 * F - ix * fw), sy = by + Math.floor(i / per) * fh + (oy0 * F - iy * fh);
      // Quellausschnitt nie über den Bildrand (Safari zeichnet sonst still nichts)
      const u0 = Math.max(x0, Math.ceil(-sx / F)), u1 = Math.min(x1, Math.floor((im.naturalWidth - sx) / F));
      const v0 = Math.max(y0, Math.ceil(-sy / F)), v1 = Math.min(y1, Math.floor((im.naturalHeight - sy) / F));
      if (u1 <= u0 || v1 <= v0) return;
      ctx.drawImage(im, sx + u0 * F, sy + v0 * F, (u1 - u0) * F, (v1 - v0) * F, X + u0 * d, Y + v0 * d, (u1 - u0) * d, (v1 - v0) * d);
    };
    const dot = (x, y, c, f = 1) => { const [px, py] = off(f); ctx.fillStyle = c; ctx.fillRect((Math.round(x) - camX - px) * d, (Math.round(y) - camY - py) * d, d, d); };
    // Teilchen im Feinraster: Lage auf ganze Feinpixel, Größe s Feinpixel
    const fdot = (x, y, c, f = 1, s_ = 1) => { const [px, py] = off(f); ctx.fillStyle = c; ctx.fillRect((Math.round(x * F) / F - camX - px) * d, (Math.round(y * F) / F - camY - py) * d, s_ * e, s_ * e); };
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
        imgs = im; show(i);
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
      const Fg = m.figur, R = Fg.r, x = m.fig.x, y = m.fig.y, w = m.fig.w, h = m.fig.h;
      const mf = mt >= 0 ? frameAt(m.moment.f, mt) : -1;
      const O = (r) => Fg.o?.[r] ?? [0, 0, w, h];   // Streifen je Teil auf seinen Rahmen zugeschnitten (Versatz und Maße in Szenenpixeln)
      if (mf >= 0) { const o = O('moment'); blit(R.moment, m.moment.f[mf][0] * o[2], 0, o[2], o[3], x + o[0], y + o[1], 1); return; }
      // Ruhe: Teile mit eigenen Zyklen (n Bilder zu ms, oder feste Folge seq); dy: Versatz je Bild eines anderen Teils
      const ms = T * 1000, cur_ = {};
      for (const p of m.ruhe) {
        const k = p.seq ? p.seq[Math.floor(ms / p.ms) % p.seq.length] : Math.floor(ms / p.ms) % p.n;
        cur_[p.r] = k;
        const o = O(p.r);
        blit(R[p.r], k * o[2], 0, o[2], o[3], x + o[0], y + o[1] + (p.dy ? p.dy[cur_[p.von]] ?? 0 : 0), 1);
      }
    };
    // Held: Ruhe (Bilder des Spiels im eigenen Takt), Treffer ab hit + treffer.at als feste Folge [Bild, ms, Versatz x]
    const drawHeld = (m, mt) => {
      const H = m.held;
      if (!H) return;
      let k = Math.floor((T * 1000) / H.ruhe.ms) % H.ruhe.n, dx = 0;
      const ht = mt - hitMs(m) - H.treffer.at;
      if (mt > -1e8 && ht >= 0) { const i = frameAt(H.treffer.f, ht); if (i >= 0) [k, , dx] = H.treffer.f[i]; }
      if (reduced) k = 0;
      // Handy hoch (ein Gerätepixel je Feinpixel): der Held doppelt so groß, ganzzahlig, mit dem Fußpunkt an derselben Stelle
      const z = narrow.matches && e === 1 ? 2 : 1;
      if (z === 1) { blit(m.fxr.held, k * H.w, 0, H.w, H.h, H.x + dx, H.y, 1); return; }
      const r = m.fxr.held, [s, bx, by, per] = r[2], im = imgs[s];
      if (!im) return;
      const [px, py] = off(1), fw = r[0], fh = r[1];
      const X = (H.x + H.fx + dx - camX - px) * d - H.fx * d * z, Y = (H.y + H.h - camY - py) * d - H.h * d * z;
      ctx.drawImage(im, bx + (k % per) * fw, by + Math.floor(k / per) * fh, fw, fh, X, Y, fw * e * z, fh * e * z);
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
    // hinter: nur die Spur der Wand links vom Boss (wird vor dem Helden gezeichnet, die Wand selbst danach über ihn)
    const drawEvents = (m, mt, z, hinter = false) => {
      const hm = hitMs(m);
      for (const e of m.ereignisse) {
        if (hinter && e.k !== 'wand') continue;
        if (e.k === 'zapfen') { drawZapfen(m, e, mt - hm - e.at + e.vor, z); continue; }
        if (e.z !== z) continue;
        const et = mt - hm - e.at;
        if (et < 0) continue;
        const r = m.fxr[e.r];
        // am Handy: kleine Effekte, die links aus dem Ausschnitt ragen würden, auslassen (die Welle läuft dort hinaus)
        if (narrow.matches && e.k === 'bild' && e.x < camX && e.w < vw / 2) continue;
        if (e.k === 'bild') {   // Bildfolge an fester Stelle (ganze Bilder untereinander oder nebeneinander)
          let k = Math.floor(et / e.ms);
          if (k >= e.n) continue;
          if (e.loop) k %= e.loop;
          if (e.quer) blit(r, k * e.w, 0, e.w, e.h, e.x, e.y, 1); else blit(r, 0, k * e.h, e.w, e.h, e.x, e.y, 1);
        } else if (e.k === 'wand') {   // Flammenwand läuft in ganzen Pixeln über den Boden, dahinter brennt eine Spur nieder
          // am Handy endet sie vor dem linken Bildrand des Ausschnitts, läuft aber immer ganz über den Helden
          const H = m.held, overHeld = H ? (e.dir < 0 ? e.x - H.x : H.x + H.w - e.x) + (e.w >> 1) + 2 : 0;
          const weg = narrow.matches ? Math.min(e.weg, Math.max(overHeld, Math.abs(e.x - (e.dir < 0 ? camX : camX + vw)) - e.w - 6)) : e.weg;
          const dist = Math.floor((et / 1000) * e.v), R2 = m.fxr[e.r2], R3 = m.fxr[e.r3];
          // Spur: alle e.abst Pixel eine Flamme, groß -> mittel -> klein, versetzt im Takt
          for (let q = e.abst, i = 1; q < Math.min(dist, weg); q += e.abst, i++) {
            const age = et - (q / e.v) * 1000;
            if (age >= e.nach) continue;
            const k = (Math.floor(age / e.ms) + i * 2) % e.n, x = e.x + e.dir * q;
            if (m.held && hinter !== x < m.fig.x) continue;
            if (age < e.nach * 0.45) blit(R2, k * e.w2, 0, e.w2, e.h2, x - (e.w2 >> 1), e.y - e.h2, 1);
            else blit(R3, k * e.w3, 0, e.w3, e.h3, x - (e.w3 >> 1), e.y - e.h3, 1);
          }
          if (dist > weg || hinter) continue;
          const k = Math.floor(et / e.ms) % e.n, x = e.x + e.dir * dist - (e.w >> 1);
          if (!e.einzeln) blit(r, ((k + 3) % e.n) * e.w, 0, e.w, e.h, x - e.dir * 12, e.y - e.h + 6, 1);   // zweite Säule dahinter, etwas kleiner (einzeln: nur eine)
          blit(r, k * e.w, 0, e.w, e.h, x, e.y - e.h, 1);
          if (Math.random() < 0.7) spawn({ x: x + e.w / 2 + rnd(-8, 8), y: e.y - rnd(6, e.h * 0.8), vx: rnd(-10, 10), vy: -rnd(24, 60), g: 0, wob: 10, max: rnd(0.3, 0.8), f: 1, c: m.glut });
          if (Math.random() < 0.4) spawn({ x: x + e.w / 2 + rnd(-6, 6), y: e.y - 1, vx: rnd(-20, 20) + e.dir * 10, vy: -rnd(10, 30), g: 80, wob: 0, max: rnd(0.4, 0.8), f: 1, c: e.staub || ['#6a5040', '#4e3a30', '#3a2a24'] });   // staub: eigene Farben
        }
      }
    };
    const draw = () => {
      if (!B || !imgs) return;
      const m = B.m;
      const mt = reduced ? -1e9 : (T - m.start) * 1000;
      const inMoment = mt >= 0 && mt < momentLen(m);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#05020a'; ctx.fillRect(0, 0, cv.width, cv.height);
      for (const L of m.layers) {
        ctx.globalAlpha = reduced ? 1 : pulse(L.glow, t);
        blit(L.r, 0, 0, L.r[0] / F, L.r[1] / F, L.x, L.y, L.f);
        ctx.globalAlpha = 1;
        if (L.name === m.schaleNach) {
          const sc = m.schale, k = reduced ? 0 : Math.floor((t * 1000) / sc.ms) % sc.n;
          for (const [x, y] of m.schalen) blit(m.fxr.schale, k * sc.w, 0, sc.w, sc.h, x, y, L.f);
        }
        if (L.name === m.nach) {
          drawEvents(m, mt, 'boden');
          drawWarn(m, mt);
          if (m.held) { drawEvents(m, mt, 'vorn', true); drawHeld(m, mt); }
          drawFigure(m, inMoment ? mt : -1);
          drawEvents(m, mt, 'vorn');
          for (const q of parts) {
            if (q.f > 1) continue;
            const k = q.life / q.max; if (q.rain && q.life < 0.3) continue;
            fdot(q.x, q.y, q.c[Math.min(q.c.length - 1, Math.floor(k * q.c.length))], q.f, q.f >= 1 ? F : 1);
          }
        }
      }
      for (const q of parts) {
        if (q.f <= 1) continue;
        const k = q.life / q.max; if (q.rain && q.life < 0.3) continue;
        fdot(q.x, q.y, q.c[Math.min(q.c.length - 1, Math.floor(k * q.c.length))], q.f, q.f >= 1 ? F : 1);
      }
      // ganze verlängerte Szene sichtbar (Bühne breiter als X0 … X1): Ränder in harten Stufen ins Dunkel (deckend, Schachbrett aus Feinpixeln)
      if (edge) { ctx.drawImage(edge, 0, 0); ctx.save(); ctx.translate(cv.width, 0); ctx.scale(-1, 1); ctx.drawImage(edge, 0, 0); ctx.restore(); }
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
            if (!keep && a >= 0) { const ww = Math.min((i - a) * bs, trans.prev.width - a * bs), hh = Math.min(bs, trans.prev.height - j * bs); if (ww > 0 && hh > 0) ctx.drawImage(trans.prev, a * bs, j * bs, ww, hh, a * bs, j * bs, ww, hh); a = -1; }   // nie über den Rand
            if (i < cols && !keep && v > P) { ctx.fillStyle = v > P + 0.03 ? trans.c[2] : trans.c[1]; ctx.fillRect(i * bs, j * bs, bs, bs); }
          }
        }
      }
    };

    const tick = (now) => {
      if (!vis || document.hidden) { on = false; return; }
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      if (B && imgs) { update(dt); draw(); }
      requestAnimationFrame(tick);
    };
    const run_ = () => { if (!reduced && vis && !document.hidden && !on) { on = true; last = 0; requestAnimationFrame(tick); } };
    load(ORDER[cur]).then((im) => {
      imgs = im; show(cur); size();
      draw(); cv.classList.add('on'); poster.style.visibility = 'hidden';   // Standbild nicht neben einer schmaleren Leinwand zeigen
      if (!reduced) prefetch();
      new IntersectionObserver((es) => { vis = es[es.length - 1].isIntersecting; run_(); }).observe(stage);   // letzter Eintrag zählt (mehrere je Aufruf möglich)
      document.addEventListener('visibilitychange', run_);
    }, () => {});
  }
})();
