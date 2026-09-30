import { h } from '../core/dom.js';
import { MenuScene } from './TitleScene.js';

// Früher: lokale Demo-Accounts. Gespielt wird nur noch mit Online-Konto (src/online),
// die Szene 'account' bleibt nur als Weiterleitung für alte Aufrufe bestehen.
export class AccountScene extends MenuScene {
  enter() {
    this.root = h('div.ef-screen.acc-screen');
    const o = this.game.online;
    if (o?.user) o.play(); else if (o) o.open('login'); else this.game.scenes.go('title');
  }

  back() { this.game.scenes.go('title'); }
}
