// Postfach: Regeln, die Spiel und Datenbank teilen (ohne DOM). Die Datenbank bekommt dieselben Werte über
// src/mail/mailSql.mjs (erzeugt die Migration).
import { PRICE_MAX } from '../market/rules.js';

export const GOLD_MAX = PRICE_MAX; // Gold je Brief, wie ein Preis im Auktionshaus

export const KEEP_DAYS = 30;        // Spielerbriefe: nach so vielen Tagen einmal zurück an den Absender (Auktionshaus-Post bleibt)
export const SEND_PER_HOUR = 30;    // Briefe je Konto und Stunde
export const LOOKUP_PER_MINUTE = 20; // Empfänger nachschlagen je Konto und Minute
export const BOX_MAX = 60;          // offene Briefe von Spielern je Empfänger (Auktionshaus und Beute zählen nicht)
export const PAIR_MAX = 3;          // offene Briefe eines Kontos an denselben Empfänger
export const LOOT_MAX = 20;         // Beutebriefe (Bossbeute, nicht aufgehoben) je Charakter, ältere verfallen zuerst
export const LOOT_ITEMS_MAX = 8;    // Gegenstände je Beutebrief
export const LOOT_GOLD_MAX = 20000; // Gold je Beutebrief (Bossgold liegt weit darunter)
export const DAY_MS = 86_400_000;
