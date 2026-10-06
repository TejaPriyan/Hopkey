// The ONLY surface Mode A depends on. PeerJS lives behind it in transportPeer.ts; tests use mockTransport.ts.
// To swap in Trystero, a WebSocket relay, or a LAN transport, implement `Transport` and change one line in transportFactory.ts.
export type TransportErrorKind = 'id-taken' | 'peer-not-found' | 'timeout' | 'signaling' | 'offline' | 'closed' | 'unsupported' | 'unknown';

export class TransportError extends Error {
  kind: TransportErrorKind;
  constructor(kind: TransportErrorKind, message?: string) {
    super(message ?? kind);
    this.name = 'TransportError';
    this.kind = kind;
  }
}

export type Msg = string | Uint8Array;

/** An open, ordered, reliable, message-oriented channel to one remote peer. */
export interface Connection {
  readonly remoteId: string;
  readonly isOpen: boolean;
  /** Bytes queued locally but not yet handed to the network. */
  readonly bufferedAmount: number;
  send(data: Msg): void;
  /** Set the (single) message handler. Messages that arrived earlier are replayed. */
  onMessage(cb: (data: Msg) => void): void;
  onClose(cb: () => void): void;
  /** Resolves once bufferedAmount has fallen to the low-water mark (or the connection closed). */
  drain(): Promise<void>;
  close(): void;
}

export interface Listener {
  /** Set the (single) handler. Connections that arrived earlier are replayed. */
  onConnection(cb: (c: Connection) => void): void;
  onError?(cb: (e: TransportError) => void): void;
  /** Unregister the id so nobody else can connect, but keep existing connections alive. */
  stopListening(): void;
  /** Stop listening and close every connection. */
  destroy(): void;
}

export interface Transport {
  /** Register `peerId`. Rejects with kind 'id-taken' when it already exists. */
  listen(peerId: string): Promise<Listener>;
  /** Connect to a listening peer. Rejects with 'peer-not-found' | 'timeout' | 'offline' | 'signaling'. */
  connect(peerId: string, opts?: { timeoutMs?: number }): Promise<Connection>;
}
