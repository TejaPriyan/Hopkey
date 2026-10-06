import type { Item } from '../types.ts';
import { INSTANT_MAX_BYTES } from '../config.ts';
import { concat } from '../bytes.ts';
import { base64urlDecode, base64urlEncode } from '../lt/text.ts';
import { buildContainer, parseContainer } from './container.ts';
import { deflate, hasCompression, inflate } from './compress.ts';
import { PayloadError } from './errors.ts';

// Instant QR: [version=1][flags bit0=compressed][container (maybe deflated)] as base64url in a URL *fragment*,
// so the data never reaches any server. Only text and link items qualify.
export async function buildInstant(items: Item[]): Promise<string | null> {
  if (!items.length || items.some((i) => i.kind !== 'text' && i.kind !== 'link')) return null;
  let body = await buildContainer(items);
  let flags = 0;
  if (body.length > INSTANT_MAX_BYTES * 4) return null; // cheap pre-check before compressing
  const packed = await deflate(body);
  if (packed && packed.length < body.length) { body = packed; flags = 1; }
  if (body.length > INSTANT_MAX_BYTES) return null;
  return base64urlEncode(concat([Uint8Array.of(1, flags), body]));
}

export async function parseInstant(b64: string): Promise<Item[]> {
  const bytes = base64urlDecode(b64);
  if (!bytes || bytes.length < 3 || bytes[0] !== 1) throw new PayloadError('corrupt');
  let body: Uint8Array = bytes.subarray(2);
  if (bytes[1]! & 1) {
    if (!hasCompression()) throw new PayloadError('unsupported');
    try { body = await inflate(body, 256 * 1024); } catch { throw new PayloadError('corrupt'); }
  }
  return parseContainer(body);
}
