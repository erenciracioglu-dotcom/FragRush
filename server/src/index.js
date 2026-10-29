// FragRush oda sunucusu. Worker: POST /room (oda kodu uretir), GET /room/<KOD>?role=host|guest&name=... (WebSocket).
// Durable Object `Room`: oda basina bir tane; kimin bagli oldugunu bilir, SDP / ICE'yi eslere iletir, ev sahibi
// cikinca odayi kapatir. Hicbir sey SAKLAMAZ (storage yok); WebSocket Hibernation API kullanir.

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // 0/O, 1/I/L karismaz
const CODE_LEN = 6;
const GUEST_IDS = [12, 13, 14, 15];                         // ev sahibi 0, botlar 1-11 (oyunla ayni kimlik duzeni)
const MAX_MSG = 16 * 1024;

function makeCode() {
  const b = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  let s = ''; for (const x of b) s += CODE_ALPHABET[x % CODE_ALPHABET.length];
  return s;
}

function originAllowed(origin, env) {
  if (!origin) return false;
  for (const rule of String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    if (rule.endsWith('*') ? origin.startsWith(rule.slice(0, -1)) : origin === rule) return true;
  }
  return false;
}

function cors(origin, extra = {}) {
  return { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'Origin', ...extra };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (!originAllowed(origin, env)) return new Response('forbidden origin', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    if (url.pathname === '/room' && request.method === 'POST') {
      return new Response(JSON.stringify({ code: makeCode() }), { headers: cors(origin, { 'content-type': 'application/json' }) });
    }
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9]{6})$/);
    if (m && request.headers.get('Upgrade') === 'websocket') {
      const code = m[1].toUpperCase();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      return stub.fetch(request);
    }
    if (url.pathname === '/' ) return new Response('fragrush-rooms ok', { headers: cors(origin) });
    return new Response('not found', { status: 404, headers: cors(origin) });
  },
};

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env;
    // bos yazma: hibernation sirasinda uyandirmadan ping'e cevap ver
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  peers() {
    const out = [];
    for (const ws of this.ctx.getWebSockets()) { const a = ws.deserializeAttachment(); if (a) out.push({ ws, id: a.id, role: a.role, name: a.name }); }
    return out;
  }
  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch { /* kapali */ } }

  async fetch(request) {
    const url = new URL(request.url);
    const role = url.searchParams.get('role') === 'host' ? 'host' : 'guest';
    const name = (url.searchParams.get('name') || 'Player').replace(/[^\p{L}\p{N} _.\-]/gu, '').slice(0, 20) || 'Player';
    const peers = this.peers();
    const host = peers.find((p) => p.role === 'host');
    const maxGuests = Math.min(GUEST_IDS.length, Number(this.env.MAX_GUESTS) || 3);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    let err = null, id;
    if (role === 'host') {
      if (host) err = ['room-taken', 'Bu oda kodu kullanımda'];
      else id = 0;
    } else {
      if (!host) err = ['no-room', 'Oda bulunamadı ya da kapandı'];
      else {
        const used = new Set(peers.map((p) => p.id));
        id = GUEST_IDS.find((g) => !used.has(g));
        if (peers.filter((p) => p.role === 'guest').length >= maxGuests || id === undefined) err = ['room-full', 'Oda dolu'];
      }
    }
    this.ctx.acceptWebSocket(server);
    if (err) {
      this.send(server, { t: 'error', code: err[0], msg: err[1] });
      server.close(4000, err[0]);
      return new Response(null, { status: 101, webSocket: client });
    }
    server.serializeAttachment({ id, role, name });
    this.send(server, { t: 'welcome', id, role, name, peers: this.peers().filter((p) => p.ws !== server).map((p) => ({ id: p.id, name: p.name, role: p.role })), maxGuests });
    if (role === 'guest') for (const p of this.peers()) if (p.ws !== server) this.send(p.ws, { t: 'peer-joined', id, name });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > MAX_MSG) return;
    let msg; try { msg = JSON.parse(message); } catch { return; }
    const me = ws.deserializeAttachment(); if (!me) return;
    if (msg.t === 'signal' && typeof msg.to === 'number') {
      // SDP / ICE: yalniz hedef ese; oyuncular yalniz ev sahibiyle konusur (yildiz topoloji)
      const to = this.peers().find((p) => p.id === msg.to);
      if (!to || (me.role === 'guest' && to.role !== 'host')) return;
      this.send(to.ws, { t: 'signal', from: me.id, data: msg.data });
    }
  }

  webSocketClose(ws) { this.left(ws); }
  webSocketError(ws) { this.left(ws); }

  left(ws) {
    const me = ws.deserializeAttachment();
    try { ws.close(1000, 'bye'); } catch { /* zaten kapali */ }
    if (!me) return;
    if (me.role === 'host') {
      for (const p of this.peers()) if (p.ws !== ws) { this.send(p.ws, { t: 'host-left' }); try { p.ws.close(1000, 'host-left'); } catch { /* zaten kapali */ } }
    } else {
      for (const p of this.peers()) if (p.ws !== ws) this.send(p.ws, { t: 'peer-left', id: me.id });
    }
  }
}
