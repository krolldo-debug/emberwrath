import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { iconEl, itemIconEl } from '../gfx/Icons.js';
import { fmtNum, tr } from '../i18n/index.js';
import { panelFrame, itemDetail, actionBtn, attachTip, hideTip } from '../progression/widgets.js';
import { frameUrl, pixelTitle } from '../ui/pixelFrame.js';
import { coinEl, goldEl } from '../market/panel.js';
import { tradeable, listStack, TRADE_MIN_LEVEL } from '../market/rules.js';
import { GOLD_MAX, DAY_MS, KEEP_DAYS } from './rules.js';

// Fenster am Briefkasten: Post · Schreiben. Daten und Buchungen über game.mail (index.js).
// Gleicher Rahmen und dieselben Bausteine wie das Auktionshaus (market.css, Klassen mk-*), eigene Teile in mail.css.
const AH = {
  sold: (n) => `Verkauft: ${n}`,
  outbid: (n) => `Überboten: ${n}`,
  won: (n) => `Ersteigert: ${n}`,
  bought: (n) => `Gekauft: ${n}`,
  expired: (n) => `Nicht verkauft: ${n}`,
  cancelled: (n) => `Zurückgezogen: ${n}`,
};

// Umschlag mit Wachssiegel 13×9 für den Briefkopf (Anzeige 2-fach)
let seal = null;
function sealUrl() {
  if (seal) return seal;
  const rows = [
    'kkkkkkkkkkkkk',
    'kppppppppppdk',
    'kpdpppppppddk',
    'kppddpppddppk',
    'kppppdrrdpppk',
    'kpppprwrrpppk',
    'kppppprrppppk',
    'kdppppppppddk',
    'kkkkkkkkkkkkk',
  ];
  const col = { k: '#14060a', p: '#d8c8a8', d: '#a8946c', r: '#a8283a', w: '#ffb640' };
  const c = document.createElement('canvas'); c.width = 13; c.height = 9;
  const ctx = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (col[ch]) { ctx.fillStyle = col[ch]; ctx.fillRect(x, y, 1, 1); } }));
  seal = c.toDataURL();
  return seal;
}

const num = (v) => {
  const n = Math.floor(Number(String(v ?? '').replace(/[^\d]/g, '')));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function daysLeft(until, now) {
  if (!Number.isFinite(until)) return null; // Auktionshaus-Post, Zurückgekommenes, Gold über dem Rahmen: verfällt nicht
  const d = Math.ceil((until - now) / DAY_MS);
  return d <= 1 ? 'noch 1 Tag' : `noch ${fmtNum(d)} Tage`;
}

export function mailPanel(session, game, mail) {
  const root = h('div.pg-mount');
  const content = session.content;
  const st = () => session.state.slices;
  let tab = 'post', err = '', working = false;
  // Schreiben
  const form = { to: '', gold: '', qty: 1 };
  let pick = null; // { itemId, max }
  let who = null, whoErr = '', whoTimer = 0, whoGen = 0, armed = false, armTimer = 0, backArmed = null;

  const say = (text, isBad = false) => {
    err = isBad ? text : '';
    if (text && !isBad) session.bus.emit(EV.UI_TOAST, { text, kind: 'info', icon: 'gold' });
  };
  const errEl = () => (err ? h('p.mk-err', { role: 'alert' }, err) : null);
  const detailOpts = { equipment: st().inventory?.equipment ?? {}, level: st().progress?.level ?? 1, classId: st().character?.classId, compact: true };

  async function run(action, done) {
    if (working) return;
    working = true; say(''); draw();
    try { say(done(await action()) ?? ''); } catch (e) { say(e.message, true); }
    working = false;
    draw();
  }

  // ------------------------------------------------------------------ Post
  // Ein Eintrag für die Liste: Server-Post (Auktionshaus, Spieler) und Bossbeute aus dem Spielstand
  function entries() {
    const out = [];
    for (const m of mail.letters) {
      const id = m.itemId ?? m.about, def = id ? content.find('item', id) : null;
      const qty = m.itemId ? m.qty : m.aboutQty;
      const player = m.kind === 'letter' || m.kind === 'returned';
      const title = m.kind === 'letter' ? `Von ${m.from ?? '?'}` : m.kind === 'returned' ? `Zurück von ${m.from ?? '?'}` : (AH[m.kind] ?? AH.sold)(def?.name ?? '');
      const sub = player ? (m.itemId && def ? def.name : null) : m.kind === 'outbid' ? 'Dein Gebot kommt zurück.' : null;
      out.push({
        key: `s${m.id}`, itemId: def ? id : null, def: m.itemId || !player ? def : null, qty, gold: m.gold, title, sub, rarity: !player ? def?.rarity : null,
        until: m.expiresAt ? Date.parse(m.expiresAt) : Infinity, at: Date.parse(m.at) || 0, kind: player ? (m.kind === 'returned' ? 'back' : 'letter') : 'ah',
        take: () => mail.take([m.id]), giveBack: m.kind === 'letter' ? () => mail.giveBack(m.id) : null,
      });
    }
    for (const l of mail.loot) {
      const def = l.items[0] ? content.find('item', l.items[0].itemId) : null;
      const boss = typeof l.boss === 'string' ? content.find('enemy', l.boss)?.name : null;
      const zone = l.zoneId ? content.find('zone', l.zoneId)?.name : null;
      const more = l.items.length - 1;
      out.push({
        key: l.id, itemId: def ? l.items[0].itemId : null, def, qty: l.items[0]?.qty ?? 0, gold: l.gold, rarity: def?.rarity,
        title: boss ? `Beute: ${boss}` : zone ? `Bossbeute aus ${zone}` : 'Bossbeute',
        sub: def ? (more > 0 ? `${def.name} und ${fmtNum(more)} weitere` : def.name) : null,
        until: l.at + KEEP_DAYS * DAY_MS, at: l.at, kind: 'loot', take: async () => mail.takeLoot(l.id),
      });
    }
    return out.sort((a, b) => b.at - a.at); // Neueste oben
  }

  const takeMsg = (r) => {
    if (r?.capped) return 'Weiteres Gold kannst du nehmen, sobald du länger gespielt hast.';
    if (r?.left || r?.reason === 'partial') return 'Deine Tasche ist voll. Der Rest bleibt hier.';
    return '';
  };
  const takeOne = (e) => run(e.take, (r) => {
    const msg = takeMsg(r);
    if (msg) throw new Error(msg);
    return '';
  });
  async function takeAll() {
    let res = {};
    if (mail.letters.length) res = await mail.take(null);
    for (const l of [...mail.loot]) {
      const r = mail.takeLoot(l.id);
      if (r?.reason === 'partial') res.left = (res.left ?? 0) + 1;
    }
    return res;
  }

  function postView(now) {
    const list = entries();
    const rows = list.map((e) => {
      const icon = e.def ? itemIconEl({ ...e.def, name: null }, 52) : e.kind === 'letter' || e.kind === 'back' ? h('img.ml-seal-big', { src: sealUrl(), width: 52, height: 36, alt: '' }) : h('span.mk-coinbig', iconEl('gold', 52));
      const left = daysLeft(e.until, now);
      const line = [e.sub, left].filter(Boolean).join(' · ');
      const back = backArmed === e.key;
      const row = h(`li.pg-stock-row.mk-row.ml-row.${e.kind}`,
        h('span.mk-icon', icon, e.def && e.qty > 1 ? h('span.pg-qty', fmtNum(e.qty)) : null),
        h('div.pg-stock-name',
          h(e.rarity ? `span.r-${e.rarity}` : 'span', e.title),
          line ? h('small', line) : null),
        e.gold ? goldEl(e.gold, '.mk-amount') : null,
        // Zurückschicken (nur Briefe von Spielern): leise, mit zweitem Tippen
        e.giveBack ? h(`button.ml-back${back ? '.armed' : ''}`, {
          type: 'button', disabled: working, title: back ? null : 'Zurückschicken', 'aria-label': back ? 'Wirklich zurückschicken?' : 'Zurückschicken',
          onclick: () => {
            if (!back) { backArmed = e.key; draw(); clearTimeout(armTimer); armTimer = setTimeout(() => { backArmed = null; draw(); }, 3500); return; }
            backArmed = null; clearTimeout(armTimer);
            run(e.giveBack, () => 'Der Rabe bringt den Brief zurück.');
          },
        }, back ? 'Zurück?' : '↩') : null,
        actionBtn('Nehmen', () => takeOne(e), { small: true, disabled: working }));
      if (e.def) attachTip(row, () => itemDetail(content, e.itemId, detailOpts));
      return row;
    });
    const loading = !mail.loaded && mail.ready && !list.length;
    return h('div.mk-view.mk-mailbox.mk-scroll.pg-keep-scroll', errEl(),
      list.length ? h('ul.pg-stock.mk-list', rows)
        : h('div.ml-empty', h('img.ml-seal-big', { src: sealUrl(), width: 52, height: 36, alt: '' }), h('p', loading ? 'Der Rabe sieht nach …' : 'Keine Post für dich.')));
  }

  // ------------------------------------------------------------------ Schreiben
  // „Alles nehmen“ sitzt in der Kopfzeile neben dem Gold (nur im Reiter Post, ab zwei Einträgen)
  function takeAllBtn() {
    const n = entries().length;
    if (tab !== 'post' || n < 2) return null;
    const b = actionBtn(`Alles nehmen · ${fmtNum(n)}`, () => run(takeAll, (r) => {
      const msg = takeMsg(r);
      if (msg) throw new Error(msg);
      return '';
    }), { small: true, primary: true, disabled: working });
    b.classList.add('ml-takeall');
    return b;
  }

  function lookup() {
    clearTimeout(whoTimer);
    who = null; whoErr = '';
    const name = form.to.trim();
    if (name.length < 2 || !mail.ready) return;
    const my = ++whoGen;
    whoTimer = setTimeout(async () => {
      try { const r = await mail.lookup(name); if (my === whoGen) who = r; } catch (e) { if (my === whoGen) whoErr = e.message; }
      if (my === whoGen) draw();
    }, 450);
  }

  function goodsList() {
    const inv = st().inventory;
    const goods = new Map(), mats = new Set();
    for (const it of inv.slots) if (it && tradeable(content.find('item', it.itemId))) goods.set(it.itemId, (goods.get(it.itemId) ?? 0) + it.qty);
    for (const [id, n] of Object.entries(inv.mats ?? {})) if (n > 0 && tradeable(content.find('item', id))) { goods.set(id, n); mats.add(id); }
    return [...goods].map(([id, n]) => {
      const def = content.find('item', id);
      const on = pick?.itemId === id;
      const btn = h(`button.pg-stock-row.mk-row.mk-good${on ? '.selected' : ''}`, {
        type: 'button', 'data-k': `att-${id}`, 'aria-pressed': String(on),
        onclick: () => { pick = on ? null : { itemId: id, max: n }; form.qty = pick ? Math.min(n, listStack(def)) : 1; armed = false; say(''); draw(); },
      },
        h('span.mk-icon', itemIconEl({ ...def, name: null }, 52), n > 1 ? h('span.pg-qty', fmtNum(n)) : null),
        h('span.pg-stock-name', h(`span.r-${def.rarity}`, def.name), h('small', mats.has(id) ? `Materialbeutel · ${fmtNum(n)}` : `Tasche · ${fmtNum(n)}`)));
      if (!on) attachTip(btn, () => itemDetail(content, id, detailOpts));
      return h('li', btn);
    });
  }

  function letterBox() {
    const gold = st().wallet?.gold ?? 0;
    const g = num(form.gold) ?? 0;
    const def = pick ? content.find('item', pick.itemId) : null;
    const stack = def ? Math.min(pick.max, listStack(def)) : 1;
    const qty = def ? Math.max(1, Math.min(stack, num(form.qty) ?? 1)) : null;
    const name = form.to.trim();
    const valid = name.length >= 2 && !!who?.key && (g > 0 || def) && g <= Math.min(gold, GOLD_MAX) && !whoErr;
    const cls = who?.classId ? content.find('class', who.classId)?.name : null;
    const whoLine = whoErr ? h('small.ml-who.bad', whoErr)
      : who ? h('small.ml-who', cls ? `Stufe ${fmtNum(who.level)} · ${cls}` : `Stufe ${fmtNum(who.level)}`, who.many ? h('span', ' · Name mehrfach vergeben') : null)
        : null;
    const field = (label, key, attrs = {}, extra = null) => h('label.mk-field', h('span', label), h('span.mk-numwrap', h('input.ef-input.mk-num', {
      type: 'text', value: String(form[key] ?? ''), 'data-k': `ml-${key}`, ...attrs,
      oninput: (e) => { form[key] = e.target.value; armed = false; if (key === 'to') lookup(); },
      onchange: () => draw(),
    }), extra));
    const send = () => {
      if (!armed) {
        armed = true; draw();
        clearTimeout(armTimer); armTimer = setTimeout(() => { armed = false; draw(); }, 3500);
        return;
      }
      armed = false; clearTimeout(armTimer);
      const itemId = def ? pick.itemId : null;
      run(() => mail.send({ to: name, key: who?.key, itemId, qty, gold: g }).catch((e) => {
        if (e?.code === 'changed') lookup(); // Empfänger neu nachschlagen, der Spieler sieht ihn und schickt bewusst
        throw e;
      }), (r) => {
        pick = null; form.gold = ''; form.qty = 1;
        return `Der Rabe bringt deinen Brief zu ${r.to ?? name}.`;
      });
    };
    return h('div.ml-letter',
      h('div.ml-letter-head', h('img.ml-seal', { src: sealUrl(), width: 26, height: 18, alt: '' }), h('b', 'Brief')),
      h('div.ml-letter-body',
        h('div.ml-to', field('An', 'to', { maxlength: '40', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'next', translate: 'no' }), whoLine),
        h(`div.mk-prices${def && stack > 1 ? '' : '.one'}`,
          field('Gold', 'gold', { inputmode: 'numeric' }, h('small.mk-max', coinEl())),
          def && stack > 1 ? field('Menge', 'qty', { inputmode: 'numeric' }, h('small.mk-max', `/${fmtNum(stack)}`)) : null),
        h(`div.ml-attach${def ? `.rb-${def.rarity}` : ''}`,
          def ? h('span.mk-icon', itemIconEl({ ...def, name: null }, 52)) : h('span.ml-slot', { 'aria-hidden': 'true' }),
          def ? h('span.pg-stock-name', h(`span.r-${def.rarity}`, def.name), h('small', qty > 1 ? `${fmtNum(qty)} Stück` : 'Beilage'))
            : h('span.pg-stock-name.ml-none', h('small', 'Keine Beilage')),
          def ? h('button.mk-side-close', { type: 'button', 'aria-label': 'Beilage entfernen', onclick: () => { pick = null; armed = false; draw(); } }, '✕') : null)),
      h('div.mk-acts.ml-acts', errEl(), (() => {
        const b = actionBtn(armed ? `Wirklich an ${who?.name ?? name} senden?` : 'Senden', send, { primary: true, disabled: working || !valid || !mail.ready });
        if (armed) b.classList.add('ml-armed');
        return b;
      })()));
  }

  function writeView() {
    const s = st();
    if (!mail.ready) return h('div.mk-view', h('p.ef-note.mk-empty', 'Melde dich mit deinem Konto an, um Post zu verschicken.'));
    if ((s.progress?.level ?? 1) < TRADE_MIN_LEVEL) return h('div.mk-view', h('p.ef-note.mk-empty', `Post verschicken geht ab Stufe ${TRADE_MIN_LEVEL} und nach einer Stunde Spielzeit.`));
    const goods = goodsList();
    return h('div.mk-view.ml-write',
      h('div.mk-main.mk-scroll.pg-keep-scroll',
        h('section', h('h3', 'Beilegen'),
          goods.length ? h('ul.pg-stock.mk-list.mk-goods', goods) : h('p.ef-note.mk-empty', 'Du hast gerade nichts, was sich verschicken lässt.'))),
      letterBox());
  }

  // ------------------------------------------------------------------ Rahmen
  let title = null;
  const render = () => {
    const now = mail.serverNow();
    const gold = st().wallet?.gold ?? 0;
    const n = mail.count;
    const tabs = [['post', 'Post'], ['write', 'Schreiben']];
    const panel = panelFrame(session, 'mail', 'Postfach',
      h('div.pg-tabs.mk-tabs', { role: 'tablist' }, tabs.map(([id, label]) => h(`button.pg-tabbtn${tab === id ? '.on' : ''}`, {
        type: 'button', role: 'tab', 'aria-selected': String(tab === id),
        onclick: () => { tab = id; armed = false; backArmed = null; say(''); draw(); if (id === 'post') mail.refresh().catch(() => {}); },
      }, label, id === 'post' && n ? h('span.mk-badge', fmtNum(n)) : null)), takeAllBtn(), goldEl(gold, '.mk-purse')),
      h('div.mk-body', tab === 'post' ? postView(now) : writeView()));
    panel.classList.add('pg-market', 'ml-panel');
    panel.style.setProperty('--mk-frame2', `url(${frameUrl(2)})`);
    panel.style.setProperty('--mk-frame3', `url(${frameUrl(3)})`);
    const t = panel.querySelector('.pg-title');
    if (t && session.font) {
      if (title?.lang !== tr('Postfach')) title = { c: pixelTitle(session.font, 'Postfach'), lang: tr('Postfach') };
      const tc = title.c;
      const c = h('canvas.mk-ptitle', { width: tc.width, height: tc.height, 'aria-hidden': 'true' });
      c.getContext('2d').drawImage(tc, 0, 0);
      c.style.setProperty('--tw', String(tc.width)); c.style.setProperty('--th', String(tc.height));
      t.replaceChildren(c, h('span.mk-sr', 'Postfach'));
    }
    return panel;
  };

  // Neu zeichnen ohne Fokus, Cursor und Scrollstand zu verlieren (wie im Auktionshaus)
  let queued = false;
  function draw() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      hideTip();
      const act = document.activeElement, k = root.contains(act) ? act?.dataset?.k : null;
      const caret = k && typeof act.selectionStart === 'number' ? [act.selectionStart, act.selectionEnd] : null;
      const tops = [...root.querySelectorAll('.pg-keep-scroll')].map((el) => el.scrollTop);
      root.replaceChildren(render());
      root.querySelectorAll('.pg-keep-scroll').forEach((el, i) => { el.scrollTop = tops[i] ?? 0; });
      root.querySelectorAll('.mk-scroll').forEach((el) => {
        const more = () => el.classList.toggle('more', el.scrollHeight - el.scrollTop - el.clientHeight > 4);
        more();
        el.addEventListener('scroll', more, { passive: true });
      });
      if (k) {
        const el = root.querySelector(`[data-k="${k}"]`);
        if (el) { el.focus({ preventScroll: true }); if (caret) try { el.setSelectionRange(caret[0], caret[1]); } catch { /* egal */ } }
      }
    });
  }

  const offs = [
    mail.onChange(draw),
    session.bus.on(EV.STATE_CHANGED, (e) => { if (/^(wallet|inventory|market|mail)/.test(e.type)) draw(); }),
  ];
  const tick = setInterval(draw, 60_000);
  draw();
  mail.refresh().catch((e) => { say(e.message, true); draw(); });
  return { root, dispose: () => { offs.forEach((off) => off()); clearInterval(tick); clearTimeout(whoTimer); clearTimeout(armTimer); hideTip(); } };
}
