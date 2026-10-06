import type { Item, ItemKind } from '../types.ts';
import { MAX_INFLATED_BYTES, MAX_ITEMS } from '../config.ts';
import { blobOf, concat, fromUtf8, getU32, putU32, utf8 } from '../bytes.ts';
import { itemBytes, newId, RASTER_MIMES } from '../items.ts';
import { parseHttpUrl, sanitizeFilename } from '../sanitize.ts';
import { PayloadError } from './errors.ts';

/*
 * Container = u32 manifestLength | manifest JSON {v:1,i:[{k,n,m,s}]} | raw bytes of every item, back to back.
 * k kind, n name, m mime, s size in bytes.
 */
const KINDS: ReadonlySet<string> = new Set(['text', 'link', 'image', 'file']);

export async function buildContainer(items: Item[]): Promise<Uint8Array> {
  const bodies = await Promise.all(items.map(itemBytes));
  if (bodies.reduce((n, b) => n + b.length, 0) > MAX_INFLATED_BYTES) throw new PayloadError('too-large');
  const manifest = utf8(JSON.stringify({ v: 1, i: items.map((it, n) => ({ k: it.kind, n: it.name, m: it.mime, s: bodies[n]!.length })) }));
  const head = new Uint8Array(4);
  putU32(head, 0, manifest.length);
  return concat([head, manifest, ...bodies]);
}

/** Parses untrusted container bytes into items. Throws PayloadError('corrupt') on any inconsistency. */
export function parseContainer(c: Uint8Array): Item[] {
  const bad = () => new PayloadError('corrupt', 'Container is malformed');
  if (c.length < 4) throw bad();
  const mlen = getU32(c, 0);
  if (mlen > c.length - 4) throw bad();
  let m: { v?: unknown; i?: unknown };
  try { m = JSON.parse(fromUtf8(c.subarray(4, 4 + mlen))); } catch { throw bad(); }
  if (m.v !== 1 || !Array.isArray(m.i) || m.i.length > MAX_ITEMS) throw bad();
  let off = 4 + mlen;
  const items: Item[] = [];
  for (const e of m.i as Record<string, unknown>[]) {
    const size = e.s;
    if (typeof e.k !== 'string' || !KINDS.has(e.k) || typeof size !== 'number' || !Number.isInteger(size) || size < 0 || off + size > c.length) throw bad();
    const kind = e.k as ItemKind;
    const bytes = c.subarray(off, off + size);
    off += size;
    const mime = typeof e.m === 'string' ? e.m.slice(0, 100) : 'application/octet-stream';
    if (kind === 'text') items.push({ id: newId(), kind, name: 'Text', mime: 'text/plain', size, text: fromUtf8(bytes) });
    else if (kind === 'link') {
      const u = parseHttpUrl(fromUtf8(bytes));
      if (!u) throw bad();
      items.push({ id: newId(), kind, name: u.hostname, mime: 'text/uri-list', size, text: u.href });
    } else {
      const safe = kind === 'image' && RASTER_MIMES.has(mime) ? mime : 'application/octet-stream';
      items.push({ id: newId(), kind, name: sanitizeFilename(e.n, kind), mime, size, blob: blobOf([bytes.slice()], safe) });
    }
  }
  if (off !== c.length) throw bad();
  return items;
}
