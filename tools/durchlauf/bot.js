// Spielbot für den automatischen Durchlauf (tools/durchlauf/run.mjs). Läuft im Browser im echten Spiel:
// folgt der Glutspur der Quests (world/QuestGuide.js), kämpft mit den echten Tasten, spricht mit NPCs,
// nimmt Quests an, gibt sie ab und legt bessere Ausrüstung an. Die Spielschleife wird von außen in festen
// 60-Hz-Schritten schneller als Echtzeit gerechnet; gemessen wird die Spielzeit.
import { isUpgrade, questStatus } from '/src/progression/selectors.js';

const DT = 1 / 60;

export function createBot(g, { questIds, log = () => {}, verbose = false }) {
  const inp = g.input;
  const ids = new Set(questIds);
  let axis = { x: 0, y: 0 };
  inp.axis = () => axis;
  const press = (a) => inp.pressedQueue.add(a);

  const R = {
    time: 0, deaths: [], stuck: [], quests: {}, levels: {}, zones: {}, bosses: {}, errors: [], kills: 0, bounties: 0,
    blocked: [], runs: [], idle: 0, mounted: 0, fighting: 0, walking: 0, events: [],
  };
  const st = () => g.state.slices;
  const content = () => g.scenes.current.content;
  const scene = () => g.scenes.current;
  const sc0 = scene;
  let lastPos = null, still = 0, noGoal = 0, potionCd = 0, deadT = 0, talkCd = 0, lootT = null, mountCd = 0;
  const ignore = new WeakMap();
  let fightTarget = null, bossFight = null, lastZone = null, zoneT0 = 0;

  g.bus.on('enemy:killed', (e) => {
    R.kills++;
    if (e.isBoss || bossFight?.id === e.type) {
      const b = R.bosses[e.type] ??= { tries: 0 };
      b.killedAt = R.time; b.level = st().progress.level;
      if (bossFight) b.seconds = R.time - bossFight.t0;
      log(`BOSS ${e.type} besiegt nach ${b.seconds?.toFixed(0)} s (Stufe ${b.level})`);
      bossFight = null;
    }
  });
  g.bus.on('quest:objective', (e) => {
    if (!e?.kind) return;
    const run = sc0()?.systems?.find((x) => x.sys?.constructor?.name === 'QuestRunSystem')?.sys?.run;
    R.runs.push({ t: R.time, kind: e.kind, target: e.target, level: st().progress.level, npcHp: run?.leader ? Math.round(run.leader.hp) : null });
    log(`ABLAUF ${e.kind} ${e.target} (Stufe ${st().progress.level})`);
  });
  g.bus.on('quest:completed', (e) => {
    const q = R.quests[e.questId] ??= {};
    q.done = R.time; q.level = st().progress.level;
    if (content().find('quest', e.questId)?.repeatable) R.bounties++;
    log(`fertig ${e.questId} (Stufe ${q.level}, ${(R.time / 60).toFixed(0)} min)`);
  });
  g.bus.on('level:up', (e) => { R.levels[e?.level ?? st().progress.level] = R.time; log(`STUFE ${e?.level ?? st().progress.level} nach ${(R.time / 60).toFixed(0)} min`); });

  function equipUpgrades() {
    const s = g.state, c = content();
    s.slices.inventory.slots.forEach((it, i) => {
      if (it && isUpgrade(s, c, it.itemId)) s.commit('inventory:equip', { slot: i });
    });
  }

  // NPC angesprochen: alles abgeben, was dort fertig ist, und alles annehmen, was dort wartet
  function handleNpc(npcId) {
    const s = g.state, c = content();
    for (const qid of Object.keys(s.slices.quests.active)) {
      const def = c.find('quest', qid);
      const a = s.slices.quests.active[qid];
      if (!def || a.status !== 'ready' || (def.turnInNpc ?? def.giver) !== npcId) continue;
      const r = s.commit('quest:turnIn', { questId: qid, choice: def.choices?.[0]?.id ?? null });
      if (!r?.ok) R.errors.push({ t: R.time, what: 'Abgabe', qid, reason: r?.reason ?? r?.error });
    }
    for (const def of c.all('quest')) {
      if (def.giver !== npcId) continue;
      if (questStatus(s, c, def.id) !== 'available') continue;
      if (!ids.has(def.id) && !def.repeatable) continue;
      // Kopfgelder nur, wenn sonst nichts geht (wie ein Spieler, der die Stufe für die nächste Quest braucht)
      if (def.repeatable && hasOpenStory()) continue;
      const r = s.commit('quest:accept', { questId: def.id });
      if (r?.ok !== false) { (R.quests[def.id] ??= {}).accepted = R.time; log(`angenommen ${def.id}`); }
    }
    equipUpgrades();
    try { scene().panels.close(); } catch { /* */ }
  }

  function hasOpenStory() {
    const s = g.state, c = content();
    for (const id of ids) {
      if (c.find('quest', id)?.repeatable) continue;
      const stt = questStatus(s, c, id);
      if (stt === 'available' || stt === 'active' || stt === 'ready') return true;
    }
    return false;
  }

  const hostile = (w, e) => !e.dead && !e.removed && !e.friendly && !e.ally && e.hp > 0;

  function tick() {
    R.time += DT;
    const sc = scene();
    if (!sc?.world) return;
    const w = sc.world, h = w.hero;
    axis = { x: 0, y: 0 };
    if (verbose && Math.floor(R.time / 10) !== Math.floor((R.time - DT) / 10)) {
      const run = sc.systems?.find((x) => x.sys?.constructor?.name === 'QuestRunSystem')?.sys?.run;
      const gl = w.guide?.goal;
      log(`[${Math.round(R.time)}s] ${sc.zone?.def?.id} @${Math.round(h.x / 16)},${Math.round(h.y / 16)} hp ${Math.round(h.hp)}/${h.maxHp} q=${g.state.slices.quests.tracked} ziel=${gl ? gl.label + '@' + Math.round(gl.x / 16) + ',' + Math.round(gl.y / 16) : '-'} weg=${w.guidePath?.length ?? 0} kampf=${fightTarget && !fightTarget.dead ? fightTarget.type : '-'} lauf=${run ? run.constructor.name + ' t' + Math.round(run.time ?? 0) + ' foes' + run.foes?.size + ' npc' + Math.round(run.leader?.hp ?? -1) + '/' + Math.round(run.leader?.maxHp ?? -1) + (run.leader ? '@' + Math.round(run.leader.x / 16) + ',' + Math.round(run.leader.y / 16) : '') + (run.waiting ? ' ' + run.waiting : '') : '-'} prompt=${w.prompt?.objectId ?? w.prompt?.npcId ?? w.prompt?.portalId ?? '-'}${w.boss && !w.boss.dead ? ` boss=${Math.round(w.boss.hp)}/${Math.round(w.boss.maxHp)}` : ''}${g.finder?.session?.party?.bots?.length ? ` gruppe=${g.finder.session.party.bots.map((m) => Math.round(m.hp) + '/' + Math.round(m.maxHp)).join(',')}` : ''}`);
    }
    if (sc.pendingTravel) return;
    // Gruppen-Dungeon: Söldner anheuern (für die Hauptquest kostenlos), sonst allein hinein
    if (g.finder?.state === 'offer') { const r = g.finder.hire(); if (!r?.ok) g.finder.solo(); R.hired = (R.hired ?? 0) + (r?.ok ? 1 : 0); log(`Dungeon: ${r?.ok ? 'Söldner angeheuert' : 'allein'}`); return; }
    const zid = sc.zone?.def?.id;
    if (zid !== lastZone) { if (lastZone) R.zones[lastZone] = (R.zones[lastZone] ?? 0) + R.time - zoneT0; lastZone = zid; zoneT0 = R.time; lastPos = null; still = 0; fightTarget = null; }
    if (scene().panels?.current) { try { scene().panels.close(); } catch { /* */ } }

    if (h.dead) {
      if (deadT === 0) {
        const near = w.enemies.filter((e) => !e.dead).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
        R.deaths.push({ t: R.time, zone: zid, level: st().progress.level, by: near?.type, boss: bossFight?.id ?? null });
        log(`TOD in ${zid} durch ${near?.type} (Stufe ${st().progress.level})`);
        if (bossFight) { (R.bosses[bossFight.id] ??= { tries: 0 }).deaths = (R.bosses[bossFight.id].deaths ?? 0) + 1; bossFight = null; }
      }
      deadT += DT;
      if (deadT > 3) press('attack');
      return;
    }
    deadT = 0;
    // Quest kommt 40 Spielminuten nicht voran: als blockiert melden, abbrechen, nicht wieder annehmen
    {
      const qs = g.state.slices.quests, tq = qs.tracked && qs.active[qs.tracked] ? qs.tracked : null;
      const sig = tq ? tq + JSON.stringify(qs.active[tq].progress) + qs.active[tq].status : '';
      if (sig !== block.sig) { block.sig = sig; block.t = R.time; }
      else if (tq && R.time - block.t > 2400) {
        R.blocked.push({ t: R.time, quest: tq, progress: qs.active[tq].progress, zone: zid, at: [Math.round(h.x / 16), Math.round(h.y / 16)] });
        log(`BLOCKIERT ${tq} ${JSON.stringify(qs.active[tq].progress)} in ${zid}`);
        const def = content().find('quest', tq);
        if (def?.main) { // Hauptquest: Ziel erzwingen, damit der Lauf weitergeht (im Bericht als blockiert vermerkt)
          for (const o of def.objectives) qs.active[tq].progress[o.id] = o.count;
          qs.active[tq].status = 'ready'; R.blocked.at(-1).forced = true;
        } else { ids.delete(tq); g.state.commit('quest:abandon', { questId: tq }); }
        block.sig = ''; return;
      }
    }
    potionCd -= DT; talkCd -= DT; mountCd -= DT;
    if (h.hp < h.maxHp * 0.45 && potionCd <= 0) { g.progression?.usePotion?.(); potionCd = 2; }

    // --- Kampf
    const goal = w.guide?.goal ?? null, target = w.guide?.target ?? null;
    const foes = w.enemies.filter((e) => hostile(w, e));
    const dist = (e) => Math.hypot(e.x - h.x, e.y - h.y);
    const wanted = new Set(target ? [target.id, ...(target.ids ?? [])].filter(Boolean) : []);
    let foe = null, best = Infinity;
    // Eskorte/Verteidigen: zuerst die Angreifer des Begleiters (nächster am Begleiter)
    const qr = sc.systems?.find((x) => x.sys?.constructor?.name === 'QuestRunSystem')?.sys?.run;
    if (qr && !qr.over && qr.foes?.size) {
      const at = qr.leader && !qr.leader.removed ? qr.leader : (qr.at ?? h);
      for (const e of qr.foes) if (hostile(w, e)) { const d = Math.hypot(e.x - at.x, e.y - at.y); if (d < best) { best = d; foe = e; } }
    }
    if (!foe) for (const e of foes) {
      if (ignore.get(e) > R.time) continue;
      const d = dist(e);
      const score = e.aggroed && d < 220 ? d : (wanted.has(e.type) || wanted.has(e.def?.bossId)) && d < 170 ? d + 40 : d < 34 ? d + 60 : Infinity;
      if (score < best) { best = score; foe = e; }
    }
    if (foe) {
      R.fighting += DT;
      if (h.riding) press('mount');
      const isBoss = !!(foe.def?.boss || foe.isBoss || foe.bossId);
      if (isBoss && !bossFight) { bossFight = { id: foe.type, t0: R.time }; const b = R.bosses[foe.type] ??= { tries: 0 }; b.tries++; log(`Bosskampf ${foe.type} beginnt (Stufe ${st().progress.level})`); }
      const d = dist(foe);
      const shot = h.cls?.basic?.shot?.range; const reach = shot ? shot * 0.55 : 18;
      if (d > Math.max(16, reach)) { axis = norm(foe.x - h.x, foe.y - h.y); }
      press('attack');
      for (const a of h.abilities ?? []) if (a.ready) press(a.action);
      fightTarget = foe;
      track(h, true);
      return;
    }
    if (bossFight && !foes.some((e) => e.type === bossFight.id)) bossFight = null;

    // --- Beute einsammeln (nach dem Kampf, in der Nähe)
    const drop = w.entities?.find((e) => e.drop && !e.removed && !(ignore.get(e) > R.time) && Math.hypot(e.x - h.x, e.y - h.y) < 110);
    if (drop) {
      if (drop !== lootT?.e) lootT = { e: drop, t: R.time };
      if (R.time - lootT.t > 8) { ignore.set(drop, R.time + 1e9); R.events.push({ t: R.time, what: 'Beute unerreichbar', zone: zid, at: [Math.round(drop.x / 16), Math.round(drop.y / 16)], item: drop.drop?.itemId ?? (drop.drop?.gold ? 'gold' : '?') }); }
      else { axis = norm(drop.x - h.x, drop.y - h.y); return; }
    }

    // --- Eskorte / Verteidigen läuft: beim Begleiter bzw. am Ort bleiben
    const run = sc.systems?.find((x) => x.sys?.constructor?.name === 'QuestRunSystem')?.sys?.run;
    if (run && !run.over) {
      const at = run.leader && !run.leader.removed ? run.leader : run.at;
      if (at && Math.hypot(at.x - h.x, at.y - h.y) > 36) axis = norm(at.x - h.x, at.y - h.y);
      noGoal = 0; R.fighting += DT;
      track(h, true);
      return;
    }
    // --- Ziel
    if (!goal) {
      noGoal += DT;
      R.idle += DT;
      if (noGoal > 4) {
        noGoal = 0;
        const c = content(), s = g.state;
        const open = Object.keys(s.slices.quests.active).filter((q) => q !== s.slices.quests.tracked);
        if (open.length) { s.commit('quest:track', { questId: open[0] }); log(`kein Ziel: verfolge ${open[0]}`); }
        else if (!hasOpenStory()) R.done = true;
        else {
          const run = sc.systems?.find((x) => x.sys?.constructor?.name === 'QuestRunSystem')?.sys?.run;
          const near = w.enemies.filter((e) => !e.dead).map((e) => ({ t: e.type, d: Math.round(Math.hypot(e.x - h.x, e.y - h.y)), f: !!(e.friendly || e.ally), hp: e.hp })).sort((a, b) => a.d - b.d).slice(0, 4);
          R.events.push({ t: R.time, what: 'kein Ziel', zone: zid, at: [Math.round(h.x / 16), Math.round(h.y / 16)], tracked: s.slices.quests.tracked, run: run ? { cls: run.constructor.name, t: Math.round(run.time ?? 0), wave: run.wave, foes: run.foes?.size, members: run.members?.map((m) => m.hp) } : null, near });
          log('kein Ziel ' + JSON.stringify(R.events.at(-1)));
        }
      }
      return;
    }
    noGoal = 0;
    // Lange Reisen über den Wegstein (wie ein Spieler): Zielzone mindestens 2 Zonen weg und ein entdeckter Wegstein näher dran
    const ws = waystoneHop(w, target);
    if (ws) {
      const d = Math.hypot(ws.stone.x - h.x, ws.stone.y - h.y);
      if (d > 20) { axis = norm(ws.stone.x - h.x, ws.stone.y - h.y); R.walking += DT; track(h, false, { x: ws.stone.x, y: ws.stone.y, label: 'wegstein' }, []); return; }
      if (!ws.stone.departing && talkCd <= 0) { g.bus.emit('travel:go', { zoneId: ws.to }); talkCd = 2; R.waystone = (R.waystone ?? 0) + 1; log(`Wegstein ${w.zone.id} → ${ws.to}`); }
      return;
    }
    const path = w.guidePath ?? [];
    const gd = Math.hypot(goal.x - h.x, goal.y - h.y);
    // Am Ziel: ansprechen / benutzen / Portal nehmen
    if (w.prompt && talkCd <= 0 && (path.length <= 1 || gd < 30)) {
      const p = w.prompt;
      // Reihenfolge-Rätsel: nur das nächste richtige Objekt, nicht irgendeins der Liste
      const okind = content().find('quest', target?.questId)?.objectives?.find((o) => o.id === target?.objectiveId)?.kind;
      const okIds = okind === 'sequence' ? [target.id] : (target?.ids ?? [target?.id]);
      const isGoal = (goal.npc && p === goal.npc) || (goal.portal && p === goal.portal) || (p.objectId && okIds.includes(p.objectId)) || (gd < 24 && (!p.objectId || okIds.includes(p.objectId)));
      if (isGoal) {
        press('interact'); talkCd = 1;
        if (p.npcId) pendingNpc = p.npcId;
        return;
      }
    }
    if (pendingNpc) { handleNpc(pendingNpc); pendingNpc = null; }
    // Reiten auf langen Wegen
    const pathLen = path.reduce((s, p, i) => (i ? s + Math.hypot(p.x - path[i - 1].x, p.y - path[i - 1].y) : 0), 0);
    if (!h.riding && !h.mountCast && pathLen > 260 && mountCd <= 0 && st().character?.mounts?.active) { press('mount'); mountCd = 6; return; }
    if (h.mountCast) return;
    let next = null;
    for (const p of path) { if (Math.hypot(p.x - h.x, p.y - h.y) > 10) { next = p; break; } }
    if (!next && gd > 5) next = goal;
    if (next) { axis = norm(next.x - h.x, next.y - h.y); if (h.riding) R.mounted += DT; else R.walking += DT; }
    else R.idle += DT;
    track(h, false, goal, path);
  }
  let pendingNpc = null;
  const block = { sig: '', t: 0 };

  function hops(from) {
    const dist = new Map([[from, 0]]), queue = [from];
    while (queue.length) { const z = queue.shift(); for (const n of content().find('zone', z)?.links ?? []) if (!dist.has(n)) { dist.set(n, dist.get(z) + 1); queue.push(n); } }
    return dist;
  }
  function waystoneHop(w, target) {
    const goalZone = target?.kind === 'zone' ? target.id : target?.zoneId;
    if (!goalZone || goalZone === w.zone.id || w.zone.instanced) return null;
    const stone = w.interactables.find((x) => x.constructor.name === 'Waystone');
    if (!stone) return null;
    const flags = st().world?.flags ?? {};
    const toGoal = hops(goalZone);
    const here = toGoal.get(w.zone.id);
    if (here == null || here < 2) return null;
    let best = null;
    for (const z of Object.keys(flags)) {
      if (!z.startsWith('waystone:') || !flags[z]) continue;
      const id = z.slice(9), d = toGoal.get(id);
      if (d != null && d + 1 < here && (!best || d < best.d)) best = { to: id, d };
    }
    return best ? { stone, to: best.to } : null;
  }

  // Feststecken: 12 s Spielzeit kaum Bewegung, obwohl ein Weg da ist → melden und ein Stück weitersetzen
  function track(h, fighting, goal, path) {
    if (!lastPos) { lastPos = { x: h.x, y: h.y }; still = 0; return; }
    const moved = Math.hypot(h.x - lastPos.x, h.y - lastPos.y);
    if (moved > 24) { lastPos = { x: h.x, y: h.y }; still = 0; return; }
    still += DT;
    const limit = fighting ? 25 : 12;
    if (still < limit) return;
    still = 0; lastPos = null;
    const w = scene().world, s = g.state;
    const tq = s.slices.quests.tracked;
    const ev = { t: R.time, zone: scene().zone?.def?.id, x: Math.round(h.x / 16), y: Math.round(h.y / 16), quest: tq, fighting, goal: goal ? { label: goal.label, x: Math.round(goal.x / 16), y: Math.round(goal.y / 16) } : null, path: path?.length ?? 0 };
    if (fighting) { // unerreichbarer Gegner: 60 s nicht mehr beachten
      if (fightTarget) { ev.foe = fightTarget.type; ev.foeAt = [Math.round(fightTarget.x / 16), Math.round(fightTarget.y / 16)]; ignore.set(fightTarget, R.time + 60); }
      R.stuck.push(ev); log(`FEST ${JSON.stringify(ev)}`);
      return;
    }
    R.stuck.push(ev);
    log(`FEST ${JSON.stringify(ev)}`);
    const p = path?.[Math.min(6, (path?.length ?? 1) - 1)] ?? goal;
    if (p) { h.x = p.x; h.y = p.y; }
  }

  return { R, tick, handleNpc, equipUpgrades };
}

function norm(x, y) { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; }
