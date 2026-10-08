// Verbindliche Liste aller Event-Namen, die zwischen Bereichen fließen.
// Neue bereichsübergreifende Events werden hier ergänzt (nur Architektur-Thread)
// und in docs/INTEGRATION.md mit ihrer Nutzlast beschrieben.
// Bereichsinterne Events (z. B. "footstep", "swing") dürfen frei bleiben.
export const EV = Object.freeze({
  // Ablauf
  SCENE_CHANGE: 'scene:change',          // { from, to }
  SCENE_FAILED: 'scene:failed',          // { id, from, error } Szene ließ sich nicht öffnen (es folgt der Titel)
  VIEW_RESIZED: 'view:resized',          // { width, height, portrait }  (internes Bild hat neue Größe)
  GAME_STARTED: 'game:started',          // { accountId, characterId, isNew }
  GAME_SAVED: 'game:saved',              // { at, reason }
  SAVE_CHARACTER: 'save:character',      // { accountId, characterId }  – jeder erfolgreiche Charakter-Schreibvorgang (SaveStore)
  SAVE_DELETED: 'save:deleted',          // { accountId, characterId, fromSync }
  ONLINE_CHANGED: 'online:changed',      // { user, status }  – An-/Abmeldung, Sync-Status (src/online)
  STATE_CHANGED: 'state:changed',        // { type, payload, result }  (nach jedem Command)

  // Account & Charakter (A)
  ACCOUNT_LOGIN: 'account:login',        // { accountId, name }
  ACCOUNT_LOGOUT: 'account:logout',      // {}
  CHARACTER_CREATED: 'character:created',// { characterId, name, raceId, classId }
  WARDROBE_UNLOCKED: 'wardrobe:unlocked', // { itemIds }  (neue Aussehen für die Garderobe, character/wardrobe.js)

  // Welt (B)
  ZONE_ENTER: 'zone:enter',              // { zoneId, instanceId, spawnId }
  ZONE_LEAVE: 'zone:leave',              // { zoneId }
  ZONE_TRAVEL: 'zone:travel',            // Anfrage: { zoneId, spawnId }  -> PlayScene wechselt die Zone
  AREA_REACHED: 'area:reached',          // { areaId, zoneId }  (Trigger-Flächen, z. B. Dungeon-Eingang entdeckt)
  NPC_INTERACT: 'npc:interact',          // { npcId, x, y }
  ENEMY_KILLED: 'enemy:killed',          // { enemyId, type, level, x, y, zoneId, isBoss, xp }
  BOSS_ENGAGED: 'boss:engaged',          // { bossId }
  BOSS_DEFEATED: 'boss:defeated',        // { bossId, x, y }
  TRAVEL_OPEN: 'travel:open',            // Teleporter-Fenster öffnen (erkundete Städte, Welt B)
  TRAVEL_GO: 'travel:go',                // Teleport zu einer erkundeten Stadt (Welt B)
  BOARD_OPEN: 'board:open',              // Auftragsbrett öffnen (Welt B)
  OBJECT_INTERACT: 'object:interact',    // { objectId, kind, x, y }  (Truhen, Hebel …)
  PLAYER_DIED: 'player:died',            // { zoneId }
  PLAYER_RESPAWNED: 'player:respawned',  // { zoneId, spawnId }

  // Fortschritt (C)
  XP_GAINED: 'xp:gained',                // { amount, total, source }
  LEVEL_UP: 'level:up',                  // { level }
  LOOT_DROPPED: 'loot:dropped',          // { x, y, drops: [{ itemId, qty } | { gold }] }
  ITEM_ADDED: 'item:added',              // { itemId, qty, source }
  ITEM_REMOVED: 'item:removed',          // { itemId, qty }
  ITEM_EQUIPPED: 'item:equipped',        // { slot, itemId }
  ITEM_USED: 'item:used',                // { itemId }
  GOLD_CHANGED: 'gold:changed',          // { delta, total, source }
  QUEST_ACCEPTED: 'quest:accepted',      // { questId }
  QUEST_PROGRESS: 'quest:progress',      // { questId, objectiveId, current, required }
  QUEST_READY: 'quest:ready',            // { questId }  (alle Ziele erfüllt, Abgabe offen)
  QUEST_COMPLETED: 'quest:completed',    // { questId, rewards }
  QUEST_TRACKED: 'quest:tracked',        // { questId | null }  (Questpfad neu berechnen)
  // Endgame „Glutprüfungen“ (Thread C, Zone ember_trial)
  TRIAL_STARTED: 'trial:started',        // { run }
  TRIAL_PROGRESS: 'trial:progress',      // { value, target, timeLeft }
  TRIAL_BOSS: 'trial:boss',              // { bossId }
  TRIAL_COMPLETED: 'trial:completed',    // { tier, time, rewards }
  TRIAL_FAILED: 'trial:failed',          // { reason }
  MOUNT_CHANGED: 'mount:changed',        // { riding, mountId }  (INTEGRATION §12.6)
  MOUNT_LEARNED: 'mount:learned',        // { mountId }
  ACHIEVEMENT_UNLOCKED: 'achievement:unlocked', // { id, name, title? }  (Thread C)
  ITEM_AUTO_SOLD: 'item:autoSold',             // { itemId, qty, gold }  (Thread C)

  // UI (D und alle, die UI anfordern)
  UI_TOAST: 'ui:toast',                  // { text, kind: 'info'|'loot'|'quest'|'warn' }
  UI_BANNER: 'ui:banner',                // { title, sub, color }
  UI_OPEN_PANEL: 'ui:openPanel',         // { id, params }
  UI_CLOSE_PANEL: 'ui:closePanel',       // { id }
  PREFS_CHANGED: 'prefs:changed',        // { key, value }  (Geräte-Einstellungen, game.prefs)
  UI_PROMPT: 'ui:prompt',                // { text, x, y } | null  (Interaktionshinweis "E – Sprechen")
});
