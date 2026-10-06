// Small byte helpers shared by every module. No DOM dependencies (runs in Node for tests).
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

export const utf8 = (s: string): Uint8Array => encoder.encode(s);
export const fromUtf8 = (b: Uint8Array): string => decoder.decode(b);

export function concat(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function toHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i]!.toString(16).padStart(2, '0');
  return s;
}

// TS >= 5.7 types Uint8Array<ArrayBufferLike>, which DOM typings refuse as BlobPart / BufferSource. Casts live here only.
export const blobOf = (parts: Uint8Array[], type = ''): Blob => new Blob(parts as BlobPart[], { type });
export const asSource = (b: Uint8Array): BufferSource => b as BufferSource;
export async function blobBytes(b: Blob): Promise<Uint8Array> { return new Uint8Array(await b.arrayBuffer()); }

export function putU32(buf: Uint8Array, off: number, v: number): void {
  buf[off] = (v >>> 24) & 255; buf[off + 1] = (v >>> 16) & 255; buf[off + 2] = (v >>> 8) & 255; buf[off + 3] = v & 255;
}
export function getU32(buf: Uint8Array, off: number): number {
  return ((buf[off]! << 24) | (buf[off + 1]! << 16) | (buf[off + 2]! << 8) | buf[off + 3]!) >>> 0;
}
export function putU16(buf: Uint8Array, off: number, v: number): void { buf[off] = (v >>> 8) & 255; buf[off + 1] = v & 255; }
export function getU16(buf: Uint8Array, off: number): number { return (buf[off]! << 8) | buf[off + 1]!; }

/** Wait for a short time (used for tests and small UI delays). */
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
