-- Löschfristen aus der Datenschutzerklärung wirklich einhalten (Rechtsprüfung 05.10.2026).
--
-- Bisher gab es cleanup_forms() und cleanup_chat_moderation(), aber cleanup_forms() lief nie von selbst, und für
-- character_flags (Prüfung der Spielstände) und unbezahlte Shop-Bestellungen gab es gar keine Löschung.
-- Diese Migration bündelt alles in cleanup_personal_data() und lässt es täglich um 03:15 Uhr (UTC) per pg_cron laufen.
-- Läuft auch, wenn die Shop-Migrationen noch nicht ausgeführt sind (Tabellen werden vorher geprüft).
--
-- Fristen (müssen zu site/datenschutz.html passen):
--   newsletter_subscribers  unbestätigt nach 7 Tagen            (cleanup_forms)
--   support_requests        erledigt nach 180 Tagen             (cleanup_forms)
--   chat_reports            erledigt nach 180 Tagen             (cleanup_chat_moderation)
--   chat_mutes              abgelaufen nach 365 Tagen           (cleanup_chat_moderation)
--   character_flags         nach 365 Tagen oder sobald das Konto gelöscht ist (user_id hat keinen Fremdschlüssel)
--   gold_orders             pending/failed/expired nach 90 Tagen; bezahlte Bestellungen bleiben (steuerliche
--                           Aufbewahrung, user_id wird beim Löschen des Kontos schon heute auf null gesetzt)
--   shop_block_marks        nach drei Jahren                    (cleanup_shop() aus der Shop-Migration, falls vorhanden)

create or replace function public.cleanup_personal_data() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if to_regprocedure('public.cleanup_forms()') is not null then
    perform public.cleanup_forms();
  end if;
  if to_regprocedure('public.cleanup_chat_moderation()') is not null then
    perform public.cleanup_chat_moderation();
  end if;
  if to_regclass('public.character_flags') is not null then
    delete from public.character_flags f
      where f.created_at < now() - interval '365 days'
         or not exists (select 1 from auth.users u where u.id = f.user_id);
  end if;
  if to_regprocedure('public.cleanup_shop()') is not null then
    perform public.cleanup_shop();  -- shop_block_marks nach drei Jahren (Shop-Migration)
  end if;
  if to_regclass('public.gold_orders') is not null then
    delete from public.gold_orders o
      where o.status in ('pending', 'failed', 'expired') and o.created_at < now() - interval '90 days';
  end if;
end $$;
revoke execute on function public.cleanup_personal_data() from public, anon, authenticated;

-- Täglich ausführen. pg_cron ist bei Supabase vorhanden (Database › Extensions). Falls die Erweiterung nicht
-- eingeschaltet werden kann, bricht die Migration nicht ab; dann einmal im Monat von Hand:
--   select public.cleanup_personal_data();
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'emberwrath_loeschfristen';
  perform cron.schedule('emberwrath_loeschfristen', '15 3 * * *', 'select public.cleanup_personal_data()');
exception when others then
  raise notice 'pg_cron nicht verfügbar (%). Bitte cleanup_personal_data() regelmäßig von Hand ausführen.', sqlerrm;
end $$;

-- Gleich einmal aufräumen.
select public.cleanup_personal_data();
