// Handy und Tablet: gespielt wird nur im Querformat.
// Hochkant liegt ein Hinweis zum Drehen über allem (auch Menüs und Anmeldung), das Spiel ist so lange angehalten.
// Wo der Browser es erlaubt, wird das Querformat zusätzlich festgehalten (Vollbild, als App gestartet; siehe Fullscreen.js
// und pwa/manifest.webmanifest). Desktop-Fenster bleiben frei, auch wenn sie schmal sind (Game#chooseView).

const DEVICE_MQ = '(hover: none) and (pointer: coarse)';

export const isMobileDevice = () =>
  !!window.matchMedia?.(DEVICE_MQ).matches || document.documentElement.classList.contains('ef-touch');

const PHONE_SVG = `<svg class="ef-rotate-phone" viewBox="0 0 32 52" width="64" height="104" aria-hidden="true" shape-rendering="crispEdges">
  <rect x="2" y="2" width="28" height="48" fill="#120a18"/>
  <path d="M2 2h28v48H2z" fill="none" stroke="#e8c25a" stroke-width="2"/>
  <rect x="5" y="7" width="22" height="36" fill="#2a1424"/>
  <rect x="5" y="31" width="22" height="12" fill="#3a1a1e"/>
  <rect x="9" y="35" width="4" height="2" fill="#ff8a3a"/><rect x="17" y="33" width="3" height="2" fill="#ffb640"/>
  <rect x="21" y="37" width="3" height="2" fill="#ff6a2a"/><rect x="12" y="27" width="4" height="4" fill="#d8d0c0"/>
  <rect x="14" y="45" width="4" height="2" fill="#e8c25a"/>
</svg>`;

export function installRotateGate(game) {
  const root = document.documentElement;
  const gate = document.createElement('div');
  gate.id = 'ef-rotate';
  gate.setAttribute('role', 'alertdialog');
  gate.setAttribute('aria-live', 'polite');
  gate.innerHTML = `<div class="ef-rotate-glow"></div>
    <div class="ef-rotate-card">
      <div class="ef-rotate-anim">${PHONE_SVG}<span class="ef-rotate-arrow" aria-hidden="true"></span></div>
      <h2>Dreh dein Gerät</h2>
      <p>Emberwrath wird im Querformat gespielt.</p>
    </div>`;
  document.body.append(gate);

  let on = null;
  const check = () => {
    const blocked = isMobileDevice() && window.innerHeight > window.innerWidth;
    if (blocked === on) return;
    on = blocked;
    root.classList.toggle('ef-rotate-on', blocked);
    gate.setAttribute('aria-hidden', blocked ? 'false' : 'true');
    if (game) game.paused = blocked;
    // Offenes Eingabefeld schließen, damit die Tastatur den Hinweis nicht verdeckt
    if (blocked && document.activeElement?.blur && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) document.activeElement.blur();
  };
  window.addEventListener('resize', check);
  window.addEventListener('orientationchange', () => setTimeout(check, 50));
  screen.orientation?.addEventListener?.('change', check);
  new MutationObserver(check).observe(root, { attributes: true, attributeFilter: ['class'] });
  check();
  return { check };
}
