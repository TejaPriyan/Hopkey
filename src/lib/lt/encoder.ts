import { neighborsFor, xorInto } from './neighbors.ts';
import type { Frame } from './frame.ts';
import { frameToText } from './frame.ts';
import { randomBytes, getU32 } from '../bytes.ts';

export interface EncoderOptions { blockSize: number; sessionId?: number; flags?: number }

/** LT (fountain) encoder: K systematic source frames first, then endless coded droplets. */
export class LtEncoder {
  readonly K: number;
  readonly B: number;
  readonly total: number;
  readonly sessionId: number;
  readonly flags: number;
  private blocks: Uint8Array;
  private seed = 0;

  constructor(payload: Uint8Array, opts: EncoderOptions) {
    if (payload.length < 1) throw new Error('empty payload');
    this.B = opts.blockSize;
    this.total = payload.length;
    this.K = Math.ceil(payload.length / this.B);
    if (this.K > 0xffff) throw new Error('payload too large for 16-bit block count');
    this.sessionId = opts.sessionId ?? getU32(randomBytes(4), 0);
    this.flags = opts.flags ?? 0;
    this.blocks = new Uint8Array(this.K * this.B); // zero-padded tail
    this.blocks.set(payload);
  }

  frameFor(seed: number): Frame {
    const data = new Uint8Array(this.B);
    for (const j of neighborsFor(seed, this.K)) xorInto(data, this.blocks.subarray(j * this.B, (j + 1) * this.B));
    return { sessionId: this.sessionId, flags: this.flags, K: this.K, B: this.B, total: this.total, seed, data };
  }
  /** Next frame in the endless sequence: seeds 0..K-1 (source blocks), then K, K+1, ... (droplets). */
  next(): Frame { const f = this.frameFor(this.seed); this.seed = (this.seed + 1) >>> 0; return f; }
  nextText(): string { return frameToText(this.next()); }
  get position(): number { return this.seed; }
  reset(): void { this.seed = 0; }
}
