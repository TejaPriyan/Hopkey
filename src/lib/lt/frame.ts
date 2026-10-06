import { crc32 } from './crc32.ts';
import { base45Decode, base45Encode, BASE45_RE } from './text.ts';
import { getU16, getU32, putU16, putU32 } from '../bytes.ts';

export const FRAME_MAGIC = 0x484b; // "HK"
export const FRAME_VERSION = 1;
export const HEADER_SIZE = 24;
export const FLAG_ENCRYPTED = 1;

/*
 * Binary frame layout (big-endian), then base45-encoded for the QR:
 *  0  u16 magic 'HK'     2  u8 version     3  u8 flags (bit0 = payload encrypted)
 *  4  u32 sessionId      8  u16 K          10 u16 B       12 u32 total payload length
 * 16  u32 seed          20  u32 CRC-32 of bytes [0,20) + block data
 * 24  B bytes of (XORed) block data
 */
export interface Frame { sessionId: number; flags: number; K: number; B: number; total: number; seed: number; data: Uint8Array }

export function packFrame(f: Frame): Uint8Array {
  const out = new Uint8Array(HEADER_SIZE + f.data.length);
  putU16(out, 0, FRAME_MAGIC); out[2] = FRAME_VERSION; out[3] = f.flags;
  putU32(out, 4, f.sessionId); putU16(out, 8, f.K); putU16(out, 10, f.B); putU32(out, 12, f.total); putU32(out, 16, f.seed);
  out.set(f.data, HEADER_SIZE);
  putU32(out, 20, crc32(f.data, crc32(out.subarray(0, 20))));
  return out;
}

/** Returns null for anything that is not a perfectly valid frame (bad magic/version/shape/CRC). */
export function unpackFrame(b: Uint8Array): Frame | null {
  if (b.length <= HEADER_SIZE || getU16(b, 0) !== FRAME_MAGIC || b[2] !== FRAME_VERSION) return null;
  const K = getU16(b, 8), B = getU16(b, 10), total = getU32(b, 12);
  const data = b.subarray(HEADER_SIZE);
  if (K < 1 || B < 1 || data.length !== B || total < 1 || total > K * B || total <= (K - 1) * B) return null;
  if (crc32(data, crc32(b.subarray(0, 20))) !== getU32(b, 20)) return null;
  return { sessionId: getU32(b, 4), flags: b[3]!, K, B, total, seed: getU32(b, 16), data: data.slice() };
}

export const frameToText = (f: Frame): string => base45Encode(packFrame(f));
export function textToFrame(text: string): Frame | null {
  if (!BASE45_RE.test(text)) return null;
  const bytes = base45Decode(text);
  return bytes ? unpackFrame(bytes) : null;
}
