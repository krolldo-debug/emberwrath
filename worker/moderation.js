// Moderation des Gebietschats: Meldungen speichern (DSA Art. 16) und Chatsperren lesen (Art. 17).
// Gespeichert wird in Supabase (supabase/migrations/20261003120100_chat_meldungen.sql) mit dem Secret
// SUPABASE_SERVICE_ROLE_KEY, wie bei worker/forms.js. Fehlt das Secret oder ist Supabase nicht erreichbar, bleibt die
// Meldung im Speicher des Shards (Durable-Object-Storage) und wird beim nächsten Alarm erneut gesendet; verloren geht nichts.

import { ONLINE_CONFIG } from '../src/online/config.js';

export const REPORT_REASONS = ['beleidigung', 'hass', 'spam', 'betrug', 'name', 'sonstiges'];

const base = (env) => String(env.SUPABASE_URL || ONLINE_CONFIG.supabaseUrl).replace(/\/$/, '');
export const moderationReady = (env) => !!String(env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

async function db(env, path, { method = 'GET', body } = {}) {
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  const r = await fetch(`${base(env)}/rest/v1/${path}`, {
    method,
    headers: {
      // sb_secret_… nur als apikey; ältere service_role-Schlüssel (JWT) zusätzlich als Bearer (siehe worker/forms.js)
      apikey: key, ...(key.startsWith('eyJ') ? { authorization: `Bearer ${key}` } : {}),
      'content-type': 'application/json', prefer: 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`db ${r.status}`);
  return r.status === 204 || method !== 'GET' ? null : r.json();
}

export async function saveReport(env, row) {
  if (!moderationReady(env)) throw new Error('not configured');
  await db(env, 'chat_reports', { method: 'POST', body: row });
}

// Laufende Chatsperre eines Kontos -> { until, reason } | null. Fehler: keine Sperre (Chat bleibt nutzbar).
export async function activeMute(env, uid) {
  if (!moderationReady(env) || !/^[0-9a-f-]{36}$/i.test(uid)) return null;
  try {
    const rows = await db(env, `chat_mutes?user_id=eq.${uid}&until=gt.${encodeURIComponent(new Date().toISOString())}&select=until,reason&order=until.desc&limit=1`);
    return rows?.[0] ? { until: rows[0].until, reason: rows[0].reason ?? '' } : null;
  } catch { return null; }
}

// Gespeicherter Charakter (Name, Stufe) -> { name, level } | null. Quelle für das, was andere Spieler sehen:
// der Client darf Name und Stufe nicht frei behaupten. null bei unbekannt, fehlendem Secret oder Störung.
export async function loadCharacter(env, uid, charId) {
  if (!moderationReady(env) || !/^[0-9a-f-]{36}$/i.test(uid) || !/^[A-Za-z0-9_-]{1,64}$/.test(String(charId ?? ''))) return null;
  try {
    const rows = await db(env, `characters?user_id=eq.${uid}&id=eq.${encodeURIComponent(charId)}&select=name,level&limit=1`);
    return rows?.[0] ? { name: String(rows[0].name ?? ''), level: Number(rows[0].level) || 1 } : null;
  } catch { return null; }
}
