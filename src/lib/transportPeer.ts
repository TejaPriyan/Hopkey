// PeerJS adapter for the Transport interface (verified against peerjs.com/client/api docs: Peer(id, options),
// peer.connect(id, {reliable, serialization}), peer events open/connection/disconnected/error, peer.disconnect/reconnect/destroy,
// dataConnection.dataChannel, serialization 'none').
import { Peer } from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { Connection, Listener, Msg, Transport } from './transport.ts';
import { TransportError } from './transport.ts';
import type { TransportErrorKind } from './transport.ts';
import { BUFFER_LOW, CONNECT_TIMEOUT_MS } from './config.ts';
import { peerOptions } from './env.ts';

function mapError(err: unknown): TransportError {
  const type = (err as { type?: string } | null)?.type;
  const kind: TransportErrorKind =
    type === 'unavailable-id' ? 'id-taken'
    : type === 'peer-unavailable' ? 'peer-not-found'
    : type === 'browser-incompatible' ? 'unsupported'
    : type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed' || type === 'ssl-unavailable' || type === 'disconnected' ? 'signaling'
    : 'unknown';
  return new TransportError(kind, (err as { message?: string } | null)?.message);
}

// PeerJS option typings are stricter than plain objects (numeric debug level etc.), hence `any` for the options bag.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const newPeer = (id?: string): Peer => (id ? new Peer(id, peerOptions() as any) : new Peer(peerOptions() as any));

class PeerConn implements Connection {
  remoteId: string;
  isOpen = true;
  private dc: DataConnection;
  private owner: Peer | null;
  private msgCb: ((d: Msg) => void) | null = null;
  private closeCb: (() => void) | null = null;
  private pending: Msg[] = [];
  private waiters: (() => void)[] = [];

  /** `owner` is the receiver-side Peer, destroyed with the connection so the signalling socket is released. */
  constructor(dc: DataConnection, owner: Peer | null) {
    this.dc = dc; this.owner = owner; this.remoteId = dc.peer;
    dc.on('data', (d: unknown) => this.onData(d));
    dc.on('close', () => this.closed());
    dc.on('error', () => this.closed());
    const ch = dc.dataChannel as RTCDataChannel | undefined;
    if (ch) {
      ch.binaryType = 'arraybuffer';
      ch.bufferedAmountLowThreshold = BUFFER_LOW;
      ch.addEventListener('bufferedamountlow', () => this.wake());
    }
  }
  get bufferedAmount(): number { return (this.dc.dataChannel as RTCDataChannel | undefined)?.bufferedAmount ?? 0; }

  private onData(d: unknown): void {
    if (d instanceof Blob) {
      void d.arrayBuffer().then((ab) => this.onData(ab));
      return;
    }
    let m: Msg | null = null;
    if (typeof d === 'string') m = d;
    else if (d instanceof ArrayBuffer) m = new Uint8Array(d);
    else if (ArrayBuffer.isView(d)) m = new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
    if (m === null) return; // anything else (objects, blobs) is not part of our protocol
    if (this.msgCb) this.msgCb(m); else this.pending.push(m);
  }
  private wake(): void { const w = this.waiters; this.waiters = []; w.forEach((f) => f()); }
  private closed(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.wake();
    this.closeCb?.();
    this.owner?.destroy();
  }
  send(data: Msg): void {
    if (!this.isOpen) throw new TransportError('closed');
    try { this.dc.send(data); } catch { throw new TransportError('closed'); }
  }
  onMessage(cb: (d: Msg) => void): void { this.msgCb = cb; const p = this.pending; this.pending = []; p.forEach(cb); }
  onClose(cb: () => void): void { this.closeCb = cb; }
  drain(): Promise<void> {
    return this.bufferedAmount <= BUFFER_LOW || !this.isOpen ? Promise.resolve() : new Promise((r) => this.waiters.push(r));
  }
  close(): void { try { this.dc.close(); } catch { /* already closed */ } this.closed(); }
}

class PeerListener implements Listener {
  private peer: Peer;
  private cb: ((c: Connection) => void) | null = null;
  private errCb: ((e: TransportError) => void) | null = null;
  private queue: Connection[] = [];
  private listening = true;
  private dead = false;

  constructor(peer: Peer) {
    this.peer = peer;
    peer.on('connection', (dc: DataConnection) => {
      if (!this.listening) { dc.close(); return; }
      // The DataConnection exists before its channel is open; hand it over only once it is usable.
      const ready = () => { const c = new PeerConn(dc, null); if (this.cb) this.cb(c); else this.queue.push(c); };
      if (dc.open) ready(); else dc.on('open', ready);
    });
    // Mobile browsers drop the signalling socket in the background: re-register the same id while we still want it.
    peer.on('disconnected', () => { if (this.listening && !this.dead && !peer.destroyed) { try { peer.reconnect(); } catch { /* ignore */ } } });
    peer.on('error', (e: unknown) => { const te = mapError(e); if (te.kind !== 'peer-not-found') this.errCb?.(te); });
  }
  onConnection(cb: (c: Connection) => void): void { this.cb = cb; const q = this.queue; this.queue = []; q.forEach(cb); }
  onError(cb: (e: TransportError) => void): void { this.errCb = cb; }
  stopListening(): void { this.listening = false; try { this.peer.disconnect(); } catch { /* ignore */ } }
  destroy(): void { this.listening = false; this.dead = true; try { this.peer.destroy(); } catch { /* ignore */ } }
}

export class PeerTransport implements Transport {
  listen(peerId: string): Promise<Listener> {
    return new Promise((resolve, reject) => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return reject(new TransportError('offline'));
      const peer = newPeer(peerId);
      const listener = new PeerListener(peer);
      let settled = false;
      const timer = setTimeout(() => settle(new TransportError('timeout', 'Signalling server did not answer')), CONNECT_TIMEOUT_MS);
      const settle = (err?: TransportError) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (err) { try { peer.destroy(); } catch { /* ignore */ } reject(err); } else resolve(listener);
      };
      peer.on('open', () => settle());
      peer.on('error', (e: unknown) => settle(mapError(e))); // after open, PeerListener forwards errors
    });
  }

  connect(peerId: string, opts?: { timeoutMs?: number }): Promise<Connection> {
    return new Promise((resolve, reject) => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return reject(new TransportError('offline'));
      const peer = newPeer();
      let settled = false;
      const fail = (err: TransportError) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        try { peer.destroy(); } catch { /* ignore */ }
        reject(err);
      };
      const timer = setTimeout(() => fail(new TransportError('timeout')), opts?.timeoutMs ?? CONNECT_TIMEOUT_MS);
      peer.on('error', (e: unknown) => fail(mapError(e)));
      peer.on('open', () => {
        const dc = peer.connect(peerId, { reliable: true, serialization: 'raw' });
        dc.on('error', (e: unknown) => fail(mapError(e)));
        dc.on('open', () => {
          if (settled) return;
          settled = true; clearTimeout(timer);
          resolve(new PeerConn(dc, peer));
        });
      });
    });
  }
}
