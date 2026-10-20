# Store-App (iOS, später Android)

Capacitor-Hülle um https://www.emberwrath.com/spielen/. Die App lädt das Spiel von der Website, Updates am Spiel
brauchen also keine neue App-Version. Nur Änderungen in `app/` (Symbol, Startbild, native Einstellungen) gehen
über einen neuen Build durch die Store-Prüfung.

- `capacitor.config.json`: Adresse, User-Agent-Zusatz `EmberwrathApp/ios|android`, Startbild.
- `www/offline.html`: wird gezeigt, wenn die Website nicht erreichbar ist (eigene kleine Übersetzung de/en/es/fr).
- `ios/`: Xcode-Projekt (Swift Package Manager, kein CocoaPods). Nur Querformat, Statusleiste und Home-Strich aus
  (`SceneDelegate.swift`, `GameViewController`), `ITSAppUsesNonExemptEncryption = false` (nur HTTPS).
- `tools/icons.py`: erzeugt App-Symbol und Startbild aus `src/ui/pwa/app-icon-512.png` und `site/img/logo.png`.

Im Spiel erkennt `src/app/native.js` die App. Dort gilt: kein Gold-Shop (Apple Richtlinie 3.1.1), keine
Google-Anmeldung (Google sperrt eingebettete Ansichten; ohne fremde Anmeldung entfällt auch „Mit Apple anmelden“,
Richtlinie 4.8), kein „Zurück zur Website“, kein Vollbild-/Home-Bildschirm-Hinweis. Wer sich mit Google
registriert hat, setzt einmal über „Passwort vergessen“ ein Passwort.

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
