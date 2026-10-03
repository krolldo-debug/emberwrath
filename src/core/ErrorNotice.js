// Sichtbarer Hinweis bei schweren Fehlern (Szene lässt sich nicht öffnen, Spielschleife hängt).
// Bewusst ohne Abhängigkeiten und mit eigenen Stilen: muss auch funktionieren, wenn der Rest der Oberfläche kaputt ist.
// showErrorNotice(text, { reload }) – reload: Knopf „Neu laden“ anbieten.
let box = null;

export function showErrorNotice(text, { reload = true } = {}) {
  if (typeof document === 'undefined') return;
  box?.remove();
  box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:9999;max-width:min(92vw,440px);'
    + 'background:#1a0d0b;color:#f3e3c7;border:2px solid #c9542b;padding:12px 14px;font:14px/1.4 system-ui,sans-serif;'
    + 'box-shadow:0 6px 24px rgba(0,0,0,.6);display:flex;gap:10px;align-items:center;flex-wrap:wrap';
  const msg = document.createElement('span');
  msg.style.flex = '1 1 220px';
  msg.textContent = text;
  box.append(msg);
  const btn = (label, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label;
    b.style.cssText = 'background:#c9542b;color:#fff;border:0;padding:6px 12px;font:inherit;cursor:pointer';
    b.onclick = fn;
    box.append(b);
    return b;
  };
  if (reload) btn('Neu laden', () => window.location.reload());
  btn('Schließen', () => { box?.remove(); box = null; }).style.background = '#4a2a22';
  document.body.append(box);
}
