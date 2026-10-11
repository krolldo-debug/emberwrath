// Postfach: Regeln, die Spiel und Datenbank teilen (ohne DOM). Die Datenbank bekommt dieselben Werte über
// src/mail/mailSql.mjs (erzeugt die Migration).
import { PRICE_MAX } from '../market/rules.js';

export const GOLD_MAX = PRICE_MAX; // Gold je Brief, wie ein Preis im Auktionshaus

export const KEEP_DAYS = 30;        // Post bleibt so viele Tage liegen, danach verfällt sie
export const SEND_PER_HOUR = 30;    // Briefe je Konto und Stunde
export const BOX_MAX = 60;          // offene Briefe von Spielern je Empfänger (Auktionshaus und Beute zählen nicht)
export const LOOT_MAX = 20;         // Beutebriefe (Bossbeute, nicht aufgehoben) je Charakter, ältere verfallen zuerst
export const DAY_MS = 86_400_000;
