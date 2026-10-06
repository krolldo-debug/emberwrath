import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { QUALITY_LEVELS } from './Quality.js';
import { langSwitch } from '../i18n/index.js';

// Geräte-Einstellungen (game.prefs, INTEGRATION.md §11.8) – Thread D.
// Schlüssel: volume (0..1), musicVolume (0..1), muted, guidePath (Questpfad, B liest), screenShake,
// minimap, touchScale (0.85 | 1 | 1.2), quality (auto | low | medium | high). Alles pro Gerät, nicht im Spielstand.
export const TOUCH_SIZES = [
  { value: 0.85, label: 'Klein' },
  { value: 1, label: 'Normal' },
  { value: 1.2, label: 'Groß' },
];

// Einmal beim Start (installUi) und nach jeder Änderung: Ton und CSS-Schalter anwenden.
export function applyPrefs(game) {
  const p = game.prefs;
  game.sfx.bindPrefs?.(p);
  const root = document.documentElement;
  root.style.setProperty('--touch-scale', String(p.get('touchScale', 1)));
  root.classList.toggle('ef-no-minimap', p.get('minimap', true) === false);
}

export function installPrefs(game) {
  applyPrefs(game);
  game.bus.on(EV.PREFS_CHANGED, (e) => {
    if (e.key === 'touchScale' || e.key === 'minimap') applyPrefs(game);
  });
}

// Einstellungsbereich (für das Pausemenü, auch anderswo einsetzbar).
export function createSettingsSection(game) {
  const p = game.prefs, sfx = game.sfx;
  const row = (label, control, note) => h('label.set-row', h('span.set-label', label, note ? h('small.set-note', note) : null), control);

  const volVal = h('output.set-val');
  const vol = h('input.set-range', { type: 'range', min: '0', max: '100', step: '5', 'aria-label': 'Lautstärke' });
  const mute = h('input.set-check', { type: 'checkbox', 'aria-label': 'Ton aus' });
  const syncSound = () => {
    vol.value = String(Math.round((sfx.volume ?? 1) * 100));
    volVal.textContent = `${vol.value} %`;
    mute.checked = !!sfx.muted;
    vol.disabled = !!sfx.muted;
  };
  vol.addEventListener('input', () => { sfx.setVolume?.(Number(vol.value) / 100); syncSound(); });
  vol.addEventListener('change', () => sfx.play?.('coin'));
  const music = game.music;
  const musVal = h('output.set-val');
  const mus = h('input.set-range', { type: 'range', min: '0', max: '100', step: '5', 'aria-label': 'Musik' });
  const syncMusic = () => { mus.value = String(Math.round((music?.volume ?? 0.6) * 100)); musVal.textContent = `${mus.value} %`; mus.disabled = !!sfx.muted; };
  mus.addEventListener('input', () => { music?.setVolume(Number(mus.value) / 100); syncMusic(); });
  const fxVal = h('output.set-val');
  const fx = h('input.set-range', { type: 'range', min: '0', max: '100', step: '5', 'aria-label': 'Effekte' });
  const syncFx = () => { fx.value = String(Math.round((sfx.fxVolume ?? 1) * 100)); fxVal.textContent = `${fx.value} %`; fx.disabled = !!sfx.muted; };
  fx.addEventListener('input', () => { sfx.setFxVolume?.(Number(fx.value) / 100); syncFx(); });
  fx.addEventListener('change', () => sfx.play?.('hit'));
  mute.addEventListener('change', () => { syncMusic(); syncFx(); });
  mute.addEventListener('change', () => { sfx.setMuted ? sfx.setMuted(mute.checked) : sfx.toggleMute(); syncSound(); });

  const check = (key, def) => {
    const el = h('input.set-check', { type: 'checkbox' });
    el.checked = p.get(key, def) !== false;
    el.addEventListener('change', () => { p.set(key, el.checked); sfx.play?.('ui'); });
    return el;
  };

  const sizes = h('div.set-seg', { role: 'radiogroup', 'aria-label': 'Größe der Touch-Knöpfe' });
  const syncSizes = () => {
    const cur = p.get('touchScale', 1);
    for (const b of sizes.children) b.setAttribute('aria-checked', String(Number(b.dataset.v) === cur));
  };
  for (const s of TOUCH_SIZES) {
    sizes.append(h('button.set-seg-btn', { type: 'button', role: 'radio', 'data-v': String(s.value), onclick: () => { p.set('touchScale', s.value); syncSizes(); sfx.play?.('ui'); } }, s.label));
  }
  const qual = h('div.set-seg', { role: 'radiogroup', 'aria-label': 'Grafikqualität' });
  const qNote = h('small.set-note');
  const syncQual = () => {
    const cur = p.get('quality', 'auto');
    for (const b of qual.children) b.setAttribute('aria-checked', String(b.dataset.v === cur));
    const eff = game.quality?.level;
    qNote.textContent = cur === 'auto' && eff ? `passt sich an, gerade: ${{ low: 'niedrig', medium: 'mittel', high: 'hoch' }[eff]}` : 'Partikel, Leuchten, Wetter';
  };
  for (const q of QUALITY_LEVELS) {
    qual.append(h('button.set-seg-btn', { type: 'button', role: 'radio', 'data-v': q.value, onclick: () => { p.set('quality', q.value); syncQual(); sfx.play?.('ui'); } }, q.label));
  }
  syncSound(); syncSizes(); syncMusic(); syncFx(); syncQual();

  return h('section.set-section', { 'aria-label': 'Einstellungen' },
    h('h3', 'Einstellungen'),
    row('Lautstärke', h('span.set-inline', vol, volVal), 'Gesamt'),
    row('Musik', h('span.set-inline', mus, musVal)),
    row('Effekte', h('span.set-inline', fx, fxVal), 'Kampf, Zauber, Umgebung'),
    row('Ton aus', mute, 'Taste N'),
    row('Questpfad am Boden', check('guidePath', true), 'Weg zur verfolgten Quest'),
    row('Bildschirmwackeln', check('screenShake', true), 'bei Treffern und Explosionen'),
    row('Minimap', check('minimap', true), 'Karte bleibt über M erreichbar'),
    h('div.set-row', h('span.set-label', 'Grafik', qNote), qual),
    h('div.set-row', h('span.set-label', 'Sprache'), langSwitch({ cls: 'set-seg', btnCls: 'set-seg-btn', role: 'radio' })),
    h('div.set-row', h('span.set-label', 'Touch-Knöpfe', h('small.set-note', 'Größe der Bedienelemente')), sizes),
    h('p.ef-note.set-local', 'Einstellungen gelten für dieses Gerät.'),
  );
}
