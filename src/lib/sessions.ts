// Pure state machines for Mode A (no DOM, no PeerJS): SenderSession and ReceiverSession run on any Connection.
import type { Item } from './types.ts';
import type { Connection, Msg } from './transport.ts';
import type { ManifestItem, RejectReason } from './protocol.ts';
import { BUFFER_HIGH, CHUNK_SIZE, MAX_ONLINE_TOTAL_BYTES } from './config.ts';
import { PROTOCOL_VERSION, decodeChunk, encodeChunk, encodeCtrl, parseCtrl } from './protocol.ts';
import { BlobSink, Reassembler, readChunks } from './chunker.ts';
import type { ChunkSink } from './chunker.ts';
import { Sha256 } from './sha256.ts';
import { newId, safeBlobType } from './items.ts';
import { parseHttpUrl } from './sanitize.ts';

export type SessionError = 'connection-lost' | 'bad-pin' | 'pin-required' | 'denied' | 'declined' | 'full' | 'version' | 'integrity' | 'peer-cancelled' | 'too-large' | 'protocol';
const CLOSE_DELAY_MS = 250; // let the last message flush before closing the channel

// ======================= SENDER =======================
export type SenderState = 'handshake' | 'pending' | 'offered' | 'sending' | 'done' | 'rejected' | 'cancelled' | 'failed';

export interface SenderHooks {
  change(s: SenderSession): void;
  isFull(): boolean;
  /** Reserve a receiver slot. Return false when the code is already fully claimed. */
  claim(s: SenderSession): boolean;
  pinFailed(s: SenderSession): void;
}

export class SenderSession {
  readonly id = newId();
  state: SenderState = 'handshake';
  error?: SessionError;
  sent = 0;
  total = 0;
  approved = false;
  private conn: Connection;
  private items: Item[];
  private pin: string | undefined;
  private hooks: SenderHooks;
  private completeSent = false;
  private aborted = false;

  constructor(conn: Connection, items: Item[], opts: { pin?: string }, hooks: SenderHooks) {
    this.conn = conn; this.items = items; this.pin = opts.pin; this.hooks = hooks;
    this.total = items.filter((i) => i.kind === 'image' || i.kind === 'file').reduce((n, i) => n + i.size, 0);
    conn.onMessage((d) => this.onData(d));
    conn.onClose(() => { if (!this.isTerminal) this.end('failed', 'connection-lost'); });
  }

  get remoteId(): string { return this.conn.remoteId; }
  get isTerminal(): boolean { return ['done', 'rejected', 'cancelled', 'failed'].includes(this.state); }

  private send(m: Parameters<typeof encodeCtrl>[0]): void { try { this.conn.send(encodeCtrl(m)); } catch { /* connection already gone */ } }
  private closeSoon(): void { setTimeout(() => this.conn.close(), CLOSE_DELAY_MS); }
  private end(state: SenderState, error?: SessionError): void {
    if (this.isTerminal) return;
    this.state = state; this.error = error;
    if (state !== 'done') this.aborted = true;
    this.hooks.change(this);
    this.closeSoon();
  }
  private reject(reason: RejectReason): void {
    this.send({ t: 'reject', reason });
    this.end('rejected', reason === 'declined' ? 'declined' : reason);
  }

  private onData(data: Msg): void {
    if (typeof data !== 'string') return;
    const m = parseCtrl(data);
    if (!m) return;
    switch (m.t) {
      case 'hello': if (this.state === 'handshake') this.onHello(m.v, m.pin); break;
      case 'accept': if (this.state === 'offered') void this.run(); break;
      case 'reject': if (this.state === 'offered') this.end('rejected', 'declined'); break;
      case 'ack': if (!m.ok) this.end('failed', 'integrity'); break;
      case 'finished': if (this.state === 'sending' && this.completeSent) this.end('done'); break;
      case 'cancel': this.end('cancelled', 'peer-cancelled'); break;
      default: break;
    }
  }

  private onHello(v: number, pin?: string): void {
    if (v !== PROTOCOL_VERSION) return this.reject('version');
    if (this.hooks.isFull()) return this.reject('full');
    if (this.pin) {
      if (pin === undefined || pin === '') return this.reject('pin-required');
      if (pin !== this.pin) { this.reject('bad-pin'); this.hooks.pinFailed(this); return; }
    }
    this.state = 'pending';
    this.hooks.change(this);
  }

  /** Sender pressed "Allow this device". */
  approve(): void {
    if (this.state !== 'pending') return;
    if (!this.hooks.claim(this)) return this.reject('full');
    this.approved = true;
    const manifest: ManifestItem[] = this.items.map((i) => ({ id: i.id, kind: i.kind, name: i.name, mime: i.mime, size: i.size, text: i.text }));
    this.send({ t: 'manifest', items: manifest });
    this.state = 'offered';
    this.hooks.change(this);
  }
  deny(): void { if (this.state === 'pending') this.reject('denied'); }
  cancel(): void { if (!this.isTerminal) { this.send({ t: 'cancel' }); this.end('cancelled'); } }

  private async run(): Promise<void> {
    this.state = 'sending';
    this.hooks.change(this);
    try {
      const files = this.items.filter((i) => i.kind === 'image' || i.kind === 'file');
      for (let index = 0; index < files.length; index++) {
        const item = files[index]!;
        const hash = new Sha256();
        let seq = 0;
        for await (const chunk of readChunks(item.blob!, CHUNK_SIZE)) {
          if (this.aborted) return;
          hash.update(chunk);
          this.conn.send(encodeChunk(index, seq++, chunk));
          this.sent += chunk.length;
          this.hooks.change(this);
          if (this.conn.bufferedAmount > BUFFER_HIGH) await this.conn.drain(); // backpressure
        }
        if (this.aborted) return;
        this.send({ t: 'done', id: item.id, sha256: hash.hex() });
      }
      this.completeSent = true;
      this.send({ t: 'complete' });
    } catch {
      this.end('failed', 'connection-lost');
    }
  }
}

// ======================= RECEIVER =======================
export type ReceiverState = 'handshake' | 'review' | 'receiving' | 'done' | 'rejected' | 'cancelled' | 'failed';
export type SinkFactory = (item: ManifestItem) => Promise<ChunkSink>;
export const memorySinks: SinkFactory = async (m) => new BlobSink(safeBlobType(m.kind, m.mime));

export class ReceiverSession {
  state: ReceiverState = 'handshake';
  error?: SessionError;
  manifest: ManifestItem[] = [];
  received = 0;
  totalBytes = 0;
  items: Item[] = [];
  private conn: Connection;
  private pin: string | undefined;
  private onChange: (s: ReceiverSession) => void;
  private files: { m: ManifestItem; r: Reassembler }[] = [];
  private results = new Map<string, Item>();
  private chain: Promise<void> = Promise.resolve();

  constructor(conn: Connection, opts: { pin?: string }, onChange: (s: ReceiverSession) => void) {
    this.conn = conn; this.pin = opts.pin; this.onChange = onChange;
    conn.onMessage((d) => { this.chain = this.chain.then(() => this.handle(d)).catch(() => this.fail('protocol')); });
    conn.onClose(() => { if (!this.isTerminal) this.finish('failed', 'connection-lost'); });
  }

  get isTerminal(): boolean { return ['done', 'rejected', 'cancelled', 'failed'].includes(this.state); }
  private send(m: Parameters<typeof encodeCtrl>[0]): void { try { this.conn.send(encodeCtrl(m)); } catch { /* gone */ } }
  private finish(state: ReceiverState, error?: SessionError): void {
    if (this.isTerminal) return;
    this.state = state; this.error = error;
    if (state !== 'done') for (const f of this.files) void f.r.abort();
    this.onChange(this);
    setTimeout(() => this.conn.close(), 250);
  }
  private fail(error: SessionError): void { this.send({ t: 'cancel' }); this.finish('failed', error); }

  start(): void { this.send({ t: 'hello', v: PROTOCOL_VERSION, pin: this.pin }); }
  decline(): void { this.send({ t: 'reject', reason: 'declined' }); this.finish('rejected', 'declined'); }
  cancel(): void { if (!this.isTerminal) { this.send({ t: 'cancel' }); this.finish('cancelled'); } }

  /** Accept the offered manifest. `sinks` decides whether files go to memory or to disk. */
  async accept(sinks: SinkFactory = memorySinks): Promise<void> {
    if (this.state !== 'review') return;
    try {
      this.files = [];
      for (const m of this.manifest) if (m.kind === 'image' || m.kind === 'file') this.files.push({ m, r: new Reassembler(m.size, await sinks(m)) });
    } catch { return this.fail('protocol'); }
    this.state = 'receiving';
    this.onChange(this);
    this.send({ t: 'accept' });
  }

  private async handle(data: Msg): Promise<void> {
    if (this.isTerminal) return;
    if (typeof data !== 'string') {
      const c = decodeChunk(data);
      const f = c && this.state === 'receiving' ? this.files[c.index] : undefined;
      if (!c || !f) return this.fail('protocol');
      await f.r.push(c.seq, c.data);
      this.received += c.data.length;
      this.onChange(this);
      return;
    }
    const m = parseCtrl(data);
    if (!m) return;
    switch (m.t) {
      case 'manifest': {
        if (this.state !== 'handshake') return;
        this.manifest = m.items;
        this.totalBytes = m.items.reduce((n, i) => (i.kind === 'image' || i.kind === 'file' ? n + i.size : n), 0);
        if (this.totalBytes > MAX_ONLINE_TOTAL_BYTES) { this.send({ t: 'reject', reason: 'too-large' }); return this.finish('rejected', 'too-large'); }
        this.state = 'review';
        this.onChange(this);
        return;
      }
      case 'reject': if (this.state === 'handshake') this.finish('rejected', m.reason); return;
      case 'cancel': this.finish('cancelled', 'peer-cancelled'); return;
      case 'done': {
        const f = this.files.find((x) => x.m.id === m.id);
        if (this.state !== 'receiving' || !f) return this.fail('protocol');
        const res = await f.r.finish(m.sha256);
        this.send({ t: 'ack', id: m.id, ok: res.ok });
        if (!res.ok) return this.finish('failed', 'integrity');
        const { blob, savedTo } = res.result;
        this.results.set(m.id, { id: m.id, kind: f.m.kind, name: f.m.name, mime: f.m.mime, size: f.m.size, blob, savedTo });
        return;
      }
      case 'complete': {
        if (this.state !== 'receiving' || this.files.some((x) => !this.results.has(x.m.id))) return this.fail('protocol');
        this.items = this.manifest.map((mi) => this.results.get(mi.id) ?? this.inline(mi));
        this.send({ t: 'finished' });
        return this.finish('done');
      }
      default: return;
    }
  }

  private inline(m: ManifestItem): Item {
    const text = m.text ?? '';
    if (m.kind === 'link') { const u = parseHttpUrl(text); return { id: m.id, kind: 'link', name: u?.hostname ?? 'Link', mime: 'text/uri-list', size: m.size, text: u?.href ?? text }; }
    return { id: m.id, kind: 'text', name: 'Text', mime: 'text/plain', size: m.size, text };
  }
}
