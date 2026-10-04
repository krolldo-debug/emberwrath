-- Support-Formular: neue Kategorie „Spieler melden“ (DSA Art. 16) mit gemeldetem Charakter und Ort/Zeit.
-- Gehört zu worker/forms.js (Übergabe Startseite, 03.10.). Löschfrist wie bisher: erledigte Anfragen nach 180 Tagen.
-- Hinweis: Neue Spalten erben die Tabellenrechte; GRANTs unten trotzdem ausdrücklich (Supabase-Falle in diesem Projekt).

alter table public.support_requests drop constraint if exists support_requests_kind_check;
alter table public.support_requests add constraint support_requests_kind_check
  check (kind in ('kontakt', 'fehler', 'melden', 'loeschen'));

alter table public.support_requests add column if not exists reported text;
alter table public.support_requests add column if not exists place text;

grant select, insert, update, delete on public.support_requests to service_role;

-- Admin-Panel: gemeldeter Charakter und Ort zusätzlich ausgeben (Rückgabetyp ändert sich → neu anlegen).
drop function if exists public.admin_support_requests(int, int);
create function public.admin_support_requests(p_limit int default 100, p_offset int default 0)
returns table (id bigint, kind text, email text, name text, "character" text, device text, message text, reported text, place text, done boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query select s.id, s.kind, s.email, s.name, s.character, s.device, s.message, s.reported, s.place, s.done, s.created_at
    from public.support_requests s order by s.done, s.created_at desc limit least(p_limit, 500) offset p_offset;
end $$;

revoke execute on function public.admin_support_requests(int, int) from public, anon;
grant execute on function public.admin_support_requests(int, int) to authenticated;
