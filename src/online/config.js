// Verbindung zum Online-Dienst (Supabase). Solange url/anonKey leer sind, bleibt das Spiel rein lokal
// und die Anmeldeseite sagt ehrlich „Online-Konten sind noch nicht eingerichtet“.
//
// Beide Werte stehen im Supabase-Dashboard unter Project Settings → API und dürfen öffentlich sein:
// Der anon-Schlüssel erlaubt nur, was die Row-Level-Security-Regeln zulassen (supabase/migrations/).
// Den service_role-Schlüssel NIE hier oder sonst im Repo eintragen.
export const ONLINE_CONFIG = {
  supabaseUrl: 'https://mgjhllqnelqbdqfvczls.supabase.co',
  supabaseAnonKey: 'sb_publishable_K_fTi48XiEfx4wB8vTOjeA_oFeyqiFq', // öffentlicher publishable-Schlüssel (kein Geheimnis)
  // Schnellanmeldung: erst auf true setzen, wenn der Anbieter in Supabase (Authentication → Providers) aktiv ist.
  providers: {
    google: false,
    apple: false, // braucht ein Apple-Developer-Konto (99 $/Jahr), siehe docs/ONLINE.md
  },
};
