import { appPlatform } from './native.js';

// Käufe über den App Store (nur iOS-App ab Version 1.1). Die native Seite steckt in app/ios/App/App/StorePlugin.swift und
// wird über Capacitor.nativePromise aufgerufen (die Seite kommt von der Website, ein Capacitor-Paket ist nicht eingebaut).
// Ältere App-Versionen ohne Plugin lehnen jeden Aufruf ab; dann bleibt der Shop in der App einfach verborgen.
//   products(ids)      → [{ id, displayPrice }] (Apple-Produkt-IDs, Preise im Format des App-Store-Landes)
//   purchase(id, acct) → { status: 'ok'|'pending'|'cancel', jws?, transactionId? }
//   unfinished()       → [{ jws, transactionId, productId }] bezahlt, vom Server noch nicht bestätigt
//   finish(txId)       schließt einen Kauf ab (erst nach der Gutschrift durch den Server)
//   restore()          → [{ jws, transactionId, productId }] dauerhafte Käufe dieser Apple-ID
//   requestReview()    Bewertungsfrage von Apple (iOS entscheidet, ob sie erscheint)
const PLUGIN = 'EmberStore';

export const hasAppStore = () => appPlatform() === 'ios' && typeof globalThis.Capacitor?.nativePromise === 'function';

const call = (method, options = {}) => (hasAppStore()
  ? globalThis.Capacitor.nativePromise(PLUGIN, method, options)
  : Promise.reject(new Error('app-store')));

export const appStore = {
  products: (ids) => call('products', { ids }).then((r) => (Array.isArray(r?.products) ? r.products : [])),
  purchase: (id, account) => call('purchase', { id, account }),
  unfinished: () => call('unfinished').then((r) => (Array.isArray(r?.transactions) ? r.transactions : [])),
  finish: (transactionId) => call('finish', { transactionId: String(transactionId) }),
  restore: () => call('restore').then((r) => (Array.isArray(r?.transactions) ? r.transactions : [])),
  requestReview: () => call('requestReview'),
};
