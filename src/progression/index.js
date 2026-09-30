import { registerProgressionContent, registerProgressionState } from './logic.js';
import { ProgressionSystem } from './ProgressionSystem.js';
import { registerPanels } from './panels.js';
import { xpToNext, totalXpForLevel, LEVEL_CAP, LEVEL_GROWTH } from './xp.js';
import { rareSpawnsFor } from './rares.js';
import { xpInfo, equipmentBonus, trackedQuests, trackedQuestId, questTarget, npcMarker, questStatus, questsForNpc, potionCount, countItem, vendorStock, isUpgrade } from './selectors.js';

// Thread C – Fortschritt: Erfahrung und Stufen, Beute, Inventar, Gold, Quests, Händler.
//
// Slices:  progress { level, xp (gesamt), xpNext (gesamt), stats }
//          inventory { slots[36] of { itemId, qty, n? } | null, equipment { weapon, head, chest, hands, feet, ring, amulet } }
//          wallet { gold }
//          quests { active { [id]: { status 'active'|'ready', progress, seen? } }, completed [], repeats {}, tracked }
//          rares { killedAt { [rareId]: ms }, kills { [rareId]: n } }  (seltene Weltgegner, rares.js)
// Inhalte: content 'item', 'quest', 'vendor', 'recipe', 'npcLine'
// Panels:  inventory (I), character (C), questlog (L), questDialog, shop, craft, smith, bank, achievements, trials
// Endgame: bank, achievements, trials (endgame.js); Sets (sets.js), Verstärken/Verzaubern (smithing.js)
// Lesezugriff für andere Bereiche: game.progression (siehe unten) oder progression/selectors.js.
// Details: src/progression/README.md
export function installProgression(game) {
  registerProgressionContent(game.content);
  const logic = registerProgressionState(game.state);

  const state = game.state, content = game.content;
  let system = null;
  let lastRares = [];
  game.progression = {
    LEVEL_CAP, LEVEL_GROWTH, xpToNext,
    xpForLevel: totalXpForLevel,                  // Gesamt-XP, ab der eine Stufe erreicht ist
    xpInfo: () => xpInfo(state),                  // { level, xp, into, need, frac, capped }
    equipmentBonus: () => equipmentBonus(state, content),
    trackedQuests: () => trackedQuests(state, content),
    questStatus: (id) => questStatus(state, content, id),
    questsForNpc: (npcId) => questsForNpc(state, content, npcId),
    npcMarker: (npcId) => npcMarker(state, content, npcId),  // 'available' | 'repeatable' | 'ready' | 'active' | null
    trackedQuestId: () => trackedQuestId(state, content),   // verfolgte Quest (gewählt oder erste Hauptquest)
    focusedQuestId: () => trackedQuestId(state, content),   // Alias
    questTarget: () => questTarget(state, content),         // Ziel für den Questpfad, INTEGRATION.md §11.6
    trackQuest: (questId) => state.commit('quest:track', { questId }),
    guideQuest: (questId) => state.commit('quest:guide', { questId }), // Weg zum Questgeber einer verfügbaren Quest
    vendorStock: (vendorId) => vendorStock(content, vendorId),
    isUpgrade: (itemId) => isUpgrade(state, content, itemId),
    // Endgame
    title: () => { const id = state.slices.achievements?.title; return id ? content.find('achievement', id)?.title ?? null : null; },
    bonus: () => ({ ...state.slices.inventory.bonus }),          // Setboni + Verstärkung + Verzauberung (computeStats von A)
    trialRun: () => state.slices.trials?.run ?? null,            // Laufbeschreibung für Thread B (Format: README)
    trialInfo: () => {                                          // für das HUD (D)
      const run = state.slices.trials?.run;
      if (!run) return null;
      return { tier: run.tier, name: run.name, value: run.value, target: run.target, phase: run.phase, timeLeft: Math.max(0, run.timeLimit - (system?.trialTime ?? 0)), affixes: run.affixes };
    },
    // Seltene Weltgegner (rares.js): einmal pro Zonenaufbau aufrufen. Liefert
    // [{ rareId, type, name, title, level, hpMult, dmgMult, scale, tint, spawn, elite }]; B meldet den Tod mit rareId.
    rareSpawns: (zoneId) => {
      const list = rareSpawnsFor(zoneId, state.slices.rares, Date.now());
      lastRares = list.map((r) => ({ ...r, zoneId }));
      return list;
    },
    potionCount: () => potionCount(state, content),
    countItem: (id) => countItem(state, id),
    usePotion: () => system?.usePotion() ?? false,          // wie Taste H
    pendingLoot: () => logic.ledger.size,
  };

  game.addSessionSystem('progression', (session) => {
    system = new ProgressionSystem(session, { lastRareSpawns: () => lastRares });
    return {
      update: (dt, s) => system.update(dt, s),
      draw: (ctx, s) => system.draw(ctx, s),
      dispose: () => { system = null; },
    };
  }, 10);

  registerPanels(game);
}
