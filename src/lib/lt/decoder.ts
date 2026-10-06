import { neighborsFor, xorInto } from './neighbors.ts';
import type { Frame } from './frame.ts';

export type AddResult = 'new' | 'duplicate' | 'redundant' | 'other-session' | 'complete';

interface Droplet { data: Uint8Array; idx: Set<number>; dead: boolean }

/** Peeling (belief-propagation) LT decoder. Accepts frames in any order, with duplicates and loss. */
export class LtDecoder {
  sessionId: number | null = null;
  flags = 0; K = 0; B = 0; total = 0;
  solvedCount = 0;
  solved = new Uint8Array(0);
  accepted = 0; // unique frames used
  duplicates = 0;
  private blocks: (Uint8Array | null)[] = [];
  private seen = new Set<number>();
  private byIndex = new Map<number, Set<Droplet>>();

  get complete(): boolean { return this.K > 0 && this.solvedCount === this.K; }
  get progress(): number { return this.K ? this.solvedCount / this.K : 0; }

  addFrame(f: Frame): AddResult {
    if (this.sessionId === null) {
      this.sessionId = f.sessionId; this.flags = f.flags; this.K = f.K; this.B = f.B; this.total = f.total;
      this.solved = new Uint8Array(f.K); this.blocks = new Array(f.K).fill(null);
    } else if (f.sessionId !== this.sessionId || f.K !== this.K || f.B !== this.B || f.total !== this.total) return 'other-session';
    if (this.complete) return 'duplicate';
    if (this.seen.has(f.seed)) { this.duplicates++; return 'duplicate'; }
    this.seen.add(f.seed);

    const data = f.data.slice();
    const unresolved = new Set<number>();
    for (const j of neighborsFor(f.seed, this.K)) {
      if (this.solved[j]) xorInto(data, this.blocks[j]!); else unresolved.add(j);
    }
    if (unresolved.size === 0) return 'redundant';
    this.accepted++;
    if (unresolved.size === 1) this.solve([...unresolved][0]!, data);
    else {
      const d: Droplet = { data, idx: unresolved, dead: false };
      for (const j of unresolved) { let s = this.byIndex.get(j); if (!s) this.byIndex.set(j, (s = new Set())); s.add(d); }
    }
    return this.complete ? 'complete' : 'new';
  }

  private solve(start: number, startData: Uint8Array): void {
    const queue: [number, Uint8Array][] = [[start, startData]];
    while (queue.length) {
      const [j, data] = queue.pop()!;
      if (this.solved[j]) continue;
      this.blocks[j] = data; this.solved[j] = 1; this.solvedCount++;
      const drops = this.byIndex.get(j);
      if (!drops) continue;
      this.byIndex.delete(j);
      for (const d of drops) {
        if (d.dead) continue;
        xorInto(d.data, data);
        d.idx.delete(j);
        if (d.idx.size === 0) d.dead = true;
        else if (d.idx.size === 1) {
          d.dead = true;
          const k = [...d.idx][0]!;
          this.byIndex.get(k)?.delete(d);
          queue.push([k, d.data]);
        }
      }
    }
  }

  /** The reassembled payload. Throws if not complete. */
  payload(): Uint8Array {
    if (!this.complete) throw new Error('decoder incomplete');
    const out = new Uint8Array(this.K * this.B);
    for (let i = 0; i < this.K; i++) out.set(this.blocks[i]!, i * this.B);
    return out.slice(0, this.total);
  }
}
