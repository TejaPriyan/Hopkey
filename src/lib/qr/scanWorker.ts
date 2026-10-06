// Fallback decoder for browsers without BarcodeDetector (Safari/iOS, Firefox, most desktop Chrome). jsQR runs off the main thread.
import jsQR from 'jsqr';

interface Job { data: Uint8ClampedArray; width: number; height: number }
self.addEventListener('message', (e: MessageEvent<Job>) => {
  const { data, width, height } = e.data;
  const r = jsQR(data, width, height, { inversionAttempts: 'dontInvert' });
  (self as unknown as { postMessage(m: unknown): void }).postMessage({ text: r ? r.data : null });
});
