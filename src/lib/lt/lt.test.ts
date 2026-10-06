import { describe, expect, it } from 'vitest';
import { LtEncoder } from './encoder.ts';
import { LtDecoder } from './decoder.ts';
import { textToFrame, frameToText, packFrame, unpackFrame } from './frame.ts';
import { degreeThresholds, neighborsFor, prng } from './neighbors.ts';
import { base45Decode, base45Encode, base64urlDecode, base64urlEncode } from './text.ts';
import { crc32 } from './crc32.ts';
import { randomData, seededRandom } from '../testUtils.ts';

interface Chaos { loss?: number; shuffle?: boolean; dup?: number; corrupt?: number; joinAt?: number; skipSource?: boolean }

/** Generates a batch of frame texts, mangles them like a flaky camera would, and feeds the decoder until it completes. */
function simulate(payload: Uint8Array, B: number, c: Chaos, seed: number) {
  const rnd = seededRandom(seed);
  const enc = new LtEncoder(payload, { blockSize: B, sessionId: 77 });
  const N = enc.K * 4 + 60;
  let texts: string[] = [];
  for (let i = 0; i < N; i++) texts.push(enc.nextText());
  texts = texts.slice(c.skipSource ? enc.K : c.joinAt ?? 0);
  texts = texts.filter(() => rnd() >= (c.loss ?? 0));
  const out: string[] = [];
  for (const t of texts) {
    out.push(rnd() < (c.corrupt ?? 0) ? t.slice(0, 40) + (t[40] === 'A' ? 'B' : 'A') + t.slice(41) : t);
    if (rnd() < (c.dup ?? 0)) out.push(t);
  }
  if (c.shuffle) for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
  const dec = new LtDecoder();
  let used = 0, rejected = 0;
  for (const t of out) {
    const f = textToFrame(t);
    if (!f) { rejected++; continue; }
    used++;
    dec.addFrame(f);
    if (dec.complete) break;
  }
  return { dec, K: enc.K, used, rejected };
}

const sizes: [string, number, number][] = [['1 byte', 1, 250], ['exactly K=1', 250, 250], ['K=1000', 250_000, 250]];

describe('LT codec round trip', () => {
  for (const [label, size, B] of sizes) {
    it(`${label}: 30% loss, shuffled, duplicated, CRC-corrupted frames`, () => {
      const payload = randomData(size, seededRandom(size));
      const { dec, rejected } = simulate(payload, B, { loss: 0.3, shuffle: true, dup: 0.2, corrupt: 0.05 }, 9);
      expect(dec.complete).toBe(true);
      expect(Array.from(dec.payload())).toEqual(Array.from(payload));
      if (size > 1000) expect(rejected).toBeGreaterThan(0);
    });
    it(`${label}: joining mid-stream (first half of the source frames missed)`, () => {
      const payload = randomData(size, seededRandom(size + 1));
      const K = Math.ceil(size / B);
      const { dec } = simulate(payload, B, { joinAt: Math.floor(K / 2), loss: 0.1, shuffle: true }, 5);
      expect(dec.complete).toBe(true);
      expect(Array.from(dec.payload())).toEqual(Array.from(payload));
    });
  }

  it('decodes from coded droplets alone (all systematic frames missed)', () => {
    const payload = randomData(40_000, seededRandom(3));
    const { dec } = simulate(payload, 200, { skipSource: true }, 1);
    expect(dec.complete).toBe(true);
    expect(Array.from(dec.payload())).toEqual(Array.from(payload));
  });

  it('reports average frames needed relative to K', () => {
    const rows: string[] = [];
    for (const [K, loss, skip, shuffle] of [[1000, 0, false, false], [1000, 0, false, true], [1000, 0.3, false, true], [1000, 0, true, true], [100, 0.3, false, true], [20, 0.3, false, true]] as const) {
      let sum = 0, worst = 0;
      const runs = 20;
      for (let r = 0; r < runs; r++) {
        const rnd = seededRandom(100 + r);
        const payload = randomData(K * 16, rnd);
        const { dec, used } = simulate(payload, 16, { loss, shuffle, skipSource: skip }, 500 + r);
        expect(dec.complete).toBe(true);
        sum += used / K; worst = Math.max(worst, used / K);
      }
      rows.push(`K=${K} loss=${loss * 100}% ${skip ? 'droplets-only' : shuffle ? 'source+droplets shuffled' : 'in order'}: avg ${(sum / runs).toFixed(3)}xK, worst ${worst.toFixed(3)}xK (frames received, after loss)`);
      expect(sum / runs).toBeLessThan(1.7);
    }
    console.log('\nFrames needed relative to K:\n  ' + rows.join('\n  '));
  });

  it('ignores a frame from another session', () => {
    const a = new LtEncoder(randomData(900, seededRandom(1)), { blockSize: 100, sessionId: 1 });
    const b = new LtEncoder(randomData(900, seededRandom(2)), { blockSize: 100, sessionId: 2 });
    const dec = new LtDecoder();
    expect(dec.addFrame(a.next())).toBe('new');
    expect(dec.addFrame(b.next())).toBe('other-session');
    expect(dec.solvedCount).toBe(1);
  });
});

describe('PRNG / neighbour parity', () => {
  it('is pinned to golden values (changing these breaks cross-version compatibility)', () => {
    const r = prng(12345);
    expect([r(), r(), r()]).toEqual([4207900869, 1317490944, 2079646450]);
    expect(neighborsFor(1000, 1000)).toEqual([384, 863]);
    expect(neighborsFor(1001, 1000)).toEqual([979, 718]);
  });
  it('encoder output equals the XOR of exactly the neighbours the decoder derives', () => {
    const payload = randomData(5000, seededRandom(8));
    const enc = new LtEncoder(payload, { blockSize: 50 });
    for (const seed of [0, 7, 99, 100, 101, 5000, 123456, 0xfffffff0]) {
      const f = enc.frameFor(seed);
      const expected = new Uint8Array(50);
      for (const j of neighborsFor(seed, enc.K)) for (let i = 0; i < 50; i++) expected[i]! ^= payload[j * 50 + i] ?? 0;
      expect(Array.from(f.data)).toEqual(Array.from(expected));
    }
  });
  it('neighbour sets are deterministic, distinct, in range, and degrees follow a plausible soliton', () => {
    const K = 1000;
    let sum = 0, ones = 0;
    for (let s = K; s < K + 3000; s++) {
      const a = neighborsFor(s, K), b = neighborsFor(s, K);
      expect(a).toEqual(b);
      expect(new Set(a).size).toBe(a.length);
      expect(a.every((j) => j >= 0 && j < K)).toBe(true);
      sum += a.length; if (a.length === 1) ones++;
    }
    expect(sum / 3000).toBeGreaterThan(3);
    expect(sum / 3000).toBeLessThan(20);
    expect(ones).toBeGreaterThan(30); // robust soliton: P(degree 1) is about 2.3% at K=1000
    expect(ones).toBeLessThan(200);
    expect(degreeThresholds(1)[0]).toBe(0xffffffff);
  });
});

describe('frames and encodings', () => {
  it('rejects corrupted, truncated and foreign frames', () => {
    const enc = new LtEncoder(randomData(300, seededRandom(4)), { blockSize: 100 });
    const bytes = packFrame(enc.next());
    expect(unpackFrame(bytes)).toBeTruthy();
    const flipped = bytes.slice(); flipped[30]! ^= 1;
    expect(unpackFrame(flipped)).toBeNull();
    const badHeader = bytes.slice(); badHeader[9]! ^= 1;
    expect(unpackFrame(badHeader)).toBeNull();
    expect(unpackFrame(bytes.subarray(0, 50))).toBeNull();
    expect(textToFrame('https://example.com/r/ABC-DEF')).toBeNull();
    expect(textToFrame(frameToText(enc.next()))).toBeTruthy();
  });
  it('base45 matches the RFC 9285 test vectors', () => {
    const t = new TextEncoder();
    expect(base45Encode(t.encode('AB'))).toBe('BB8');
    expect(base45Encode(t.encode('Hello!!'))).toBe('%69 VD92EX0');
    expect(base45Encode(t.encode('base-45'))).toBe('UJCLQE7W581');
    expect(new TextDecoder().decode(base45Decode('QED8WEX0')!)).toBe('ietf!');
    expect(base45Decode('GGW')).toBeNull(); // 65536 overflows
    const r = randomData(1001, seededRandom(6));
    expect(Array.from(base45Decode(base45Encode(r))!)).toEqual(Array.from(r));
  });
  it('base64url and crc32 behave', () => {
    const r = randomData(777, seededRandom(7));
    expect(Array.from(base64urlDecode(base64urlEncode(r))!)).toEqual(Array.from(r));
    expect(base64urlDecode('a+b')).toBeNull();
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});
