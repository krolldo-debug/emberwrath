import { RACES, DEFAULT_RACE } from './races.js';
import { CLASSES, ABILITIES, DEFAULT_CLASS } from './classes.js';
import { cleanTalents, canLearn, TALENT_LEVEL_MAX } from './talents.js';
import { registerTalentPanel } from './TalentPanel.js';
import { cleanAppearance, restylePrice, DYES } from './cosmetics.js';
import { registerAppearancePanel } from './AppearancePanel.js';
import { installMounts, cleanMounts } from './mounts.js';

// Thread A – Charakter: Völker, Klassen, Fähigkeiten, character-Slice.
// Inhalte:  content 'race' (4), 'class' (4), 'ability' (8)
// Slice:    character = { name, raceId, classId, appearance: { variant, dye, hairStyle }, talents: { talentId: rang },
//                        mounts: { owned, active, riding } }  (Reittiere: mounts.js, §12.6)
// Commands: character:rename { name }  (Name prüfen wie in der Erstellung)
//           character:learnTalent { id }, character:resetTalents (kostenlos)
//           character:restyle { variant?, dye?, hairStyle? } (kostet Gold über wallet:addGold)
// Panels:   'talents' (Aktion 'talents'), 'appearance' (Spiegel im Dorf, siehe cosmetics.js)
// Werte:    computeStats() in stats.js, Held in createHero.js
export const NAME_MIN = 2;
export const NAME_MAX = 16;
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ' -]*$/;

// Liefert eine Fehlermeldung oder null.
export function validateName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < NAME_MIN) return `Der Name braucht mindestens ${NAME_MIN} Zeichen.`;
  if (name.length > NAME_MAX) return `Der Name darf höchstens ${NAME_MAX} Zeichen haben.`;
  if (!NAME_RE.test(name)) return 'Nur Buchstaben, Leerzeichen, Bindestrich und Apostroph.';
  return null;
}

export function cleanName(raw) { return String(raw ?? '').trim().replace(/\s+/g, ' '); }

export function installCharacter(game) {
  const { content, state } = game;
  content.defineAll('race', RACES);
  content.defineAll('class', CLASSES);
  content.defineAll('ability', ABILITIES);
  installMounts(game);

  const valid = (c) => ({
    // Die Erstellung prüft den Namen streng (validateName); hier wird nur bereinigt.
    name: cleanName(c.name).slice(0, NAME_MAX) || 'Namenlos',
    raceId: content.find('race', c.raceId) ? c.raceId : DEFAULT_RACE,
    classId: content.find('class', c.classId) ? c.classId : DEFAULT_CLASS,
    appearance: cleanAppearance(content.find('race', c.raceId) ? c.raceId : DEFAULT_RACE, c.appearance),
    // Stufe steht im progress-Slice; beim Laden nur Form prüfen, Punkte begrenzt computeStats
    talents: cleanTalents(content.find('class', c.classId) ? c.classId : DEFAULT_CLASS, c.talents ?? {}, TALENT_LEVEL_MAX),
    // Reittiere (§12.6): alte Spielstände ohne mounts -> leer
    mounts: cleanMounts(c.mounts, (id) => !!content.find('mount', id)),
  });

  // Slice 'character' – Identität des Charakters (gespeichert).
  // Alte Spielstände (Phase 1, ohne Volk/Klasse) werden zum menschlichen Krieger.
  state.defineSlice('character', {
    create: (init) => valid(init ?? {}),
    deserialize: (json) => valid(json ?? {}),
  });

  const level = (s) => s.slices?.progress?.level ?? s.get?.('progress')?.level ?? 1;
  state.defineCommand('character:learnTalent', (s, { id }) => {
    const ch = s.get('character');
    const err = canLearn(ch.classId, ch.talents, level(s), id);
    if (err) return { ok: false, error: err };
    ch.talents = { ...ch.talents, [id]: (ch.talents?.[id] ?? 0) + 1 };
    return { ok: true, rank: ch.talents[id] };
  });
  state.defineCommand('character:resetTalents', (s) => {
    s.get('character').talents = {};
    return { ok: true };
  });
  registerTalentPanel(game);

  // Kosmetik gegen Gold. Nicht angegebene Teile bleiben, wie sie sind.
  state.defineCommand('character:restyle', (s, p) => {
    const ch = s.get('character');
    const cur = ch.appearance;
    const next = cleanAppearance(ch.raceId, {
      variant: p.variant ?? cur.variant,
      dye: p.dye !== undefined ? p.dye : cur.dye,
      hairStyle: p.hairStyle !== undefined ? p.hairStyle : cur.hairStyle,
    });
    const need = next.dye ? DYES[next.dye].level ?? 1 : 1;
    if (level(s) < need) return { ok: false, error: `Diese Farbe gibt es ab Stufe ${need}.` };
    const price = restylePrice(cur, next);
    if (price === 0) return { ok: false, error: 'Nichts geändert.' };
    if ((s.slices.wallet?.gold ?? 0) < price) return { ok: false, error: `Dafür fehlen dir ${price - (s.slices.wallet?.gold ?? 0)} Gold.` };
    s.commit('wallet:addGold', { amount: -price, source: 'cosmetic' });
    ch.appearance = next;
    return { ok: true, price };
  }, { authoritative: true });
  registerAppearancePanel(game);

  state.defineCommand('character:rename', (s, { name }) => {
    const err = validateName(name);
    if (err) return { ok: false, error: err };
    s.get('character').name = cleanName(name);
    return { ok: true };
  });
}
