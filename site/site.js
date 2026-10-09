// Emberwrath – Verhalten der Startseite und Unterseiten. Ohne Abhängigkeiten.
// Liest window.EW_SITE (config.js). Alles Optionale ist so gebaut, dass die
// Seite ohne JavaScript lesbar bleibt.
(() => {
  const cfg = window.EW_SITE ?? {};
  const doc = document.documentElement;
  doc.classList.remove('no-js');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  // Bilderordner auch für /en/ (dort sind alle Pfade absolut): neben dem Favicon
  const IMG = new URL('img/', document.querySelector('link[rel="icon"]')?.href ?? location.href).href;

  // ---------- Links aus der Konfiguration
  const links = { play: cfg.playUrl, login: cfg.loginUrl, register: cfg.registerUrl };
  for (const a of $$('[data-link]')) if (links[a.dataset.link]) a.href = links[a.dataset.link];

  // ---------- Anmeldestatus (vom Login-Thread: localStorage 'emberwrath:online:session')
  // Angemeldet: „Anmelden“ wird zu „Mein Konto“ und „Konto erstellen“ entfällt.
  try {
    const sess = JSON.parse(localStorage.getItem('emberwrath:online:session') ?? 'null');
    const exp = Number(sess?.expires_at ?? 0);
    const valid = sess?.user && (!exp || (exp > 1e12 ? exp : exp * 1000) > Date.now());
    if (valid) {
      const name = sess.user.user_metadata?.display_name || sess.user.email || 'Mein Konto';
      for (const a of $$('[data-link="login"]')) { a.textContent = name; a.title = 'Mein Konto'; a.href = cfg.accountUrl ?? '/spielen/#konto'; }
      for (const a of $$('[data-link="register"]')) a.hidden = true;
    }
  } catch { /* kein Speicher: nichts anzeigen */ }

  // ---------- Social Media
  const SOCIAL = {
    discord: { name: 'Discord', path: 'M20 5.3A17 17 0 0 0 15.8 4l-.5 1a16 16 0 0 0-6.6 0l-.5-1A17 17 0 0 0 4 5.3C1.4 9.2.7 13 1 16.8a17 17 0 0 0 5.2 2.6l1.1-1.8a11 11 0 0 1-1.7-.8l.4-.3a12 12 0 0 0 12 0l.4.3a11 11 0 0 1-1.7.8l1.1 1.8a17 17 0 0 0 5.2-2.6c.4-4.4-.7-8.2-3-11.5zM8.5 14.5c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1zm7 0c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1z' },
    youtube: { name: 'YouTube', path: 'M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.8 15.1V8.9l5.4 3.1z' },
    tiktok: { name: 'TikTok', path: 'M16.6 2h-3.4v13.3a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9a6.3 6.3 0 1 0 5.4 6.3V8.6a8 8 0 0 0 4.4 1.4V6.6a4.5 4.5 0 0 1-4.4-4.6z' },
    instagram: { name: 'Instagram', path: 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3zm5 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm5.3-4a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z' },
    x: { name: 'X', path: 'M17.8 2.5h3.3l-7.2 8.2 8.5 10.8h-6.6l-5.2-6.6-5.9 6.6H1.4l7.7-8.8L1 2.5h6.8l4.7 6 5.3-6zm-1.2 17.1h1.8L6.6 4.3H4.6z' },
  };
  const svg = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${path}"/></svg>`;
  const validUrl = (u) => typeof u === 'string' && /^https:\/\//.test(u.trim());
  const entries = Object.entries(cfg.social ?? {}).filter(([k]) => SOCIAL[k]);
  // Nur eingetragene Kanäle zeigen; ohne Adressen bleibt der Bereich ganz aus.
  const live = entries.filter(([, url]) => validUrl(url));
  for (const box of $$('[data-socials]')) {
    box.innerHTML = live.map(([k, url]) => `<a class="social" href="${encodeURI(url.trim())}" target="_blank" rel="noopener me">${svg(SOCIAL[k].path)}${SOCIAL[k].name}</a>`).join('');
    box.hidden = !live.length;
  }
  for (const box of $$('[data-social-icons]')) {
    box.innerHTML = live
      .map(([k, url]) => `<a href="${encodeURI(url.trim())}" target="_blank" rel="noopener me" aria-label="${SOCIAL[k].name}">${svg(SOCIAL[k].path)}</a>`).join('');
  }

  // ---------- Kontakt
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const mail = (cfg.supportEmail ?? '').trim();
  for (const el of $$('[data-support-email]')) {
    if (mail) el.innerHTML = `<a href="mailto:${esc(mail)}?subject=${encodeURIComponent('Emberwrath Support')}">${esc(mail)}</a>`;
  }
  for (const el of $$('[data-if-email]')) el.hidden = !mail;
  for (const el of $$('[data-if-no-email]')) el.hidden = !!mail;

  // ---------- Impressum
  const imp = cfg.impressum ?? {};
  const impBox = document.querySelector('[data-impressum]');
  if (impBox && imp.name && imp.street && imp.city) {
    const rows = [
      ['Anbieter', `${esc(imp.name)}<br>${esc(imp.street)}<br>${esc(imp.city)}${imp.country ? `<br>${esc(imp.country)}` : ''}`],
      ['Telefon', esc(imp.phone ?? '')],
      ['Verantwortlich für den Inhalt <span class="nw">(§ 18 Abs. 2 MStV)</span>',esc(imp.responsible || imp.name)],
    ].filter(([, v]) => v);
    impBox.innerHTML = `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  }

  // ---------- Kopfleiste: fester Hintergrund beim Scrollen
  const top = document.querySelector('.top');
  const onScroll = () => top?.classList.toggle('solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------- Menü auf dem Handy
  const menuBtn = document.querySelector('.menu-btn');
  if (menuBtn) {
    const setMenu = (open) => { document.body.classList.toggle('menu-open', open); menuBtn.setAttribute('aria-expanded', String(open)); };
    menuBtn.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
    for (const a of $$('#hauptmenue a')) a.addEventListener('click', () => setMenu(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  }

  // ---------- Einblenden beim Scrollen
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver((list) => {
      for (const e of list) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px' });
    $$('.reveal, .talk, h2.title, .lore h1.title').forEach((el) => io.observe(el));
  } else $$('.reveal, .talk, h2.title, .lore h1.title').forEach((el) => el.classList.add('in'));

  // ---------- Bildstreifen abspielen: ein Element zeigt jeweils ein Bild eines waagerechten Streifens (Hintergrundbild),
  // oder eine Zeichenfläche bekommt das Bild per drawImage (große Streifen: kein riesiges skaliertes Hintergrundbild,
  // das der Browser beim Wechsel erst neu rastern müsste).
  // Ein gemeinsamer Takt (requestAnimationFrame) für alle Figuren; Figuren außerhalb des Bildschirms stehen still.
  const decoded = new Map();
  const loadImg = (src) => {
    let p = decoded.get(src);
    if (!p) { const im = new Image(); im.src = src; p = (im.decode ? im.decode() : new Promise((r) => { im.onload = r; })).then(() => im, () => im); decoded.set(src, p); }
    return p;
  };
  const players = new Set();
  let clockOn = false, clockLast = 0;
  const clock = (t) => {
    const dt = Math.min(100, t - (clockLast || t)); clockLast = t;
    let any = false;
    for (const pl of players) if (pl.visible && pl.seq) { pl.step(dt); any = true; }
    if (any) requestAnimationFrame(clock); else { clockOn = false; clockLast = 0; }
  };
  const kick = () => { if (!clockOn && !reduced) { clockOn = true; requestAnimationFrame(clock); } };
  const seen = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
    for (const e of es) { const pl = e.target.__strip; if (pl) { pl.visible = e.isIntersecting; if (pl.visible) kick(); } }
  }, { rootMargin: '80px' }) : null;
  class Strip {
    constructor(el) { this.el = el; this.cv = el instanceof HTMLCanvasElement ? el : null; this.seq = null; this.token = 0; this.visible = !seen; el.__strip = this; seen?.observe(el); players.add(this); }
    // seq: { src, n, ms (Zahl oder Liste je Bild), loop, done }
    async play(seq) {
      const tok = ++this.token;
      const img = await loadImg(seq.src);
      if (tok !== this.token) return;
      if (this.cv) this.img = img;
      else { this.el.style.backgroundImage = `url(${seq.src})`; this.el.style.setProperty('--n', seq.n); }
      this.seq = seq; this.i = 0; this.t = 0; this.show();
      if (reduced) { this.seq = null; seq.done?.(); return; }
      kick();
    }
    show() {
      if (!this.cv) { this.el.style.backgroundPosition = `${this.seq.n > 1 ? (this.i / (this.seq.n - 1)) * 100 : 0}% 0`; return; }
      const im = this.img, w = im.naturalWidth / this.seq.n, h = im.naturalHeight, c = this.cv;
      if (!w) return;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const x = c.getContext('2d'); x.clearRect(0, 0, w, h); x.drawImage(im, this.i * w, 0, w, h, 0, 0, w, h);
      if (!c.__on) { c.__on = true; c.parentElement.classList.add('live'); }
    }
    step(dt) {
      const s = this.seq, dur = (i) => (Array.isArray(s.ms) ? s.ms[i] : s.ms);
      this.t += dt;
      let moved = false;
      while (this.t >= dur(this.i)) {
        this.t -= dur(this.i);
        if (this.i + 1 >= s.n) {
          if (!s.loop) { this.seq = null; s.done?.(); return; }
          this.i = 0;
        } else this.i++;
        moved = true;
      }
      if (moved) this.show();
    }
  }

  // ---------- Titelbild: nach dem Laden der Seite gegen die lebende Fassung tauschen (Schleife, tools/titel-kampf.mjs)
  const heroImg = document.querySelector('.hero-bg img[data-live]');
  const slow = navigator.connection && (navigator.connection.saveData || /(^|-)2g|3g/.test(navigator.connection.effectiveType ?? ''));
  if (heroImg && !reduced && !slow) {
    const swap = () => setTimeout(() => {
      const im = new Image(); im.src = IMG + heroImg.dataset.live;
      (im.decode ? im.decode() : new Promise((r) => { im.onload = r; })).then(() => { heroImg.src = im.src; }, () => {});
    }, 600);
    if (document.readyState === 'complete') swap(); else addEventListener('load', swap, { once: true });
  }

  // ---------- Klassen: Kampf beim Wechsel, danach lebendige Ruhe und reihum die vier Fähigkeiten (oder die angeklickte)
  const F12 = 1000 / 12;
  const classFx = (panel) => {
    const fig = panel.querySelector('.fight');
    if (!fig) return null;
    if (fig.__ctl) return fig.__ctl;
    const cls = fig.dataset.cls, [nFight, nIdle, ...nSkill] = fig.dataset.n.split(' ').map(Number);
    const cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true'); fig.append(cv);
    const pl = new Strip(cv), lis = [...panel.querySelectorAll('.skills li')];
    let timer = 0, next = 0;
    const mark = (k) => lis.forEach((li, i) => li.classList.toggle('on', i === k));
    const idle = () => { mark(-1); pl.play({ src: `${IMG}ruhe-${cls}.webp`, n: nIdle, ms: F12, loop: true }); wait(); };
    const wait = () => { clearTimeout(timer); timer = setTimeout(() => (pl.visible && !panel.hidden ? skill(next) : wait()), 1100); };
    const skill = (k) => {
      clearTimeout(timer); next = (k + 1) % nSkill.length; mark(k);
      pl.play({ src: `${IMG}kampf-${cls}-${k + 1}.webp`, n: nSkill[k], ms: F12, done: idle });
    };
    const fight = () => { clearTimeout(timer); mark(-1); pl.play({ src: `${IMG}kampf-${cls}.webp`, n: nFight, ms: F12, done: idle }); };
    lis.forEach((li, k) => li.querySelector('button')?.addEventListener('click', () => skill(k)));
    // Fähigkeiten vorladen, sobald die Klasse gezeigt wird
    const preload = () => { for (let k = 0; k < nSkill.length; k++) loadImg(`${IMG}kampf-${cls}-${k + 1}.webp`); loadImg(`${IMG}ruhe-${cls}.webp`); };
    const stop = () => { clearTimeout(timer); mark(-1); };
    return (fig.__ctl = { fight, preload, stop });
  };
  const playFight = (panel) => {
    if (reduced || !panel) return;
    for (const p of $$('.cls-panel')) if (p !== panel) classFx(p)?.stop();
    const c = classFx(panel); c?.preload(); c?.fight();
    const fig = panel.querySelector('.hero-fig'); fig?.classList.remove('swap'); void fig?.offsetWidth; fig?.classList.add('swap');
  };
  const clsSec = document.querySelector('.classes');
  if (clsSec && 'IntersectionObserver' in window) {
    const io2 = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io2.disconnect();
      playFight(clsSec.querySelector('.cls-panel:not([hidden])'));
    }, { threshold: 0.45 });
    io2.observe(clsSec);
  }

  // ---------- Bosse: jeder kämpft auf dem Boden seines Gebiets (tools/bosse-buehne.mjs): Boden, darüber der Kampfstreifen
  // (Ruhe → Warnfläche → Angriff), dazu Teilchen in der Farbe seines Gebiets. Gezeichnet in Spielpixeln auf einer kleinen
  // Zeichenfläche, die CSS ganzzahlig vergrößert. Ohne Bewegung bleibt das Standbild stehen.
  const arena = document.querySelector('.arena');
  if (arena) {
    const FX = {
      // Teilchen je Gebiet: Farben, Richtung, Dichte
      wisp: { c: ['#9fe6c8', '#d8fff0', '#6fbfa0'], n: 16, vy: [-6, -2], vx: [-3, 3], life: [2.5, 4.5], glow: true },
      spore: { c: ['#a8e05a', '#d4f08a', '#7ab040'], n: 22, vy: [-7, -3], vx: [-4, 4], life: [2.5, 4], glow: true },
      snow: { c: ['#ffffff', '#d8ecff', '#a8d0ff'], n: 30, vy: [8, 16], vx: [-6, -1], life: [4, 7], glow: false, top: true },
      ember: { c: ['#ffd27a', '#ff8a30', '#ff5a1a'], n: 28, vy: [-16, -7], vx: [-4, 4], life: [1.5, 3], glow: true },
    };
    const rnd = (a) => a[0] + Math.random() * (a[1] - a[0]);
    const stages = $$('.boss', arena).map((fig, i) => {
      fig.style.setProperty('--i', i);
      const st = fig.querySelector('.stage'), cv = st.querySelector('canvas'), d = fig.dataset;
      const [w, h, n, fps] = d.f.split(' ').map(Number);
      const ground = new Image(), strip = new Image(), front = new Image();
      ground.src = `${IMG}boss-${d.boss}-boden.webp`;
      cv.width = w; cv.height = h;
      return { fig, st, cv, ctx: cv.getContext('2d'), w, h, n, fps, ground, strip, front, fx: FX[d.fx], parts: [], t: Math.random() * 0.5, vis: false, ready: false };
    });
    const fit = () => {
      const dpr = devicePixelRatio || 1, phone = innerWidth <= 820;
      for (const s of stages) {
        // Drei Diener nebeneinander, Malgareth groß darunter; alle ×2, nur wenn der Platz fehlt kleiner (Handy: wischbar)
        const main = s.fig.classList.contains('main');
        const room = phone ? innerWidth * 0.96 : main ? arena.clientWidth - 40 : arena.clientWidth / 3 - 16;
        const k = Math.max(1, Math.min(Math.floor((room * dpr) / s.w), Math.round(2 * dpr)));
        s.st.style.width = `${(s.w * k) / dpr}px`; s.st.style.height = `${(s.h * k) / dpr}px`;
      }
    };
    fit(); addEventListener('resize', fit);
    let px = 0, py = 0;   // Zeigerversatz für die Tiefe (−1 … 1)
    if (!reduced) arena.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; const r = arena.getBoundingClientRect(); px = ((e.clientX - r.left) / r.width) * 2 - 1; py = ((e.clientY - r.top) / r.height) * 2 - 1; });
    const draw = (s) => {
      const x = s.ctx, f = Math.floor(s.t * s.fps) % s.n;
      x.clearRect(0, 0, s.w, s.h);
      x.drawImage(s.ground, 0, 0);
      // Tiefe: hintere Teilchen weichen dem Zeiger leicht aus, vordere ziehen mit
      const ox = Math.round(-px * 2), oy = Math.round(-py);
      x.save(); x.translate(ox, oy);
      for (const q of s.parts) if (q.back) dot(x, q);
      x.restore();
      x.drawImage(s.strip, f * s.w, 0, s.w, s.h, 0, 0, s.w, s.h);
      x.drawImage(s.front, 0, 0);
      x.save(); x.translate(-ox * 2, -oy * 2);
      for (const q of s.parts) if (!q.back) dot(x, q);
      x.restore();
    };
    const dot = (x, q) => {
      const a = Math.min(1, q.life / 0.5, (q.max - q.life) / 0.8) * q.a;
      if (q.glow) { x.globalAlpha = a * 0.25; x.fillStyle = q.c; x.fillRect(Math.round(q.x) - 1, Math.round(q.y), 3, 1); x.fillRect(Math.round(q.x), Math.round(q.y) - 1, 1, 3); }
      x.globalAlpha = a; x.fillStyle = q.c; x.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s);
      x.globalAlpha = 1;
    };
    const step = (s, dt) => {
      s.t += dt;
      const F = s.fx;
      if (F) {
        if (s.parts.length < F.n && Math.random() < dt * F.n * 0.6) {
          const back = Math.random() < 0.55;
          s.parts.push({ x: Math.random() * s.w, y: F.top ? -2 : s.h * (0.45 + Math.random() * 0.5), vx: rnd(F.vx), vy: rnd(F.vy) * (back ? 0.7 : 1.2), life: 0, max: rnd(F.life), c: F.c[Math.floor(Math.random() * F.c.length)], a: back ? 0.55 : 0.95, s: back ? 1 : (Math.random() < 0.3 ? 2 : 1), back, glow: F.glow, ph: Math.random() * 6 });
        }
        for (const q of s.parts) { q.life += dt; q.x += (q.vx + Math.sin(q.life * 2 + q.ph) * 3) * dt; q.y += q.vy * dt; }
        s.parts = s.parts.filter((q) => q.life < q.max && q.y > -4 && q.y < s.h + 4);
      }
    };
    let last = 0, on = false;
    const tick = (t) => {
      const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
      let any = false;
      for (const s of stages) if (s.vis && s.ready) { step(s, dt); draw(s); any = true; }
      if (any) requestAnimationFrame(tick); else { on = false; last = 0; }
    };
    const kick = () => { if (!on && !reduced) { on = true; requestAnimationFrame(tick); } };
    const load = (s) => {
      if (s.loading) return; s.loading = true;
      s.strip.src = `${IMG}boss-${s.fig.dataset.boss}-kampf.webp`;
      s.front.src = `${IMG}boss-${s.fig.dataset.boss}-vorn.webp`;
      Promise.all([s.ground, s.strip, s.front].map((im) => (im.decode ? im.decode() : new Promise((r) => { im.onload = r; })))).then(() => {
        s.ready = true; s.st.classList.add('live'); draw(s); kick();
      }, () => {});
    };
    if ('IntersectionObserver' in window) {
      const io3 = new IntersectionObserver((es) => {
        for (const e of es) { const s = stages.find((q) => q.st === e.target); s.vis = e.isIntersecting; if (s.vis && !reduced) { load(s); kick(); } }
      }, { rootMargin: '200px 0px' });
      for (const s of stages) io3.observe(s.st);
      new IntersectionObserver(([e], o) => { if (e.isIntersecting) { arena.classList.add('in'); o.disconnect(); } }, { threshold: 0.2 }).observe(arena);
    } else arena.classList.add('in');
  }

  // ---------- Reittier-Parade: jedes Reittier in seiner Gangart (tools/reittiere-gang.mjs) über gekachelten Boden aus
  // Spielkacheln (tools/parade-boden.mjs) mit zwei Ebenen. Die Kamera zieht langsam mit, der Boden läuft darunter durch.
  // Gezeichnet in ganzen Bildschirmpunkten je Streifenpixel; unter der Bühne steht der Name des Tiers in der Mitte.
  const parade = document.querySelector('.parade');
  if (parade) {
    const cv = parade.querySelector('canvas'), ctx = cv.getContext('2d');
    const defs = $$('.parade-names li', parade).map((li) => {
      const [w, h, fx, fy, n, fps, fly, v] = li.dataset.f.split(' ').map(Number);
      const lift = (li.dataset.l ?? '').split(' ').filter(Boolean).map(Number);
      const glow = li.style.getPropertyValue('--glow').trim();
      const img = new Image(); img.src = `${IMG}gang-${li.dataset.m}.webp`;
      return { li, w, h, fx, fy, n, fps, fly, v, lift, img, glow: glow ? `rgb(${glow})` : null };
    });
    const layer = (src) => { const i = new Image(); i.src = `${IMG}${src}`; return i; };
    const near = layer('parade-nah.webp'), far = layer('parade-fern.webp');
    // Spielpixel: Laufhöhe, Gesamthöhe; Lauflinie im nahen Streifen, Versatz der fernen Ebene über der Lauflinie
    const BASE = +parade.dataset.base, H = +parade.dataset.h, NEAR_Y = +parade.dataset.nearY, FAR_Y = +parade.dataset.farY;
    const CAM = 22;   // Kamerafahrt (Spielpixel/s): naher Boden voll, ferne Ebene zu 40 %
    let wp = 4, W = 400, dpr = 1, runners = [], dust = [], nextAt = 0, qi = 0, last = 0, on = false, vis = false, clockT = 0, shown = null;
    const layout = () => {
      dpr = devicePixelRatio || 1;
      const wide = parade.clientWidth > 820;
      wp = 2 * Math.max(1, Math.round(((wide ? 4 : 3) * dpr) / 2));   // Bildschirmpunkte je Spielpixel (gerade: Streifen in 2× Auflösung)
      parade.style.setProperty('--ph', `${(H * wp) / dpr}px`);
      cv.width = Math.round(parade.clientWidth * dpr); cv.height = H * wp;
      W = cv.width / wp;
      ctx.imageSmoothingEnabled = false;
    };
    const speed = (d) => d.v - CAM;   // Geschwindigkeit auf dem Bildschirm
    const spawn = () => {
      const d = defs[qi++ % defs.length];
      runners.push({ d, x: -(d.w - d.fx) - 2, t: Math.random(), ph: Math.random() * 6 });
      // Abstand so wählen, dass ein schnelleres Tier das vorige nicht einholt
      const nx = defs[qi % defs.length], span = W + 80, gap = d.w + 30;
      return Math.max(gap / speed(d), span / speed(d) - span / speed(nx) + gap / speed(nx), 1.3);
    };
    const px = (x) => Math.round(x * wp);
    const shadow = (x, w, a) => {
      if (w < 2) return;
      ctx.fillStyle = `rgba(0, 0, 0, ${a})`;
      for (let r = -1; r <= 1; r++) { const hw = Math.round(w * Math.sqrt(1 - (r / 2) ** 2)); ctx.fillRect(px(x - hw), px(BASE + r), hw * 2 * wp, wp); }
    };
    const tile = (img, y, off) => {
      if (!img.complete || !img.naturalWidth) return;
      const tw = img.naturalWidth / 2, th = img.naturalHeight / 2;
      for (let x = -(((off % tw) + tw) % tw); x < W; x += tw) ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, px(x), px(y), tw * wp, th * wp);
    };
    const heightOf = (r) => {
      const d = r.d, f = Math.floor(r.t * d.fps) % d.n;
      return { f, lift: (d.lift[f] ?? 0) + (d.fly ? d.fly + 3 * Math.sin(clockT * 1.3 + r.ph) : 0) };
    };
    const draw = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      const cam = clockT * CAM;
      tile(far, BASE - FAR_Y, cam * 0.4);
      tile(near, BASE - NEAR_Y, cam);
      // Unten in den Seitenhintergrund ausblenden
      const fb = ctx.createLinearGradient(0, cv.height - px(16), 0, cv.height);
      fb.addColorStop(0, 'rgba(10, 5, 16, 0)'); fb.addColorStop(1, 'rgba(10, 5, 16, 1)');
      ctx.fillStyle = fb; ctx.fillRect(0, cv.height - px(16), cv.width, px(16));
      // Schatten werden mit der Höhe kleiner und blasser
      for (const r of runners) {
        const { lift } = heightOf(r), k = Math.max(0.5, 1 - lift / 60);
        shadow(r.x + (r.d.fly ? 2 : 0), r.d.w * (r.d.fly ? 0.34 : 0.32) * k, (r.d.fly ? 0.62 : 0.48) * k);
      }
      for (const q of dust) { ctx.globalAlpha = Math.max(0, 1 - q.life / q.max) * q.a; ctx.fillStyle = q.c; ctx.fillRect(px(q.x), px(q.y), wp, wp); }
      ctx.globalAlpha = 1;
      for (const r of [...runners].sort((a, b) => a.d.fly - b.d.fly)) {
        const d = r.d, { f, lift } = heightOf(r);
        if (!d.img.complete || !d.img.naturalWidth) continue;
        // Höhe aus dem Streifen ist schon eingebacken; nur die Flughöhe kommt dazu
        const up = d.fly ? Math.round(lift - (d.lift[f] ?? 0)) : 0;
        ctx.drawImage(d.img, f * d.w * 2, 0, d.w * 2, d.h * 2, px(r.x - d.fx), px(BASE - up - d.fy), d.w * wp, d.h * wp);
      }
      // Name: das Tier, das gerade der Mitte am nächsten ist
      let best = null, bd = W * 0.5;
      for (const r of runners) { const dd = Math.abs(r.x - r.d.fx + r.d.w / 2 - W / 2); if (dd < bd) { bd = dd; best = r.d; } }
      if (best !== shown) { shown?.li.classList.remove('on'); best?.li.classList.add('on'); shown = best; }
    };
    const update = (dt, fx) => {
      clockT += dt;
      if (clockT >= nextAt) nextAt = clockT + spawn();
      for (const r of runners) {
        r.x += speed(r.d) * dt; r.t += dt;
        if (!fx) continue;
        // Staub hinter den Läufern (bleibt auf dem Boden zurück), Funken/Schnee unter den legendären und den Fliegern
        const d = r.d, back = r.x - d.fx * 0.7, { lift } = heightOf(r);
        if (!d.fly && lift < 1 && Math.random() < dt * 26) dust.push({ x: back + Math.random() * 6, y: BASE - Math.random() * 2, vx: -CAM - 6 - Math.random() * 12, vy: -6 - Math.random() * 8, life: 0, max: 0.5 + Math.random() * 0.6, c: Math.random() < 0.5 ? '#6e5a48' : '#8f7a62', a: 0.7 });
        if (d.glow && Math.random() < dt * (d.fly ? 16 : 9)) dust.push({ x: r.x - d.fx * 0.4 + Math.random() * d.w * 0.6, y: BASE - lift - d.fy * (0.2 + Math.random() * 0.5), vx: -CAM - 10 - Math.random() * 10, vy: d.fly ? 10 + Math.random() * 10 : -10 - Math.random() * 10, life: 0, max: 0.6 + Math.random() * 0.8, c: d.glow, a: 0.95 });
      }
      // Sicherheitsabstand am Boden: niemand läuft durch das Tier vor ihm (Flieger haben ihre eigene Bahn)
      let ahead = null;
      for (const r of runners) {
        if (r.d.fly) continue;
        if (ahead) r.x = Math.min(r.x, ahead.x - ahead.d.fx - (r.d.w - r.d.fx) - 10);
        ahead = r;
      }
      for (const q of dust) { q.life += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 18 * dt; }
      dust = dust.filter((q) => q.life < q.max).slice(-260);
      runners = runners.filter((r) => r.x - r.d.fx < W + 4);
    };
    const tick = (t) => {
      if (!vis) { on = false; return; }
      const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
      update(dt, true);
      draw();
      requestAnimationFrame(tick);
    };
    layout();
    if (reduced) {
      // Ohne Bewegung: eine ruhige Aufstellung, Namen als Liste darunter
      parade.classList.add('still');
      const still = () => { layout(); runners = []; let x = 10; for (const d of defs) { if (x + d.w > W) break; runners.push({ d, x: x + d.fx, t: 0, ph: 0 }); x += d.w + 8; } draw(); };
      for (const im of [near, far, ...defs.map((d) => d.img)]) im.addEventListener('load', still, { once: true });
      addEventListener('resize', still); still();
    } else {
      // Bühne nicht leer beginnen: die Parade läuft unsichtbar schon eine Weile
      for (let i = 0; i < 30 * 9; i++) update(1 / 30, false);
      new IntersectionObserver(([e]) => { vis = e.isIntersecting; if (vis && !on) { on = true; last = 0; requestAnimationFrame(tick); } }, { rootMargin: '60px' }).observe(parade);
      addEventListener('resize', () => { layout(); });
    }
  }

  // ---------- Klassen: Reiter wechseln das Porträt (Pfeiltasten wie bei Tabs üblich)
  const tabs = $$('.cls-tabs [role="tab"]');
  const show = (tab, focus = false) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }
    // Glut hinter der Figur in der Farbe der Klasse
    document.querySelector('.classes')?.style.setProperty('--res', tab.style.getPropertyValue('--res'));
    if (focus) tab.focus();
    dispatchEvent(new Event('resize'));   // neu sichtbare Figur pixelgenau runden
    playFight(document.getElementById(tab.getAttribute('aria-controls')));
  };
  tabs.forEach((t, i) => {
    t.tabIndex = i === 0 ? 0 : -1;
    t.addEventListener('click', () => show(t));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); show(tabs[(i + d + tabs.length) % tabs.length], true); }
    });
  });

  // ---------- Bildbetrachter für die Aufnahmen
  const box = document.querySelector('.lightbox');
  if (box && typeof box.showModal === 'function') {
    const big = box.querySelector('img'), cap = box.querySelector('p');
    for (const el of $$('[data-zoom]')) {
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      const open = () => {
        const im = el.querySelector('img');
        big.src = im.currentSrc || im.src; big.alt = im.alt;
        big.classList.toggle('px', im.classList.contains('px'));
        cap.textContent = el.dataset.zoom;
        box.showModal();
        sizeBig();
      };
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    }
    // Größter ganzzahliger Faktor in Bildschirmpunkten, der ins Fenster passt
    const sizeBig = () => {
      const dpr = devicePixelRatio || 1, w = big.naturalWidth || 960, h = big.naturalHeight || 540;
      const n = Math.floor(Math.min((innerWidth * 0.96 * dpr) / w, (innerHeight * 0.84 * dpr) / h));
      big.style.width = n >= 1 ? `${(w * n) / dpr}px` : '';
      big.style.height = n >= 1 ? `${(h * n) / dpr}px` : '';
    };
    big.addEventListener('load', sizeBig);
    addEventListener('resize', () => { if (box.open) sizeBig(); });
    box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('button')) box.close(); });
  }

  // ---------- Spielszenen pixelgenau: nur ganzzahlige Vergrößerung in Bildschirmpunkten
  // Die Aufnahmen haben die native Auflösung des Spiels (960 × 540). CSS gibt je Bildschirmbreite einen
  // Faktor vor (--f); hier wird er auf ganze Bildschirmpunkte gerundet, so weit erhöht, dass das Bild seinen
  // Rahmen füllt, und der Ausschnitt (--fx/--fy = Bildpunkt, der an die Stelle --ax/--ay des Rahmens soll, sonst in die Mitte) auf ganze Punkte gesetzt.
  const shots = $$('img.shot');
  const mobile = matchMedia('(max-width: 820px)');
  const fitShots = () => {
    const dpr = devicePixelRatio || 1;
    for (const img of shots) {
      const frame = img.parentElement, cw = frame.clientWidth, ch = frame.clientHeight;
      if (!cw || !ch) continue;
      const w = Number(img.getAttribute('width')), h = Number(img.getAttribute('height'));
      const cs = getComputedStyle(img);
      const f = parseFloat(cs.getPropertyValue('--f')) || 2;
      let n = Math.max(1, Math.round(f * dpr));
      while ((w * n) / dpr < cw - 0.5 || (h * n) / dpr < ch - 0.5) n++;
      const k = n / dpr, iw = w * k, ih = h * k;
      // Handy: eigener Bildausschnitt (--mx/--my), sonst --fx/--fy
      const num = (k) => parseFloat(cs.getPropertyValue(k));
      const fx = (mobile.matches && num('--mx')) || num('--fx') || 0.5, fy = (mobile.matches && num('--my')) || num('--fy') || 0.5;
      const snap = (v) => Math.round(v * dpr) / dpr;
      const ax = parseFloat(cs.getPropertyValue('--ax')) || 0.5, ay = parseFloat(cs.getPropertyValue('--ay')) || 0.5;
      const left = snap(Math.min(0, Math.max(cw - iw, cw * ax - fx * iw)));
      const top = snap(Math.min(0, Math.max(ch - ih, ch * ay - fy * ih)));
      Object.assign(img.style, { width: `${iw}px`, height: `${ih}px`, left: `${left}px`, top: `${top}px` });
    }
  };
  if (shots.length) {
    let raf = 0;
    const queue = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fitShots); };
    fitShots();
    addEventListener('resize', queue);
    if ('ResizeObserver' in window) { const ro = new ResizeObserver(queue); for (const img of shots) ro.observe(img.parentElement); }
  }

  // ---------- Figuren und Symbole (img.px): CSS-Maße sind ganzzahlige Vielfache; bei krummer Bildschirmskalierung
  // (z. B. 125 %) auf ganze Bildschirmpunkte runden, damit jeder Spielpixel gleich breit bleibt.
  const figs = $$('img.px:not(.shot)');
  const fitFigs = () => {
    const dpr = devicePixelRatio || 1;
    for (const img of figs) {
      if (!img.naturalWidth) continue;
      img.style.width = img.style.height = '';
      const w = img.getBoundingClientRect().width;
      if (!w) continue;
      const k = (w / img.naturalWidth) * dpr, n = Math.max(1, Math.round(k));
      if (Math.abs(k - n) < 0.01) continue;
      img.style.width = `${(img.naturalWidth * n) / dpr}px`;
      img.style.height = `${(img.naturalHeight * n) / dpr}px`;
    }
    for (const f of $$('.fight')) {
      f.style.removeProperty('--s');
      const want = parseFloat(getComputedStyle(f).getPropertyValue('--s')) || 4, lay = f.closest('.cls-layout'), cs = lay && getComputedStyle(lay);
      const room = lay ? parseFloat(cs.gridTemplateColumns) : 1e4;   // Breite der Figurenspalte
      // Streifen in doppelter Detailauflösung: gerade Anzahl Bildpunkte je Weltpixel, damit jeder Bildpunkt gleich groß bleibt
      const k = Math.max(2, 2 * Math.min(Math.floor((want * dpr) / 2 + 0.01), Math.floor((room * dpr) / 208)));
      if (Math.abs(k / dpr - want) > 0.001) f.style.setProperty('--s', String(k / dpr));
    }
  };
  if (figs.length || document.querySelector('.fight')) {
    for (const img of figs) if (!img.complete) img.addEventListener('load', fitFigs, { once: true });
    fitFigs();
    let raf2 = 0;
    addEventListener('resize', () => { cancelAnimationFrame(raf2); raf2 = requestAnimationFrame(fitFigs); });
  }

  // ---------- Glutfunken über dem Titelbild (wie die Funken im Spiel, pixelig)
  // Wind aus der Mausbewegung: Funken weichen dem Zeiger aus und treiben mit (klingt schnell ab)
  let wind = 0, ptr = null;
  if (!reduced) addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; wind = Math.max(-40, Math.min(40, wind + e.movementX * 0.35)); ptr = { x: e.clientX, y: e.clientY, t: performance.now() }; }, { passive: true });
  for (const cv of reduced ? [] : $$('.embers')) {
    const ctx = cv.getContext('2d');
    const P = 3; // Pixelgröße der Funken
    let W = 0, H = 0, sparks = [], last = 0, running = true;
    const resize = () => { W = cv.width = Math.ceil(cv.clientWidth / P); H = cv.height = Math.ceil(cv.clientHeight / P); };
    const spawn = (y = H + 2) => ({ x: Math.random() * W, y, vy: 6 + Math.random() * 14, drift: (Math.random() - 0.5) * 6, life: 0, max: 4 + Math.random() * 7, phase: Math.random() * 6.28 });
    resize();
    // auch wenn der Bereich erst später sichtbar wird (Newsletter nach der Statusabfrage)
    if ('ResizeObserver' in window) new ResizeObserver(() => { const was = H; resize(); if (!was && H) sparks = sparks.map(() => spawn(Math.random() * H)); }).observe(cv);
    else addEventListener('resize', resize);
    sparks = Array.from({ length: Number(cv.dataset.n) || 70 }, () => spawn(Math.random() * H));
    const COLORS = ['#fff2b0', '#ffd46a', '#ffa030', '#ef6a1c', '#b02e10'];
    new IntersectionObserver(([e]) => { running = e.isIntersecting; if (running) requestAnimationFrame(tick); }).observe(cv);
    function tick(t) {
      if (!running) return;
      const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
      ctx.clearRect(0, 0, W, H);
      wind *= Math.pow(0.12, dt);
      const r = cv.getBoundingClientRect(), near = ptr && performance.now() - ptr.t < 400 ? { x: (ptr.x - r.left) / P, y: (ptr.y - r.top) / P } : null;
      for (const s of sparks) {
        s.life += dt; s.y -= s.vy * dt; s.x += (s.drift + wind * (0.6 + (s.phase % 1)) + Math.sin(s.life * 2 + s.phase) * 4) * dt;
        if (near) { const dx = s.x - near.x, dy = s.y - near.y, d2 = dx * dx + dy * dy; if (d2 < 900) { const k = (1 - d2 / 900) * 60 * dt; s.x += Math.sign(dx) * k; s.y += Math.sign(dy) * k * 0.5; } }
        const k = s.life / s.max;
        if (k >= 1 || s.y < -2) { Object.assign(s, spawn()); continue; }
        ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
        ctx.fillStyle = COLORS[Math.min(COLORS.length - 1, Math.floor(k * COLORS.length))];
        ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(tick);
    }
  }

  // ---------- Formulare (Support, Newsletter) → Worker unter /net/ (worker/forms.js)
  const FORMS_API = cfg.formsApi ?? '/net';
  const shownAt = performance.now();
  const post = async (path, body) => {
    const r = await fetch(`${FORMS_API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, t: Math.round(performance.now() - shownAt) }) });
    let data = {};
    try { data = await r.json(); } catch { /* leer */ }
    return { ok: r.ok && data.ok, status: r.status, data };
  };
  const say = (form, text, kind) => {
    const msg = form.querySelector('.form-msg');
    msg.textContent = text; msg.hidden = !text; msg.dataset.kind = kind ?? '';
  };
  const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

  const sup = document.querySelector('[data-form="support"]');
  if (sup) {
    // Kurz und lesbar statt des ganzen User-Agents, z. B. „Chrome 129, Windows“ (der Spieler kann es ändern).
    const deviceGuess = () => {
      const ua = navigator.userAgent;
      const b = [['Edg/', 'Edge'], ['OPR/', 'Opera'], ['SamsungBrowser/', 'Samsung Internet'], ['Firefox/', 'Firefox'], ['FxiOS/', 'Firefox'], ['CriOS/', 'Chrome'], ['Chrome/', 'Chrome'], ['Version/', 'Safari']]
        .find(([k]) => ua.includes(k));
      const browser = b ? `${b[1]} ${(ua.split(b[0])[1] ?? '').split(/[.\s]/)[0]}`.trim() : '';
      const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
        : /Mac OS X/.test(ua) ? (navigator.maxTouchPoints > 1 ? 'iPad' : 'Mac') : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : '';
      return [browser, os].filter(Boolean).join(', ');
    };
    const F = (n) => sup.elements.namedItem(n);
    const kindNow = () => sup.querySelector('input[name="kind"]:checked')?.value ?? 'kontakt';
    const label = sup.querySelector('[data-label-message]');
    const applyKind = () => {
      const k = kindNow();
      for (const el of $$('[data-for]', sup.closest('.help') ?? sup)) el.hidden = !el.dataset.for.split(' ').includes(k);
      label.innerHTML = k === 'fehler' || k === 'melden' ? 'Was ist passiert?' : k === 'loeschen' ? 'Anmerkung <i>(freiwillig)</i>' : 'Nachricht';
      F('message').required = k !== 'loeschen';
      F('reported').required = k === 'melden';
      if (k === 'fehler' && !F('device').value) F('device').value = deviceGuess();
    };
    const want = new URLSearchParams(location.search).get('anliegen');
    const pre = want && sup.querySelector(`input[name="kind"][value="${CSS.escape(want)}"]`);
    if (pre) pre.checked = true;
    for (const r of $$('input[name="kind"]', sup)) r.addEventListener('change', applyKind);
    applyKind();
    // Fehlermeldung verschwindet, sobald das Feld stimmt
    const check = {
      email: () => emailOk(F('email').value.trim()),
      reported: () => kindNow() !== 'melden' || F('reported').value.trim().length >= 2,
      message: () => kindNow() === 'loeschen' || F('message').value.trim().length >= 10,
    };
    for (const f of Object.keys(check)) F(f).addEventListener('input', () => {
      if (F(f).getAttribute('aria-invalid') === 'true' && check[f]()) { F(f).setAttribute('aria-invalid', 'false'); sup.querySelector(`[data-err="${f}"]`).classList.remove('on'); }
    });
    sup.addEventListener('submit', async (e) => {
      e.preventDefault();
      const k = kindNow();
      const bad = Object.fromEntries(Object.entries(check).map(([f, ok]) => [f, !ok()]));
      for (const [f, on] of Object.entries(bad)) { F(f).setAttribute('aria-invalid', String(on)); sup.querySelector(`[data-err="${f}"]`).classList.toggle('on', on); }
      const first = Object.keys(bad).find((f) => bad[f]);
      if (first) { F(first).focus(); return; }
      const btn = sup.querySelector('button[type="submit"]');
      btn.disabled = true; say(sup, 'Wird gesendet …');
      try {
        const res = await post('/forms/support', {
          kind: k, name: F('name').value, email: F('email').value, message: F('message').value, website: F('website').value,
          character: k === 'kontakt' ? '' : F('character').value, device: k === 'fehler' ? F('device').value : '',
          reported: k === 'melden' ? F('reported').value : '', place: k === 'melden' ? F('place').value : '',
        });
        if (res.ok) {
          sup.reset(); sup.querySelector(`input[name="kind"][value="${k}"]`).checked = true; applyKind();
          say(sup, {
            loeschen: 'Danke. Wir schreiben dir an deine Adresse, um die Löschung zu bestätigen.',
            melden: 'Danke, deine Meldung ist angekommen. Wir prüfen sie und schreiben dir, was wir entschieden haben.',
          }[k] ?? 'Danke, deine Nachricht ist angekommen. Wir melden uns per E\u2011Mail.', 'ok');
        } else if (res.status === 429) say(sup, 'Zu viele Anfragen in kurzer Zeit. Bitte versuch es in ein paar Minuten noch einmal.', 'err');
        else throw new Error(String(res.status));
      } catch {
        say(sup, 'Das hat gerade nicht geklappt. Schreib uns bitte direkt an support@emberwrath.com.', 'err');
      } finally { btn.disabled = false; }
    });
  }

  // Newsletter: Formular erscheint nur, wenn Versand und Speicher eingerichtet sind. Auf der Rückmeldeseite
  // nur nach einem abgelaufenen Link (dort ist die erneute Anmeldung gerade gefragt).
  const nlState = new URLSearchParams(location.search).get('s');
  const news = document.querySelector('[data-nl-title]') && nlState !== 'ungueltig' ? [] : $$('[data-newsletter]');
  if (news.length) {
    fetch(`${FORMS_API}/newsletter/status`).then((r) => (r.ok ? r.json() : {})).then((d) => {
      if (d.enabled) for (const el of news) el.hidden = false;
    }).catch(() => {});
    for (const form of $$('[data-form="newsletter"]')) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = form.elements.namedItem('email').value.trim();
        if (!emailOk(email)) { form.elements.namedItem('email').setAttribute('aria-invalid', 'true'); say(form, 'Bitte eine gültige E\u2011Mail-Adresse angeben.', 'err'); form.elements.namedItem('email').focus(); return; }
        form.elements.namedItem('email').removeAttribute('aria-invalid');
        const btn = form.querySelector('button');
        btn.disabled = true; say(form, 'Wird gesendet …');
        try {
          const res = await post('/newsletter/subscribe', { email, website: form.elements.namedItem('website').value, source: location.pathname });
          if (res.ok) { form.reset(); say(form, 'Fast geschafft: Bitte bestätige die Anmeldung über den Link in der E\u2011Mail, die wir dir gerade geschickt haben.', 'ok'); }
          else if (res.status === 429) say(form, 'Zu viele Anfragen in kurzer Zeit. Bitte versuch es später noch einmal.', 'err');
          else throw new Error(String(res.status));
        } catch {
          say(form, 'Das hat gerade nicht geklappt. Bitte versuch es später noch einmal.', 'err');
        } finally { btn.disabled = false; }
      });
    }
  }

  // Rückmeldeseite /newsletter?s=… und Zwischenschritt ?aktion=bestaetigen|abmelden&token=…
  // (der Link in der Mail ändert selbst nichts, erst der Knopf schickt die Anfrage ab)
  const nlTitle = document.querySelector('[data-nl-title]');
  const nlQ = new URLSearchParams(location.search);
  const nlAct = { bestaetigen: ['Anmeldung bestätigen', 'Ein Klick noch, dann bekommst du Neuigkeiten aus Emberwrath.', 'Jetzt bestätigen', '/newsletter/confirm'],
    abmelden: ['Newsletter abbestellen', 'Willst du keine E\u2011Mails mehr von uns bekommen?', 'Abmelden', '/newsletter/unsubscribe'] }[nlQ.get('aktion')];
  const nlForm = document.querySelector('[data-nl-step]');
  if (nlTitle && nlAct && nlForm && nlQ.get('token')) {
    const token = nlQ.get('token');
    nlTitle.textContent = nlAct[0]; document.querySelector('[data-nl-text]').textContent = nlAct[1]; document.title = `${nlAct[0]} – Emberwrath`;
    const btn = nlForm.querySelector('button');
    btn.textContent = nlAct[2]; nlForm.hidden = false; document.querySelector('.nl-actions')?.setAttribute('hidden', '');
    nlForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      btn.disabled = true;
      let st = 'fehler';
      try {
        if (nlAct[3] === '/newsletter/confirm') st = (await post(nlAct[3], { token })).data.s || st;
        else {
          const r = await fetch(`${FORMS_API}${nlAct[3]}?token=${encodeURIComponent(token)}`, { method: 'POST' });
          st = (await r.json().catch(() => ({}))).s || st;
        }
      } catch { /* bleibt fehler */ }
      location.replace(`newsletter?s=${encodeURIComponent(st)}`);
    });
  }
  if (nlTitle) {
    const MSG = {
      bestaetigt: ['Du bist dabei.', 'Danke für die Bestätigung. Ab jetzt bekommst du Neuigkeiten aus Emberwrath. Abmelden kannst du dich jederzeit über den Link in jeder E\u2011Mail.'],
      abgemeldet: ['Du bist abgemeldet.', 'Du bekommst keinen Newsletter mehr von uns. Wenn du es dir anders überlegst, kannst du dich unten auf der Startseite wieder anmelden.'],
      ungueltig: ['Dieser Link gilt nicht mehr.', 'Der Link ist abgelaufen oder wurde schon benutzt. Melde dich unten einfach noch einmal an, dann bekommst du einen neuen.'],
      fehler: ['Das hat nicht geklappt.', 'Bitte versuch es später noch einmal oder schreib uns an support@emberwrath.com.'],
    }[new URLSearchParams(location.search).get('s')];
    if (MSG) { nlTitle.textContent = MSG[0]; document.querySelector('[data-nl-text]').textContent = MSG[1]; document.title = `${MSG[0]} – Emberwrath`; }
  }

  // ---------- Spieler online: Summe aller Welten aus /net/status, erst ab ein paar Spielern
  const online = document.querySelector('[data-online]');
  if (online) {
    fetch(`${FORMS_API}/status`).then((r) => (r.ok ? r.json() : {})).then((d) => {
      let n = 0;
      for (const worlds of Object.values(d.zones ?? {})) for (const v of Object.values(worlds)) n += Number(v) || 0;
      if (n < (cfg.onlineMin ?? 5)) return;
      online.querySelector('span').textContent = `${n.toLocaleString('de-DE')} Spieler gerade online`;
      online.hidden = false;
    }).catch(() => {});
  }

  // ---------- Jahr in der Fußzeile
  for (const el of $$('[data-year]')) el.textContent = new Date().getFullYear();
})();
