// Shop-Seite (site/shop.html): Bühnen für Klassen-Sets und Reittiere, Kauf mit dem Konto aus dem Spiel. Ohne Abhängigkeiten.
// Anmeldung: dieselbe Sitzung wie das Spiel (localStorage 'emberwrath:online:session', Format von src/online/AuthClient.js).
// Kaufen: POST /net/shop/checkout (worker/shop.js) → Stripe. Gutgeschrieben wird nur nach dem Webhook von Stripe;
// Gekauftes kommt beim nächsten Spielstart ins Spiel (src/shop/index.js, claim()).
// Kaufbar ist nur, was /net/shop/status nennt (products, designs und weitere Listen mit id); alles andere zeigt „Bald erhältlich“.
(() => {
  // Öffentliche Werte wie in src/online/config.js (publishable-Schlüssel, kein Geheimnis).
  const SUPABASE_URL = 'https://mgjhllqnelqbdqfvczls.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_K_fTi48XiEfx4wB8vTOjeA_oFeyqiFq';
  const SESSION_KEY = 'emberwrath:online:session';
  const IMG = document.querySelector('.brand img')?.getAttribute('src')?.replace(/logo\.png$/, '') ?? 'img/';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rgb = (el) => el.style.getPropertyValue('--glow').trim();
  const nums = (s) => (s ?? '').split(' ').filter(Boolean).map(Number);
  const cfg = window.EW_SITE ?? {};

  // ---------- Pixelbühne: Canvas in ganzen Bildschirmpunkten je Spielpixel (gerade, weil die Bilder in 2× Auflösung sind)
  function stage(cv, H, cssK, fit = false) {
    const ctx = cv.getContext('2d');
    const st = { ctx, wp: 4, W: 100, H };
    st.layout = () => {
      const dpr = devicePixelRatio || 1, k = cssK(cv.parentElement.clientWidth);
      // fit: k ist eine Höchstgrenze (Bühne muss in die Höhe passen), also abrunden statt runden
      st.wp = 2 * Math.max(1, (fit ? Math.floor : Math.round)((k * dpr) / 2 + (fit ? 0.01 : 0)));
      cv.parentElement.style.setProperty(cv.dataset.var ?? '--ph', `${(H * st.wp) / dpr}px`);
      cv.width = Math.round(cv.parentElement.clientWidth * dpr); cv.height = H * st.wp;
      st.W = cv.width / st.wp;
      ctx.imageSmoothingEnabled = false;
    };
    st.px = (x) => Math.round(x * st.wp);
    // Bild in 2× Auflösung: Ausschnitt (sx, sy, w, h in Spielpixeln) an Spielposition (x, y)
    st.blit = (img, sx, sy, w, h, x, y) => ctx.drawImage(img, sx * 2, sy * 2, w * 2, h * 2, st.px(x), st.px(y), w * st.wp, h * st.wp);
    st.rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(st.px(Math.round(x * 2) / 2), st.px(Math.round(y * 2) / 2), Math.round(w * st.wp), Math.round(h * st.wp)); };
    return st;
  }
  const loop = (el, step) => {
    let vis = false, on = false, last = 0;
    const tick = (t) => {
      if (!vis) { on = false; return; }
      const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
      step(dt);
      requestAnimationFrame(tick);
    };
    new IntersectionObserver(([e]) => { vis = e.isIntersecting; if (vis && !on) { on = true; last = 0; requestAnimationFrame(tick); } }, { rootMargin: '80px' }).observe(el);
  };
  const loadImg = (src) => { const i = new Image(); i.src = src; return i; };

  // ---------- Klassen-Sets: Held auf dem Podest, „Vorher“ ↔ „Im Set“ als Verwandlung von unten nach oben mit glühender Kante
  const setSec = $('#sets'), setStage = $('[data-set-stage]');
  if (setSec && setStage) {
    const cv = $('canvas', setStage); cv.dataset.var = '--sh';
    // Breite bestimmt den Maßstab; auf niedrigen Bildschirmen (Handy quer) passt die Bühne in die Höhe
    const st = stage(cv, 50, (w) => Math.min(w > 480 ? 10 : w > 420 ? 9 : w > 340 ? 7 : 6, Math.max(4, (innerHeight - 95) / 50)), true);
    const BASE = 43;   // Fußlinie in Spielpixeln; die Figur füllt gut drei Viertel der Bühne
    const tabs = $$('.set-tabs [role="tab"]'), switches = $$('.set-switch button');
    const imgs = {}, scratch = document.createElement('canvas'), sctx = scratch.getContext('2d');
    let cur = null, look = 1, from = 1, prog = 1, clock = 0, motes = [], pending = 0;
    const def = (panel) => {
      const [w, h, fx, fy, n, fps] = nums(panel.dataset.f);
      const cls = panel.dataset.cls;
      imgs[cls] ??= loadImg(`${IMG}set-${cls}.webp`);
      return { panel, cls, w, h, fx, fy, n, fps, img: imgs[cls], glow: rgb(panel) };
    };
    const glowC = (a) => `rgba(${cur.glow}, ${a})`;
    const drawDais = () => {
      const cx = Math.round(st.W / 2), on = look || prog < 1 ? 1 : 0.45;
      // Lichtsäule hinter dem Helden in harten Stufen, nach oben schwächer
      for (let i = 0; i < 6; i++) {
        const y0 = BASE - 6 - i * 8, a = (0.07 - i * 0.011) * on;
        if (a <= 0) break;
        st.rect(cx - 10, y0 - 8, 20, 8, glowC(a * 0.6));
        st.rect(cx - 5, y0 - 8, 10, 8, glowC(a));
      }
      // Lichtlache um das Podest
      for (const [rx, ry, a] of [[26, 5, 0.05], [21, 4, 0.06]]) {
        for (let y = -ry; y <= ry; y++) { const hw = Math.round(rx * Math.sqrt(1 - (y / (ry + 0.5)) ** 2)); st.rect(cx - hw, BASE + 2 + y, hw * 2, 1, glowC(a * on)); }
      }
      // Podest: Seitenwand aus Steinquadern, Glutfuge unten, Deckplatte als Ellipse
      const RX = 15, RY = 3;
      for (let y = 0; y < 4; y++) {
        const hw = RX - (y === 3 ? 1 : 0);
        st.rect(cx - hw, BASE + RY - 1 + y, hw * 2, 1, y === 0 ? '#2b2134' : '#1d1525');
        if (y > 0 && y < 3) for (let x = -RX + 3 + (y % 2) * 3; x < RX; x += 6) st.rect(cx + x, BASE + RY - 1 + y, 1, 1, '#110b17');
      }
      st.rect(cx - RX + 1, BASE + RY + 3, RX * 2 - 2, 1, glowC(0.55 * on));
      for (let y = -RY; y <= RY; y++) {
        const hw = Math.round(RX * Math.sqrt(1 - (y / (RY + 0.5)) ** 2));
        st.rect(cx - hw, BASE + y, hw * 2, 1, y === -RY ? '#4a3c56' : y < 0 ? '#382c43' : y < 2 ? '#30263a' : '#2a2133');
      }
      // Runenring auf der Platte, flackert sacht
      const k = 0.6 + 0.25 * Math.sin(clock * 2.2);
      for (let i = 0; i < 24; i++) {
        if (i % 4 === 3) continue;
        const a = (i / 24) * Math.PI * 2, x = Math.round(Math.cos(a) * (RX - 4)), y = Math.round(Math.sin(a) * (RY - 1));
        st.rect(cx + x, BASE + y, 1, 1, glowC(k * on));
      }
    };
    const drawHero = () => {
      const d = cur;
      if (!d.img.complete || !d.img.naturalWidth) return;
      const f = Math.floor(clock * d.fps) % d.n, x = st.W / 2 - d.fx, y = BASE - d.fy;
      if (prog >= 1) { st.blit(d.img, f * d.w, look * d.h, d.w, d.h, x, y); return; }
      // Verwandlung: unterhalb der Kante das neue Aussehen, darüber das alte
      const edge = Math.round(d.h * (1 - prog));
      if (edge > 0) st.blit(d.img, f * d.w, from * d.h, d.w, edge, x, y);
      if (edge < d.h) st.blit(d.img, f * d.w, look * d.h + edge, d.w, d.h - edge, x, y + edge);
      // Glühende Kante in Form der Figur: 1 Spielpixel Zeile des neuen Bildes, eingefärbt
      const row = Math.min(d.h - 1, edge);
      scratch.width = d.w * 2; scratch.height = 2;
      sctx.clearRect(0, 0, scratch.width, 2);
      sctx.drawImage(d.img, f * d.w * 2, (look * d.h + row) * 2, d.w * 2, 2, 0, 0, d.w * 2, 2);
      sctx.globalCompositeOperation = 'source-in'; sctx.fillStyle = `rgb(${d.glow})`; sctx.fillRect(0, 0, scratch.width, 2);
      sctx.globalCompositeOperation = 'source-over';
      st.ctx.drawImage(scratch, 0, 0, d.w * 2, 2, st.px(x), st.px(y + row), d.w * st.wp, st.wp);
      if (Math.random() < 0.9) motes.push({ x: x + Math.random() * d.w, y: y + row, vx: (Math.random() - 0.5) * 10, vy: -8 - Math.random() * 14, life: 0, max: 0.5 + Math.random() * 0.5, hot: true });
    };
    // Funke deckend, verglüht in harten Stufen: weiß → Farbe des Sets → dunkle Glut
    const mote = (m) => {
      const t = m.life / m.max;
      st.rect(m.x, m.y, 0.5, 0.5, m.hot && t < 0.3 ? '#fff4d0' : t < 0.65 ? `rgb(${cur.glow})` : `rgb(${cur.glow.split(',').map((v) => Math.round(v * 0.45)).join(',')})`);
    };
    const draw = () => {
      st.ctx.clearRect(0, 0, cv.width, cv.height);
      if (!cur) return;
      drawDais();
      for (const m of motes) if (m.y <= BASE - 2) mote(m);
      drawHero();
      for (const m of motes) if (m.y > BASE - 2) mote(m);
    };
    const step = (dt) => {
      clock += dt;
      if (pending > 0 && (pending -= dt) <= 0) morph(1);
      if (prog < 1) prog = Math.min(1, prog + dt / 0.8);
      // Glutfunken steigen vom Podest auf (im Set mehr)
      if (Math.random() < dt * (look ? 9 : 3)) motes.push({ x: st.W / 2 + (Math.random() - 0.5) * 30, y: BASE + 1, vx: (Math.random() - 0.5) * 3, vy: -6 - Math.random() * 8, life: 0, max: 1.6 + Math.random() * 2 });
      for (const m of motes) { m.life += dt; m.x += m.vx * dt + Math.sin((m.life + m.max) * 3) * 0.04; m.y += m.vy * dt; }
      motes = motes.filter((m) => m.life < m.max).slice(-140);
      draw();
    };
    const morph = (to) => {
      pending = 0;
      for (const b of switches) b.setAttribute('aria-pressed', String(+b.dataset.look === to));
      if (to === look && prog >= 1) return;
      from = look; look = to; prog = reduced ? 1 : 0;
      if (reduced) draw();
    };
    const show = (tab, focus = false) => {
      for (const t of tabs) {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      }
      if (focus) tab.focus();
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      cur = def(panel);
      setSec.style.setProperty('--glow', cur.glow);
      motes = [];
      // Jede Klasse zeigt einmal die Verwandlung: kurz im Alltagsgewand, dann im Set
      if (reduced) { look = 1; prog = 1; morph(1); cur.img.addEventListener('load', draw, { once: true }); draw(); }
      else { look = 0; from = 0; prog = 1; pending = 0.7; for (const b of switches) b.setAttribute('aria-pressed', String(b.dataset.look === '0')); }
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => show(t));
      t.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); show(tabs[(i + d + tabs.length) % tabs.length], true); }
      });
    });
    for (const b of switches) b.addEventListener('click', () => morph(+b.dataset.look));
    for (const p of $$('.set-panel')) def(p);   // Bilder vorladen (klein)
    st.layout();
    addEventListener('resize', () => { st.layout(); draw(); });
    show(tabs[0]);
    if (!reduced) loop(setStage, step);
  }

  // ---------- Exklusive Reittiere: Schaulauf wie die Parade der Startseite. Das gewählte Tier läuft in der Mitte,
  // der Boden zieht darunter durch; beim Wechsel läuft das alte hinaus und das neue von links herein.
  const show = $('[data-show]');
  const cards = $$('.mount-list [role="tab"]');
  if (show && cards.length) {
    const cv = $('canvas', show);
    const BASE = +show.dataset.base, H = +show.dataset.h, NEAR_Y = +show.dataset.nearY, FAR_Y = +show.dataset.farY;
    const st = stage(cv, H, (w) => (w > 1100 ? 5 : w > 700 ? 4 : 3));
    const defs = cards.map((c) => {
      const [w, h, fx, fy, n, fps, fly, v] = nums(c.dataset.f);
      return { card: c, w, h, fx, fy, n, fps, fly, v, lift: nums(c.dataset.l), img: loadImg(`${IMG}gang-${c.dataset.m}.webp`), glow: rgb(c) };
    });
    const near = loadImg(`${IMG}parade-nah.webp`), far = loadImg(`${IMG}parade-fern.webp`);
    let runners = [], dust = [], cam = 0, clock = 0, sel = 0;
    const center = (d) => st.W / 2 + d.fx - d.w / 2;
    const tile = (img, y, off) => {
      if (!img.complete || !img.naturalWidth) return;
      const tw = img.naturalWidth / 2, th = img.naturalHeight / 2;
      for (let x = -(((off % tw) + tw) % tw); x < st.W; x += tw) st.ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, st.px(x), st.px(y), tw * st.wp, th * st.wp);
    };
    // Schatten als Pixelraster: Kern deckend, Rand im Schachbrett (keine Halbtransparenz)
    const shadow = (x, w, airy) => {
      if (w < 2) return;
      const x0 = Math.round(x);
      for (let r = -1; r <= 1; r++) {
        const hw = Math.round(w * Math.sqrt(1 - (r / 2) ** 2)), core = airy ? 0 : r ? hw - 3 : hw - 2;
        for (let i = -hw; i < hw; i++) if (Math.abs(i + 0.5) < core || (i + r) % 2 === 0) st.rect(x0 + i, BASE + r, 1, 1, '#1a110c');
      }
    };
    const lift = (r) => {
      const d = r.d, f = Math.floor(r.t * d.fps) % d.n;
      return { f, lift: (d.lift[f] ?? 0) + (d.fly ? d.fly + 3 * Math.sin(clock * 1.3) : 0) };
    };
    const draw = () => {
      st.ctx.clearRect(0, 0, cv.width, cv.height);
      tile(far, BASE - FAR_Y, cam * 0.4);
      tile(near, BASE - NEAR_Y, cam);
      // Unterkante hart: zwei Reihen Schachbrett, dann Seitengrund
      const W = Math.ceil(st.W);
      st.rect(0, H - 2, W, 2, '#05020a');
      for (let r = 3; r <= 4; r++) for (let i = (r % 2); i < W; i += 2) st.rect(i, H - r, 1, 1, '#05020a');
      for (const r of runners) { const { lift: l } = lift(r), k = Math.max(0.5, 1 - l / 60); shadow(r.x + (r.d.fly ? 2 : 0), r.d.w * (r.d.fly ? 0.26 : 0.32) * k, !!r.d.fly); }
      for (const q of dust) st.rect(Math.round(q.x), Math.round(q.y), 1, 1, q.life > q.max * 0.6 && q.dim ? q.dim : q.c);
      for (const r of runners) {
        const d = r.d, { f, lift: l } = lift(r);
        if (!d.img.complete || !d.img.naturalWidth) continue;
        const up = d.fly ? Math.round(l - (d.lift[f] ?? 0)) : 0;
        st.blit(d.img, f * d.w, 0, d.w, d.h, Math.round(r.x - d.fx), BASE - up - d.fy);
      }
    };
    const update = (dt, fx = true) => {
      clock += dt;
      const lead = runners.find((r) => r.d === defs[sel]) ?? runners[0];
      const v = lead ? lead.d.v : 80;
      cam += v * dt;
      for (const r of runners) {
        r.t += dt;
        // Bildschirmtempo: das gewählte Tier gleitet zur Mitte, das alte beschleunigt hinaus
        const target = r.out ? st.W + r.d.w + 20 : center(r.d);
        r.vx = r.out ? Math.min(160, (r.vx ?? 0) + 260 * dt) : (target - r.x) * 2.2;
        r.x += r.vx * dt;
        if (!fx) continue;
        const d = r.d, back = r.x - d.fx * 0.7, { lift: l } = lift(r);
        if (!d.fly && l < 1 && Math.random() < dt * 26) dust.push({ x: back + Math.random() * 6, y: BASE - Math.random() * 2, vx: -v - 6 - Math.random() * 12, vy: -6 - Math.random() * 8, life: 0, max: 0.5 + Math.random() * 0.6, c: Math.random() < 0.5 ? '#6e5a48' : '#8f7a62', dim: '#4a3c30' });
        if (Math.random() < dt * (d.fly ? 22 : 14)) dust.push({ x: r.x - d.fx * 0.4 + Math.random() * d.w * 0.6, y: BASE - l - d.fy * (0.2 + Math.random() * 0.5), vx: -v * 0.6 - 10 - Math.random() * 10, vy: d.fly ? 10 + Math.random() * 10 : -10 - Math.random() * 10, life: 0, max: 0.6 + Math.random() * 0.8, c: `rgb(${d.glow})`, dim: `rgb(${d.glow.split(',').map((v) => Math.round(v * 0.5)).join(',')})` });
      }
      for (const q of dust) { q.life += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 18 * dt; }
      dust = dust.filter((q) => q.life < q.max).slice(-260);
      runners = runners.filter((r) => !r.out || r.x - r.d.fx < st.W + 4);
    };
    const select = (i, focus = false) => {
      if (i === sel && runners.length) return;
      sel = i;
      cards.forEach((c, k) => { c.setAttribute('aria-selected', String(k === i)); c.tabIndex = k === i ? 0 : -1; });
      if (focus) cards[i].focus();
      show.style.setProperty('--glow', defs[i].glow);
      for (const r of runners) r.out = true;
      const d = defs[i];
      runners.push({ d, x: reduced ? center(d) : -(d.w - d.fx) - 4, t: 0, vx: 0 });
      if (reduced) { runners = runners.filter((r) => !r.out); draw(); }
    };
    cards.forEach((c, i) => {
      c.addEventListener('click', () => select(i));
      c.addEventListener('keydown', (e) => {
        if (e.target !== c) return;
        const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (d) { e.preventDefault(); select((i + d + cards.length) % cards.length, true); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); }
      });
    });
    st.layout();
    sel = -1; select(0);
    runners[0].x = center(defs[0]);
    if (reduced) {
      for (const im of [near, far, ...defs.map((d) => d.img)]) im.addEventListener('load', draw, { once: true });
      addEventListener('resize', () => { st.layout(); for (const r of runners) r.x = center(r.d); draw(); });
      draw();
    } else {
      for (let i = 0; i < 30; i++) update(1 / 30, false);
      addEventListener('resize', () => { st.layout(); });
      loop(show, (dt) => { update(dt); draw(); });
    }
  }

  // ---------- Kaufen
  const state = $('[data-shop-state]');
  const dlg = $('[data-buy-dlg]');
  const errorBox = $('[data-shop-error]');
  const waiver = $('[data-waiver]');
  const charField = $('[data-char-field]');
  const charSelect = $('[data-char-select]');
  const goBtn = $('[data-dlg-go]');
  const dlgLogin = $('[data-shop-login-dlg]');
  if (cfg.loginUrl) dlgLogin.href = cfg.loginUrl;

  const ERRORS = {
    auth: 'Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.',
    closed: 'Der Shop öffnet in Kürze.',
    unavailable: 'Der Shop öffnet in Kürze.',
    waiver: 'Bitte bestätige zuerst den Hinweis zum Widerrufsrecht.',
    blocked: 'Käufe sind für dein Konto gesperrt. Bitte wende dich an den Support.',
    revoke_pending: 'Eine erstattete Zahlung wird gerade verbucht. Bitte starte einmal das Spiel und versuch es dann noch einmal.',
    owned: 'Das gehört dir schon.',
    rate_limited: 'Zu viele Kaufversuche in kurzer Zeit. Bitte warte ein paar Minuten.',
  };

  // Rückkehr von Stripe
  const params = new URLSearchParams(location.search);
  const back = params.get('kauf');
  if (back) {
    $(back === 'erfolg' ? '[data-shop-thanks]' : '[data-shop-cancel]').hidden = false;
    history.replaceState(null, '', location.pathname + location.hash);
  }

  // ---------- Sitzung
  const readSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null'); } catch { return null; } };
  async function token() {
    const s = readSession();
    if (!s?.access_token) return null;
    if ((s.expires_at ?? 0) - 60 > Date.now() / 1000) return s.access_token;
    if (!s.refresh_token) return null;
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }),
      });
      if (!r.ok) return null;
      const d = await r.json();
      // Hat das Spiel in einem anderen Tab gerade selbst erneuert, dessen Sitzung behalten.
      const now = readSession();
      if (now?.access_token && now.access_token !== s.access_token) return now.access_token;
      const next = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at ?? Math.floor(Date.now() / 1000) + (d.expires_in ?? 3600), user: d.user ?? s.user };
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      return next.access_token;
    } catch { return null; }
  }
  const rest = async (path, tok, init = {}) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init, headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${tok}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
    if (!r.ok) throw new Error(`rest ${r.status}`);
    return r.json();
  };

  // ---------- Anzeige
  let status = null, user = null, admin = false, owned = [], chars = [], busy = false, product = null;
  const open = () => !!status && (status.enabled || (admin && status.configured));
  const offers = () => {
    const m = new Map();
    for (const list of Object.values(status ?? {})) if (Array.isArray(list)) for (const o of list) if (o?.id) m.set(o.id, o);
    return m;
  };
  const price = (cents) => (cents / 100).toLocaleString(document.documentElement.lang || undefined, { style: 'currency', currency: 'EUR' });
  const ownsOffer = (o) => Array.isArray(o?.items) && o.items.length > 0 && o.items.every((k) => owned.includes(k));

  function render() {
    if (!status) state.textContent = '';
    else if (!status.enabled && !admin) state.textContent = 'Der Shop öffnet in Kürze.';
    else if (!user) state.textContent = '';
    else if (!status.enabled) state.textContent = status.configured
      ? 'Admin-Vorschau: Käufe gehen nur mit deinem Admin-Konto.'
      : 'Admin-Vorschau: Zahlungen sind noch nicht eingerichtet.';
    else state.textContent = '';

    const all = offers();
    for (const btn of $$('[data-buy]')) {
      const o = all.get(btn.dataset.buy);
      const card = btn.closest('.set-panel, .mount, .pack, .svc');
      if (o?.priceCents) { const p = card?.querySelector('[data-price], .price'); if (p) p.textContent = price(o.priceCents); }
      const has = ownsOffer(o);
      btn.classList.toggle('owned', has);
      btn.disabled = has || !o || !open() || busy;
      btn.textContent = has ? 'Gehört dir' : o && open() ? 'Kaufen' : 'Bald erhältlich';
    }
    if (status?.priceNote) $('[data-price-note]').textContent = status.priceNote;
    renderDialog();
  }

  function renderDialog() {
    if (!product) return;
    const needsChar = product.btn.dataset.char === '1';
    $('[data-dlg-login]').hidden = !!user;
    $('[data-dlg-form]').hidden = !user;
    charField.hidden = !needsChar || !chars.length;
    goBtn.disabled = busy || !waiver.checked || (needsChar && !charSelect.value);
    goBtn.textContent = busy ? 'Einen Moment …' : 'Weiter zur Bezahlung';
  }

  async function load() {
    try {
      const r = await fetch('/net/shop/status', { headers: { accept: 'application/json' } });
      status = r.ok ? await r.json() : null;
    } catch { status = null; }
    const tok = await token();
    user = tok ? readSession()?.user ?? null : null;
    if (tok) {
      const [isAdmin, designs, list] = await Promise.all([
        rest('rpc/is_admin', tok, { method: 'POST', body: '{}' }).catch(() => false),
        rest('rpc/shop_designs', tok, { method: 'POST', body: '{}' }).catch(() => []),
        rest('characters?select=id,name,level,class_id&order=level.desc', tok).catch(() => []),
      ]);
      admin = isAdmin === true;
      owned = Array.isArray(designs) ? designs : [];
      chars = Array.isArray(list) ? list : [];
      const CLASS = { warrior: 'Krieger', rogue: 'Schurke', ranger: 'Waldläufer', mage: 'Magier' };
      charSelect.replaceChildren(...chars.map((c) => {
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = `${c.name}, Stufe ${c.level}${CLASS[c.class_id] ? ` ${CLASS[c.class_id]}` : ''}`;
        o.translate = false;
        return o;
      }));
    }
    render();
  }

  // Produktbild im Dialog: erstes Bild des Angebots, ganzzahlig vergrößert (Sets und Reittiere im Set bzw. mit Reiter)
  const thumbCv = $('[data-dlg-thumb]');
  function thumb(btn) {
    const card = btn.closest('.set-panel, .mount, .pack, .svc'), dpr = devicePixelRatio || 1;
    let img, crop, step = 1;
    if (card?.matches('.set-panel, .mount')) {
      const [w, h] = nums(card.dataset.f), set = card.matches('.set-panel');
      img = loadImg(set ? `${IMG}set-${card.dataset.cls}.webp` : `${IMG}gang-${card.dataset.m}.webp`);
      crop = [0, set ? h * 2 : 0, w * 2, h * 2];
      step = 0.5;   // Bild in 2× Auflösung: halbe Schritte bleiben ganze Spielpixel
    } else {
      img = card?.querySelector('img');
      crop = img && [0, 0, img.naturalWidth, img.naturalHeight];
    }
    const draw = () => {
      if (!img?.naturalWidth) return;
      if (!crop[2]) crop = [0, 0, img.naturalWidth, img.naturalHeight];
      const fit = Math.min((150 * dpr) / crop[2], (124 * dpr) / crop[3]);
      const k = Math.max(step, Math.floor(fit / step) * step);
      thumbCv.width = Math.round(crop[2] * k); thumbCv.height = Math.round(crop[3] * k);
      thumbCv.style.width = `${thumbCv.width / dpr}px`; thumbCv.style.height = `${thumbCv.height / dpr}px`;
      const x = thumbCv.getContext('2d'); x.imageSmoothingEnabled = false;
      x.drawImage(img, ...crop, 0, 0, thumbCv.width, thumbCv.height);
    };
    thumbCv.width = thumbCv.height = 0;
    if (img?.complete) draw(); else img?.addEventListener('load', draw, { once: true });
  }

  function openDialog(btn) {
    const o = offers().get(btn.dataset.buy);
    product = { btn, id: btn.dataset.buy };
    $('[data-dlg-title]').textContent = btn.dataset.title ?? '';
    $('[data-dlg-price]').textContent = o?.priceCents ? price(o.priceCents) : (btn.closest('.set-panel, .mount, .pack, .svc')?.querySelector('.price')?.textContent ?? '');
    const note = $('[data-price-note]')?.textContent ?? '';
    $('[data-dlg-vat]').hidden = !/Umsatzsteuer|VAT/i.test(note) || /UStG|keine|no VAT/i.test(note);
    thumb(btn);
    waiver.checked = false; errorBox.hidden = true;
    renderDialog();
    dlg.showModal();
  }

  async function buy() {
    if (!product) return;
    errorBox.hidden = true;
    const tok = await token();
    if (!tok) { errorBox.textContent = ERRORS.auth; errorBox.hidden = false; return; }
    busy = true; render();
    try {
      const r = await fetch('/net/shop/checkout', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
        body: JSON.stringify({ productId: product.id, characterId: product.btn.dataset.char === '1' ? charSelect.value : undefined, waiver: true, from: 'web', lang: document.documentElement.lang?.startsWith('en') ? 'en' : 'de' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) throw new Error(ERRORS[d.error] ?? 'Die Bezahlseite ist gerade nicht erreichbar. Bitte versuch es gleich noch einmal.');
      location.assign(d.url);
    } catch (e) {
      busy = false; errorBox.textContent = e.message; errorBox.hidden = false; render();
    }
  }

  for (const b of $$('[data-buy]')) b.addEventListener('click', (e) => { e.stopPropagation(); openDialog(b); });
  goBtn.addEventListener('click', buy);
  waiver.addEventListener('change', renderDialog);
  charSelect.addEventListener('change', renderDialog);
  dlg.addEventListener('close', () => { if (!busy) product = null; });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  load();
})();
