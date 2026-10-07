import { h } from '../core/dom.js';
import { npcPortraitUrl } from '../gfx/Portraits.js';

// Gesprächsporträt (Thread D): Pixel-Brustbild des NPC neben dem Questdialog
// von Thread C. C's Panel bleibt unverändert: installDialogPortraits() legt
// beim ersten Session-Start eine Hülle um die Panel-Fabrik 'questDialog'
// (Porträt links, im Hochformat darüber). Nutzt C später dialogPortraitEl()
// direkt im eigenen Layout, fällt die Hülle über den Marker weg.
export function dialogPortraitEl(session, npcId) {
  const def = session.content.find('npc', npcId);
  return h('figure.dlg-portrait', { 'aria-hidden': 'true' },
    h('div.dlg-frame', h('img.dlg-img', { src: npcPortraitUrl(npcId, def), alt: '', width: 96, height: 96, draggable: 'false' })),
    h('figcaption.dlg-plate', h('b', def?.name ?? ''), def?.title ? h('small', def.title) : null));
}

export function installDialogPortraits(game) {
  const def = game.panels.defs?.get('questDialog');
  if (!def || def.factory.dlgWrapped || def.portrait === false) return;
  const inner = def.factory;
  const wrapped = (session, params = {}) => {
    const panel = inner(session, params);
    if (!params.npcId || panel.root?.querySelector?.('.dlg-portrait')) return panel;
    session.sfx?.play?.('dialog');
    const root = h('div.dlg-wrap', dialogPortraitEl(session, params.npcId), panel.root);
    return { ...panel, root };
  };
  wrapped.dlgWrapped = true;
  def.factory = wrapped;
}
