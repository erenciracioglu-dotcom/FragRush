// Ag tasima katmani: sinyal sunucusuna WebSocket + eslerle WebRTC DataChannel (iki kanal).
//   'u': guvenilmez, sirasiz (ordered:false, maxRetransmits:0)  -> girdi ve anlik goruntu
//   'r': guvenilir, sirali                                       -> olaylar, voksel farklari, katilim verisi
// Mesajlar ikili (ArrayBuffer), tek mesaj <= 16 KB. Yildiz topoloji: konuklar yalniz ev sahibiyle baglanir.
// Katman, "Link" arayuzunun arkasinda soyuttur (send / onmessage / stats): dogrudan baglanti kurulamazsa TURN ya da
// DO uzerinden WebSocket aktarma ayni arayuzle eklenebilir (Asama 3 karari).

export const DEFAULT_ICE = [{ urls: 'stun:stun.cloudflare.com:3478' }];
export const MAX_MSG = 16 * 1024;

// ?netsim=gecikmeMs,oynamaMs,kayip%  (gidis-donus gecikmesi; her uc alinan mesaji gecikme/2 geciktirir)
export function parseNetsim(search) {
  const v = new URLSearchParams(search || '').get('netsim');
  if (!v) return null;
  const [lat = 0, jit = 0, loss = 0] = v.split(',').map(Number);
  return { lat, jit, loss };
}

export class Link {
  // opts: { id, initiator, signal(data), ice, netsim, onMessage(reliable, ArrayBuffer), onOpen(), onClose() }
  constructor(opts) {
    this.id = opts.id; this.initiator = opts.initiator;
    this.sendSignal = opts.signal; this.onMessage = opts.onMessage || (() => {}); this.onOpen = opts.onOpen || (() => {}); this.onClose = opts.onClose || (() => {});
    this.netsim = opts.netsim || null;
    this.open = false; this.closed = false;
    this.u = null; this.r = null;
    this.bytesIn = 0; this.bytesOut = 0; this.msgsIn = 0; this.msgsOut = 0;
    this.rtt = 0;                 // ms (ping / pong ile)
    this.connType = '?';          // 'direct' | 'relay' | '?'
    this.t0 = performance.now(); this.openMs = 0;
    this._chain = Promise.resolve();
    this._lastDeliver = 0;
    const pc = this.pc = new RTCPeerConnection({ iceServers: opts.ice || DEFAULT_ICE });
    pc.onicecandidate = (e) => { if (e.candidate) this.sendSignal({ ice: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this._closed(); };
    if (this.initiator) {
      this._attach(pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 }));
      this._attach(pc.createDataChannel('r', { ordered: true }));
      this._chain = this._chain.then(async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.sendSignal({ sdp: pc.localDescription.toJSON() });
      });
    } else {
      pc.ondatachannel = (e) => this._attach(e.channel);
    }
  }

  _attach(dc) {
    dc.binaryType = 'arraybuffer';
    if (dc.label === 'u') this.u = dc; else this.r = dc;
    dc.onopen = () => {
      if (this.u && this.r && this.u.readyState === 'open' && this.r.readyState === 'open' && !this.open) {
        this.open = true; this.openMs = performance.now() - this.t0;
        this._pingLoop();
        this.onOpen();
      }
    };
    dc.onclose = () => this._closed();
    dc.onmessage = (e) => this._recv(dc.label === 'r', e.data);
  }

  // sinyal sunucusundan gelen SDP / ICE
  handleSignal(data) {
    this._chain = this._chain.then(async () => {
      const pc = this.pc;
      if (this.closed) return;
      if (data.sdp) {
        await pc.setRemoteDescription(data.sdp);
        if (data.sdp.type === 'offer') {
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          this.sendSignal({ sdp: pc.localDescription.toJSON() });
        }
      } else if (data.ice) {
        try { await pc.addIceCandidate(data.ice); } catch { /* gec gelen aday */ }
      }
    }).catch((e) => console.warn('link signal', e));
  }

  _recv(reliable, data) {
    this.bytesIn += data.byteLength; this.msgsIn++;
    // dahili ping / pong: ilk bayt 0xF0 / 0xF1
    const v = new Uint8Array(data);
    if (v.length === 9 && (v[0] === 0xF0 || v[0] === 0xF1)) {
      if (v[0] === 0xF0) { const o = new Uint8Array(9); o.set(v); o[0] = 0xF1; this._rawSend(false, o.buffer); }
      else { const dv = new DataView(data); const rtt = performance.now() - dv.getFloat64(1, true); this.rtt = this.rtt ? this.rtt * 0.8 + rtt * 0.2 : rtt; }
      return;
    }
    const ns = this.netsim;
    if (!ns) { this.onMessage(reliable, data); return; }
    if (!reliable && Math.random() * 100 < ns.loss) return;
    // gecikme: gidis-donus / 2 + oynama; sirali kanalda siralama bozulmaz, guvenilmezde bozulabilir
    let at = performance.now() + ns.lat / 2 + (Math.random() - 0.5) * 2 * ns.jit;
    if (reliable) { at = Math.max(at, this._lastDeliver + 0.01); this._lastDeliver = at; }
    setTimeout(() => { if (!this.closed) this.onMessage(reliable, data); }, Math.max(0, at - performance.now()));
  }

  _rawSend(reliable, buf) {
    const ch = reliable ? this.r : this.u;
    if (!ch || ch.readyState !== 'open') return false;
    if (!reliable && ch.bufferedAmount > 256 * 1024) return false;   // sikisma: eski anlik goruntuleri at
    try { ch.send(buf); } catch { return false; }
    return true;
  }

  send(reliable, buf) {
    if (buf.byteLength > MAX_MSG) throw new Error('mesaj cok buyuk: ' + buf.byteLength);
    const ok = this._rawSend(reliable, buf);
    if (ok) { this.bytesOut += buf.byteLength; this.msgsOut++; }
    return ok;
  }

  _pingLoop() {
    const tick = () => {
      if (this.closed) return;
      const b = new Uint8Array(9); b[0] = 0xF0; new DataView(b.buffer).setFloat64(1, performance.now(), true);
      this._rawSend(false, b.buffer);
      this._pingT = setTimeout(tick, 1000);
    };
    tick();
  }

  // baglanti turu: yerel / sunucu-yansitmali (srflx, prflx) = direct, relay = TURN
  async refreshConnType() {
    try {
      const st = await this.pc.getStats();
      let pair = null; const cands = {};
      st.forEach((r) => { if (r.type === 'candidate-pair' && (r.nominated || r.state === 'succeeded') && r.selected !== false) pair = pair && !r.nominated ? pair : r; if (r.type === 'local-candidate' || r.type === 'remote-candidate') cands[r.id] = r; });
      if (pair) { const l = cands[pair.localCandidateId], rr = cands[pair.remoteCandidateId]; this.connType = (l && l.candidateType === 'relay') || (rr && rr.candidateType === 'relay') ? 'relay' : 'direct'; }
    } catch { /* */ }
    return this.connType;
  }

  _closed() {
    if (this.closed) return;
    this.closed = true; this.open = false;
    clearTimeout(this._pingT);
    try { this.pc.close(); } catch { /* */ }
    this.onClose();
  }
  close() { this._closed(); }
}

// ---- oda istemcisi: sinyal WebSocket'i + Link yonetimi ----
function wsBase(base) { return base.replace(/^http/, 'ws'); }

export class RoomClient {
  // opts: { base, role: 'host'|'guest', code, name, ice, netsim, onLink(link, peerId, name), onPeerLeft(id), onHostLeft(), onError(code, msg) }
  constructor(opts) {
    Object.assign(this, { ice: DEFAULT_ICE, netsim: null, name: 'Player' }, opts);
    this.id = -1; this.links = new Map(); this.peers = new Map(); this.ws = null; this.closed = false;
  }

  static async host(opts) {
    for (let tries = 0; tries < 4; tries++) {
      const r = await fetch(`${opts.base}/room`, { method: 'POST' });
      if (!r.ok) throw new Error('oda sunucusu: ' + r.status);
      const { code } = await r.json();
      const c = new RoomClient({ ...opts, role: 'host', code });
      try { await c.connect(); return c; } catch (e) { if (e.code !== 'room-taken') throw e; }
    }
    throw new Error('oda kodu alinamadi');
  }
  static async join(opts) { const c = new RoomClient({ ...opts, role: 'guest', code: String(opts.code).toUpperCase() }); await c.connect(); return c; }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = this.ws = new WebSocket(`${wsBase(this.base)}/room/${this.code}?role=${this.role}&name=${encodeURIComponent(this.name)}`);
      let settled = false;
      const fail = (code, msg) => { if (settled) return; settled = true; const e = new Error(msg || code); e.code = code; reject(e); };
      ws.onerror = () => fail('ws-error', 'oda sunucusuna baglanilamadi');
      ws.onclose = () => { if (!settled) fail('closed', 'baglanti kapandi'); else if (!this.closed) { this.closed = true; this.onClosed && this.onClosed(); } };
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string') return;
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'error') { fail(m.code, m.msg); if (settled && this.onError) this.onError(m.code, m.msg); return; }
        if (m.t === 'welcome') {
          this.id = m.id; this.maxGuests = m.maxGuests;
          for (const p of m.peers) this.peers.set(p.id, p.name);
          settled = true; resolve(this);
          this._keepalive = setInterval(() => { try { ws.send('ping'); } catch { /* */ } }, 20000);
          return;
        }
        this._onSignalMsg(m);
      };
    });
  }

  _link(peerId, initiator) {
    const link = new Link({
      id: peerId, initiator, ice: this.ice, netsim: this.netsim,
      signal: (data) => { try { this.ws.send(JSON.stringify({ t: 'signal', to: peerId, data })); } catch { /* */ } },
      onMessage: (rel, buf) => link.onmessage && link.onmessage(rel, buf),
      onOpen: () => link.onopen && link.onopen(),
      onClose: () => { this.links.delete(peerId); link.onclosed && link.onclosed(); },
    });
    this.links.set(peerId, link);
    if (this.onLink) this.onLink(link, peerId, this.peers.get(peerId) || 'Player');
    return link;
  }

  _onSignalMsg(m) {
    if (m.t === 'peer-joined') {
      this.peers.set(m.id, m.name);
      if (this.role === 'host') this._link(m.id, true);       // ev sahibi teklif eder
    } else if (m.t === 'signal') {
      let link = this.links.get(m.from);
      if (!link && this.role === 'guest') link = this._link(m.from, false);
      if (link) link.handleSignal(m.data);
    } else if (m.t === 'peer-left') {
      this.peers.delete(m.id);
      const l = this.links.get(m.id); if (l) l.close();
      if (this.onPeerLeft) this.onPeerLeft(m.id);
    } else if (m.t === 'host-left') {
      for (const l of [...this.links.values()]) l.close();
      if (this.onHostLeft) this.onHostLeft();
      this.close();
    }
  }

  close() {
    this.closed = true;
    clearInterval(this._keepalive);
    for (const l of [...this.links.values()]) l.close();
    try { this.ws.close(); } catch { /* */ }
  }
}
