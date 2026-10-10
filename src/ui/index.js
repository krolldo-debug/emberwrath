import { FeedbackSystem } from '../systems/Feedback.js';
import { Hud } from './Hud.js';
import { Toasts } from './Toasts.js';
import { ScreenFx } from './ScreenFx.js';
import { createMenuPanel } from './MenuPanel.js';
import { Minimap, createMapPanel } from './Minimap.js';
import { installTravel, listenTravel } from './TravelPanel.js';
import { installWardrobe } from './WardrobePanel.js';
import { ZoneTransition } from './ZoneTransition.js';
import { Unlocks } from './Unlocks.js';
import { Rewards } from './Rewards.js';
import { Weather } from '../gfx/Weather.js';
import { QualityControl } from './Quality.js';
import { installDialogPortraits } from './DialogPortrait.js';
import { installLogoCss } from '../gfx/Logo.js';
import { installPrefs } from './Settings.js';
import { installFullscreen } from './Fullscreen.js';
import { createGuideSprites } from '../sprites/effects.js';
import { Music } from '../audio/Music.js';
import { Soundscape } from '../audio/Soundscape.js';

// Thread D – Darstellung: Feedback/Effekte, Bildschirm-Effekte, HTML-HUD,
// Meldungen, Touch-Steuerung (im HUD) und das Spielmenü (Esc).
export function installUi(game) {
  installLogoCss(); // Schriftzug als CSS-Variable --ef-logo (Titelbildschirm)
  installPrefs(game); // Lautstärke, Touch-Größe, Minimap aus game.prefs
  installFullscreen(game); // Vollbild (Android/iPad) bzw. Web-App vom Home-Bildschirm (iPhone)
  // Effekt-Sprites für andere Bereiche: assets.effects.guide (Questpfad, Thread B)
  game.assets.effects ??= {};
  game.assets.effects.guide = createGuideSprites();
  // Prozedurale Musik (eine Instanz für das ganze Spiel, Lautstärke in prefs.musicVolume)
  game.music = new Music(game.sfx, game.prefs);
  game.addSessionSystem('soundscape', (session) => new Soundscape(session, game.music), 1);
  // Qualitätsstufe (prefs.quality) und Umgebungseffekte je Zone (Asche, Regen, Glut, Wasserlicht, Hitze)
  game.quality = new QualityControl(game);
  game.addSessionSystem('ambience', (session) => {
    const weather = new Weather(session);
    session.weather = weather; // nur lesend (Debug, Tests)
    return {
      update: (dt) => { game.quality.update(dt, session, weather); weather.update(dt); },
      draw: (ctx) => weather.draw(ctx),
    };
  }, 50);
  game.addSessionSystem('feedback', (session) => new FeedbackSystem(session), 0);
  game.addSessionSystem('hud', (session) => {
    installDialogPortraits(game); // Porträts im Questdialog (einmalig, alle Panels sind dann registriert)
    const fx = new ScreenFx(session);
    const hud = new Hud(session);
    const toasts = new Toasts(session);
    const minimap = new Minimap(session, hud.frame);
    const zt = new ZoneTransition(session);
    const unlocks = new Unlocks(session, hud);
    hud.unlocks = unlocks; // Banner haben Vorrang vor Freischalt-Karten (Warteschlange im Hud)
    const rewards = new Rewards(session, hud); // Kill-Serie, fliegende Beute, EP-Glühen, Fähigkeit bereit
    listenTravel(session); // Wegstein -> Reisemenü
    return {
      update: (dt) => { fx.update(dt); hud.update(dt); rewards.update(dt); toasts.update(dt); minimap.update(dt); zt.update(dt); unlocks.update(dt); },
      draw: (ctx) => fx.draw(ctx),
      dispose: () => { rewards.dispose(); unlocks.dispose(); zt.dispose(); minimap.dispose(); hud.dispose(); toasts.dispose(); },
    };
  }, 100);
  game.panels.register('menu', (session) => createMenuPanel(session), { title: 'Menü' });
  game.panels.register('map', (session) => createMapPanel(session), { title: 'Karte' });
  installTravel(game);
  installWardrobe(game);
}
