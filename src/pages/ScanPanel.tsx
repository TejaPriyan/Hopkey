import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import jsQR from 'jsqr';
import type { Item } from '../lib/types.ts';
import { StreamReceiver } from '../lib/streamReceiver.ts';
import { classifyScan } from '../lib/qr/route.ts';
import { CameraError, Scanner } from '../lib/qr/scanner.ts';
import type { CameraErrorCode } from '../lib/qr/scanner.ts';
import { openPayload, peekPayload } from '../lib/pipeline/payload.ts';
import { PayloadError } from '../lib/pipeline/errors.ts';
import { describePayloadError } from '../lib/messages.ts';
import { BlockGrid } from '../components/BlockGrid.tsx';
import { ItemResults } from '../components/results.tsx';
import { Notice, ProgressBar, SuccessMark } from '../components/ui.tsx';

type Cam = 'idle' | 'starting' | 'running' | CameraErrorCode;
type Phase = 'scanning' | 'needpass' | 'decoding' | 'done' | 'error';

const CAMERA_HELP: Record<Exclude<CameraErrorCode, 'unknown'>, string> = {
  denied: 'Camera access is blocked. Tap the lock or camera icon in the address bar, set Camera to Allow, then reload. On iPhone: Settings, Safari, Camera.',
  'no-camera': 'No camera was found on this device. You can upload or paste a QR code image below.',
  insecure: 'The camera only works on HTTPS (or localhost). Open the app from its https:// address.',
  'in-use': 'The camera is busy. Close other apps or tabs that use it, then try again.',
  unsupported: 'This browser cannot access the camera. You can upload or paste a QR code image below.',
};

export function ScanPanel({ onJoin, onInstant }: { onJoin: (code: string) => void; onInstant: (payload: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const scanner = useRef<Scanner | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rx = useRef(new StreamReceiver());
  const payload = useRef<Uint8Array | null>(null);
  const painting = useRef(false);
  const alive = useRef(true);
  const cbs = useRef({ onJoin, onInstant });
  cbs.current = { onJoin, onInstant };
  const lastUnknown = useRef(0);
  const progressAt = useRef({ solved: 0, at: Date.now() });
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [cam, setCam] = useState<Cam>('idle');
  const [phase, setPhase] = useState<Phase>('scanning');
  const [items, setItems] = useState<Item[]>([]);
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [isDecodingImage, setIsDecodingImage] = useState(false);

  const repaint = () => { if (painting.current) return; painting.current = true; requestAnimationFrame(() => { painting.current = false; bump(); }); };

  const stop = useCallback(() => { scanner.current?.stop(); scanner.current = null; setCam('idle'); }, []);

  const finish = useCallback(async (passphrase?: string) => {
    const bytes = payload.current ?? rx.current.decoder.payload();
    payload.current = bytes;
    const info = peekPayload(bytes);
    if (info?.encrypted && !passphrase) { setPhase('needpass'); return; }
    setPhase('decoding');
    try { setItems(await openPayload(bytes, passphrase)); setPhase('done'); setMsg(null); }
    catch (e) {
      const code = e instanceof PayloadError ? e.code : 'corrupt';
      setMsg(describePayloadError(code));
      setPhase(code === 'bad-passphrase' ? 'needpass' : 'error');
    }
  }, []);

  const onText = useCallback((text: string) => {
    const s = classifyScan(text);
    const r = rx.current;
    switch (s.type) {
      case 'join': stop(); cbs.current.onJoin(s.code); return;
      case 'instant': stop(); cbs.current.onInstant(s.payload); return;
      case 'frame': {
        const before = r.decoder.solvedCount;
        const res = r.ingest(s.frame);
        if (r.decoder.solvedCount > before) navigator.vibrate?.(6);
        if (res === 'complete') { stop(); void finish(); }
        repaint();
        return;
      }
      case 'bad-frame': r.noteBad(); repaint(); return;
      default:
        if (Date.now() - lastUnknown.current > 3000) {
          lastUnknown.current = Date.now();
          const preview = text.length > 50 ? `${text.slice(0, 47)}…` : text;
          setMsg(`Scanned: "${preview}". That QR is not a valid HOPKEY code or stream.`);
        }
    }
  }, [finish, stop]);

  const decodeImageFile = useCallback(async (file: File | Blob) => {
    setIsDecodingImage(true);
    setMsg(null);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('canvas context error');
      ctx.drawImage(bitmap, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const res = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'attemptBoth' });
      if (res && res.data) {
        onText(res.data);
      } else {
        setMsg('Could not find a QR code in that image. Try a higher contrast photo or screenshot.');
      }
    } catch {
      setMsg('Could not read image file. Please choose a valid PNG or JPEG.');
    } finally {
      setIsDecodingImage(false);
    }
  }, [onText]);

  const start = useCallback(async () => {
    if (!video.current || scanner.current) return;
    setCam('starting'); setMsg(null);
    const s = new Scanner(video.current, onText);
    try { await s.start(); if (!alive.current) { s.stop(); return; } scanner.current = s; setCam('running'); }
    catch (e) { s.stop(); setCam(e instanceof CameraError ? e.code : 'unknown'); }
  }, [onText]);

  useEffect(() => { alive.current = true; void start(); return () => { alive.current = false; scanner.current?.stop(); scanner.current = null; }; }, [start]);

  // Hints: no QR for 3 s, many unreadable frames, or no progress for a while.
  useEffect(() => {
    const t = setInterval(() => {
      const s = scanner.current, r = rx.current;
      if (!s || r.decoder.complete) { setHints([]); return; }
      const h: string[] = [];
      if (Date.now() - Math.max(s.lastDetectAt, s.startedAt) > 3000) h.push(s.lastDetectAt ? 'No QR code detected for a few seconds. Aim at the sender\'s screen and hold steady.' : 'No QR code detected yet. Point the camera at the sender\'s screen, hold steady and move closer.');
      else if (r.badFrames >= 5 && r.badFrames > r.framesSeen * 0.3) h.push('Many frames are unreadable. Hold steady and ask the sender to raise screen brightness.');
      const solved = r.decoder.solvedCount;
      if (solved !== progressAt.current.solved) progressAt.current = { solved, at: Date.now() };
      else if (r.started && Date.now() - progressAt.current.at > 6000) h.push('Progress has stalled. Move closer, or ask the sender to lower the speed or pick Reliable.');
      setHints(h);
    }, 700);
    return () => clearInterval(t);
  }, []);

  // Support pasting a QR code image from clipboard
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            void decodeImageFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [decodeImageFile]);

  const reset = () => { rx.current.reset(); payload.current = null; setItems([]); setPass(''); setMsg(null); setPhase('scanning'); progressAt.current = { solved: 0, at: Date.now() }; void start(); };

  const r = rx.current;
  const d = r.decoder;
  const camErr = cam !== 'idle' && cam !== 'starting' && cam !== 'running' ? cam : null;

  if (phase === 'done') {
    return (
      <div className="grid gap-4">
        <SuccessMark label="Received and verified" />
        <ItemResults items={items} />
        <button type="button" className="btn justify-self-start" onClick={reset}>Scan another</button>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div
        className={phase === 'scanning' ? 'relative overflow-hidden rounded-2xl border-2 border-ink bg-ink' : 'hidden'}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f && f.type.startsWith('image/')) void decodeImageFile(f);
        }}
      >
        <video ref={video} muted playsInline className="aspect-[4/3] w-full object-cover" aria-label="Camera preview" />
        {cam !== 'running' && !camErr && <p className="absolute inset-0 m-0 grid place-items-center text-white" aria-live="polite">Starting camera…</p>}
        {camErr && (
          <div className="absolute inset-0 m-0 grid place-items-center bg-ink/90 p-4 text-center text-white">
            <div className="grid gap-2">
              <span className="text-3xl" aria-hidden>📷</span>
              <p className="m-0 text-sm font-semibold">{camErr === 'no-camera' ? 'No camera detected' : 'Camera not accessible'}</p>
              <button type="button" className="btn btn-sm btn-primary mx-auto" onClick={() => fileInputRef.current?.click()}>
                Choose QR image or screenshot
              </button>
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void decodeImageFile(f);
          e.target.value = '';
        }}
      />

      {phase === 'scanning' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className="btn btn-sm btn-quiet"
              disabled={isDecodingImage}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
              {isDecodingImage ? 'Scanning image…' : 'Upload QR image / screenshot'}
            </button>
            <span className="text-xs text-muted">or paste with Ctrl+V / drop image</span>
          </div>

          {camErr && (
            <Notice tone="error" title="Camera not available" action={<button type="button" className="btn btn-sm btn-primary" onClick={() => void start()}>Try again</button>}>
              {camErr === 'unknown' ? 'The camera could not be started.' : CAMERA_HELP[camErr]}
            </Notice>
          )}
          {cam === 'running' && !r.started && <p className="m-0 text-center text-muted">Point the camera at a QR code from another device. Join links, one-shot QRs and animated streams are all recognised.</p>}
          {hints.map((h) => <Notice key={h} tone="warn">{h}</Notice>)}
          {msg && <Notice tone="info">{msg}</Notice>}
        </>
      )}

      {r.other && r.other.hits >= 3 && phase === 'scanning' && (
        <Notice tone="warn" title="New transfer detected. Switch?" action={<div className="flex gap-2"><button type="button" className="btn btn-sm btn-primary" onClick={() => { r.switchToOther(); progressAt.current = { solved: 0, at: Date.now() }; bump(); }}>Switch</button><button type="button" className="btn btn-sm" onClick={() => { r.other = null; bump(); }}>Keep current</button></div>}>
          Another sender is showing a different stream.
        </Notice>
      )}

      {r.started && (
        <section className="panel grid gap-3" aria-label="Scan progress">
          <ProgressBar label="Scan progress" value={d.progress} />
          <BlockGrid solved={d.solved} K={d.K} />
          <p className="m-0 text-sm text-muted" aria-live="off">{d.solvedCount} of {d.K} blocks · {r.framesSeen} frames seen{r.badFrames ? ` · ${r.badFrames} unreadable` : ''}{scanner.current ? ` · ${scanner.current.engine === 'barcode-detector' ? 'built-in detector' : 'JS decoder'}` : ''}</p>
          {r.encrypted && <Notice tone="info">This transfer is protected with a passphrase. You will be asked for it when scanning finishes.</Notice>}
        </section>
      )}

      {phase === 'needpass' && (
        <form className="panel grid gap-3" onSubmit={(e) => { e.preventDefault(); void finish(pass); }}>
          <SuccessMark label="All blocks received" />
          <label htmlFor="pp" className="font-bold">Enter the passphrase</label>
          {msg && <Notice tone="error">{msg}</Notice>}
          <input id="pp" type="password" className="field" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus autoComplete="off" />
          <div className="flex gap-2"><button className="btn btn-primary flex-1" disabled={!pass}>Unlock</button><button type="button" className="btn" onClick={reset}>Start over</button></div>
        </form>
      )}
      {phase === 'decoding' && <p className="m-0 text-lg" aria-live="polite">Decrypting and checking…</p>}
      {phase === 'error' && (
        <div className="grid gap-3"><Notice tone="error" title="Could not open the transfer">{msg}</Notice><button type="button" className="btn btn-primary justify-self-start" onClick={reset}>Scan again</button></div>
      )}
    </div>
  );
}
