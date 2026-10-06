import { useEffect, useRef, useState } from 'react';
import type { Item } from '../lib/types.ts';
import { imageSize, optimizeImage } from '../lib/pipeline/imageOptimize.ts';
import { formatBytes, formatDuration } from '../lib/format.ts';
import { FPS_EFFICIENCY } from '../lib/config.ts';
import { sanitizeFilename } from '../lib/sanitize.ts';

/** Per-image shrinker for Mode B: live size and transfer-time estimate as the sliders move. */
export function ImageOptimizer({ item, blockSize, fps, onChange }: { item: Item; blockSize: number; fps: number; onChange: (next: Item) => void }) {
  const original = item.original ?? item.blob!;
  const origName = useRef(item.name);
  const [on, setOn] = useState(false);
  const [maxDim, setMaxDim] = useState(1024);
  const [quality, setQuality] = useState(0.7);
  const [type, setType] = useState<'image/webp' | 'image/jpeg'>('image/webp');
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const latest = useRef(item);
  latest.current = item;

  useEffect(() => { void imageSize(original).then(setDims).catch(() => setDims(null)); }, [original]);

  useEffect(() => {
    const base = latest.current;
    if (!on) { if (base.blob !== original) onChange({ ...base, blob: original, size: original.size, mime: original.type || base.mime, name: origName.current }); return; }
    let cancelled = false;
    setBusy(true); setErr(null);
    const t = setTimeout(async () => {
      try {
        const { blob, ext } = await optimizeImage(original, { maxDim, quality, type });
        if (cancelled) return;
        const stem = origName.current.replace(/\.[^.]+$/, '');
        onChange({ ...latest.current, blob, size: blob.size, mime: blob.type, name: sanitizeFilename(`${stem}.${ext}`) });
      } catch { if (!cancelled) setErr('This browser could not re-encode the image.'); }
      finally { if (!cancelled) setBusy(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, maxDim, quality, type, original]);

  const secs = Math.ceil(item.size / blockSize) / (fps * FPS_EFFICIENCY);
  const limit = dims ? Math.max(dims.w, dims.h) : 4096;
  return (
    <div className="mt-2 rounded-xl border-2 border-line bg-surface2 p-3">
      <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="h-5 w-5" /> Shrink this image for the QR stream</label>
      {on && (
        <div className="mt-3 grid gap-3 text-sm">
          <label className="grid gap-1">Longest side: {Math.min(maxDim, limit)} px
            <input type="range" min={240} max={Math.max(480, Math.min(2560, limit))} step={20} value={Math.min(maxDim, Math.max(480, Math.min(2560, limit)))} onChange={(e) => setMaxDim(Number(e.target.value))} /></label>
          <label className="grid gap-1">Quality: {Math.round(quality * 100)}%
            <input type="range" min={0.2} max={0.95} step={0.05} value={quality} onChange={(e) => setQuality(Number(e.target.value))} /></label>
          <label className="flex items-center gap-2">Format
            <select className="field w-auto py-1" value={type} onChange={(e) => setType(e.target.value as 'image/webp' | 'image/jpeg')}><option value="image/webp">WebP (smaller)</option><option value="image/jpeg">JPEG (most compatible)</option></select></label>
        </div>
      )}
      <p className="mt-2 text-sm" aria-live="polite">{busy ? 'Working…' : <>Original {formatBytes(original.size)} → <strong>{formatBytes(item.size)}</strong> · about {formatDuration(secs)} to scan</>}</p>
      {err && <p className="text-sm text-err">{err}</p>}
    </div>
  );
}
