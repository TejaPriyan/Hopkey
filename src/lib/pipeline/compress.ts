import { concat } from '../bytes.ts';

// The stream typings differ between TS/lib versions, so this one helper is deliberately loosely typed.
type AnyStream = { pipeThrough(t: unknown): { getReader(): ReadableStreamDefaultReader<Uint8Array> } };

export const hasCompression = (): boolean =>
  typeof (globalThis as { CompressionStream?: unknown }).CompressionStream === 'function' &&
  typeof (globalThis as { DecompressionStream?: unknown }).DecompressionStream === 'function';

async function run(data: Uint8Array, kind: 'CompressionStream' | 'DecompressionStream', limit: number): Promise<Uint8Array> {
  const Ctor = (globalThis as unknown as Record<string, new (f: string) => unknown>)[kind]!;
  const source = new Blob([data as BlobPart]).stream() as unknown as AnyStream;
  const reader = source.pipeThrough(new Ctor('deflate-raw')).getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > limit) { await reader.cancel(); throw new RangeError('output too large'); }
    parts.push(value);
  }
  return concat(parts);
}

/** deflate-raw. Returns null when the browser has no CompressionStream. */
export async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
  return hasCompression() ? run(data, 'CompressionStream', Infinity) : null;
}
/** inflate with an output cap (decompression-bomb guard). Throws RangeError past `limit`. */
export function inflate(data: Uint8Array, limit: number): Promise<Uint8Array> {
  return run(data, 'DecompressionStream', limit);
}
