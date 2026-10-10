// Zielhilfe (Thread A): node src/character/test/aim.test.mjs
import assert from 'node:assert/strict';
import { pickTarget, aimAngle, targetable } from '../aim.js';

const foe = (x, y, extra = {}) => ({ x, y, centerY: y - 8, hurtRadius: 7, rise: 1, hurtable: true, vx: 0, vy: 0, kbx: 0, kby: 0, ...extra });
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
let fails = 0;
const test = (name, fn) => { try { fn(); console.log('ok ', name); } catch (err) { fails++; console.log('FAIL', name, '\n', err.message); } };

test('ohne Eingabe: nächster Gegner ringsum, auch senkrecht über dem Helden', () => {
  const up = foe(0, -30), far = foe(80, 0);
  assert.equal(pickTarget([far, up], { ox: 0, oy: -8, range: 100, facing: 1 }), up);
});

test('Stick: Kegel um die Laufrichtung zuerst, sonst der nächste in Reichweite', () => {
  const right = foe(60, 0), left = foe(-30, 0);
  assert.equal(pickTarget([left, right], { ox: 0, oy: -8, range: 100, dir: { x: 1, y: 0 } }), right);
  assert.equal(pickTarget([left], { ox: 0, oy: -8, range: 100, dir: { x: 1, y: 0 } }), left, 'Zurückweichen: trotzdem Ziel');
  assert.equal(pickTarget([left], { ox: 0, oy: -8, range: 20, dir: { x: 1, y: 0 } }), null, 'außer Reichweite');
});

test('Maus: Gegner unter dem Zeiger schlägt näheren im Kegel', () => {
  const close = foe(30, 0), under = foe(90, 10);
  assert.equal(pickTarget([close, under], { ox: 0, oy: -8, range: 150, pointer: { x: 92, y: 4 } }), under);
  assert.equal(pickTarget([close], { ox: 0, oy: -8, range: 150, pointer: { x: 0, y: 120 } }), null, 'Zeiger weit daneben');
});

test('bisheriges Ziel bleibt bevorzugt, Versteckte/Tote zählen nicht', () => {
  const a = foe(40, 0), b = foe(50, 0);
  assert.equal(pickTarget([a, b], { ox: 0, oy: -8, range: 100, last: b }), b);
  assert.equal(targetable(foe(0, 0, { rise: 0 })), false);
  assert.equal(targetable(foe(0, 0, { dead: true })), false);
});

test('Vorhalt: Geschoss trifft den laufenden Gegner, getroffene Gegner bremsen', () => {
  const e = foe(100, 8, { vx: 0, vy: 60 });
  const ang = aimAngle(e, 0, 0, 200);
  // Flugzeit t: Geschoss und Gegner treffen sich (Abweichung unter dem Trefferkreis)
  const t = 100 / (200 * Math.cos(ang));
  const miss = Math.hypot(Math.cos(ang) * 200 * t - e.x, Math.sin(ang) * 200 * t - (e.centerY + e.vy * t));
  assert.ok(miss < 4, `Abweichung ${miss.toFixed(1)}`);
  assert.ok(near(aimAngle({ ...e, state: 'hurt' }, 0, 0, 200), Math.atan2(e.centerY, e.x)), 'im Taumeln kein Vorhalt');
  assert.ok(near(aimAngle(e, 0, 0), Math.atan2(e.centerY, e.x)), 'Nahkampf ohne Vorhalt');
});

console.log(fails ? `${fails} fehlgeschlagen` : 'alle Tests grün');
process.exit(fails ? 1 : 0);
