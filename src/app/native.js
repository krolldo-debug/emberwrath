// Store-App (app/, Capacitor-Hülle um /spielen/). Die Hülle hängt „EmberwrathApp/ios“ bzw. „/android“ an den User-Agent.
// In der App gilt: kein Gold-Shop (Apple/Google verlangen dort ihre eigenen Käufe), keine Google-Anmeldung
// (Google sperrt sie in eingebetteten Ansichten), kein Weg zurück zur Website (die App ist das Spiel).
const match = () => (globalThis.navigator?.userAgent ?? '').match(/EmberwrathApp\/(ios|android)/);

export const inApp = () => !!match();
export const appPlatform = () => match()?.[1] ?? null;
