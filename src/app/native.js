// Store-App (app/, Capacitor-Hülle um /spielen/). Die Hülle hängt „EmberwrathApp/ios“ bzw. „/android“ an den User-Agent.
// In der App gilt: Shop nur über den App Store (src/app/store.js, ab App 1.1; Stripe ist dort nicht erlaubt), keine Google-Anmeldung
// (Google sperrt sie in eingebetteten Ansichten), kein Weg zurück zur Website (die App ist das Spiel).
const match = () => (globalThis.navigator?.userAgent ?? '').match(/EmberwrathApp\/(ios|android)/);

export const inApp = () => !!match();
export const appPlatform = () => match()?.[1] ?? null;
