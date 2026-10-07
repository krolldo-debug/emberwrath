-- Emberwrath: Konto löschen nur nach frischer Anmeldung (Sicherheitscheck C4).
-- Einmal im Supabase-SQL-Editor ausführen (nach 20260930120000_konten_und_admin.sql). Mehrfach ausführbar.
--
-- Wer ein offenes Gerät eines anderen benutzt, soll dessen Konto nicht mit einem Klick löschen können. Das Spiel fragt
-- deshalb vor dem Löschen das Passwort ab bzw. leitet Google-Konten zu einer erneuten Google-Anmeldung. Der Server
-- prüft das selbst: Im Zugriffstoken steht unter "amr" der Zeitpunkt der letzten echten Anmeldung (Passwort, Google,
-- E-Mail-Link). Token-Erneuerungen ändern ihn nicht. Liegt die Anmeldung länger als 10 Minuten zurück, lehnt
-- delete_my_account mit 'reauth_required' ab; das Spiel zeigt dann die Bestätigung erneut.

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  signed_in bigint;
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  select max((a ->> 'timestamp')::bigint) into signed_in
    from jsonb_array_elements(coalesce((select auth.jwt()) -> 'amr', '[]'::jsonb)) a
    where jsonb_typeof(a -> 'timestamp') = 'number';
  if signed_in is null or signed_in < extract(epoch from now()) - 600 then
    raise exception 'reauth_required' using errcode = 'P0001';
  end if;
  delete from auth.users where id = uid;
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
