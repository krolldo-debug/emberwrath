import { createHeroSprites } from './sprites/hero.js';
import { createSkeletonSprites } from './sprites/skeleton.js';
import { createSpiderSprites } from './sprites/spider.js';
import { createPropSprites } from './sprites/props.js';
import { createArrowSprite } from './sprites/effects.js';

// Grafiken werden erst beim ersten Zugriff erzeugt (assets.sprites.x ist ein Getter,
// der sich danach durch den fertigen Wert ersetzt). Das hält den Start auf schwachen
// Handys kurz: Jede Zone erzeugt nur, was sie wirklich zeigt. Später kann hier ein
// Loader für echte Spritesheets (PNG + JSON) dieselbe Struktur liefern.
// Bereiche ergänzen eigene Grafiken in install() über
//   game.assets.define('wolf', () => createWolfSprites())   -> game.assets.sprites.wolf
// Der Schlüssel muss eindeutig sein.
function lazy(target, key, factory) {
  Object.defineProperty(target, key, {
    configurable: true, enumerable: true,
    get() {
      const value = factory();
      Object.defineProperty(target, key, { value, writable: true, configurable: true, enumerable: true });
      return value;
    },
  });
}

export function createAssets() {
  const sprites = {};
  lazy(sprites, 'hero', createHeroSprites);
  lazy(sprites, 'skeleton', () => createSkeletonSprites('sword'));
  lazy(sprites, 'archer', () => createSkeletonSprites('bow'));
  lazy(sprites, 'spider', createSpiderSprites);
  lazy(sprites, 'arrow', createArrowSprite);
  const assets = {
    sprites,
    define(key, factory) {
      if (key in sprites) throw new Error(`Asset ${key} doppelt definiert`);
      lazy(sprites, key, factory);
    },
  };
  lazy(assets, 'props', createPropSprites);
  return assets;
}
