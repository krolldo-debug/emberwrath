// Emberwrath – Verhalten der Startseite und Unterseiten. Ohne Abhängigkeiten.
// Liest window.EW_SITE (config.js). Alles Optionale ist so gebaut, dass die
// Seite ohne JavaScript lesbar bleibt.
(() => {
  const cfg = window.EW_SITE ?? {};
  const doc = document.documentElement;
  doc.classList.remove('no-js');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

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
  for (const box of $$('[data-socials]')) {
    box.innerHTML = entries.map(([k, url]) => validUrl(url)
      ? `<a class="social" href="${encodeURI(url.trim())}" target="_blank" rel="noopener me">${svg(SOCIAL[k].path)}${SOCIAL[k].name}</a>`
      : `<span class="social soon" title="Kanal folgt">${svg(SOCIAL[k].path)}${SOCIAL[k].name} <small>bald</small></span>`).join('');
  }
  for (const box of $$('[data-foot-socials]')) {
    box.innerHTML = entries.filter(([, url]) => validUrl(url))
      .map(([k, url]) => `<a href="${encodeURI(url.trim())}" target="_blank" rel="noopener me" aria-label="${SOCIAL[k].name}">${svg(SOCIAL[k].path)}</a>`).join('');
  }

  // ---------- Kontakt
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const mail = (cfg.supportEmail ?? '').trim();
  for (const el of $$('[data-support-email]')) {
    if (mail) el.innerHTML = `<a class="btn primary" href="mailto:${esc(mail)}?subject=${encodeURIComponent('Emberwrath Support')}">${esc(mail)}</a>`;
  }
  for (const el of $$('[data-if-email]')) el.hidden = !mail;
  for (const el of $$('[data-if-no-email]')) el.hidden = !!mail;

  // ---------- Impressum
  const imp = cfg.impressum ?? {};
  const impBox = document.querySelector('[data-impressum]');
  if (impBox && imp.name && imp.street && imp.city) {
    const email = (imp.email || mail).trim();
    const rows = [
      ['Anbieter', `${esc(imp.name)}<br>${esc(imp.street)}<br>${esc(imp.city)}${imp.country ? `<br>${esc(imp.country)}` : ''}`],
      ['E-Mail', email ? `<a href="mailto:${esc(email)}">${esc(email)}</a>` : ''],
      ['Telefon', esc(imp.phone ?? '')],
      ['Verantwortlich für den Inhalt (§ 18 Abs. 2 MStV)', esc(imp.responsible || imp.name)],
    ].filter(([, v]) => v);
    impBox.innerHTML = `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  }

  // ---------- Kopfleiste: Menü auf dem Handy, fester Hintergrund beim Scrollen
  const top = document.querySelector('.top');
  const btn = document.querySelector('.menu-btn');
  btn?.addEventListener('click', () => {
    const open = top.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
  for (const a of $$('.top .nav a, .top .top-actions a')) a.addEventListener('click', () => { top.classList.remove('open'); btn?.setAttribute('aria-expanded', 'false'); });
  const onScroll = () => top?.classList.toggle('solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------- Einblenden beim Scrollen
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver((list) => {
      for (const e of list) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px' });
    $$('.reveal').forEach((el) => io.observe(el));
  } else $$('.reveal').forEach((el) => el.classList.add('in'));

  // ---------- Bosse: Auswahl wechselt das große Bild
  const stage = document.querySelector('[data-stage]');
  if (stage) {
    const img = stage.querySelector('img');
    const tabs = $$('.boss');
    const pick = (tab) => {
      for (const t of tabs) t.setAttribute('aria-selected', String(t === tab));
      if (img.getAttribute('src') === tab.dataset.img) return;
      img.style.opacity = '0';
      const next = new Image();
      next.onload = () => { img.src = tab.dataset.img; img.alt = tab.dataset.alt; img.style.opacity = '1'; };
      next.src = tab.dataset.img;
    };
    tabs.forEach((t) => t.addEventListener('click', () => pick(t)));
    tabs.forEach((t) => new Image().src = t.dataset.img); // vorladen
  }

  // ---------- Bildbetrachter für Zonen und Aufnahmen
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
      };
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    }
    box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('button')) box.close(); });
  }

  // ---------- Glutfunken über dem Titelbild (wie die Funken im Spiel, pixelig)
  const cv = document.querySelector('.embers');
  if (cv && !reduced) {
    const ctx = cv.getContext('2d');
    const P = 3; // Pixelgröße der Funken
    let W = 0, H = 0, sparks = [], last = 0, running = true;
    const resize = () => { W = cv.width = Math.ceil(cv.clientWidth / P); H = cv.height = Math.ceil(cv.clientHeight / P); };
    const spawn = (y = H + 2) => ({ x: Math.random() * W, y, vy: 6 + Math.random() * 14, drift: (Math.random() - 0.5) * 6, life: 0, max: 4 + Math.random() * 7, phase: Math.random() * 6.28 });
    resize();
    addEventListener('resize', resize);
    sparks = Array.from({ length: 70 }, () => spawn(Math.random() * H));
    const COLORS = ['#fff2b0', '#ffd46a', '#ffa030', '#ef6a1c', '#b02e10'];
    new IntersectionObserver(([e]) => { running = e.isIntersecting; if (running) requestAnimationFrame(tick); }).observe(cv);
    function tick(t) {
      if (!running) return;
      const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
      ctx.clearRect(0, 0, W, H);
      for (const s of sparks) {
        s.life += dt; s.y -= s.vy * dt; s.x += (s.drift + Math.sin(s.life * 2 + s.phase) * 4) * dt;
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

  // ---------- Jahr in der Fußzeile
  for (const el of $$('[data-year]')) el.textContent = new Date().getFullYear();
})();
