// Exklusive Shop-Designs im Aussehen, das andere Spieler sehen (Welt-Server, Glutarena): nur, wenn das Konto sie besitzt.
// Ein veränderter Client könnte sonst Phönixschwinge, Skinsets usw. allen zeigen, ohne zu zahlen. Besitz wie
// shop_owned_items() in Supabase: bezahlte Design-Bestellungen (gold_orders, kind 'design', paid/credited) und Geschenke
// (shop_grants). Schlüssel wie im Katalog: 'mount:<id>', 'dye:<id>', 'look:<Set>' (src/shop/catalog.js DESIGN_ITEMS).

import { DESIGN_ITEMS } from '../src/shop/catalog.js';
import { ITEMS } from '../src/progression/items.js';
import { ONLINE_CONFIG } from '../src/online/config.js';

const EXCLUSIVE = new Set(DESIGN_ITEMS);
const exclusive = (key) => EXCLUSIVE.has(key);
const setKey = (itemId) => (itemId && Object.hasOwn(ITEMS, itemId) && ITEMS[itemId].skinSet ? `look:${ITEMS[itemId].skinSet}` : null);

// Abbild (cleanLook) ohne die exklusiven Teile, die owned (Set der Schlüssel) nicht enthält.
// owned undefined: nicht prüfbar (kein Secret, z. B. lokal) → unverändert.
export function stripDesigns(look, owned) {
  if (!look || owned === undefined) return look;
  const has = (key) => !exclusive(key) || !!owned?.has(key);
  const out = { ...look, appearance: { ...look.appearance }, items: { ...look.items } };
  if (out.mountId && !has(`mount:${out.mountId}`)) { out.mountId = null; out.riding = false; }
  if (out.appearance.dye && !has(`dye:${out.appearance.dye}`)) out.appearance.dye = null;
  for (const [slot, id] of Object.entries(out.items)) {
    const k = setKey(id);
    if (k && !has(k)) out.items[slot] = null;
  }
  return out;
}

// Zeigt das Abbild ein exklusives Design, das owned nicht kennt? (dann lohnt ein neues Laden, z. B. gerade gekauft)
export function missingDesigns(look, owned) {
  if (!look || owned === undefined) return false;
  const keys = [look.mountId && `mount:${look.mountId}`, look.appearance?.dye && `dye:${look.appearance.dye}`,
    ...Object.values(look.items ?? {}).map(setKey)];
  return keys.some((k) => k && exclusive(k) && !owned?.has(k));
}

// Designs eines Kontos → Set; null bei Störung (dann gilt nichts Exklusives als bezahlt); undefined ohne Secret.
export async function ownedDesigns(env, uid) {
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!key) return undefined;
  if (!/^[0-9a-f-]{36}$/i.test(String(uid ?? ''))) return new Set();
  const base = String(env.SUPABASE_URL || ONLINE_CONFIG.supabaseUrl).replace(/\/$/, '');
  const get = async (path) => {
    const r = await fetch(`${base}/rest/v1/${path}`, {
      headers: { apikey: key, ...(key.startsWith('eyJ') ? { authorization: `Bearer ${key}` } : {}) },
    });
    if (!r.ok) throw new Error(`db ${r.status}`);
    return r.json();
  };
  try {
    const [orders, grants] = await Promise.all([
      get(`gold_orders?user_id=eq.${uid}&kind=eq.design&status=in.(paid,credited)&select=items`),
      get(`shop_grants?user_id=eq.${uid}&select=item`),
    ]);
    const out = new Set();
    for (const o of orders ?? []) for (const k of o.items ?? []) out.add(k);
    for (const g of grants ?? []) out.add(g.item);
    return out;
  } catch { return null; }
}
