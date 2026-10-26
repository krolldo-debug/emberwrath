// Erzeugt die Migration für eine neue Höchststufe (Sternenglut Teil 1: 50) aus den Spieldaten. Nicht Teil des Spiels.
//
//   node src/ledger/stufenSql.mjs > supabase/migrations/20261026120000_stufe_50.sql
//
// Enthält nur, was an der Höchststufe hängt: die Stufengrenze der Spielstandprüfung (characters_plausible) und aus dem
// Fortschrittsbuch (ledgerSql.mjs) die Erfahrung je Stufe, ledger_values und ledger_normalize. Alles andere bleibt, wie
// die bisherigen Migrationen es angelegt haben. Mehrfach ausführbar.
import { LEVEL_CAP, LEGACY_CAP } from '../progression/xp.js';
import { ledgerSql } from './ledgerSql.mjs';

// Ein Abschnitt aus der Fortschrittsbuch-Migration, von `start` bis einschließlich `end`
function part(sql, start, end) {
  const a = sql.indexOf(start);
  const b = sql.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error(`Abschnitt fehlt: ${start}`);
  return sql.slice(a, b + end.length);
}

export function stufenSql() {
  const sql = ledgerSql();
  const levels = part(sql, 'delete from public.ledger_levels;', ';\n\n');
  const values = part(sql, 'create or replace function public.ledger_values(', 'end $$;');
  const normalize = part(sql, 'create or replace function public.ledger_normalize(', 'end $$;');
  return `-- Emberwrath: Höchststufe ${LEVEL_CAP} (Erweiterung Sternenglut, Teil 1).
-- Einmal im Supabase-SQL-Editor ausführen, NACH allen bisherigen Migrationen (zuletzt 20261026090000_handelskontingent.sql)
-- und VOR dem Merge des Spiels mit Stufe ${LEVEL_CAP}: Das jetzige Spiel (Stufe ${LEGACY_CAP}) läuft damit unverändert weiter.
-- Mehrfach ausführbar. Erzeugt mit: node src/ledger/stufenSql.mjs (Stufen und Erfahrung aus src/progression/xp.js).
--
--  - Spielstandprüfung (characters_plausible): Stufe 1–${LEVEL_CAP} statt 1–${LEGACY_CAP}. Die übrige Funktion bleibt genau, wie sie ist
--    (sie wird aus der Datenbank gelesen und nur an dieser Stelle geändert).
--  - Fortschrittsbuch: Erfahrung je Stufe bis ${LEVEL_CAP} (bis ${LEGACY_CAP} unverändert), Stufe beim Zählen und Bereinigen bis ${LEVEL_CAP}.
--  - Bestehende Charaktere: Stufe, Erfahrung und alles andere bleiben genau, wie sie sind.

-- ------------------------------------------------------------------ Spielstandprüfung
do $stufe$
declare
  src text := pg_get_functiondef('public.characters_plausible()'::regprocedure);
  neu text := regexp_replace(src, 'lvl > [0-9]+ or gold', 'lvl > ${LEVEL_CAP} or gold');
begin
  if neu !~ 'lvl > ${LEVEL_CAP} or gold' then
    raise exception 'characters_plausible: Stufengrenze nicht gefunden – bitte melden, nichts geändert';
  end if;
  if neu <> src then execute neu; end if;
end $stufe$;
revoke execute on function public.characters_plausible() from public, anon, authenticated;

-- ------------------------------------------------------------------ Fortschrittsbuch
${levels.trimEnd()}

${values}

${normalize}
revoke execute on function public.ledger_values(jsonb) from public, anon, authenticated;
revoke execute on function public.ledger_normalize(jsonb) from public, anon, authenticated;
`;
}

if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(stufenSql());
