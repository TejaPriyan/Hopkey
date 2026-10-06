import { sleep } from '../bytes.ts';

export type CameraErrorCode = 'denied' | 'no-camera' | 'insecure' | 'in-use' | 'unsupported' | 'unknown';
export class CameraError extends Error {
  code: CameraErrorCode;
  constructor(code: CameraErrorCode, message?: string) { super(message ?? code); this.name = 'CameraError'; this.code = code; }
}

interface Detector { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }
const SCAN_INTERVAL_MS = 66; // ~15 scans per second
const MAX_SCAN_WIDTH = 800; // frames are downscaled before the JS decoder to keep CPU low

async function makeDetector(): Promise<Detector | null> {
  const BD = (globalThis as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
  if (!BD) return null;
  try { if (!(await BD.getSupportedFormats()).includes('qr_code')) return null; return new BD({ formats: ['qr_code'] }); } catch { return null; }
}

export class Scanner {
  engine: 'barcode-detector' | 'jsqr' = 'jsqr';
  lastDetectAt = 0;
  startedAt = 0;
  private video: HTMLVideoElement;
  private onText: (t: string) => void;
  private stream: MediaStream | null = null;
  private running = false;
  private worker: Worker | null = null;
  private busy = false;
  private canvas = document.createElement('canvas');

  constructor(video: HTMLVideoElement, onText: (t: string) => void) { this.video = video; this.onText = onText; }

  async start(): Promise<void> {
    if (!window.isSecureContext) throw new CameraError('insecure');
    if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      } catch (e) {
        const n = (e as { name?: string }).name;
        throw new CameraError(n === 'NotAllowedError' || n === 'SecurityError' ? 'denied' : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'no-camera' : n === 'NotReadableError' ? 'in-use' : 'unknown');
      }
    }
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.setAttribute('playsinline', '');
    await this.video.play().catch(() => undefined);
    const detector = await makeDetector();
    if (detector) this.engine = 'barcode-detector';
    else this.worker = new Worker(new URL('./scanWorker.ts', import.meta.url), { type: 'module' });
    this.running = true;
    this.startedAt = Date.now();
    void this.loop(detector);
  }

  stop(): void {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.worker?.terminate();
    this.worker = null;
  }

  private async loop(detector: Detector | null): Promise<void> {
    let det = detector;
    while (this.running) {
      const t0 = performance.now();
      if (this.video.readyState >= 2 && this.video.videoWidth > 0) {
        try {
          if (det) {
            for (const c of await det.detect(this.video)) this.emit(c.rawValue);
          } else await this.scanWithWorker();
        } catch {
          if (det) { det = null; this.engine = 'jsqr'; this.worker ??= new Worker(new URL('./scanWorker.ts', import.meta.url), { type: 'module' }); }
        }
      }
      await sleep(Math.max(0, SCAN_INTERVAL_MS - (performance.now() - t0)));
    }
  }

  private emit(text: string): void { if (text) { this.lastDetectAt = Date.now(); this.onText(text); } }

  private scanWithWorker(): Promise<void> {
    if (!this.worker || this.busy) return Promise.resolve();
    const v = this.video;
    const scale = Math.min(1, MAX_SCAN_WIDTH / v.videoWidth);
    const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
    this.canvas.width = w; this.canvas.height = h;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(v, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    this.busy = true;
    return new Promise((resolve) => {
      const worker = this.worker!;
      worker.onmessage = (e: MessageEvent<{ text: string | null }>) => { this.busy = false; if (e.data.text) this.emit(e.data.text); resolve(); };
      worker.onerror = () => { this.busy = false; resolve(); };
      worker.postMessage({ data: img.data, width: w, height: h }, [img.data.buffer]);
    });
  }
}
