import { CHUNK_SIZE } from './config.ts';
import { blobOf } from './bytes.ts';
import { Sha256 } from './sha256.ts';
import { sanitizeFilename } from './sanitize.ts';

export async function* readChunks(blob: Blob, size = CHUNK_SIZE): AsyncGenerator<Uint8Array> {
  for (let o = 0; o < blob.size; o += size) yield new Uint8Array(await blob.slice(o, o + size).arrayBuffer());
}

// ---- sinks: where received bytes go ----
export interface SinkResult { blob?: Blob; savedTo?: string }
export interface ChunkSink { write(c: Uint8Array): Promise<void>; close(): Promise<SinkResult>; abort(): Promise<void> }

export class BlobSink implements ChunkSink {
  private parts: Uint8Array[] = [];
  private type: string;
  constructor(type: string) { this.type = type; }
  async write(c: Uint8Array): Promise<void> { this.parts.push(c.slice()); }
  async close(): Promise<SinkResult> { const blob = blobOf(this.parts, this.type); this.parts = []; return { blob }; }
  async abort(): Promise<void> { this.parts = []; }
}

// Minimal structural types for the File System Access API (not in every TS lib.dom version).
export interface WritableLike { write(d: Uint8Array): Promise<void>; close(): Promise<void>; abort(): Promise<void> }
export interface DirHandleLike {
  getFileHandle(name: string, o?: { create?: boolean }): Promise<{ createWritable(): Promise<WritableLike> }>;
}

export class FsSink implements ChunkSink {
  private w: WritableLike;
  private name: string;
  constructor(w: WritableLike, name: string) { this.w = w; this.name = name; }
  write(c: Uint8Array): Promise<void> { return this.w.write(c); }
  async close(): Promise<SinkResult> { await this.w.close(); return { savedTo: this.name }; }
  abort(): Promise<void> { return this.w.abort().catch(() => undefined); }
}

export const canStreamToDisk = (): boolean => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/** Must be called from a user gesture (a click). Returns null if the user cancels. */
export async function pickSaveFolder(): Promise<DirHandleLike | null> {
  try { return await (window as unknown as { showDirectoryPicker(o?: object): Promise<DirHandleLike> }).showDirectoryPicker({ mode: 'readwrite' }); }
  catch { return null; }
}

/** Never overwrite an existing file in the chosen folder. */
export async function openFsSink(dir: DirHandleLike, wanted: string): Promise<FsSink> {
  const safe = sanitizeFilename(wanted);
  const dot = safe.lastIndexOf('.');
  const base = dot > 0 ? safe.slice(0, dot) : safe, ext = dot > 0 ? safe.slice(dot) : '';
  for (let i = 0; i < 100; i++) {
    const name = i === 0 ? safe : `${base} (${i})${ext}`;
    try { await dir.getFileHandle(name); continue; } catch { /* not found: free to use */ }
    const handle = await dir.getFileHandle(name, { create: true });
    return new FsSink(await handle.createWritable(), name);
  }
  throw new Error('Could not find a free file name');
}

/** Ordered chunk intake for one file: validates sequence and size, hashes incrementally, verifies at the end. */
export class Reassembler {
  received = 0;
  private seq = 0;
  private hash = new Sha256();
  private size: number;
  private sink: ChunkSink;
  constructor(size: number, sink: ChunkSink) { this.size = size; this.sink = sink; }

  async push(seq: number, data: Uint8Array): Promise<void> {
    if (seq !== this.seq) throw new Error('chunk out of order');
    if (this.received + data.length > this.size) throw new Error('more data than announced');
    this.seq++; this.received += data.length;
    this.hash.update(data);
    await this.sink.write(data);
  }
  async finish(expectedHex: string): Promise<{ ok: true; result: SinkResult } | { ok: false; reason: 'size' | 'hash' }> {
    if (this.received !== this.size) { await this.sink.abort(); return { ok: false, reason: 'size' }; }
    if (this.hash.hex() !== expectedHex) { await this.sink.abort(); return { ok: false, reason: 'hash' }; }
    return { ok: true, result: await this.sink.close() };
  }
  abort(): Promise<void> { return this.sink.abort(); }
}
