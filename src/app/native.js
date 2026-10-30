// Store-App (app/, Capacitor-Hülle um /spielen/). Die Hülle hängt „EmberwrathApp/ios“ bzw. „/android“ an den User-Agent,
// ab App 1.1 zusätzlich „EmberwrathNative/2“ (Stufe der eingebauten Plugins, app/capacitor.config.json).
// In der App gilt: Shop nur über den App Store (src/app/store.js, ab App 1.1; Stripe ist dort nicht erlaubt), kein Weg
// zurück zur Website (die App ist das Spiel). Google und Apple melden ab App 1.1 nativ an (src/app/auth.js); in App 1.0
// gibt es nur E-Mail (Google sperrt die Anmeldung in eingebetteten Ansichten).
const ua = () => globalThis.navigator?.userAgent ?? '';
const match = () => ua().match(/EmberwrathApp\/(ios|android)/);

export const inApp = () => !!match();
export const appPlatform = () => match()?.[1] ?? null;
// 0 = Website oder App 1.0, 2 = App mit Anmelde- und Mitteilungs-Plugin (src/app/auth.js, src/app/notify.js)
export const appNativeLevel = () => Number(ua().match(/EmberwrathNative\/(\d+)/)?.[1] ?? 0);
