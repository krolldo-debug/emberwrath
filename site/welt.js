// Emberwrath – Seite „Welt“: der Weg füllt sich beim Scrollen mit Glut, erreichte Stufenschilder leuchten.
// Ohne JavaScript bleibt der Weg leer und alle Schilder ruhig; die Seite ist vollständig lesbar.
(() => {
  const weg = document.querySelector('[data-weg]');
  if (!weg) return;
  const stops = [...weg.children].map((li) => ({ li, plate: li.querySelector('.stufe') }));
  let raf = 0;
  const update = () => {
    raf = 0;
    const r = weg.getBoundingClientRect(), mark = innerHeight * 0.55;
    // in ganzen Bildschirmpunkten, damit die Kante der Füllung hart bleibt
    const dpr = devicePixelRatio || 1;
    const fill = Math.max(0, Math.min(r.height, mark - r.top));
    weg.style.setProperty('--fill', `${Math.round(fill * dpr) / dpr}px`);
    for (const s of stops) s.plate?.classList.toggle('on', s.li.getBoundingClientRect().top < mark);
  };
  const queue = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  update();
})();
