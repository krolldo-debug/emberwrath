import { NetClient } from './NetClient.js';
import { NetAuthority } from './NetAuthority.js';
import { NetSession } from './NetSession.js';

// Mehrspieler (Stufe 1): andere Spieler in offenen Gebieten sehen, Welten mit Obergrenze, Zonen-Chat.
// Server: worker/ (Cloudflare Durable Objects), Protokoll: src/net/protocol.js, Beschreibung: src/net/README.md.
//
// game.net (für andere Bereiche):
//   client        NetClient (status, zone, world, cap, on('status'|'welcome'|'join'|'leave'|'chat'|…))
//   authority     NetAuthority (ersetzt LocalAuthority; gleiche Form, siehe core/Authority.js)
//   session       laufende NetSession oder null (remotes: Map netId -> RemotePlayer)
// Verbunden wird nur mit Online-Konto (Supabase-Token) und nur in offenen Gebieten; Dungeon-Instanzen bleiben
// in Stufe 1 ohne Verbindung.
export function installNet(game) {
  const net = { client: null, authority: null, session: null };
  net.client = new NetClient({
    getToken: async () => (game.online?.user ? game.online.client.getAccessToken() : null),
    hello: () => net.session?.hello() ?? {},
  });
  net.authority = new NetAuthority(game.content, net.client);
  // Die Authority ist die Nahtstelle zum Server: Spielzustand und Sitzungen benutzen ab jetzt diese.
  game.authority = net.authority;
  game.state.authority = net.authority;
  game.net = net;

  game.addSessionSystem('net', (session) => {
    const ns = new NetSession(session, net);
    net.session = ns;
    return {
      update: (dt) => ns.update(dt),
      draw: (ctx) => ns.draw(ctx),
      dispose: () => { ns.dispose(); if (net.session === ns) net.session = null; },
    };
  }, 110); // nach dem HUD (100), das ui.hud beim Aufbau leert

  // Abmelden trennt sofort.
  game.bus.on('online:changed', ({ user }) => { if (!user) net.client.leave(); });
}
