// Vollbild auf Handy und Tablet (Thread D).
// - Android, iPad, Desktop-Browser: echtes Vollbild beim ersten Antippen (Fullscreen-API).
// - iPhone: Safari erlaubt Webseiten kein Vollbild. Als Web-App vom Home-Bildschirm gestartet
//   läuft das Spiel randlos (apple-mobile-web-app-capable + viewport-fit=cover). Einmaliger Hinweis,
//   wie man es dort ablegt.
// Die Dateien in src/ui/pwa/ (Manifest, App-Symbole) legt der Build neben die Spielseite.
// <html> bekommt .ef-standalone (als App gestartet) und .ef-fullscreen (Vollbild aktiv).

const HINT_KEY = 'ef.fullscreenHint';

function meta(name, content) {
  if (document.head.querySelector(`meta[name="${name}"]`)) return;
  const m = document.createElement('meta');
  m.name = name; m.content = content;
  document.head.append(m);
}
function link(rel, href, extra = {}) {
  if (document.head.querySelector(`link[rel="${rel}"]`)) return;
  const l = document.createElement('link');
  l.rel = rel; l.href = href;
  for (const [k, v] of Object.entries(extra)) l.setAttribute(k, v);
  document.head.append(l);
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches || navigator.standalone === true;
}
export function canFullscreen() {
  const el = document.documentElement;
  return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !!(el.requestFullscreen || el.webkitRequestFullscreen);
}
export function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }

export function enterFullscreen() {
  if (isFullscreen() || !canFullscreen()) return Promise.resolve(false);
  const el = document.documentElement;
  const req = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen();
  return Promise.resolve(req).then(() => {
    // Querformat festhalten, wo der Browser es erlaubt (nur im Vollbild möglich)
    try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch { /* nicht unterstützt */ }
    return true;
  }).catch(() => false);
}
export function exitFullscreen() {
  if (!isFullscreen()) return;
  (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document)?.catch?.(() => {});
}
export function toggleFullscreen() { return isFullscreen() ? (exitFullscreen(), Promise.resolve(false)) : enterFullscreen(); }

const isIPhone = () => /iPhone|iPod/.test(navigator.userAgent);
const touchDevice = () => window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;

function readHint() { try { return localStorage.getItem(HINT_KEY); } catch { return '1'; } }
function writeHint() { try { localStorage.setItem(HINT_KEY, '1'); } catch { /* privat */ } }

function showIPhoneHint() {
  if (readHint()) return;
  const card = document.createElement('div');
  card.className = 'ef-fs-hint';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Vollbild auf dem iPhone');
  const share = '<svg viewBox="0 0 12 14" width="13" height="15" aria-hidden="true"><path d="M6 1v8M3 4l3-3 3 3M2 6H1v7h10V6h-1" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
  card.innerHTML = `<b>Randlos spielen</b><span>Tippe in Safari auf ${share} <i>Teilen</i> und dann auf <i>Zum Home-Bildschirm</i>. Von dort startet Emberwrath im Vollbild.</span>`;
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'ef-fs-hint-close'; close.setAttribute('aria-label', 'Hinweis schließen'); close.textContent = '×';
  close.addEventListener('click', () => { writeHint(); card.remove(); });
  card.append(close);
  document.body.append(card);
  setTimeout(() => { if (card.isConnected) { writeHint(); card.classList.add('out'); setTimeout(() => card.remove(), 600); } }, 14000);
}

export function installFullscreen(game) {
  const root = document.documentElement;
  // Web-App-Angaben (wirken beim Ablegen auf dem Home-Bildschirm)
  meta('apple-mobile-web-app-capable', 'yes');
  meta('mobile-web-app-capable', 'yes');
  meta('apple-mobile-web-app-status-bar-style', 'black-translucent');
  meta('apple-mobile-web-app-title', 'Emberwrath');
  link('manifest', 'manifest.webmanifest');
  link('apple-touch-icon', 'app-icon-180.png', { sizes: '180x180' });

  const standalone = isStandalone();
  root.classList.toggle('ef-standalone', standalone);
  const sync = () => { root.classList.toggle('ef-fullscreen', isFullscreen()); game?.resize?.(); };
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  if (standalone || !touchDevice()) return;

  // Erstes Antippen im Spiel schaltet Vollbild ein (Browser verlangen eine Nutzergeste).
  // Wer es danach selbst verlässt, bekommt es nicht ungefragt zurück (Menü › Vollbild).
  if (canFullscreen()) {
    const first = (e) => {
      if (e.target?.closest?.('input, textarea, select, a')) return;
      document.removeEventListener('pointerup', first, true);
      enterFullscreen();
    };
    document.addEventListener('pointerup', first, true);
    return;
  }
  // iPhone: Hinweis einmalig, sobald das Spiel läuft
  if (isIPhone()) {
    const wait = setInterval(() => { if (document.querySelector('.ef-hud')) { clearInterval(wait); setTimeout(showIPhoneHint, 2500); } }, 1500);
  }
}
