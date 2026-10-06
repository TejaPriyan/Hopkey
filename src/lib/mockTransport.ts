// In-memory Transport for unit tests: ordered delivery, simulated buffering/backpressure, loss of connection, tampering.
import type { Connection, Listener, Msg, Transport } from './transport.ts';
import { TransportError } from './transport.ts';
import { BUFFER_LOW, CONNECT_TIMEOUT_MS } from './config.ts';

interface Job { run: () => void; bytes: number }

export class MockNetwork {
  listeners = new Map<string, MockListener>();
  offline = false;
  blackhole = false; // connect() hangs until its timeout
  bytesPerTick = Infinity; // throttle to exercise backpressure
  maxBuffered = 0;
  tamper: ((d: Uint8Array) => Uint8Array) | null = null; // corrupt binary messages in flight
  private queue: Job[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private n = 0;

  enqueue(run: () => void, bytes: number): void {
    this.queue.push({ run, bytes });
    if (!this.timer) this.timer = setTimeout(() => this.pump(), 0);
  }
  private pump(): void {
    this.timer = null;
    let budget = this.bytesPerTick;
    while (this.queue.length) {
      const job = this.queue[0]!;
      if (job.bytes > budget && budget !== this.bytesPerTick) break;
      budget -= job.bytes;
      this.queue.shift();
      job.run();
    }
    if (this.queue.length) this.timer = setTimeout(() => this.pump(), 0);
  }
  nextId(): string { return `client-${++this.n}`; }
  transport(): Transport { return new MockTransport(this); }
}

class MockConn implements Connection {
  remoteId: string;
  isOpen = true;
  bufferedAmount = 0;
  peer!: MockConn;
  private net: MockNetwork;
  private msgCb: ((d: Msg) => void) | null = null;
  private closeCb: (() => void) | null = null;
  private pending: Msg[] = [];
  private waiters: (() => void)[] = [];
  constructor(net: MockNetwork, remoteId: string) { this.net = net; this.remoteId = remoteId; }

  send(data: Msg): void {
    if (!this.isOpen) throw new TransportError('closed');
    const bytes = data.length;
    const copy = typeof data === 'string' ? data : data.slice();
    this.bufferedAmount += bytes;
    this.net.maxBuffered = Math.max(this.net.maxBuffered, this.bufferedAmount);
    this.net.enqueue(() => {
      this.bufferedAmount -= bytes;
      if (this.bufferedAmount <= BUFFER_LOW) { const w = this.waiters; this.waiters = []; w.forEach((f) => f()); }
      if (this.peer.isOpen) this.peer.deliver(typeof copy !== 'string' && this.net.tamper ? this.net.tamper(copy) : copy);
    }, bytes);
  }
  deliver(d: Msg): void { if (this.msgCb) this.msgCb(d); else this.pending.push(d); }
  onMessage(cb: (d: Msg) => void): void { this.msgCb = cb; const p = this.pending; this.pending = []; p.forEach(cb); }
  onClose(cb: () => void): void { this.closeCb = cb; }
  drain(): Promise<void> {
    return this.bufferedAmount <= BUFFER_LOW || !this.isOpen ? Promise.resolve() : new Promise((r) => this.waiters.push(r));
  }
  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.net.enqueue(() => {
      this.waiters.forEach((f) => f());
      this.closeCb?.();
      if (this.peer.isOpen) { this.peer.isOpen = false; this.peer.closeCb?.(); }
    }, 0);
  }
}

class MockListener implements Listener {
  private cb: ((c: Connection) => void) | null = null;
  private queue: Connection[] = [];
  conns: MockConn[] = [];
  private net: MockNetwork;
  private id: string;
  constructor(net: MockNetwork, id: string) { this.net = net; this.id = id; }
  accept(c: MockConn): void { this.conns.push(c); if (this.cb) this.cb(c); else this.queue.push(c); }
  onConnection(cb: (c: Connection) => void): void { this.cb = cb; const q = this.queue; this.queue = []; q.forEach(cb); }
  stopListening(): void { if (this.net.listeners.get(this.id) === this) this.net.listeners.delete(this.id); }
  destroy(): void { this.stopListening(); this.conns.forEach((c) => c.close()); }
}

class MockTransport implements Transport {
  private net: MockNetwork;
  constructor(net: MockNetwork) { this.net = net; }
  async listen(peerId: string): Promise<Listener> {
    if (this.net.offline) throw new TransportError('offline');
    if (this.net.listeners.has(peerId)) throw new TransportError('id-taken');
    const l = new MockListener(this.net, peerId);
    this.net.listeners.set(peerId, l);
    return l;
  }
  async connect(peerId: string, opts?: { timeoutMs?: number }): Promise<Connection> {
    if (this.net.offline) throw new TransportError('offline');
    if (this.net.blackhole) {
      await new Promise((_, rej) => setTimeout(() => rej(new TransportError('timeout')), opts?.timeoutMs ?? CONNECT_TIMEOUT_MS));
    }
    const l = this.net.listeners.get(peerId);
    if (!l) throw new TransportError('peer-not-found');
    const client = new MockConn(this.net, peerId);
    const server = new MockConn(this.net, this.net.nextId());
    client.peer = server; server.peer = client;
    this.net.enqueue(() => l.accept(server), 0);
    return client;
  }
}
