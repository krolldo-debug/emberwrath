import { EV } from '../core/events.js';
import { IntroPlayer } from './IntroPlayer.js';
import { FILM } from './film.js';

// Intro-Film: läuft einmal je Charakter, wenn er zum ersten Mal die Welt betritt (kein Gameplay, nur die Geschichte).
// „Gesehen“ steht im Spielstand des Charakters (Slice 'story') und wird mit ihm in die Cloud gesichert, gilt also auf
// jedem Gerät. Ältere Charaktere (vor dem Intro angelegt) haben die Slice nicht; sie sehen es nur, solange sie noch
// ganz am Anfang stehen (Stufe 1, kaum Spielzeit), sonst nie.
// Der Film zeichnet sich selbst (IntroPlayer + film.js) über der Welt; die Welt lädt dahinter und steht still, bis er
// endet oder übersprungen wird. Bilder und Stimme liegen in intro/ (Website: /spielen/intro/, tools/build.mjs).
const FRESH_SECONDS = 120;

export function installIntro(game) {
  game.state.defineSlice('story', {
    create: () => ({ intro: false }),
    deserialize: (raw) => ({ intro: !!raw?.intro }),
  });
  game.state.defineCommand('story:introSeen', (s) => {
    s.get('story').intro = true;
    return { ok: true };
  });

  let isNew = false;
  game.bus.on(EV.GAME_STARTED, (e) => { isNew = !!e?.isNew; });

  game.addSessionSystem('intro', (sess) => {
    let player = null, done = false;
    const due = () => {
      const st = game.state;
      if (st.slices.story?.intro) return false;
      if ((st.slices.progress?.level ?? 1) > 1) return false;       // nur ganz am Anfang, auf Stufe 1
      return isNew || (st.meta.playTime ?? 0) < FRESH_SECONDS;
    };
    const finish = (how) => {
      if (done) return;
      done = true;
      player = null;
      sess.setPaused('intro', false);
      if (game.state.commands.has('story:introSeen')) game.state.commit('story:introSeen', { how });
      game.saveNow?.('intro');
    };
    const off = sess.bus.on(EV.ZONE_ENTER, () => {
      off?.();
      if (done || !due()) { done = true; return; }
      sess.setPaused('intro', true);
      try {
        player = new IntroPlayer(game, sess, FILM, { onEnd: finish });
        player.start();
      } catch (err) {
        console.error('Intro', err);
        finish('error');
      }
    });
    return {
      dispose: () => { off?.(); player?.dispose(); player = null; },
    };
  }, 26);
}
