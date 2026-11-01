# Store-App (iOS, später Android)

Capacitor-Hülle um https://www.emberwrath.com/spielen/. Die App lädt das Spiel von der Website, Updates am Spiel
brauchen also keine neue App-Version. Nur Änderungen in `app/` (Symbol, Startbild, native Einstellungen) gehen
über einen neuen Build durch die Store-Prüfung.

- `capacitor.config.json`: Adresse, User-Agent-Zusatz `EmberwrathApp/ios|android`, Startbild.
- `www/offline.html`: wird gezeigt, wenn die Website nicht erreichbar ist (eigene kleine Übersetzung de/en/es/fr).
- `ios/`: Xcode-Projekt (Swift Package Manager, kein CocoaPods). Nur Querformat, Statusleiste und Home-Strich aus
  (SystemBars in `capacitor.config.json`, Randgesten in `SceneDelegate.swift`), `ITSAppUsesNonExemptEncryption = false` (nur HTTPS).
- `tools/icons.py`: erzeugt App-Symbol und Startbild aus `src/ui/pwa/app-icon-512.png` und `site/img/logo.png`.

Ab Version 1.1: `ios/App/App/StorePlugin.swift` (In-App-Käufe mit StoreKit 2 und Apples Bewertungsfrage), im Spiel
über `Capacitor.nativePromise('EmberStore', …)` aus `src/app/store.js` angesprochen (Shop siehe `docs/SHOP.md`,
Abschnitt „App Store“; Bewertungsfrage einmal nach einem Bosssieg, `src/app/review.js`).

Ab Version 1.1 außerdem:
- `ios/App/App/AuthPlugin.swift`: „Weiter mit Apple“ (natives Fenster), Google im Anmeldefenster des Systems
  (ASWebAuthenticationSession, Rückkehr über `emberwrath://auth`) und die Sitzung im Schlüsselbund, damit man angemeldet
  bleibt (`src/app/auth.js`, `docs/ONLINE.md`). Mit Google in der App ist „Mit Apple anmelden“ Pflicht (Richtlinie 4.8).
- `ios/App/App/PushPlugin.swift`: Mitteilungen. Das Spiel fragt am zweiten Spieltag nach der Tagesbelohnung (erst eine
  eigene Frage, dann Apples Abfrage) und plant eine Erinnerung um 18 Uhr, wenn die nächste Tagesbelohnung bereitliegt
  (`src/app/notify.js`). Für Mitteilungen vom Server meldet sich die App bei APNs an; gesendet wird noch nichts.
- `ios/App/App/App.entitlements`: Sign in with Apple, `aps-environment`. Der Build schaltet die Fähigkeiten an der App-ID
  ein (`tools/appstore-faehigkeiten.mjs`) und bettet die Berechtigungen vor dem Export ein (unsigniertes Archiv).
- User-Agent-Zusatz `EmberwrathNative/2`: daran erkennt das Spiel, dass die Plugins da sind. In App 1.0 bleibt es bei E-Mail.

Im Spiel erkennt `src/app/native.js` die App. Dort gilt: Shop nur über den App Store (Apple Richtlinie 3.1.1), kein
„Zurück zur Website“, kein Vollbild-/Home-Bildschirm-Hinweis.

## Bauen

Kein Mac nötig: `.github/workflows/app-ios.yml` baut bei jeder Änderung in `app/` auf GitHub (macOS).
Hochladen: GitHub → Actions → „iOS-App“ → „Run workflow“ (upload an). Der Build landet in App Store Connect
unter TestFlight. Dafür braucht das Repo diese Secrets (Settings → Secrets and variables → Actions):

| Secret | Woher |
|---|---|
| `APPLE_TEAM_ID` | developer.apple.com → Account → Membership details → Team ID |
| `ASC_KEY_ID` | App Store Connect → Benutzer und Zugriff → Integrationen → App Store Connect API → Team-Schlüssel (Zugriff „Admin“) |
| `ASC_ISSUER_ID` | dieselbe Seite, „Issuer ID“ oben |
| `ASC_KEY_P8` | Inhalt der heruntergeladenen `AuthKey_….p8` (nur einmal herunterladbar) |

Lokal (Mac mit Xcode): `cd app && npm ci && npx cap sync ios && npx cap open ios`.
