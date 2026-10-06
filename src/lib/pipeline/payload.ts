import type { Item } from '../types.ts';
import { MAX_INFLATED_BYTES } from '../config.ts';
import { asSource, concat, equalBytes, randomBytes } from '../bytes.ts';
import { buildContainer, parseContainer } from './container.ts';
import { deflate, hasCompression, inflate } from './compress.ts';
import { decrypt, encrypt } from './crypto.ts';
import { PayloadError } from './errors.ts';

/*
 * Payload (what the fountain code carries):
 *   [0] version=1  [1] flags (bit0 compressed, bit1 encrypted)  [encrypted: salt(16) iv(12)]  body
 *   inner = container || SHA-256(container);  body = [deflate-raw(inner)] then [AES-GCM(.. aad = header)]
 */
const VERSION = 1, F_COMPRESSED = 1, F_ENCRYPTED = 2, SALT = 16, IV = 12;

export interface BuiltPayload { payload: Uint8Array; compressed: boolean; encrypted: boolean; rawSize: number }

export async function buildPayload(items: Item[], opts: { passphrase?: string } = {}): Promise<BuiltPayload> {
  const container = await buildContainer(items);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', asSource(container)));
  let inner = concat([container, digest]);
  const rawSize = inner.length;
  let flags = 0;
  const packed = await deflate(inner);
  if (packed && packed.length < inner.length) { inner = packed; flags |= F_COMPRESSED; } // skip if it would grow
  if (!opts.passphrase) return { payload: concat([Uint8Array.of(VERSION, flags), inner]), compressed: !!(flags & F_COMPRESSED), encrypted: false, rawSize };
  flags |= F_ENCRYPTED;
  const salt = randomBytes(SALT), iv = randomBytes(IV);
  const header = concat([Uint8Array.of(VERSION, flags), salt, iv]);
  const body = await encrypt(inner, opts.passphrase, salt, iv, header);
  return { payload: concat([header, body]), compressed: !!(flags & F_COMPRESSED), encrypted: true, rawSize };
}

export function peekPayload(p: Uint8Array): { encrypted: boolean; compressed: boolean } | null {
  if (p.length < 2 || p[0] !== VERSION) return null;
  return { compressed: !!(p[1]! & F_COMPRESSED), encrypted: !!(p[1]! & F_ENCRYPTED) };
}

/** Decrypt, inflate, verify the SHA-256 and parse. Throws PayloadError with a code the UI can explain. */
export async function openPayload(p: Uint8Array, passphrase?: string): Promise<Item[]> {
  const info = peekPayload(p);
  if (!info) throw new PayloadError('unsupported', 'Unknown payload version');
  let inner: Uint8Array;
  if (info.encrypted) {
    if (!passphrase) throw new PayloadError('passphrase-required');
    const hl = 2 + SALT + IV;
    if (p.length <= hl) throw new PayloadError('corrupt');
    try { inner = await decrypt(p.subarray(hl), passphrase, p.subarray(2, 2 + SALT), p.subarray(2 + SALT, hl), p.subarray(0, hl)); }
    catch { throw new PayloadError('bad-passphrase'); }
  } else inner = p.subarray(2);
  if (info.compressed) {
    if (!hasCompression()) throw new PayloadError('unsupported', 'This browser cannot decompress the data');
    try { inner = await inflate(inner, MAX_INFLATED_BYTES + 64); }
    catch (e) { throw new PayloadError(e instanceof RangeError ? 'too-large' : 'corrupt'); }
  }
  if (inner.length < 36) throw new PayloadError('corrupt');
  const container = inner.subarray(0, inner.length - 32);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', asSource(container)));
  if (!equalBytes(digest, inner.subarray(inner.length - 32))) throw new PayloadError('integrity');
  return parseContainer(container);
}
