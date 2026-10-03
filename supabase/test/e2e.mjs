import { execSync } from 'node:child_process';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
execSync('sudo -u postgres psql -q -f /tmp/mock.sql >/dev/null 2>&1 && sudo -u postgres psql -q -d sbtest -v ON_ERROR_STOP=1 -f /tmp/mig.sql >/dev/null');
const { pool } = await import('./mock.mjs');
const html = readFileSync('work/dist/emberfall.html');
http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); }).listen(8099);
const B = 'http://localhost:8099/spielen/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, msg) => { console.log(ok ? 'OK  ' : 'FAIL', msg); if (!ok) fails++; };
const errs = [];
async function newPage(w = 1280, h = 800) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebSocket connection/.test(m.text())) errs.push(m.text()); });
  return p;
}
const text = (p) => p.evaluate(() => document.querySelector('.ui-scene')?.innerText ?? '');
const scene = (p) => p.evaluate(() => window.emberfall.scenes.currentId);

// 1 Registrieren
const a = await newPage();
await a.goto(B + '#registrieren'); await wait(600);
check(await scene(a) === 'login' && (await text(a)).includes('Konto erstellen'), 'Anker #registrieren öffnet Registrierung');
await a.screenshot({ path: 'shot-register.png' });
const inputs = a.locator('.on-form input');
await inputs.nth(0).fill('Sitzheizung'); await inputs.nth(1).fill('admin@test.de'); await inputs.nth(2).fill('kurz');
await a.click('.on-submit'); await wait(200);
check((await text(a)).includes('mindestens 8'), 'schwaches Passwort wird abgelehnt');
await a.locator('.on-form input').nth(2).fill('geheim123');
// Felder wurden durch Render geleert? neu füllen
const i2 = a.locator('.on-form input');
await i2.nth(0).fill('Sitzheizung'); await i2.nth(1).fill('admin@test.de'); await i2.nth(2).fill('geheim123');
check(await a.evaluate(() => [...document.querySelectorAll('.on-legal-link')].some((l) => l.getAttribute('href') === '/nutzungsbedingungen') && [...document.querySelectorAll('.on-legal-link')].some((l) => l.getAttribute('href') === '/datenschutz')), 'Registrierung verlinkt Nutzungsbedingungen und Datenschutz');
await a.click('.on-submit'); await wait(300);
check((await text(a)).includes('Bitte bestätige die Nutzungsbedingungen') && (await a.locator('.on-form input').nth(1).inputValue()) === 'admin@test.de', 'ohne Zustimmung keine Registrierung, Eingaben bleiben stehen');
await a.check('.on-check input');
await a.click('.on-submit'); await wait(500);
check((await text(a)).includes('Fast geschafft'), 'Registrierung verlangt E-Mail-Bestätigung');
{ const { rows: m } = await pool.query("select raw_user_meta_data->>'terms_version' v from auth.users where email='admin@test.de'"); check(m[0]?.v === '2026-10', 'Zustimmung im Konto vermerkt: ' + JSON.stringify(m)); }
// Anmelden vor Bestätigung
const i3 = a.locator('.on-form input');
await i3.nth(0).fill('admin@test.de'); await i3.nth(1).fill('geheim123');
await a.click('.on-submit'); await wait(400);
check((await text(a)).includes('bestätige zuerst'), 'Anmeldung vor Bestätigung wird verständlich abgelehnt');
// 2 Bestätigungslink
await a.goto(globalThis.lastMail); await wait(900);
check(a.url() === B, 'Rückleitung entfernt ?code aus der Adresse: ' + a.url());
const t48 = await text(a); check(t48.includes('E-Mail bestätigt') && t48.includes('Sitzheizung'), 'nach Bestätigung angemeldet, Kontoseite ' + (await scene(a)) + ' ' + t48.slice(0,300));
check(await a.evaluate(() => !document.querySelector('.ui-scene').textContent.includes('Sicherung laden')), 'Kontoseite ohne Sicherungsdatei');
await a.screenshot({ path: 'shot-account.png' });
// 3 Spielen + Charakter anlegen -> Cloud
await a.click('text=Spielen'); await wait(300);
check(await scene(a) === 'characters', 'Spielen führt zur Charakterliste');
await a.evaluate(() => window.emberfall.newGame({ character: { name: 'Ada', raceId: 'elf', classId: 'mage' } }));
await wait(1500);
await a.evaluate(() => window.emberfall.saveNow('test'));
await wait(3500);
let { rows } = await pool.query('select name, level, class_id, snapshot is not null s from public.characters');
check(rows.length === 1 && rows[0].name === 'Ada' && rows[0].class_id === 'mage', 'Charakter liegt in der Cloud: ' + JSON.stringify(rows));
// Stufe ändern -> Upload
await a.evaluate(() => { window.emberfall.state.slices.progress.level = 7; window.emberfall.saveNow('test'); });
await wait(3500);
({ rows } = await pool.query('select level from public.characters'));
check(rows[0]?.level === 7, 'Stufenänderung wird hochgeladen');
const exported = await a.evaluate(() => JSON.stringify(window.emberfall.save.exportAll()));
check(!exported.includes('access_token') && !exported.includes('refresh_token'), 'Sicherungsdatei enthält keine Tokens');
// 4 Admin ohne Recht
await a.evaluate(() => window.emberfall.scenes.go('title')); await wait(300);
await a.goto(B + '#admin'); await wait(900);
check((await text(a)).includes('Kein Zugriff'), 'Admin-Seite ohne Recht: Kein Zugriff');
// 5 Zweites Konto per Google (anderes Gerät)
const b = await newPage(390, 844);
await b.goto(B + '#anmelden'); await wait(500);
await b.screenshot({ path: 'shot-login-mobile.png' });
check(await b.evaluate(() => document.querySelector('.on-google').offsetParent !== null && !document.querySelector('.on-apple')), 'Google-Knopf per Server-Einstellung freigeschaltet, kein Apple-Knopf');
await b.click('.on-google'); await wait(1200);
check((await text(b)).includes('Gustav Google') && (await text(b)).includes('Google'), 'Google-Anmeldung über Rückleitung');
await b.click('text=Spielen'); await wait(300);
// Google-Konten haben beim ersten Mal kein Häkchen gesetzt: Zustimmung wird einmal nachgeholt und vermerkt
check((await text(b)).includes('Zustimmen und spielen') && (await text(b)).includes('ab 12 Jahren; unter 18 nur mit Zustimmung der Eltern'), 'Google-Konto: Zustimmung wird vor dem Spielen abgefragt');
await b.click('text=Zustimmen und spielen'); await wait(300);
check((await text(b)).includes('Bitte bestätige die Nutzungsbedingungen'), 'ohne Häkchen kein Weiter');
await b.check('.on-check input'); await b.click('text=Zustimmen und spielen'); await wait(800);
{ const { rows: m } = await pool.query("select raw_user_meta_data->>'terms_version' v from auth.users where email='googleuser@example.com'"); check(m[0]?.v === '2026-10' && (await text(b)).includes('Dein erster Held'), 'Zustimmung des Google-Kontos vermerkt, weiter zur Charakterauswahl: ' + JSON.stringify(m)); }
await b.evaluate(() => window.emberfall.newGame({ character: { name: 'Bruno', raceId: 'dwarf', classId: 'warrior' } }));
await wait(3500);
const peek = await b.evaluate(async () => { const c = window.emberfall.online.client; const own = await c.rest('/characters?select=id'); let admin; try { await c.rpc('admin_stats'); admin = 'erlaubt'; } catch (e) { admin = e.message; } return { own: own.length, admin }; });
check(peek.own === 1 && /Kein Zugriff/.test(peek.admin), 'Fremdes Konto sieht nur eigene Charaktere, admin_stats verweigert: ' + JSON.stringify(peek));
// 6 Admin-Recht setzen (wie im SQL-Editor)
await pool.query("insert into public.admins select id from auth.users where email='admin@test.de'");
await a.goto(B + '#admin'); await wait(1200);
const at = await text(a); console.log(await a.evaluate(async () => { try { return JSON.stringify(await window.emberfall.online.client.rpc('is_admin')) + ' ' + window.emberfall.online.user?.email; } catch (e) { return 'ERR ' + e.message; } }));
check(at.includes('Registrierte Konten') && at.includes('gustavuser') === false && at.includes('googleuser@example.com'), 'Admin sieht Übersicht mit allen Konten');
await a.screenshot({ path: 'shot-admin.png', fullPage: true });
await a.click('text=Charaktere ('); await wait(200);
const ct = await text(a);
check(ct.includes('Bruno') && ct.includes('Ada'), 'Admin sieht Charaktere aller Konten');
await a.screenshot({ path: 'shot-admin-chars.png' });
// 6b Chat-Meldungen im Admin-Reiter „Meldungen“ (Migration chat_meldungen)
execSync('sudo -u postgres psql -q -d sbtest -v ON_ERROR_STOP=1 >/dev/null', { input: 'do $$ begin create role service_role; exception when duplicate_object then null; end $$;\n' + readFileSync(new URL('../migrations/20261003120100_chat_meldungen.sql', import.meta.url), 'utf8') });
await pool.query("insert into public.chat_reports (reporter_id, reporter_name, reported_id, reported_name, zone, reason, note, messages, good_faith) select a.id, 'Sitzheizung', g.id, 'Gustav', 'ashen_steppe', 'beleidigung', 'Testmeldung', '[{\"text\":\"du Wurm\",\"at\":\"2026-10-03T12:00:00Z\"}]', true from auth.users a, auth.users g where a.email='admin@test.de' and g.email='googleuser@example.com'");
await a.click('text=Meldungen'); await wait(800);
await a.screenshot({ path: 'shot-admin-reports.png' });
check((await text(a)).includes('Testmeldung') && (await text(a)).includes('du Wurm'), 'Admin sieht Chat-Meldung im Reiter „Meldungen“');
await a.fill('.net-adm-decision', 'Beleidigung bestätigt'); await a.click('text=Chat sperren: 24 Stunden'); await wait(1500);
{ const { rows: r } = await pool.query("select status, decision from public.chat_reports"); const { rows: m } = await pool.query('select count(*)::int n from public.chat_mutes'); check(r[0]?.status === 'erledigt' && m[0].n === 1, 'Chatsperre gesetzt und Meldung erledigt: ' + JSON.stringify(r)); }
// 7 Gerätewechsel: Admin meldet sich auf Gerät C an, Charakter kommt an, Löschen synct zurück
const c = await newPage();
await c.goto(B + '#anmelden'); await wait(500);
const ic = c.locator('.on-form input'); await ic.nth(0).fill('admin@test.de'); await ic.nth(1).fill('geheim123');
await c.click('.on-submit'); await wait(1500);
check((await text(c)).includes('1 Charakter'), 'Anderes Gerät lädt Charakter herunter');
const lvl = await c.evaluate(() => { const g = window.emberfall; const acc = g.online.accountId; const ch = g.save.listCharacters(acc)[0]; return ch?.level; });
check(lvl === 7, 'heruntergeladener Stand hat Stufe 7');
check((await text(c)).includes('Verwaltung öffnen'), 'Admin sieht Knopf „Verwaltung öffnen“');
await c.evaluate(() => { const g = window.emberfall; const acc = g.online.accountId; const ch = g.save.listCharacters(acc)[0]; g.save.deleteCharacter(acc, ch.id); });
await wait(800);
({ rows } = await pool.query("select count(*)::int n from public.characters c join auth.users u on u.id=c.user_id where u.email='admin@test.de'"));
check(rows[0].n === 0, 'Löschen auf Gerät C löscht in der Cloud');
await a.evaluate(() => window.emberfall.online.sync.syncAll()); await wait(300);
const left = await a.evaluate(() => window.emberfall.save.listCharacters(window.emberfall.online.accountId).length);
check(left === 0, 'Gerät A entfernt den anderswo gelöschten Charakter');
// 8 Lokalen Charakter übernehmen
await c.evaluate(() => { const g = window.emberfall; const acc = g.save.createAccount('Lokal'); g.login(acc.id); g.newGame({ character: { name: 'Lokalo', raceId: 'human', classId: 'rogue' } }); });
await wait(800);
await c.evaluate(() => window.emberfall.scenes.go('login', { mode: 'account' })); await wait(300);
await c.click('.on-import-row button'); await wait(3500);
({ rows } = await pool.query("select name from public.characters c join auth.users u on u.id=c.user_id where u.email='admin@test.de'"));
check(rows.length === 1 && rows[0].name === 'Lokalo', 'Lokaler Charakter wird ins Konto kopiert');
await wait(1000);
check(!(await text(c)).includes('Auf diesem Gerät gefunden'), 'übernommener Charakter wird nicht erneut angeboten');
// 9 Abmelden entfernt lokale Kopie
await c.click('text=Kontoeinstellungen'); await c.click('text=Abmelden'); await wait(800);
const after = await c.evaluate(() => ({ user: !!window.emberfall.online.user, accs: window.emberfall.save.listAccounts().map((x) => x.name), sess: localStorage.getItem('emberwrath:online:session') }));
check(!after.user && !after.sess && !after.accs.includes('Sitzheizung') && after.accs.includes('Lokal'), 'Abmelden entfernt Sitzung und Online-Kopie, lokales Profil bleibt: ' + JSON.stringify(after));
// 9b Tippen mit echter Tastatur (p, Escape-Taste nicht)
await c.click('.on-link:has-text("Registrieren")'); await wait(200);
await c.locator('.on-form input').nth(0).click(); await c.keyboard.type('Pip Opa');
check(await scene(c) === 'login' && (await c.locator('.on-form input').nth(0).inputValue()) === 'Pip Opa', 'Tippen von p im Formular bleibt auf der Seite und schreibt den Buchstaben');
await c.click('.on-link:has-text("Anmelden")'); await wait(200);
// 10 Passwort vergessen
await c.click('text=Passwort vergessen?'); await c.locator('.on-form input').fill('admin@test.de'); await c.click('.on-submit'); await wait(500);
check((await text(c)).includes('Link unterwegs'), 'Link zum Zurücksetzen angefordert');
await c.goto(globalThis.lastMail); await wait(900);
check((await text(c)).includes('Neues Passwort'), 'Link öffnet „Neues Passwort“');
await c.locator('.on-form input').fill('neuesPasswort9'); await c.click('.on-submit'); await wait(600);
check((await text(c)).includes('Passwort wurde geändert'), 'Passwort geändert');
// Link in anderem Browser
await c.click('text=Kontoeinstellungen'); await c.click('text=Abmelden'); await wait(600);
await c.click('text=Passwort vergessen?'); await c.locator('.on-form input').fill('admin@test.de'); await c.click('.on-submit'); await wait(500);
const d = await newPage(); await d.goto(globalThis.lastMail); await wait(900);
check((await text(d)).includes('anderen Browser'), 'Link im fremden Browser: verständliche Meldung');
// 11 Token-Ablauf -> Erneuerung
globalThis.TTL = 30;
const e = await newPage(); await e.goto(B + '#anmelden'); await wait(400);
const ie = e.locator('.on-form input'); await ie.nth(0).fill('admin@test.de'); await ie.nth(1).fill('neuesPasswort9'); await e.click('.on-submit'); await wait(900);
const refreshed = await e.evaluate(async () => { const c = window.emberfall.online.client; const before = c.session.access_token; const r = await c.rpc('is_admin'); return { r, changed: before !== c.session.access_token }; });
check(refreshed.r === true && refreshed.changed, 'abgelaufenes Token wird erneuert: ' + JSON.stringify(refreshed));
globalThis.TTL = 3600;
// 12 Konto löschen (Google-Konto)
await b.evaluate(() => window.emberfall.scenes.go('login', { mode: 'account' })); await wait(300);
await b.click('text=Kontoeinstellungen'); await b.click('text=Konto löschen'); await b.click('text=Wirklich endgültig löschen?'); await wait(900);
({ rows } = await pool.query("select count(*)::int n from auth.users where email='googleuser@example.com'"));
const bc = await pool.query("select count(*)::int n from public.characters where name='Bruno'");
check(rows[0].n === 0 && bc.rows[0].n === 0 && (await text(b)).includes('wurden gelöscht'), 'Konto löschen entfernt Konto und Charaktere');
// 13 Auffälligkeiten (abgelehnte Spielstände) im Admin-Reiter
execSync('sudo -u postgres psql -q -d sbtest -v ON_ERROR_STOP=1 >/dev/null', { input: readFileSync(new URL('../migrations/20261003130000_spielstand_pruefung.sql', import.meta.url), 'utf8') });
await pool.query(`insert into public.character_flags (user_id, character_id, reason, detail) select id, 'c_test', 'gold', '{"level":[5,6],"gold":[1200,9000000],"playTime":[600,900],"realSeconds":310}' from auth.users where email='admin@test.de'`);
await a.goto(B + '#admin'); await wait(1200);
await a.click('text=Auffälligkeiten'); await wait(800);
{ const t = await text(a); check(t.includes('Gold zu schnell gestiegen') && t.includes('admin@test.de') && t.includes('Gold 1.200 → 9.000.000') && t.includes('Auffälligkeiten (1)'), 'Admin sieht abgelehnte Spielstände im Reiter „Auffälligkeiten“'); }
await a.screenshot({ path: 'shot-admin-flags.png' });
check(errs.length === 0, 'keine JS-Fehler: ' + errs.join(' | '));
console.log(fails ? `${fails} FEHLER` : 'ALLES GRÜN');
await browser.close(); process.exit(fails ? 1 : 0);
