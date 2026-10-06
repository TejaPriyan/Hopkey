import { useEffect, useMemo, useRef, useState } from 'react';
import { LtEncoder } from '../lib/lt/encoder.ts';
import { FLAG_ENCRYPTED } from '../lib/lt/frame.ts';
import { makeQr } from '../lib/qr/render.ts';
import type { QrMatrix } from '../lib/qr/render.ts';
import { FPS_DEFAULT, FPS_MAX, FPS_MIN } from '../lib/config.ts';
import type { Ecc } from '../lib/config.ts';
import { useWakeLock } from '../hooks.ts';
import { QrCanvas } from './QrCanvas.tsx';
import { Notice, Segmented } from './ui.tsx';

/** Plays the endless fountain stream: K source frames first, then coded droplets, until stopped. */
export function StreamPlayer({ payload, encrypted, blockSize, ecc, onEcc, fps, onFps, onStop }: {
  payload: Uint8Array; encrypted: boolean; blockSize: number; ecc: Ecc; onEcc: (e: Ecc) => void; fps: number; onFps: (n: number) => void; onStop: () => void;
}) {
  const enc = useMemo(() => new LtEncoder(payload, { blockSize, flags: encrypted ? FLAG_ENCRYPTED : 0 }), [payload, blockSize, encrypted]);
  const [qr, setQr] = useState<QrMatrix | null>(null);
  const [pos, setPos] = useState(0);
  const [paused, setPaused] = useState(false);
  const [fs, setFs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const fpsRef = useRef(fps); fpsRef.current = fps;
  const eccRef = useRef(ecc); eccRef.current = ecc;
  const wake = useWakeLock(!paused);

  useEffect(() => {
    if (paused) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      if (!alive) return;
      const t0 = performance.now();
      try { setQr(makeQr(enc.nextText(), eccRef.current, 'alphanumeric')); setPos(enc.position); }
      catch (e) { setError(e instanceof Error ? e.message : 'Could not draw the QR code'); return; }
      timer = setTimeout(tick, Math.max(0, 1000 / fpsRef.current - (performance.now() - t0)));
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [enc, paused]);

  useEffect(() => {
    const f = () => setFs(document.fullscreenElement === wrap.current);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);

  const toggleFs = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void wrap.current?.requestFullscreen?.().catch(() => undefined); };
  const phase = pos <= enc.K ? `source frame ${Math.min(pos, enc.K)} of ${enc.K}` : `extra frame ${pos - enc.K} (repair data)`;

  return (
    <div className="grid gap-3">
      <div ref={wrap} className={fs ? 'grid h-full w-full place-items-center bg-white' : ''}>
        <div style={fs ? { width: 'min(96vw, 96vh)' } : undefined}>
          <QrCanvas qr={qr} label={`Animated QR code, ${phase}`} maxPx={fs ? 1600 : 560} />
        </div>
        {fs && <button type="button" className="btn btn-sm fixed right-4 top-4" onClick={toggleFs}>Exit full screen</button>}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <p className="m-0 text-center text-sm text-muted" aria-live="off">Frame {pos}: {phase}. Needs {enc.K} blocks of {blockSize} B.</p>
      <Notice tone="info" title="Turn the screen brightness up">Hold both devices still. The receiver can join at any moment and in any order.</Notice>
      {wake === 'none' && <Notice tone="warn">Could not keep the screen awake automatically. Disable auto-lock while this plays.</Notice>}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>{paused ? '▶ Resume' : '❚❚ Pause'}</button>
        <button type="button" className="btn" onClick={toggleFs}>Full screen</button>
        <button type="button" className="btn btn-quiet" onClick={onStop}>Stop</button>
      </div>
      <label className="grid gap-1 font-semibold">Speed: {fps} frames per second
        <input type="range" min={FPS_MIN} max={FPS_MAX} value={fps} onChange={(e) => onFps(Number(e.target.value))} aria-valuetext={`${fps} frames per second`} />
        <span className="text-sm font-normal text-muted">Default {FPS_DEFAULT}. Lower it if the receiver misses frames.</span>
      </label>
      <div className="grid gap-1"><span className="font-semibold">Error correction</span>
        <Segmented<Ecc> label="Error correction level" value={ecc} onChange={onEcc} options={[{ value: 'L', label: 'L (denser)' }, { value: 'M', label: 'M (sturdier)' }]} /></div>
    </div>
  );
}
