// Helpers shared by the unit tests (not a test file itself).
import { prng } from './lt/neighbors.ts';

export function seededRandom(seed: number): () => number {
  const r = prng(seed);
  return () => r() / 4294967296;
}
export function randomData(n: number, rnd: () => number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.floor(rnd() * 256);
  return out;
}
export async function waitFor(cond: () => boolean, ms = 3000, what = 'condition'): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 2));
  }
}
/** Resolves with the rejection value (and fails if the promise resolves). */
export async function rejection(p: Promise<unknown>): Promise<{ kind?: string; code?: string; message?: string }> {
  try { await p; } catch (e) { return e as { kind?: string }; }
  throw new Error('expected promise to reject');
}
export function fileOf(bytes: Uint8Array, name: string, type = 'application/octet-stream'): File {
  return new File([bytes as BlobPart], name, { type });
}
