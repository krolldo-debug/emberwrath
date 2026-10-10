// Auf welcher Plattform läuft das Spiel? Normal: auf der eigenen Seite (www.emberwrath.com/spielen/).
// Die CrazyGames-Fassung (tools/build-crazygames.mjs, docs/CRAZYGAMES.md) setzt vor dem Spielcode
// globalThis.EMBERWRATH_PLATFORM = 'crazygames'. Sie läuft dann auf einer fremden Adresse (*.crazygames.com)
// und erreicht Welt-Server und Website über SITE_ORIGIN statt über die eigene Adresse.
// Keine Zugriffe auf window/document beim Laden (auch in Node-Tests importierbar).
export const SITE_ORIGIN = 'https://www.emberwrath.com';
export const PLATFORM = globalThis.EMBERWRATH_PLATFORM === 'crazygames' ? 'crazygames' : 'web';
export const IS_CRAZYGAMES = PLATFORM === 'crazygames';

// Basis für /net/*-Anfragen (http) bzw. Welt-Verbindungen (ws). null: keine Verbindung möglich (z. B. file://).
export function httpBase() {
  if (IS_CRAZYGAMES) return SITE_ORIGIN;
  const loc = globalThis.location;
  if (!loc || !/^https?:$/.test(loc.protocol) || !loc.host) return null;
  return loc.origin;
}
export function wsBase() {
  const base = httpBase();
  return base ? base.replace(/^http/, 'ws') : null;
}

// Seiten der Website (Rechtstexte, Support): im Web relativ, auf CrazyGames als volle Adresse.
export const siteUrl = (path) => (IS_CRAZYGAMES ? `${SITE_ORIGIN}${path}` : path);
