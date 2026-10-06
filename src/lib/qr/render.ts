import QRCode from 'qrcode';
import type { Ecc } from '../config.ts';

export interface QrMatrix { size: number; dark(r: number, c: number): boolean }

/**
 * Locally bundled generator (node-qrcode; docs verified: create(text | segments, {errorCorrectionLevel}) -> {modules, version}).
 * `alphanumeric` forces QR alphanumeric mode, the densest mode for base45 text.
 * ASSUMPTION (TODO verify on first run): modules.size and modules.data are a row-major 0/1 grid, as in qrcode/lib/core/bit-matrix.js.
 */
export function makeQr(text: string, ecc: Ecc, mode: 'alphanumeric' | 'auto' = 'auto'): QrMatrix {
  const qr = mode === 'alphanumeric'
    ? QRCode.create([{ data: text, mode: 'alphanumeric' }], { errorCorrectionLevel: ecc })
    : QRCode.create(text, { errorCorrectionLevel: ecc });
  const m = qr.modules as unknown as { size: number; data: ArrayLike<number> };
  return { size: m.size, dark: (r, c) => m.data[r * m.size + c] === 1 };
}

/** Always dark-on-white (inverted codes confuse many decoders), with a generous quiet zone, at an integer scale for crisp edges. */
export function drawQr(canvas: HTMLCanvasElement, qr: QrMatrix, opts: { quiet?: number; targetPx: number }): void {
  const quiet = opts.quiet ?? 6;
  const total = qr.size + quiet * 2;
  const scale = Math.max(2, Math.floor(opts.targetPx / total));
  const px = total * scale;
  if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#000';
  for (let r = 0; r < qr.size; r++) {
    let c = 0;
    while (c < qr.size) { // merge horizontal runs into one rect
      if (!qr.dark(r, c)) { c++; continue; }
      const start = c;
      while (c < qr.size && qr.dark(r, c)) c++;
      ctx.fillRect((quiet + start) * scale, (quiet + r) * scale, (c - start) * scale, scale);
    }
  }
}
