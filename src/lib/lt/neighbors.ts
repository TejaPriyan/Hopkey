// THE ONE shared module for the fountain code's randomness. Encoder and decoder both call neighborsFor();
// nothing else in the codebase derives neighbour sets. A droplet is fully described by (seed, K).
//
// Determinism notes: the PRNG is integer-only (Math.imul), and the robust soliton CDF is quantised to uint32
// thresholds so two devices whose Math.log differs in the last ulp still agree on every degree except with
// probability ~1e-7 per table entry (see assumptions in the README).

/** Murmur3 finaliser: spreads consecutive seeds (K, K+1, ...) over the whole 32-bit space. */
export function mix32(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

/** mulberry32: tiny seeded PRNG returning uint32. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

export const SOLITON_C = 0.1;
export const SOLITON_DELTA = 0.5;
const cache = new Map<number, Uint32Array>();

/** Robust soliton distribution as uint32 CDF thresholds: degree d is chosen when u <= thr[d-1]. */
export function degreeThresholds(K: number): Uint32Array {
  const hit = cache.get(K);
  if (hit) return hit;
  const mu = new Float64Array(K);
  if (K === 1) mu[0] = 1;
  else {
    const R = SOLITON_C * Math.log(K / SOLITON_DELTA) * Math.sqrt(K);
    const spike = Math.max(1, Math.min(K, Math.round(K / R)));
    for (let i = 1; i <= K; i++) {
      const rho = i === 1 ? 1 / K : 1 / (i * (i - 1));
      let tau = 0;
      if (i < spike) tau = R / (i * K);
      else if (i === spike) tau = Math.max(0, (R * Math.log(R / SOLITON_DELTA)) / K);
      mu[i - 1] = rho + tau;
    }
  }
  let sum = 0;
  for (const v of mu) sum += v;
  const thr = new Uint32Array(K);
  let acc = 0;
  for (let i = 0; i < K; i++) { acc += mu[i]! / sum; thr[i] = Math.min(0xffffffff, Math.floor(acc * 4294967296)); }
  thr[K - 1] = 0xffffffff;
  cache.set(K, thr);
  return thr;
}

/**
 * Source-block indices XORed into the droplet with this seed.
 * Seeds 0..K-1 are the systematic pass (block i alone). Seeds >= K are coded droplets.
 */
export function neighborsFor(seed: number, K: number): number[] {
  if (seed < K) return [seed];
  const rnd = prng(mix32(seed));
  const thr = degreeThresholds(K);
  const u = rnd();
  let lo = 0, hi = K - 1;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (u <= thr[mid]!) hi = mid; else lo = mid + 1; }
  const degree = lo + 1;
  const picked = new Set<number>();
  const out: number[] = [];
  while (out.length < degree) {
    const j = Math.floor((rnd() * K) / 4294967296); // exact in doubles (< 2^48)
    if (!picked.has(j)) { picked.add(j); out.push(j); }
  }
  return out;
}

export function xorInto(dst: Uint8Array, src: Uint8Array): void {
  for (let i = 0; i < dst.length; i++) dst[i] ^= src[i]!;
}
