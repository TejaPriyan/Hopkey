import type { Frame } from '../lt/frame.ts';
import { FRAME_MAGIC, textToFrame } from '../lt/frame.ts';
import { BASE45_RE, base45Decode } from '../lt/text.ts';
import { isValidCode, normalizeCode } from '../code.ts';

export type Scan =
  | { type: 'join'; code: string }
  | { type: 'instant'; payload: string }
  | { type: 'frame'; frame: Frame }
  | { type: 'bad-frame' } // looks like one of our stream frames but failed validation (CRC/shape)
  | { type: 'unknown' };

/** Decide what a scanned QR string is. Accepts our own join links and Instant links from any host (the payload is handled locally). */
export function classifyScan(text: string): Scan {
  const trimmed = text.trim();
  // Instant QR link (full URL or fragment)
  const q = /(?:^https?:\/\/[^\s]+?)?(?:#|\/)\/q\/([A-Za-z0-9_-]+)(?:[/?#].*)?$/i.exec(trimmed);
  if (q) return { type: 'instant', payload: q[1]! };

  // Join URL (full URL, relative path, or hash path)
  const j = /(?:^https?:\/\/[^\s]+?)?(?:\/r\/|#\/r\/)([A-Za-z0-9]{3}-?[A-Za-z0-9]{3})(?:[/?#].*)?$/i.exec(trimmed);
  if (j) {
    const raw = j[1]!.replace('-', '').toUpperCase();
    const code = normalizeCode(raw);
    if (code === raw && isValidCode(code)) return { type: 'join', code };
  }

  // Raw 6-character code (e.g. "ABC-DEF" or "ABCDEF")
  const rawMatch = /^[A-Za-z0-9]{3}-?[A-Za-z0-9]{3}$/.exec(trimmed);
  if (rawMatch) {
    const raw = trimmed.replace('-', '').toUpperCase();
    const code = normalizeCode(raw);
    if (code === raw && isValidCode(code)) return { type: 'join', code };
  }

  // Fountain stream frame
  if (trimmed.length >= 38 && BASE45_RE.test(trimmed)) {
    const bytes = base45Decode(trimmed);
    if (bytes && bytes.length > 2 && ((bytes[0]! << 8) | bytes[1]!) === FRAME_MAGIC) {
      const frame = textToFrame(trimmed);
      return frame ? { type: 'frame', frame } : { type: 'bad-frame' };
    }
  }
  return { type: 'unknown' };
}
