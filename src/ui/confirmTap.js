// Zweiter Tipp bestätigt: für Knöpfe, deren Fehltipp mitten im Kampf teuer wäre (Dungeon verlassen löst die Gruppe auf).
// Der erste Tipp schaltet die Beschriftung um („Wirklich verlassen?“), nach ms ohne zweiten Tipp springt sie zurück.
export function confirmTap(btn, label, { ask = 'Wirklich verlassen?', ms = 3000, onConfirm }) {
  const text = label.textContent;
  let timer = 0;
  const disarm = () => { clearTimeout(timer); timer = 0; btn.classList.remove('arm'); label.textContent = text; };
  btn.addEventListener('click', () => {
    if (btn.classList.contains('arm')) { disarm(); onConfirm(); return; }
    btn.classList.add('arm');
    label.textContent = ask;
    timer = setTimeout(disarm, ms);
  });
  return disarm;
}
