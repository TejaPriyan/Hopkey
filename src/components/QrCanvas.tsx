import { useEffect, useRef } from 'react';
import { drawQr } from '../lib/qr/render.ts';
import type { QrMatrix } from '../lib/qr/render.ts';

/** Draws a QR matrix at the largest integer module size that fits its container. */
export function QrCanvas({ qr, label, quiet = 6, maxPx = 720 }: { qr: QrMatrix | null; label: string; quiet?: number; maxPx?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!qr || !canvas.current || !box.current) return;
    const target = Math.min(maxPx, box.current.clientWidth || 320) * Math.min(2, window.devicePixelRatio || 1);
    drawQr(canvas.current, qr, { quiet, targetPx: target });
  }, [qr, quiet, maxPx]);
  return (
    <div ref={box} className="qr-box mx-auto w-full" style={{ maxWidth: maxPx }}>
      <canvas ref={canvas} role="img" aria-label={label} />
    </div>
  );
}
