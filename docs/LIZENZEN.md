# Lizenzen und Herkunft aller Bestandteile

Stand 10.10.2026 (Urheberrechts-Check). Bei jedem neuen Bestandteil, der nicht im Repo selbst erzeugt wird, hier eintragen.

## Eigene Werke (im Repo erzeugt)

| Bestandteil | Herkunft |
|---|---|
| Spielgrafik (Figuren, Gegner, Bosse, Reittiere, Kacheln, Icons, Effekte) | prozedural aus `src/sprites/`, `src/gfx/`, `src/character/gearLook.js` |
| Musik | `src/audio/Music.js`, Stücke aus Tonleiter, Akkordfolge und zufälligen Motiven zur Laufzeit erzeugt; keine Audiodateien, keine fremden Melodien |
| Soundeffekte, Stimmen, Umgebung | `src/audio/Sfx.js`, `voices.js`, `Soundscape.js`, per WebAudio synthetisiert |
| Website-Bilder (`site/img/`), Logo, Favicon, App-Icons | aus dem Spielcode gerendert mit `site/tools/*.mjs` |
| Texte, Namen von Orten, Bossen, Gegenständen | eigene Erfindungen; Allgemeinbegriffe wie Phönix, Höllenhund, Sternenfall sind frei |

## Fremde Bestandteile

| Bestandteil | Wo | Lizenz | Pflichten |
|---|---|---|---|
| Schrift Cinzel 600/700 | `site/fonts/` (Website) | SIL OFL 1.1, kein reservierter Name | Lizenztext liegt bei (`OFL-Cinzel.txt`), wird mit ausgeliefert |
| Schrift Inter 400/600/700 | `site/fonts/` (Website) | SIL OFL 1.1, kein reservierter Name | Lizenztext liegt bei (`OFL-Inter.txt`), wird mit ausgeliefert |
| Google-„G“ im Knopf „Weiter mit Google“ | `src/online/LoginScene.js` | Marke von Google, Nutzung nach den Sign-in-Branding-Richtlinien erlaubt | Logo nicht verändern, Knopf hell (weiß, Rand #dadce0), Text „Weiter mit Google“ |
| Symbole TikTok, Instagram, Discord, YouTube | `site/site.js` | Marken der Anbieter, als Link zum eigenen Profil erlaubt | nur als Verweis auf unser Profil, nicht verfremden |
| Systemschriften im Spiel (Trebuchet MS, Georgia, Segoe UI) | `src/ui/theme.css` | auf dem Gerät des Spielers installiert, nichts wird ausgeliefert | keine |

Im ausgelieferten Spiel und auf der Website steckt kein fremder Programmcode (keine Bibliotheken, kein CDN).
Nur Tests und Werkzeuge nutzen Pakete (playwright Apache-2.0, ws MIT, pg MIT); diese werden nicht ausgeliefert.

## Marketing (außerhalb des Repos, `/mnt/project-files/marketing/`)

| Bestandteil | Lizenz |
|---|---|
| Musik und Effekte der Reels | aus dem Spiel gerendert (eigen) |
| Sprecherstimmen Piper „Thorsten“ und „Kerstin“ | Datensätze CC0, gewerbliche Nutzung frei, keine Nennung nötig |
| Untertitel-Schrift Poppins | SIL OFL 1.1, in Videos eingebrannt erlaubt |
| ElevenLabs (falls genutzt) | gewerblich nur mit bezahltem Tarif (ab Starter); im Gratis-Tarif verboten und mit Nennungspflicht |
