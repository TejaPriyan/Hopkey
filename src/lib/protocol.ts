import type { ItemKind } from './types.ts';
import { MAX_ITEMS, MAX_ONLINE_TOTAL_BYTES, MAX_TEXT_BYTES } from './config.ts';
import { getU16, getU32, putU16, putU32, utf8 } from './bytes.ts';
import { parseHttpUrl, sanitizeFilename } from './sanitize.ts';

/*
 * Mode A wire protocol (JSON control strings + binary chunk frames):
 *   receiver -> sender : hello{v,pin?}
 *   sender   -> receiver: manifest{items} | reject{reason}
 *   receiver -> sender : accept | reject{declined}
 *   sender   -> receiver: [chunk frames per file] then done{id,sha256} per file, then complete
 *   receiver -> sender : ack{id,ok} per file, finished
 *   either side        : cancel
 * Everything received is untrusted and validated here before any other module sees it.
 */
export const PROTOCOL_VERSION = 1;
export type RejectReason = 'bad-pin' | 'pin-required' | 'denied' | 'full' | 'declined' | 'version' | 'too-large';
const REASONS: ReadonlySet<string> = new Set(['bad-pin', 'pin-required', 'denied', 'full', 'declined', 'version', 'too-large']);

export interface ManifestItem { id: string; kind: ItemKind; name: string; mime: string; size: number; text?: string }

export type Ctrl =
  | { t: 'hello'; v: number; pin?: string }
  | { t: 'manifest'; items: ManifestItem[] }
  | { t: 'accept' }
  | { t: 'reject'; reason: RejectReason }
  | { t: 'done'; id: string; sha256: string }
  | { t: 'ack'; id: string; ok: boolean }
  | { t: 'complete' }
  | { t: 'finished' }
  | { t: 'cancel' };

export const encodeCtrl = (c: Ctrl): string => JSON.stringify(c);

function parseManifest(raw: unknown): ManifestItem[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_ITEMS) return null;
  const ids = new Set<string>();
  const out: ManifestItem[] = [];
  let total = 0;
  for (const e of raw as Record<string, unknown>[]) {
    if (!e || typeof e !== 'object') return null;
    const { id, kind, name, mime, size, text } = e;
    if (typeof id !== 'string' || !/^[\w-]{1,32}$/.test(id) || ids.has(id)) return null;
    ids.add(id);
    if (kind === 'text' || kind === 'link') {
      if (typeof text !== 'string') return null;
      const n = utf8(text).length;
      if (n > MAX_TEXT_BYTES) return null;
      if (kind === 'link' && !parseHttpUrl(text)) return null;
      out.push({ id, kind, name: kind === 'link' ? 'Link' : 'Text', mime: 'text/plain', size: n, text });
      total += n;
    } else if (kind === 'image' || kind === 'file') {
      if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) return null;
      out.push({
        id, kind, size, name: sanitizeFilename(name, kind),
        mime: typeof mime === 'string' ? mime.slice(0, 100) : 'application/octet-stream',
      });
      total += size;
    } else return null;
  }
  return total <= MAX_ONLINE_TOTAL_BYTES ? out : null;
}

export function parseCtrl(raw: string): Ctrl | null {
  if (raw.length > 600_000) return null;
  let m: Record<string, unknown>;
  try { m = JSON.parse(raw); } catch { return null; }
  if (!m || typeof m !== 'object') return null;
  switch (m.t) {
    case 'hello': return typeof m.v === 'number' ? { t: 'hello', v: m.v, pin: typeof m.pin === 'string' ? m.pin.slice(0, 8) : undefined } : null;
    case 'manifest': { const items = parseManifest(m.items); return items ? { t: 'manifest', items } : null; }
    case 'reject': return { t: 'reject', reason: typeof m.reason === 'string' && REASONS.has(m.reason) ? (m.reason as RejectReason) : 'denied' };
    case 'done': return typeof m.id === 'string' && typeof m.sha256 === 'string' && /^[0-9a-f]{64}$/.test(m.sha256) ? { t: 'done', id: m.id, sha256: m.sha256 } : null;
    case 'ack': return typeof m.id === 'string' && typeof m.ok === 'boolean' ? { t: 'ack', id: m.id, ok: m.ok } : null;
    case 'accept': case 'complete': case 'finished': case 'cancel': return { t: m.t };
    default: return null;
  }
}

// ---- binary chunk frames: [0xC7][ver=1][u16 fileIndex][u32 seq][data...] ----
export const CHUNK_HEADER = 8;
const CHUNK_MAGIC = 0xc7;
export function encodeChunk(index: number, seq: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(CHUNK_HEADER + data.length);
  out[0] = CHUNK_MAGIC; out[1] = 1; putU16(out, 2, index); putU32(out, 4, seq);
  out.set(data, CHUNK_HEADER);
  return out;
}
export function decodeChunk(buf: Uint8Array): { index: number; seq: number; data: Uint8Array } | null {
  if (buf.length < CHUNK_HEADER || buf[0] !== CHUNK_MAGIC || buf[1] !== 1) return null;
  return { index: getU16(buf, 2), seq: getU32(buf, 4), data: buf.subarray(CHUNK_HEADER) };
}
