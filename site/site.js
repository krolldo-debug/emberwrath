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
    if (mail) el.innerHTML = `<a class="btn primary" href="mailto:${esc(mail)}?subject=${encodeURIComponent('Emberwrath Support')}">${esc(mail)}</a>`;
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
    $$('.reveal').forEach((el) => io.observe(el));
  } else $$('.reveal').forEach((el) => el.classList.add('in'));

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
    // Reiter im Lauf: das Fenster zeigt genau einen Frame des Streifens (Breite / Anzahl Frames)
    for (const box of $$('.rider')) {
      const img = box.querySelector('img'), n = parseFloat(getComputedStyle(box).getPropertyValue('--n')) || 1;
      box.style.width = img?.naturalWidth ? `${img.getBoundingClientRect().width / n}px` : '';
    }
  };
  if (figs.length) {
    for (const img of figs) if (!img.complete) img.addEventListener('load', fitFigs, { once: true });
    fitFigs();
    let raf2 = 0;
    addEventListener('resize', () => { cancelAnimationFrame(raf2); raf2 = requestAnimationFrame(fitFigs); });
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
