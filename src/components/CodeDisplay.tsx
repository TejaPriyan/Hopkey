import { formatCode } from '../lib/code.ts';

/** Big monospace code on a gold ticket stub. Letters are spoken one by one by screen readers. */
export function CodeDisplay({ code }: { code: string }) {
  const spoken = [...code].join(', ');
  return (
    <div className="flex flex-wrap items-end justify-center gap-x-1" role="group" aria-label={`Your code: ${spoken}`}>
      {[...code].map((ch, i) => (
        <span key={i} className="contents">
          {i === 3 && <span className="code-sep" aria-hidden>-</span>}
          <span className="code-cell" aria-hidden>{ch}</span>
        </span>
      ))}
      <span className="sr-only">{formatCode(code)}</span>
    </div>
  );
}
