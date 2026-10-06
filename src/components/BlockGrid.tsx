import { useEffect, useRef } from 'react';

/** K squares: filled = recovered, outlined = still missing (shape, not just colour, carries the meaning). */
export function BlockGrid({ solved, K }: { solved: Uint8Array; K: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || K < 1) return;
    const css = getComputedStyle(document.documentElement);
    const brand = css.getPropertyValue('--brand').trim() || '#2f4df5', line = css.getPropertyValue('--muted').trim() || '#888';
    const width = c.parentElement?.clientWidth || 300;
    const cols = Math.max(1, Math.min(K, Math.ceil(Math.sqrt(K * 2.2))));
    const rows = Math.ceil(K / cols);
    const cell = Math.max(3, Math.floor(width / cols));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = cols * cell * dpr; c.height = rows * cell * dpr;
    c.style.width = `${cols * cell}px`; c.style.height = `${rows * cell}px`;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const gap = cell > 6 ? 1.5 : 0.5;
    for (let i = 0; i < K; i++) {
      const x = (i % cols) * cell + gap / 2, y = Math.floor(i / cols) * cell + gap / 2, s = cell - gap;
      if (solved[i]) { ctx.fillStyle = brand; ctx.fillRect(x, y, s, s); }
      else { ctx.strokeStyle = line; ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1); ctx.globalAlpha = 1; }
    }
  });
  const done = solved.reduce((n, v) => n + v, 0);
  return <div className="flex justify-center"><canvas ref={ref} role="img" aria-label={`${done} of ${K} blocks received`} /></div>;
}
