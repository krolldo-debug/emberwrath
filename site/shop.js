// Shop-Seite (site/shop.html): Designs und Gold mit dem Konto aus dem Spiel kaufen. Ohne Abhängigkeiten.
// Anmeldung: dieselbe Sitzung wie das Spiel (localStorage 'emberwrath:online:session', Format von src/online/AuthClient.js).
// Kaufen: POST /net/shop/checkout (worker/shop.js) → Stripe. Gutgeschrieben wird nur nach dem Webhook von Stripe;
// Designs und Gold kommen beim nächsten Spielstart ins Spiel (src/shop/index.js, claim()).
(() => {
  // Öffentliche Werte wie in src/online/config.js (publishable-Schlüssel, kein Geheimnis).
  const SUPABASE_URL = 'https://mgjhllqnelqbdqfvczls.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_K_fTi48XiEfx4wB8vTOjeA_oFeyqiFq';
  const SESSION_KEY = 'emberwrath:online:session';
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const state = $('[data-shop-state]');
  const loginBtn = $('[data-shop-login]');
  const errorBox = $('[data-shop-error]');
  const waiver = $('[data-waiver]');
  const charField = $('[data-char-field]');
  const charSelect = $('[data-char]');
  const cfg = window.EW_SITE ?? {};
  if (cfg.loginUrl) loginBtn.href = cfg.loginUrl;

  const ERRORS = {
    auth: 'Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.',
    closed: 'Der Shop öffnet in Kürze.',
    unavailable: 'Der Shop öffnet in Kürze.',
    waiver: 'Bitte bestätige zuerst den Hinweis zum Widerrufsrecht.',
    blocked: 'Käufe sind für dein Konto gesperrt. Bitte wende dich an den Support.',
    revoke_pending: 'Eine erstattete Zahlung wird gerade verbucht. Bitte starte einmal das Spiel und versuch es dann noch einmal.',
    owned: 'Dieses Design gehört dir schon.',
  };

  // Rückkehr von Stripe
  const params = new URLSearchParams(location.search);
  const back = params.get('kauf');
  if (back) {
    $(back === 'erfolg' ? '[data-shop-thanks]' : '[data-shop-cancel]').hidden = false;
    history.replaceState(null, '', location.pathname);
  }

  // ---------- Sitzung
  const readSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null'); } catch { return null; } };
  async function token() {
    const s = readSession();
    if (!s?.access_token) return null;
    if ((s.expires_at ?? 0) - 60 > Date.now() / 1000) return s.access_token;
    if (!s.refresh_token) return null;
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }),
      });
      if (!r.ok) return null;
      const d = await r.json();
      // Hat das Spiel in einem anderen Tab gerade selbst erneuert, dessen Sitzung behalten.
      const now = readSession();
      if (now?.access_token && now.access_token !== s.access_token) return now.access_token;
      const next = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at ?? Math.floor(Date.now() / 1000) + (d.expires_in ?? 3600), user: d.user ?? s.user };
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      return next.access_token;
    } catch { return null; }
  }
  const rest = async (path, tok, init = {}) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init, headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${tok}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
    if (!r.ok) throw new Error(`rest ${r.status}`);
    return r.json();
  };

  // ---------- Anzeige
  let status = null, user = null, admin = false, owned = [], chars = [], busy = false;
  const canBuy = () => !!status && !!user && (status.enabled || (admin && status.configured)) && !busy;
  const price = (cents) => (cents / 100).toLocaleString(document.documentElement.lang || undefined, { style: 'currency', currency: 'EUR' });

  function render() {
    if (!status) state.textContent = 'Der Shop ist gerade nicht erreichbar. Bitte versuch es später noch einmal.';
    else if (!status.enabled && !admin) state.textContent = 'Der Shop öffnet in Kürze.';
    else if (!user) state.textContent = 'Melde dich mit deinem Emberwrath-Konto an, um zu kaufen.';
    else if (!status.enabled) state.textContent = status.configured
      ? 'Admin-Vorschau: Für Spieler ist der Shop noch geschlossen. Käufe gehen nur mit deinem Admin-Konto.'
      : 'Admin-Vorschau: Zahlungen sind noch nicht eingerichtet (docs/SHOP.md).';
    else state.textContent = `Angemeldet als ${user.user_metadata?.display_name || user.email}.`;
    loginBtn.hidden = !!user || !status?.enabled;

    for (const d of status?.designs ?? []) {
      const card = $(`[data-design="${d.id}"]`);
      if (!card) continue;
      card.querySelector('[data-price]').textContent = price(d.priceCents);
      const has = d.items.every((k) => owned.includes(k));
      card.classList.toggle('owned', has);
      const btn = card.querySelector('[data-buy]');
      btn.textContent = has ? 'Gehört dir' : 'Kaufen';
      btn.disabled = has || !canBuy() || !waiver.checked;
    }
    for (const p of status?.products ?? []) {
      const btn = $(`[data-buy="${p.id}"]`);
      if (!btn) continue;
      btn.textContent = price(p.priceCents);
      btn.disabled = !canBuy() || !waiver.checked || !charSelect.value;
    }
    charField.hidden = !user || !chars.length;
  }

  async function load() {
    try {
      const r = await fetch('/net/shop/status', { headers: { accept: 'application/json' } });
      status = r.ok ? await r.json() : null;
    } catch { status = null; }
    const tok = await token();
    user = tok ? readSession()?.user ?? null : null;
    if (tok) {
      const [isAdmin, designs, list] = await Promise.all([
        rest('rpc/is_admin', tok, { method: 'POST', body: '{}' }).catch(() => false),
        rest('rpc/shop_designs', tok, { method: 'POST', body: '{}' }).catch(() => []),
        rest('characters?select=id,name,level,class_id&order=level.desc', tok).catch(() => []),
      ]);
      admin = isAdmin === true;
      owned = Array.isArray(designs) ? designs : [];
      chars = Array.isArray(list) ? list : [];
      const CLASS = { warrior: 'Krieger', rogue: 'Schurke', ranger: 'Waldläufer', mage: 'Magier' };
      charSelect.replaceChildren(...chars.map((c) => {
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = `${c.name}, Stufe ${c.level}${CLASS[c.class_id] ? ` ${CLASS[c.class_id]}` : ''}`;
        o.translate = false;
        return o;
      }));
    }
    render();
  }

  async function buy(productId) {
    errorBox.hidden = true;
    const tok = await token();
    if (!tok) { errorBox.textContent = ERRORS.auth; errorBox.hidden = false; return; }
    busy = true; render();
    try {
      const r = await fetch('/net/shop/checkout', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
        body: JSON.stringify({ productId, characterId: productId.startsWith('gold_') ? charSelect.value : undefined, waiver: true, from: 'web' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) throw new Error(ERRORS[d.error] ?? 'Die Bezahlseite ist gerade nicht erreichbar. Bitte versuch es gleich noch einmal.');
      location.assign(d.url);
    } catch (e) {
      busy = false; errorBox.textContent = e.message; errorBox.hidden = false; render();
    }
  }

  for (const b of $$('[data-buy]')) b.addEventListener('click', () => buy(b.dataset.buy));
  waiver.addEventListener('change', render);
  charSelect.addEventListener('change', render);
  load();
})();
