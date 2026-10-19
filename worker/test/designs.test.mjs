// Shop-Designs im Aussehen für andere Spieler (worker/designs.js) ohne Netz. Aufruf: node worker/test/designs.test.mjs
import { stripDesigns, missingDesigns, ownedDesigns } from '../designs.js';
import { cleanLook } from '../../src/net/protocol.js';

let fails = 0;
const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fails++; };

const look = cleanLook({
  raceId: 'human', classId: 'warrior', appearance: { variant: 1, dye: 'phoenix' },
  items: { weapon: 'set_glutthron_weapon', chest: 'set_glutthron_chest', head: null, hands: null, feet: null },
  mountId: 'phoenix_wing', riding: true,
});

let s = stripDesigns(look, new Set());
ok(s.mountId === null && s.riding === false && s.appearance.dye === null && s.items.weapon === null && s.items.chest === null,
  'Nichts gekauft: Phönixschwinge, Färbung und Skinset fallen weg');
ok(look.mountId === 'phoenix_wing', 'Original bleibt unverändert');
s = stripDesigns(look, new Set(['mount:phoenix_wing', 'dye:phoenix', 'look:set_glutthron']));
ok(s.mountId === 'phoenix_wing' && s.riding && s.appearance.dye === 'phoenix' && s.items.weapon === 'set_glutthron_weapon', 'Gekauft: bleibt sichtbar');
s = stripDesigns(look, null);
ok(s.mountId === null && s.items.chest === null, 'Störung beim Laden: nichts Exklusives');
ok(stripDesigns(look, undefined) === look, 'Ohne Secret (lokal): unverändert');
const plain = cleanLook({ appearance: { dye: 'crimson' }, items: {}, mountId: 'ash_wolf', riding: true });
s = stripDesigns(plain, new Set());
ok(s.mountId === 'ash_wolf' && s.appearance.dye === 'crimson', 'Erspielbare Reittiere und Färbungen bleiben');
ok(missingDesigns(look, new Set()) && !missingDesigns(plain, new Set()) && !missingDesigns(look, undefined), 'missingDesigns erkennt ungekaufte Designs');

const calls = [];
globalThis.fetch = async (u) => {
  calls.push(String(u));
  const p = new URL(String(u)).pathname;
  const body = p.endsWith('/gold_orders') ? [{ items: ['mount:soul_wolf', 'dye:soullight'] }] : [{ item: 'look:set_glutthron' }];
  return new Response(JSON.stringify(body), { status: 200 });
};
const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' };
const uid = '00000000-0000-0000-0000-000000000001';
const owned = await ownedDesigns(env, uid);
ok(owned.has('mount:soul_wolf') && owned.has('look:set_glutthron') && owned.size === 3, 'Besitz aus bezahlten Bestellungen und Geschenken');
ok(calls[0].includes('status=in.(paid,credited)') && calls[0].includes('kind=eq.design'), 'Nur bezahlte Design-Bestellungen');
ok(await ownedDesigns({}, uid) === undefined, 'Ohne Secret: undefined');
globalThis.fetch = async () => new Response('x', { status: 500 });
ok(await ownedDesigns(env, uid) === null, 'Störung: null');

console.log(fails ? `\n${fails} Fehler` : '\nAlle Design-Prüfungen bestanden');
process.exit(fails ? 1 : 0);
