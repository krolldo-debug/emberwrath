// Klassen und Fähigkeiten (Thread A). Reine Daten, registriert als
// content 'class' und content 'ability'. Das Verhalten der Fähigkeiten steht
// in abilities.js (gleiche IDs), der Nahkampf-/Fernkampf-Grundangriff im Helden.
//
// Klasse:
//   base / growth   Attribute auf Stufe 1 bzw. Zuwachs je Stufe
//   primary         Attribut, das die Angriffskraft bestimmt
//   hp, hpPerLevel, armor, crit, speed (Faktor auf Grundtempo), powerBase
//   resource        { type: 'rage'|'mana'|'energy', name, color, max, perInt?, regen, start,
//                     onHit?, onHurt?, decay? }   (Wut baut sich im Kampf auf und verfällt danach)
//   basic           Grundangriff: { kind: 'melee', combo: [...] } oder { kind: 'ranged', shot: {...} }
//                   Schaden = Angriffskraft × mult
//   abilities       [skill1..skill4] (IDs aus ABILITIES); level = Stufe der Freischaltung
//   weapon          Waffentyp (Items mit classes: [classId] passen dazu)
//   attackDesc      Beschreibung des Grundangriffs
export const CLASSES = {
  warrior: {
    name: 'Krieger',
    tagline: 'Schwert, Schild und Wut',
    role: 'Nahkampf · Verteidigung',
    desc: 'Steht in der ersten Reihe und hält am meisten aus. Treffer erzeugen Wut, die in verheerende Fähigkeiten fließt.',
    icon: 'sword', weapon: 'sword',
    attackDesc: 'Dreifache Schwertkombo – der dritte Schlag trifft schwer und wirft zurück.',
    base: { str: 14, agi: 8, int: 4, vit: 14 },
    growth: { str: 2, agi: 1, int: 0, vit: 2 },
    primary: 'str',
    hp: 62, hpPerLevel: 7, armor: 8, crit: 0.08, speed: 1.0, powerBase: 4,
    resource: { type: 'rage', name: 'Wut', color: '#d83a2a', max: 100, regen: 0, start: 0, onHit: 7, onHurt: 5, decay: 6 },
    basic: {
      kind: 'melee',
      combo: [
        { mult: 1.15, windup: 0.06, active: 0.09, recover: 0.16, reach: 25, arc: 2.3, knockback: 110, lunge: 60 },
        { mult: 1.3, windup: 0.06, active: 0.09, recover: 0.18, reach: 26, arc: 2.3, knockback: 120, lunge: 70 },
        { mult: 2.4, windup: 0.13, active: 0.11, recover: 0.3, reach: 30, arc: 3.4, knockback: 230, lunge: 110, heavy: true },
      ],
    },
    abilities: ['whirlwind', 'battle_shout', 'charge', 'earthshatter'],
  },
  rogue: {
    name: 'Schurke',
    tagline: 'Zwei Klingen aus dem Schatten',
    role: 'Nahkampf · Beweglichkeit',
    desc: 'Schnelle Dolchkombos mit hoher kritischer Trefferchance. Taucht durch Gegnerreihen und schlägt zu, bevor sie reagieren.',
    icon: 'dagger', weapon: 'dagger',
    attackDesc: 'Blitzschnelle Stiche im Wechsel, Abschluss mit einem Kreuzschnitt.',
    base: { str: 8, agi: 15, int: 6, vit: 10 },
    growth: { str: 1, agi: 2, int: 0, vit: 1 },
    primary: 'agi',
    hp: 56, hpPerLevel: 6, armor: 4, crit: 0.16, speed: 1.06, powerBase: 3,
    resource: { type: 'energy', name: 'Energie', color: '#e8c25a', max: 100, regen: 22, start: 100 },
    basic: {
      kind: 'melee',
      combo: [
        { mult: 0.75, windup: 0.04, active: 0.07, recover: 0.1, reach: 20, arc: 1.9, knockback: 70, lunge: 70 },
        { mult: 0.75, windup: 0.04, active: 0.07, recover: 0.1, reach: 20, arc: 1.9, knockback: 70, lunge: 70, off: true },
        { mult: 1.5, windup: 0.08, active: 0.1, recover: 0.2, reach: 24, arc: 3.0, knockback: 160, lunge: 120, heavy: true },
      ],
    },
    abilities: ['shadow_step', 'fan_of_knives', 'poison_blades', 'assassinate'],
  },
  ranger: {
    name: 'Waldläufer',
    tagline: 'Pfeil und Bogen',
    role: 'Fernkampf · Kontrolle',
    desc: 'Hält Gegner mit präzisen Pfeilen auf Abstand. Fokus lädt sich schnell auf und speist Salven und durchschlagende Schüsse.',
    icon: 'bow', weapon: 'bow',
    attackDesc: 'Gezielter Pfeilschuss auf große Distanz.',
    base: { str: 8, agi: 14, int: 8, vit: 10 },
    growth: { str: 0, agi: 2, int: 1, vit: 1 },
    primary: 'agi',
    hp: 54, hpPerLevel: 6, armor: 4, crit: 0.1, speed: 1.02, powerBase: 3,
    resource: { type: 'energy', name: 'Fokus', color: '#6ee06a', max: 100, regen: 16, start: 100 },
    basic: {
      kind: 'ranged',
      shot: { projectile: 'arrow', mult: 1.4, early: { pct: 0.3, from: 18, to: 26 }, windup: 0.14, recover: 0.2, speed: 280, knockback: 90, range: 220 },
    },
    abilities: ['volley', 'piercing_shot', 'fire_trap', 'arrow_rain'],
  },
  mage: {
    name: 'Glutmagier',
    tagline: 'Feuer aus der Tiefe',
    role: 'Fernkampf · Flächenschaden',
    desc: 'Zerbrechlich, aber tödlich. Glutbolzen treffen aus sicherer Entfernung, der Flammenring schleudert alles in der Nähe zurück.',
    icon: 'staff', weapon: 'staff',
    attackDesc: 'Glutbolzen, die beim Aufprall zerbersten.',
    base: { str: 5, agi: 8, int: 15, vit: 8 },
    growth: { str: 0, agi: 1, int: 2, vit: 1 },
    primary: 'int',
    hp: 56, hpPerLevel: 7, armor: 5, crit: 0.1, speed: 1.0, powerBase: 4,
    resource: { type: 'mana', name: 'Mana', color: '#5a8cff', max: 50, perInt: 3, regen: 7, start: 1 },
    basic: {
      kind: 'ranged',
      shot: { projectile: 'bolt', mult: 2.4, windup: 0.16, recover: 0.22, speed: 210, knockback: 120, range: 200 },
    },
    abilities: ['flame_nova', 'blink', 'fireball', 'meteor'],
  },
};

// Fähigkeiten: cost in der Ressource der Klasse, cooldown in Sekunden,
// mult = Schadensfaktor auf die Angriffskraft (× abilityPower des Volkes).
export const ABILITIES = {
  whirlwind: { name: 'Wirbelsturm', icon: 'axe', cost: 35, cooldown: 5, mult: 1.8, desc: 'Dreht sich mit ausgestreckter Klinge und trifft alle Gegner ringsum.' },
  battle_shout: { name: 'Kriegsschrei', icon: 'helm', cost: 0, cooldown: 14, desc: 'Erzeugt sofort 40 Wut und verringert erlittenen Schaden 5 Sekunden lang um 40 %.' },
  shadow_step: { name: 'Schattenschritt', icon: 'dagger', cost: 35, cooldown: 4, mult: 1.3, desc: 'Sprintet unverwundbar durch die Gegner und verletzt alle auf dem Weg.' },
  fan_of_knives: { name: 'Dolchfächer', icon: 'dagger', cost: 40, cooldown: 6, mult: 0.8, desc: 'Wirft sieben Wurfdolche in einem weiten Fächer.' },
  volley: { name: 'Pfeilsalve', icon: 'bow', cost: 30, cooldown: 5, mult: 0.8, desc: 'Fünf Pfeile auf einmal – ideal gegen Gruppen.' },
  piercing_shot: { name: 'Durchschuss', icon: 'bow', cost: 40, cooldown: 7, mult: 2.6, desc: 'Kurz gespannt, dann ein Pfeil, der alle Gegner in einer Linie durchschlägt.' },
  flame_nova: { name: 'Flammenring', icon: 'gem', cost: 30, cooldown: 6, mult: 2.1, desc: 'Ein Glutring bricht aus dem Boden, verbrennt und schleudert nahe Gegner weg.' },
  blink: { name: 'Blinzeln', icon: 'scroll', cost: 20, cooldown: 5, desc: 'Teleportiert ein Stück in Zielrichtung – Rettung aus jeder Umzingelung.' },

  // Ab Stufe 4 (skill3) und Stufe 12 (skill4)
  charge: { name: 'Sturmangriff', icon: 'skill_charge', level: 4, cost: 0, cooldown: 9, mult: 1.3, desc: 'Stürmt mit dem Schild voran, rammt alle Gegner auf dem Weg zur Seite und erzeugt 20 Wut.' },
  earthshatter: { name: 'Erdspalter', icon: 'skill_nova', level: 12, cost: 50, cooldown: 12, mult: 4.0, desc: 'Ein Hieb, der den Boden spaltet: drei Erdstöße laufen in Zielrichtung und schleudern alles davon.' },
  poison_blades: { name: 'Giftklingen', icon: 'skill_poison', level: 4, cost: 25, cooldown: 14, mult: 0.35, desc: '8 Sekunden lang vergiften deine Treffer die Gegner: vier Giftschläge über zwei Sekunden.' },
  assassinate: { name: 'Todesstoß', icon: 'skill_slash', level: 12, cost: 45, cooldown: 10, mult: 4, desc: 'Springt hinter den nächsten Gegner in Zielrichtung und sticht zu – mit 50 % höherer Chance auf einen kritischen Treffer.' },
  fire_trap: { name: 'Sprengfalle', icon: 'skill_nova', level: 4, cost: 25, cooldown: 10, mult: 2.4, desc: 'Legt eine Glutfalle, die explodiert, sobald ein Gegner sie betritt (spätestens nach 8 Sekunden).' },
  arrow_rain: { name: 'Pfeilhagel', icon: 'skill_arrows', level: 12, cost: 50, cooldown: 14, mult: 0.75, desc: 'Ein Schwarm Pfeile regnet anderthalb Sekunden lang auf das Zielgebiet.' },
  fireball: { name: 'Feuerball', icon: 'skill_fireball', level: 4, cost: 25, cooldown: 6, mult: 3.1, desc: 'Eine schwere Glutkugel, die beim Aufprall explodiert und alle Gegner in der Nähe trifft.' },
  meteor: { name: 'Meteor', icon: 'skill_fireball', level: 12, cost: 60, cooldown: 16, mult: 6.4, desc: 'Ruft nach kurzem Zögern einen brennenden Felsbrocken auf das Ziel herab. Riesiger Schaden im Einschlagsbereich.' },
};

export const DEFAULT_CLASS = 'warrior';
