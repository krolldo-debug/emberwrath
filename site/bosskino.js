// Emberwrath – Startseite, Bosskino (Abschnitt #bosse): echte Bosskämpfe aus dem Spiel, je Boss 7 Sekunden Film
// (tools/bossfilm.mjs nimmt auf, tools/bossfilm.py schneidet: Ausschnitt 704 × 352 Feinpixel, im Film ×2, H.264 oder VP9).
// Die Bühne zeigt den Film in ganzen Gerätepixeln je Feinpixel (k), so groß, wie Breite und Fensterhöhe es erlauben;
// am Handy hoch mit k = 2 und seitlich beschnitten (die Mitte zwischen Gruppe und Boss bleibt im Bild).
// Nach jedem Film folgt der nächste Boss; die Auswahl darunter (ARIA-Tabs) springt direkt. Filme laden erst kurz vor
// Sichtbarkeit und laufen nur, solange die Bühne sichtbar ist. Ohne JavaScript, bei reduzierter Bewegung und im
// Datensparmodus bleibt es beim Standbild des Bosses (bosskampf-<boss>.webp), die Auswahl wechselt dann das Standbild.
(() => {
  const kino = document.querySelector('[data-kino]');
  if (!kino) return;
  // <bossfilm.py> – von tools/bossfilm.py geschrieben, nicht von Hand ändern
  const META = {"W": 704, "H": 352, "reihe": ["nerith", "ignaroth", "aasmutter", "skalvyr", "malgareth"], "dauer": 7.0, "v": "9530f415d0"};
  // </bossfilm.py>
  const stage = kino.querySelector('.kino-buehne');
  const poster = stage.querySelector('.kino-bild');
  const tabs = [...kino.querySelectorAll('[role="tab"]')];
  const texts = [...stage.querySelectorAll('[data-text]')];
  const ORDER = tabs.map((t) => t.dataset.boss);
  const conn = navigator.connection;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches || !!(conn && (conn.saveData || /(^|-)2g/.test(conn.effectiveType ?? '')));
  const IMG = new URL('img/', document.querySelector('link[rel="icon"]')?.href ?? location.href).href;
  const url = (id, ext) => `${IMG}bosskampf-${id}.${ext}?v=${META.v}`;
  // H.264 (überall außer in Browsern ohne Lizenz-Codecs), sonst derselbe Film als VP9
  const FILM = document.createElement('video').canPlayType('video/mp4; codecs="avc1.640028"') ? 'mp4' : 'webm';
  let cur = Math.max(0, tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true'));

  // ---------- Größe: k Gerätepixel je Feinpixel (ganzzahlig) nach der Breite; ist der Film höher als 85 % des Fensters,
  // schneidet die Bühne oben und unten bis zu einem Fünftel ab (sonst eine Stufe kleiner). Handy hoch: lieber k = 2 und
  // seitlich beschnitten als winzig.
  const layout = () => {
    const dpr = devicePixelRatio || 1;
    const avail = Math.round(stage.clientWidth * dpr);
    const hmax = Math.round(innerHeight * 0.85 * dpr);
    let k = Math.max(1, Math.round(avail / META.W));
    if (avail < META.W * 2) k = 2;
    while (k > 1 && META.H * k * 0.8 > hmax) k--;
    const hd = Math.min(META.H * k, hmax);
    stage.style.height = `${hd / dpr}px`;
    const pos = { width: `${(META.W * k) / dpr}px`, height: `${(META.H * k) / dpr}px`,
      left: `${Math.round((avail - META.W * k) / 2) / dpr}px`, top: `${Math.round((hd - META.H * k) / 2) / dpr}px` };
    for (const el of [poster, video]) if (el) Object.assign(el.style, pos);
  };

  const bar = () => tabs[cur].querySelector('.kino-lauf');
  const mark = () => {
    tabs.forEach((t, i) => {
      const on = i === cur;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
    });
    stage.setAttribute('aria-labelledby', tabs[cur].id);
    texts.forEach((p) => { p.hidden = p.dataset.text !== ORDER[cur]; });
  };

  let video = null, vis = false, near = false;
  const pick = (i) => {
    cur = (i + ORDER.length) % ORDER.length;
    mark();
    poster.src = url(ORDER[cur], 'webp');
    for (const t of tabs) t.querySelector('.kino-lauf').style.transform = 'scaleX(0)';
    if (!video) return;
    video.classList.remove('on');
    video.src = url(ORDER[cur], FILM);
    if (vis) video.play().catch(() => {});
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => pick(i));
    t.addEventListener('keydown', (e) => {
      const j = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: ORDER.length - 1 }[e.key];
      if (j === undefined) return;
      e.preventDefault();
      const k = (j + ORDER.length) % ORDER.length;
      tabs[k].focus();
      pick(k);
    });
  });

  layout();
  addEventListener('resize', layout);
  if (still) return;

  // ---------- Film: lädt kurz vor Sichtbarkeit, läuft nur sichtbar; nach dem Ende der nächste Boss
  const start = () => {
    video = document.createElement('video');
    video.className = 'kino-film';
    Object.assign(video, { muted: true, playsInline: true, preload: 'auto', disablePictureInPicture: true });
    video.setAttribute('muted', ''); video.setAttribute('playsinline', ''); video.setAttribute('aria-hidden', 'true');
    video.addEventListener('playing', () => video.classList.add('on'));
    video.addEventListener('ended', () => pick(cur + 1));
    video.addEventListener('error', () => { video.remove(); video = null; });
    stage.insertBefore(video, poster.nextSibling);
    layout();
    video.src = url(ORDER[cur], FILM);
    const tick = () => {
      if (!video) return;
      if (video.duration) bar().style.transform = `scaleX(${Math.min(1, video.currentTime / video.duration)})`;
      if (vis && !video.paused) requestAnimationFrame(tick);
    };
    video.addEventListener('play', () => requestAnimationFrame(tick));
    if (vis) video.play().catch(() => {});
  };
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !near) { near = true; start(); }
  }, { rootMargin: '400px' }).observe(stage);
  new IntersectionObserver(([e]) => {
    vis = e.isIntersecting;
    if (!video) return;
    if (vis && !document.hidden) video.play().catch(() => {}); else video.pause();
  }).observe(stage);
  document.addEventListener('visibilitychange', () => {
    if (!video) return;
    if (document.hidden) video.pause(); else if (vis) video.play().catch(() => {});
  });
})();
