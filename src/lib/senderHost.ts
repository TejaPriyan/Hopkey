import type { Item } from './types.ts';
import type { Listener, Transport } from './transport.ts';
import { TransportError } from './transport.ts';
import { CODE_TTL_MS, MAX_PIN_ATTEMPTS } from './config.ts';
import { generateCode, peerIdFor } from './code.ts';
import { SenderSession } from './sessions.ts';
import type { SenderState, SessionError } from './sessions.ts';

export type HostStatus = 'starting' | 'waiting' | 'connected' | 'sending' | 'done' | 'expired' | 'error';
export interface SessionView { id: string; state: SenderState; error?: SessionError; sent: number; total: number }
export interface HostSnapshot {
  status: HostStatus; code: string | null; error: string | null;
  sessions: SessionView[]; expiresAt: number | null; approved: number; max: number; allOk: boolean;
}
export interface HostOptions { pin?: string; maxReceivers?: number; ttlMs?: number; genCode?: () => string }

/** Owns one share code: registers it (retrying on collisions), admits receivers, enforces expiry/PIN/slot limits. */
export class SenderHost {
  private transport: Transport;
  private items: Item[];
  private opts: HostOptions;
  private onChange: (s: HostSnapshot) => void;
  private listener: Listener | null = null;
  private sessions: SenderSession[] = [];
  private code: string | null = null;
  private status: HostStatus = 'starting';
  private error: string | null = null;
  private approved = 0;
  private pinFails = 0;
  private expiresAt: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(transport: Transport, items: Item[], opts: HostOptions, onChange: (s: HostSnapshot) => void) {
    this.transport = transport; this.items = items; this.opts = opts; this.onChange = onChange;
  }

  private get max(): number { return this.opts.maxReceivers ?? 1; }

  async start(): Promise<void> {
    this.emit();
    for (let attempt = 0; attempt < 8 && !this.code; attempt++) {
      const code = (this.opts.genCode ?? generateCode)();
      try { this.listener = await this.transport.listen(peerIdFor(code)); this.code = code; }
      catch (e) {
        if (e instanceof TransportError && e.kind === 'id-taken') continue; // collision: pick another code
        return this.fatal(e instanceof TransportError ? e.kind : 'unknown');
      }
    }
    if (!this.listener || !this.code) return this.fatal('id-taken');
    if (this.stopped) { this.listener.destroy(); return; }
    this.listener.onError?.((e) => this.fatal(e.kind));
    this.listener.onConnection((conn) => {
      if (this.stopped) return conn.close();
      this.sessions.push(new SenderSession(conn, this.items, { pin: this.opts.pin }, {
        change: () => this.update(),
        isFull: () => this.approved >= this.max,
        claim: () => {
          if (this.approved >= this.max) return false;
          this.approved++;
          this.clearTimer(); this.expiresAt = null; // claimed: no more expiry
          if (this.approved >= this.max) this.listener?.stopListening();
          return true;
        },
        pinFailed: () => { if (++this.pinFails >= MAX_PIN_ATTEMPTS) this.fatal('pin'); },
      }));
    });
    const ttl = this.opts.ttlMs ?? CODE_TTL_MS;
    this.expiresAt = Date.now() + ttl;
    this.timer = setTimeout(() => this.expire(), ttl);
    this.status = 'waiting';
    this.emit();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
    for (const s of this.sessions) s.cancel();
    this.listener?.destroy();
  }

  snapshot(): HostSnapshot {
    const approvedSessions = this.sessions.filter((s) => s.approved);
    return {
      status: this.status, code: this.code, error: this.error,
      sessions: this.sessions.map((s) => ({ id: s.id, state: s.state, error: s.error, sent: s.sent, total: s.total })),
      expiresAt: this.expiresAt, approved: this.approved, max: this.max,
      allOk: approvedSessions.length > 0 && approvedSessions.every((s) => s.state === 'done'),
    };
  }

  approve(id: string): void { this.sessions.find((s) => s.id === id)?.approve(); }
  deny(id: string): void { this.sessions.find((s) => s.id === id)?.deny(); }

  private update(): void {
    if (this.status === 'expired' || this.status === 'error') return;
    const live = this.sessions;
    if (live.some((s) => s.state === 'sending')) this.status = 'sending';
    else if (live.some((s) => s.state === 'pending' || s.state === 'offered')) this.status = 'connected';
    else if (this.approved >= this.max && live.filter((s) => s.approved).every((s) => s.isTerminal)) {
      this.status = 'done';
      setTimeout(() => this.listener?.destroy(), 600);
    } else this.status = 'waiting';
    this.emit();
  }
  private expire(): void {
    if (this.approved > 0) return;
    this.status = 'expired';
    for (const s of this.sessions) s.deny();
    this.listener?.destroy();
    this.emit();
  }
  private fatal(reason: string): void {
    this.status = 'error'; this.error = reason;
    this.clearTimer();
    this.listener?.stopListening();
    setTimeout(() => this.listener?.destroy(), 400); // let a final "reject" message reach the receiver first
    this.emit();
  }
  private clearTimer(): void { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
  private emit(): void { if (!this.stopped) this.onChange(this.snapshot()); }
}
