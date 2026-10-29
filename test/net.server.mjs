// Sinyal sunucusu testi (wrangler dev calisirken, varsayilan 127.0.0.1:8787). usage: node test/net.server.mjs [http://127.0.0.1:8787]
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const ORIGIN = 'http://127.0.0.1:8777';
let fail = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };

function open(code, role, name, origin = ORIGIN) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${BASE.replace('http', 'ws')}/room/${code}?role=${role}&name=${encodeURIComponent(name)}`, { headers: { Origin: origin } });
    const c = { ws, msgs: [], closed: false, waiters: [] };
    ws.onmessage = (e) => { const m = JSON.parse(e.data); c.msgs.push(m); c.waiters = c.waiters.filter((w) => !w(m)); };
    ws.onclose = (e) => { c.closed = true; c.closeCode = e.code; c.waiters.forEach((w) => w(null)); };
    ws.onerror = () => { c.err = true; resolve(c); };
    ws.onopen = () => resolve(c);
    c.next = (pred) => new Promise((r) => { const hit = c.msgs.find(pred); if (hit) return r(hit); c.waiters.push((m) => { if (m && pred(m)) { r(m); return true; } return !m && (r(null), true); }); setTimeout(() => r(null), 3000); });
  });
}

// 1) origin denetimi
const bad = await fetch(`${BASE}/room`, { method: 'POST', headers: { Origin: 'https://evil.example' } });
ok(bad.status === 403, 'izinsiz kaynak reddedildi (403)');
const noOrigin = await fetch(`${BASE}/room`, { method: 'POST' });
ok(noOrigin.status === 403, 'kaynaksiz istek reddedildi (403)');
const r = await fetch(`${BASE}/room`, { method: 'POST', headers: { Origin: ORIGIN } });
const { code } = await r.json();
ok(/^[A-HJKMNP-Z2-9]{6}$/.test(code), `oda kodu 6 karakter, karisan harf yok: ${code}`);

// 2) oda yokken konuk
const g0 = await open(code, 'guest', 'Erken');
const e0 = await g0.next((m) => m.t === 'error');
ok(e0 && e0.code === 'no-room', 'ev sahibi yokken konuk: no-room');

// 3) ev sahibi + konuklar
const host = await open(code, 'host', 'Eren');
const w = await host.next((m) => m.t === 'welcome');
ok(w && w.id === 0 && w.role === 'host', 'ev sahibi kimlik 0');
const host2 = await open(code, 'host', 'Hirsiz');
const e1 = await host2.next((m) => m.t === 'error');
ok(e1 && e1.code === 'room-taken', 'ikinci ev sahibi reddedildi');

const g1 = await open(code, 'guest', 'Ali');
const w1 = await g1.next((m) => m.t === 'welcome');
ok(w1 && w1.id === 12 && w1.peers.length === 1 && w1.peers[0].id === 0, 'ilk konuk kimlik 12, ev sahibini gordu');
const pj = await host.next((m) => m.t === 'peer-joined' && m.id === 12);
ok(!!pj && pj.name === 'Ali', 'ev sahibine peer-joined bildirildi');
const g2 = await open(code, 'guest', 'Veli'); await g2.next((m) => m.t === 'welcome');
const g3 = await open(code, 'guest', 'Ayse'); const w3 = await g3.next((m) => m.t === 'welcome');
ok(w3 && w3.id === 14, 'ucuncu konuk kimlik 14');
const g4 = await open(code, 'guest', 'Fazla');
const e4 = await g4.next((m) => m.t === 'error');
ok(e4 && e4.code === 'room-full', 'dorduncu konuk: room-full (en cok 3 konuk)');

// 4) sinyal iletme
g1.ws.send(JSON.stringify({ t: 'signal', to: 0, data: { sdp: 'offer-A' } }));
const s1 = await host.next((m) => m.t === 'signal' && m.from === 12);
ok(!!s1 && s1.data.sdp === 'offer-A', 'konuk -> ev sahibi sinyal');
host.ws.send(JSON.stringify({ t: 'signal', to: 13, data: { sdp: 'answer-B' } }));
const s2 = await g2.next((m) => m.t === 'signal');
ok(!!s2 && s2.from === 0 && s2.data.sdp === 'answer-B', 'ev sahibi -> konuk sinyal');
g1.ws.send(JSON.stringify({ t: 'signal', to: 13, data: { sdp: 'x' } }));
await new Promise((r2) => setTimeout(r2, 300));
ok(!g2.msgs.some((m) => m.t === 'signal' && m.from === 12), 'konuk -> konuk sinyal engellendi');

// 5) konuk ayrilinca / ev sahibi ayrilinca
g1.ws.close();
const pl = await host.next((m) => m.t === 'peer-left' && m.id === 12);
ok(!!pl, 'konuk ayrilinca ev sahibine peer-left');
host.ws.close();
const hl = await g2.next((m) => m.t === 'host-left');
ok(!!hl, 'ev sahibi ayrilinca konuklara host-left');
// istemci host-left'i alinca kendi baglantisini kapatir (oyun bunu yapar; wrangler dev proxy'si TCP'yi gec kapatiyor)
g2.ws.close(); g3.ws.close();
await new Promise((r2) => setTimeout(r2, 800));
console.log('bilgi  konuk soketleri kapandi mi (Node istemcisi + wrangler dev proxy; tarayicida oyun testinde dogrulanir): ' + (g2.closed && g3.closed));
for (const c of [g0, g4, host2]) try { c.ws.close(); } catch { /* */ }
console.log(fail ? `\n${fail} HATA` : '\nhepsi gecti');
process.exit(fail ? 1 : 0);
