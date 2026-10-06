// All tunables in one place. Pure constants only (no env access) so tests can import this in Node.
export const APP_NAME = 'HOPKEY';

// ---- Mode A (online code) ----
export const PEER_PREFIX = 'hopkey1'; // PeerJS id = `${PEER_PREFIX}-${code}`. Change it to isolate your deployment.
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/1/I/L/O
export const CODE_LENGTH = 6;
export const CODE_TTL_MS = 10 * 60 * 1000; // unclaimed codes expire
export const CONNECT_TIMEOUT_MS = 15_000;
export const MAX_PIN_ATTEMPTS = 5;
export const MAX_RECEIVERS = 5;
export const CHUNK_SIZE = 16 * 1024;
export const BUFFER_HIGH = 1024 * 1024; // pause sending above this many buffered bytes
export const BUFFER_LOW = 256 * 1024; // resume below this (bufferedAmountLowThreshold)
export const WARN_MEMORY_BYTES = 500 * 1024 * 1024; // warn when the browser must hold the whole file in RAM
export const STREAM_TO_DISK_MIN = 64 * 1024 * 1024; // offer "save to folder" above this size

// ---- Limits shared by both modes ----
export const MAX_ITEMS = 20;
export const MAX_TEXT_BYTES = 100_000;
export const MAX_NAME_LEN = 120;
export const MAX_ONLINE_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

// ---- Mode B (offline QR) ----
export const QR_MAX_PAYLOAD_BYTES = 2 * 1024 * 1024; // hard cap (compressed + encrypted payload)
export const QR_WARN_PAYLOAD_BYTES = 300 * 1024; // warn: this takes a long time to scan
export const INSTANT_MAX_BYTES = 1024; // single static QR up to this size after compression
export const MAX_INFLATED_BYTES = 64 * 1024 * 1024; // decompression-bomb guard
export const PBKDF2_ITERATIONS = 150_000;
export const FPS_MIN = 2;
export const FPS_MAX = 15;
export const FPS_DEFAULT = 8;
export const FPS_EFFICIENCY = 0.7; // real-world fraction of frames a camera actually decodes

export type Ecc = 'L' | 'M';
export interface QrPreset { id: 'reliable' | 'balanced' | 'fast'; label: string; blockSize: number; ecc: Ecc; hint: string }
export const QR_PRESETS: readonly QrPreset[] = [
  { id: 'reliable', label: 'Reliable', blockSize: 250, ecc: 'M', hint: '~250 B per frame. Best for older phones and bad light.' },
  { id: 'balanced', label: 'Balanced', blockSize: 500, ecc: 'L', hint: '~500 B per frame. A good default.' },
  { id: 'fast', label: 'Fast', blockSize: 800, ecc: 'L', hint: '~800 B per frame. Needs a sharp camera and a big screen.' },
];
