import { appPlatform, appNativeLevel } from './native.js';

// Anmeldung in der iOS-App (ab Version 1.1). Die native Seite steckt in app/ios/App/App/AuthPlugin.swift und wird wie der
// Shop über Capacitor.nativePromise angesprochen. Ältere App-Versionen kennen das Plugin nicht: dann bleibt es bei E-Mail.
//   apple({ nonce })       Apples eigenes Anmeldefenster → { idToken, name } (nonce: SHA-256 als Hex, an Apple)
//   web({ url, scheme })   Anmeldeseite im Systembrowser-Fenster (ASWebAuthenticationSession) → { url } der Rückleitung.
//                          Google erlaubt die Anmeldung nur dort, nicht in der Spielansicht.
//   vaultGet/vaultSet/vaultClear  Sitzung zusätzlich im Schlüsselbund des Geräts. Den Speicher der Spielansicht darf iOS
//                          bei knappem Platz leeren, und ein Schreiben kurz vor dem Beenden der App kann verloren gehen;
//                          der Schlüsselbund bleibt. So bleibt man angemeldet.
const PLUGIN = 'EmberAuth';

// Rückleitung nach der Anmeldung im Systembrowser-Fenster. Muss in Supabase unter Redirect URLs stehen (docs/ONLINE.md).
export const APP_AUTH_SCHEME = 'emberwrath';
export const APP_AUTH_REDIRECT = `${APP_AUTH_SCHEME}://auth`;

export const hasNativeAuth = () => appPlatform() === 'ios' && appNativeLevel() >= 2 && typeof globalThis.Capacitor?.nativePromise === 'function';

const call = (method, options = {}) => (hasNativeAuth()
  ? globalThis.Capacitor.nativePromise(PLUGIN, method, options)
  : Promise.reject(new Error('native-auth')));

// Abbruch durch den Spieler (Fenster geschlossen) liefert der Plugin-Fehler mit code 'cancel'.
export const isCancel = (e) => e?.code === 'cancel' || e?.message === 'cancel';

export const nativeAuth = {
  apple: (nonce) => call('apple', { nonce }),
  web: (url) => call('web', { url, scheme: APP_AUTH_SCHEME }).then((r) => r?.url ?? null),
};

// Tresor für AuthClient (Option vault): Fehler schlucken, die Sitzung im Speicher der Spielansicht bleibt maßgeblich.
export const nativeVault = {
  async load() {
    try { const r = await call('vaultGet'); return r?.value ? JSON.parse(r.value) : null; } catch { return null; }
  },
  save(session) { call('vaultSet', { value: JSON.stringify(session) }).catch(() => {}); },
  clear() { call('vaultClear').catch(() => {}); },
};
