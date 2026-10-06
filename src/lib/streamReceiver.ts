import { LtDecoder } from './lt/decoder.ts';
import { FLAG_ENCRYPTED } from './lt/frame.ts';
import type { Frame } from './lt/frame.ts';

export type IngestResult = 'accepted' | 'duplicate' | 'complete' | 'other-session';

/** Mode B receive-side controller: owns a decoder, counts frames, and tracks a competing session. */
export class StreamReceiver {
  decoder = new LtDecoder();
  framesSeen = 0; // valid frames of this session, including duplicates
  badFrames = 0; // frames that failed CRC/shape
  other: { sessionId: number; frame: Frame; hits: number } | null = null;

  ingest(frame: Frame): IngestResult {
    if (this.decoder.complete) return 'duplicate';
    const r = this.decoder.addFrame(frame);
    if (r === 'other-session') {
      if (this.other?.sessionId === frame.sessionId) this.other.hits++; else this.other = { sessionId: frame.sessionId, frame, hits: 1 };
      return 'other-session';
    }
    this.framesSeen++;
    if (r === 'complete') return 'complete';
    return r === 'duplicate' ? 'duplicate' : 'accepted';
  }
  noteBad(): void { this.badFrames++; }

  /** Drop the current session and adopt the one we saw competing with it. */
  switchToOther(): void {
    const o = this.other;
    this.decoder = new LtDecoder(); this.framesSeen = 0; this.badFrames = 0; this.other = null;
    if (o) this.ingest(o.frame);
  }
  reset(): void { this.decoder = new LtDecoder(); this.framesSeen = 0; this.badFrames = 0; this.other = null; }

  get started(): boolean { return this.decoder.sessionId !== null; }
  get encrypted(): boolean { return !!(this.decoder.flags & FLAG_ENCRYPTED); }
  get percent(): number { return Math.floor(this.decoder.progress * 100); }
}
