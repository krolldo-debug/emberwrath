import { CONFIG } from '../config.js';
import { PAL } from '../gfx/Palette.js';
import { Light } from '../gfx/Lighting.js';
import { FloatingText, Shockwave, LightPillar, ImpactStar, NovaBurst, SpinVortex, RiftFlash, ChargeGlow, SoulWisp } from '../entities/Effects.js';
import { EV } from '../core/events.js';
import { ELEMENTS } from '../gfx/Particles.js';
import { voiceFor } from '../audio/voices.js';

const F = CONFIG.feedback;
// Eigener Klang je Fähigkeit (zusätzlich zu swing/shoot/cast, die A schon sendet)
const ABILITY_SFX = {
  whirlwind: 'whoosh', battle_shout: 'shout', charge: 'whoosh', shield_wall: 'stone', earthshatter: 'quake',
  shadow_step: 'shadow', stealth: 'shadow', assassinate: 'shadow', fan_of_knives: 'knives', poison_blades: 'magic', poison: 'magic',
  volley: 'bowDraw', piercing_shot: 'bowDraw', fire_trap: 'trap', arrow_rain: 'arrowRain',
  flame_nova: 'fire', blink: 'blink', fireball: 'fire', meteor: 'meteorFall', frost_nova: 'frost',
};
const ICHOR = ['#1a2410', '#2e3a14', '#4a5a1a', '#6a7a2a'];
const WATER = ['#0e2a34', '#1a4a58', '#3a7a88', '#8ac8d0'];
const EMBER = ['#fff0b0', '#ffb640', '#f07a1c', '#c8420c'];
const ASH = ['#6e6450', '#4a4238'];

// "Game Feel": übersetzt Gameplay-Events in Hitstop, Screenshake, Partikel,
// Licht, Schadenszahlen und Sound. Einziger Ort für Treffer-Feedback.
// Bereichsinterne Effekt-Events, die A und B senden dürfen:
//   'cast'        { actor, element }                 Aufladen/Zaubern (Glühen an der Hand)
//   'spellImpact' { x, y, element, radius?, big? }   Einschlag (Ring, Funken, Licht, Ton)
//   'aura'        { actor, element }                 kurzer Aura-Puls (Buff, Schrei)
// element: fire | frost | holy | shadow | poison | arcane | nature | physical
export class FeedbackSystem {
  constructor(game) {
    this.game = game;
    const bus = game.bus;
    bus.on('hit', (e) => this.#onHit(e));
    bus.on('swing', (e) => this.#sfx(e.heavy ? 'swingHeavy' : 'swing'));
    bus.on('enemySwing', () => this.#sfx('enemySwing'));
    bus.on('telegraph', (e) => this.#sfx(voiceFor(e.actor).warn));
    bus.on('lunge', () => this.#sfx('hiss', { pitch: 1.4 }));
    bus.on('shoot', () => this.#sfx('shoot'));
    bus.on('arrowStuck', () => this.#sfx('thunk'));
    bus.on('roll', (e) => { this.#sfx('roll'); this.game.world.particles.dust(e.actor.x, e.actor.y, 6); });
    bus.on('rollEnd', (e) => this.game.world.particles.dust(e.actor.x, e.actor.y, 3));
    bus.on('footstep', (e) => {
      // Beritten (§12.6): Hufschlag mit größerer Staubwolke
      if (e.actor === this.game.world?.hero && this.#riding()) { this.game.world.particles.dust(e.actor.x, e.actor.y, 3); this.#sfx('hoof'); return; }
      this.game.world.particles.dust(e.actor.x, e.actor.y, 1); if (!e.actor.companion) this.#sfx('step');
    });
    bus.on(EV.MOUNT_CHANGED, (e) => {
      const h = this.game.world?.hero;
      if (h) { this.game.world.particles.dust(h.x - 6, h.y, 6); this.game.world.particles.dust(h.x + 6, h.y, 6); }
      this.#sfx(e.riding ? 'mountUp' : 'mountDown');
    });
    bus.on('mountCast', () => this.#sfx('mountCast'));
    // Beschwörung (B, Enemy.js): Ruf mit Kreis aus dunklem Licht um den Beschwörer
    bus.on('enemySummon', (e) => {
      const a = e.actor, w = this.game.world;
      if (!a || !e.count) return;
      w.addEffect(new Shockwave(a.x, a.y - 1, { radius: 30, color: '#a060f0', life: 0.5 }));
      w.particles.ring(a.x, a.y - 2, 12, 18, ['#ffffff', '#e0b8ff', '#a060f0', '#6a2cb0'], 70);
      w.addLight(new Light({ follow: a, offsetY: -10, radius: 80, color: [170, 100, 255], intensity: 1, ttl: 0.5, bloom: 0.5 }));
      this.#sfx('summon');
    });
    // Bossangriffe (B): die Bosse zeichnen ihre Effekte selbst, hier kommen Klang und etwas Licht dazu.
    bus.on('bossBreath', (e) => {
      if (!e.active) return;
      const dur = e.actor?.breathDur ?? 1.6;
      this.#sfx(e.element === 'frost' ? 'frostBreath' : 'bossBreath', { dur });
    });
    bus.on('bossDive', (e) => this.#sfx(this.#bossId(e) === 'frost_wyrm' ? 'iceBurrow' : 'bossDive'));
    bus.on('bossEmerge', (e) => this.#sfx(this.#bossId(e) === 'frost_wyrm' ? 'iceErupt' : 'bossEmerge'));
    bus.on('bossWave', () => this.#sfx('bossWave'));
    bus.on('bossMeteors', (e) => this.#sfx(e.element === 'frost' ? 'iceCall' : 'meteorFall', { pitch: 0.7 }));
    bus.on('bossMeteor', () => { this.#sfx('quake', { pitch: 0.8 }); this.#shake(3); });
    bus.on('bossSlam', () => this.#sfx('bossSlam'));
    bus.on('bossStep', () => this.#sfx('bossStep'));
    bus.on('bossImpact', () => this.#sfx('bossSlam', { pitch: 0.7 }));
    bus.on('bossSummon', () => this.#sfx('summon', { pitch: 0.75 }));
    bus.on('bossPillars', () => this.#sfx('bossPillars'));
    bus.on('bossPhantoms', (e) => {
      this.#sfx('bossPhantoms');
      const b = this.game.world?.boss;
      if (b) this.game.world.addLight(new Light({ x: b.x, y: b.y - 30, radius: 110, color: [120, 190, 220], intensity: 0.7, ttl: 0.9, bloom: 0.5 }));
    });
    bus.on('bossRoots', () => { this.#sfx('bossRoots'); this.#shake(2); });
    bus.on('bossRing', () => { this.#sfx('bossRing'); this.#shake(1.5); });
    bus.on('bossSporeLob', (e) => this.#sfx('bossSporeLob', { count: e.count }));
    bus.on('bossBurst', () => this.#sfx('bossBurst'));
    bus.on('bossChannel', (e) => {
      if (!e.active) return;
      this.#sfx('bossChannel', { dur: this.game.world?.boss?.channelDur ?? 4.4 });
      if (e.x != null) this.game.world.addEffect(new Shockwave(e.x, e.y, { radius: 34, color: '#ffe08a', life: 0.8 }));
    });
    bus.on('bossCataclysm', () => this.#sfx('bossCataclysm'));
    bus.on('bossCrownFall', () => this.#sfx('bossCrownFall'));
    bus.on('deflect', (e) => {
      const w = this.game.world;
      w.particles.sparks(e.x, e.y, Math.random() * Math.PI * 2, 12, ['#ffffff', '#e0ecff', '#a8c0f0']);
      w.addLight(new Light({ x: e.x, y: e.y, radius: 40, color: [200, 220, 255], intensity: 1, ttl: 0.15, bloom: 0.6 }));
      this.game.hitstop(0.05);
      this.#sfx('deflect');
      this.#text(e.x, e.y - 6, 'PARIERT', '#a8c0f0', 1);
    });
    bus.on('spawnStart', () => this.#sfx('spawn'));
    bus.on('cast', (e) => this.#cast(e));
    bus.on('spellImpact', (e) => this.#impact(e));
    bus.on('aura', (e) => this.#aura(e));
    // Welt-Ereignisse von Thread B: Kleintiere, Fallen, Hebel, Geheimräume
    bus.on('critter', (e) => this.#sfx(e.kind === 'crow' ? 'crow' : e.kind === 'rat' ? 'squeak' : 'flutter'));
    bus.on('trapClick', () => this.#sfx('trap'));
    bus.on('trapSpikes', () => { this.#sfx('spikes'); this.#shake(1.5); });
    bus.on('trapFlame', () => this.#sfx('fire', { pitch: 0.8 }));
    bus.on('leverPull', () => this.#sfx('lever'));
    bus.on('secretOpen', () => { this.#sfx('secret'); this.#shake(3); });
    // Klassenfähigkeiten (Thread A sendet 'ability' nach impl.start): zusätzliche Effektschicht
    bus.on('ability', (e) => this.#ability(e));

    // Fortschritt und Ablauf (bereichsübergreifende Events)
    bus.on(EV.XP_GAINED, (e) => {
      const h = this.game.world.hero;
      if (e.amount > 0) this.#text(h.x, h.y - 30, `+${e.amount} EP`, '#c6a8ff', 1, 1.1);
    });
    bus.on(EV.LEVEL_UP, () => this.#levelUp());
    bus.on(EV.ITEM_ADDED, (e) => { if (!['equip', 'unequip', 'move', 'swap', 'load', 'sort'].includes(e.source)) this.#sfx('pickup'); });
    bus.on(EV.GOLD_CHANGED, (e) => { if (e.delta > 0) this.#sfx('coin'); });
    bus.on(EV.ITEM_EQUIPPED, () => this.#sfx('ui'));
    bus.on(EV.QUEST_ACCEPTED, () => this.#sfx('quest'));
    bus.on(EV.QUEST_READY, () => this.#sfx('quest'));
    bus.on(EV.QUEST_COMPLETED, () => { this.#sfx('questDone'); this.#aura({ actor: this.game.world.hero, element: 'holy' }); });
    bus.on(EV.LOOT_DROPPED, (e) => {
      const w = this.game.world;
      w.particles.ring(e.x, e.y - 2, 3, 10, ['#fff0b0', '#ffd66a', '#b8862a'], 30);
    });
    bus.on(EV.BOSS_ENGAGED, () => {
      this.#sfx('bossRoar');
      this.#shake(6);
    });
    bus.on(EV.BOSS_DEFEATED, (e) => {
      const g = this.game, w = g.world;
      g.slowmo(0.3, 1.6);
      this.#shake(8);
      w.lighting.ambientBoost = 1;
      w.addEffect(new Shockwave(e.x, e.y - 8, { radius: 70, color: '#ffd66a', life: 0.9 }));
      w.addEffect(new LightPillar(e.x, e.y, { color: '#ffd66a', life: 1.6 }));
      w.particles.element(e.x, e.y - 10, 'holy', 60, 40);
      this.#sfx('victory');
    });
    // Atmo und Musik je Zone: audio/Soundscape.js
    bus.on(EV.PLAYER_RESPAWNED, () => this.#sfx('heal'));

    bus.on('heal', (e) => {
      const w = this.game.world;
      w.particles.ring(e.actor.x, e.actor.y - 6, 8, 16, ['#fff0b0', '#ffb640', '#f07a1c']);
      this.#text(e.actor.x, e.actor.y - 26, `+${e.amount}`, '#9cff8a', 1);
      this.#sfx('heal');
    });
  }

  #riding() { return !!this.game.state?.slices?.character?.mounts?.riding; }

  #bossId(e) { return e.bossId ?? this.game.world?.boss?.bossId; }

  #sfx(name, opts) { this.game.sfx.play(name, opts); }

  // Bildschirmwackeln abschaltbar (Geräte-Einstellung screenShake, Standard an)
  #shakeOn() { return this.game.game?.prefs?.get?.('screenShake', true) !== false; }
  #shake(a) { if (this.#shakeOn()) this.game.camera.shake(a); }
  #kick(x, y) { if (this.#shakeOn()) this.game.camera.kick(x, y); }

  #text(x, y, text, color, scale, life) {
    this.game.world.addEffect(new FloatingText(x, y, text, { color, scale, font: this.game.font, life }));
  }

  #levelUp() {
    const g = this.game, w = g.world, h = w.hero;
    w.addEffect(new LightPillar(h.x, h.y, { color: '#ffd66a', life: 1.4, follow: h }));
    w.addEffect(new Shockwave(h.x, h.y - 2, { radius: 40, color: '#ffe8a0', life: 0.6 }));
    w.addLight(new Light({ follow: h, offsetY: -12, radius: 120, color: [255, 214, 120], intensity: 1.2, ttl: 1.4, bloom: 0.6 }));
    w.particles.element(h.x, h.y - 8, 'holy', 40, 14);
    w.lighting.ambientBoost = 0.7;
    // Text „Stufe N“ zeigt das HUD-Banner; hier nur Licht und Funken
    this.#sfx('levelUp');
  }

  #ability(e) {
    const h = e.actor, w = this.game.world;
    if (!h || !w) return;
    const fx = (o) => w.addEffect(o);
    const snd = ABILITY_SFX[e.abilityId];
    if (snd) this.#sfx(snd);
    switch (e.abilityId) {
      case 'whirlwind':
        fx(new SpinVortex(h, { radius: 30, color: '#ffc050', life: 0.5 }));
        fx(new Shockwave(h.x, h.y, { radius: 32, color: '#ffb640', life: 0.35 }));
        break;
      case 'battle_shout':
        fx(new Shockwave(h.x, h.y - 1, { radius: 46, color: '#ff6a40', life: 0.5 }));
        fx(new Shockwave(h.x, h.y - 1, { radius: 30, color: '#ffe8a0', life: 0.35 }));
        fx(new ImpactStar(h.x, h.y - 20, { size: 11, color: '#ff8a50', rays: 8, life: 0.25 }));
        break;
      case 'charge':
        fx(new ChargeGlow(h, { color: '#ffc890', life: 0.3, offY: -9 }));
        fx(new Shockwave(h.x, h.y, { radius: 16, color: '#ffe8a0', life: 0.25 }));
        w.particles.dust(h.x, h.y, 8);
        break;
      case 'earthshatter':
        fx(new ChargeGlow(h, { color: '#ff8a40', life: 0.25, offY: -12 }));
        break;
      case 'shadow_step':
      case 'stealth':
        fx(new RiftFlash(h.x, h.y, { color: '#8a60c8', life: 0.35, height: 20 }));
        w.particles.element?.(h.x, h.y - 8, 'shadow', 12, 6);
        break;
      case 'assassinate':
        fx(new RiftFlash(h.x, h.y, { color: '#a070ff', life: 0.3, height: 22 }));
        fx(new ImpactStar(h.x, h.y - 10, { size: 10, color: '#e0c0ff', rays: 4, life: 0.18 }));
        break;
      case 'poison_blades':
      case 'poison':
        fx(new ChargeGlow(h, { color: '#a8e05a', life: 0.4, offY: -10 }));
        break;
      case 'fan_of_knives':
        fx(new Shockwave(h.x, h.y - 2, { radius: 22, color: '#d8e0f0', life: 0.25 }));
        fx(new ImpactStar(h.x + (h.facing ?? 1) * 6, h.y - 10, { size: 8, color: '#c0c8e0', rays: 8, life: 0.16 }));
        break;
      case 'volley':
        fx(new ImpactStar(h.x + (h.facing ?? 1) * 8, h.y - 11, { size: 7, color: '#d8ffc8', life: 0.14 }));
        break;
      case 'piercing_shot':
        fx(new ChargeGlow(h, { color: '#a8ff90', life: 0.3, offY: -11 }));
        break;
      case 'fire_trap':
        fx(new Shockwave(h.x, h.y + 2, { radius: 12, color: '#ffb640', life: 0.3 }));
        break;
      case 'arrow_rain':
        fx(new ImpactStar(h.x + (h.facing ?? 1) * 6, h.y - 14, { size: 8, color: '#d8ffc8', rays: 4, angle: -Math.PI / 2, life: 0.16 }));
        break;
      case 'flame_nova':
        fx(new NovaBurst(h.x, h.y, { radius: 40, life: 0.55 }));
        fx(new Shockwave(h.x, h.y, { radius: 48, color: '#fff0b0', life: 0.4 }));
        break;
      case 'fireball':
        fx(new ChargeGlow(h, { color: '#ff9a40', life: 0.3, offY: -11 }));
        break;
      case 'meteor':
        fx(new ChargeGlow(h, { color: '#ff7a30', life: 0.45, offY: -14 }));
        fx(new Shockwave(h.x, h.y, { radius: 20, color: '#ff8a40', life: 0.4 }));
        break;
      case 'blink':
        fx(new RiftFlash(h.x, h.y, { color: '#b884ff', life: 0.4, height: 24 }));
        fx(new Shockwave(h.x, h.y, { radius: 18, color: '#d8c0ff', life: 0.3 }));
        break;
      default: {
        // Unbekannte Fähigkeit: neutraler Aura-Puls, damit jede Fähigkeit sichtbar ist
        fx(new Shockwave(h.x, h.y, { radius: 22, color: '#ffe8a0', life: 0.3 }));
      }
    }
  }

  #cast(e) {
    const a = e.actor, el = ELEMENTS[e.element] ?? ELEMENTS.arcane, w = this.game.world;
    const x = a.x + (a.facing ?? 1) * 6, y = a.y - (a.bodyHeight ?? 16) * 0.7;
    w.particles.element(x, y, e.element, 6, 4);
    w.addLight(new Light({ x, y, radius: 40, color: el.light, intensity: 0.9, ttl: 0.25, bloom: 0.5 }));
    this.#sfx('magic', { pitch: el.pitch });
  }

  #impact(e) {
    const el = ELEMENTS[e.element] ?? ELEMENTS.arcane, w = this.game.world;
    const r = e.radius ?? 16;
    w.addEffect(new Shockwave(e.x, e.y, { radius: r, color: el.colors[1], life: e.big ? 0.5 : 0.3 }));
    w.particles.element(e.x, e.y, e.element, e.big ? 36 : 16, r * 0.5);
    w.addLight(new Light({ x: e.x, y: e.y, radius: r * 3 + 30, color: el.light, intensity: 1.1, ttl: e.big ? 0.4 : 0.22, bloom: 0.7 }));
    if (e.element === 'fire') w.decals.scorch(e.x, e.y, Math.round(r * 0.7));
    if (e.big) { this.#shake(4); this.game.hitstop(0.05); }
    this.#sfx(el.sound, { pitch: el.pitch });
  }

  #aura(e) {
    const a = e.actor, el = ELEMENTS[e.element] ?? ELEMENTS.holy, w = this.game.world;
    w.addEffect(new Shockwave(a.x, a.y - 1, { radius: 26, color: el.colors[1], life: 0.45 }));
    w.particles.element(a.x, a.y - 8, e.element, 20, 10);
    w.addLight(new Light({ follow: a, offsetY: -10, radius: 70, color: el.light, intensity: 0.9, ttl: 0.6, bloom: 0.4 }));
  }

  #onHit(e) {
    const g = this.game, w = g.world, t = e.target;
    const ang = Math.atan2(e.dirY, e.dirX);
    const byHero = e.attacker.team === 'hero';

    if (byHero && e.dot) {
      // Gift-Ticks (Thread A, hit.dot): nur Zahl und ein paar Tropfen, kein Hitstop/Wackeln
      w.particles.element?.(t.x, t.y - (t.bodyHeight ?? 16) * 0.6, 'poison', 3, 4);
      this.#text(e.x, e.y - 10, e.damage, '#a8e05a', 1, 0.6);
      if (e.killed) this.#onKill(e, ang);
      return;
    }
    if (byHero && e.attacker.companion) {
      // Mitspieler aus der Dungeonsuche (src/finder/): Treffer sichtbar, aber ohne Hitstop/Wackeln fürs eigene Bild
      w.particles.sparks(e.x, e.y, ang, e.heavy ? 6 : 3);
      this.#material(t, e, ang, e.killed ? 1.4 : 0.5);
      this.#text(e.x, e.y - 10, e.damage, e.crit ? '#e8cf7a' : '#c8c8d0', 1, 0.5);
      if (e.killed) this.#onKill(e, ang);
      return;
    }
    if (!byHero && t.companion) {
      w.particles.gore(t.x, t.y, 10, ang, 5, PAL.blood);
      this.#text(t.x, t.y - 24, `-${e.damage}`, '#d0706a', 1, 0.5);
      return;
    }
    if (byHero) {
      g.hitstop(e.killed ? F.hitstopKill : e.heavy ? F.hitstopHeavy : F.hitstopLight);
      this.#shake(e.heavy ? F.shakeHeavy : F.shakeLight);
      this.#kick(e.dirX * (e.heavy ? 3 : 1.5), e.dirY * (e.heavy ? 3 : 1.5));
      w.particles.sparks(e.x, e.y, ang, e.heavy ? 14 : 8);
      w.addEffect(new ImpactStar(e.x, e.y, { size: e.crit ? 11 : e.heavy ? 8 : 6, color: e.crit ? '#ffe070' : '#ffc890', rays: e.crit ? 8 : 4, angle: ang, life: e.crit ? 0.2 : 0.13 }));
      if (e.crit) w.addEffect(new Shockwave(e.x, e.y + 4, { radius: 14, color: '#ffe070', life: 0.25 }));
      w.addLight(new Light({ x: e.x, y: e.y, radius: e.heavy ? 60 : 38, color: [255, 200, 130], intensity: 1, ttl: 0.12, bloom: 0.5 }));
      this.#material(t, e, ang, e.killed ? 2.2 : 1);
      this.#text(e.x, e.y - 10, e.damage, e.crit ? '#ffe070' : '#ffffff', e.crit ? 2 : 1);
      this.#sfx(e.crit ? 'crit' : 'hit');
      if (e.killed) this.#onKill(e, ang);
    } else {
      // Held getroffen
      g.hitstop(0.07);
      this.#shake(5);
      g.hurtFlash = 1;
      w.particles.gore(t.x, t.y, 10, ang, 10, PAL.blood);
      w.decals.splat(t.x + e.dirX * 4, t.y + 1, PAL.blood, 4);
      this.#text(t.x, t.y - 24, `-${e.damage}`, '#ff5a50', 1);
      this.#sfx('hurt');
      if (t.dead) { this.#sfx('heroDeath'); g.slowmo(0.35, 1.2); }
    }
  }

  #material(t, e, ang, mult) {
    const w = this.game.world;
    const z = t.bodyHeight * 0.6;
    const v = voiceFor(t);
    if (v.material === 'bone') {
      w.particles.bones(t.x, t.y, z, ang, Math.round(5 * mult), PAL.bone.slice(1));
      w.particles.dust(t.x, t.y - 6, Math.round(3 * mult), ASH[0]);
    } else if (v.material === 'chitin') {
      w.particles.gore(t.x, t.y, z, ang, Math.round(7 * mult), ICHOR);
      w.decals.splat(t.x + e.dirX * 6, t.y + 1, ICHOR, 3 + mult);
    } else if (v.material === 'stone') {
      w.particles.bones(t.x, t.y, z, ang, Math.round(4 * mult), ASH);
      w.particles.dust(t.x, t.y - 6, Math.round(4 * mult), ASH[0]);
    } else if (v.material === 'ember') {
      w.particles.sparks(e.x, e.y, ang, Math.round(8 * mult), EMBER);
    } else if (v.material === 'water') {
      w.particles.gore(t.x, t.y, z, ang, Math.round(7 * mult), WATER);
      w.decals.splat(t.x + e.dirX * 5, t.y + 1, WATER, 3 + mult);
    } else {
      w.particles.gore(t.x, t.y, z, ang, Math.round(7 * mult), PAL.blood);
      w.decals.splat(t.x + e.dirX * 5, t.y + 1, PAL.blood, 3 + mult);
    }
    if (v.hit) this.#sfx(v.hit);
  }

  #onKill(e, ang) {
    const g = this.game, w = g.world, t = e.target;
    this.#shake(3.5);
    w.lighting.ambientBoost = 0.35;
    w.particles.ring(t.x, t.centerY, 4, 14, ['#fff0b0', '#ffb640', '#c8420c'], 90);
    w.decals.scorch(t.x, t.y + 1, 9);
    w.addEffect(new SoulWisp(t.x, t.centerY ?? t.y - 8, { color: t.material === 'bone' ? '#c6a8ff' : '#ffd9a0' }));
    const v = voiceFor(t);
    if (v.material === 'bone') w.particles.bones(t.x, t.y, 10, ang, 14, PAL.bone.slice(1));
    else if (v.material === 'stone') w.particles.bones(t.x, t.y, 10, ang, 12, ASH);
    else if (v.material === 'ember') w.particles.ring(t.x, t.centerY ?? t.y - 8, 6, 18, EMBER, 60);
    this.#sfx(v.death);
  }
}
