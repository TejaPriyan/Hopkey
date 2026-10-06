import type { Transport } from './transport.ts';
import { PeerTransport } from './transportPeer.ts';

// The single place that picks the Mode A transport. Swap PeerTransport for another Transport implementation here.
export const createTransport = (): Transport => new PeerTransport();
