import { useEffect, useRef, useState } from 'react';
import type { ReactNode, KeyboardEvent } from 'react';

type Tone = 'info' | 'warn' | 'error' | 'ok';
const TONE: Record<Tone, { glyph: string; label: string; cls: string }> = {
  info: { glyph: 'i', label: 'Note', cls: 'border-line' },
  warn: { glyph: '!', label: 'Warning', cls: 'border-warn' },
  error: { glyph: '×', label: 'Problem', cls: 'border-err' },
  ok: { glyph: '✓', label: 'Success', cls: 'border-ok' },
};
const TONE_TEXT: Record<Tone, string> = { info: 'text-muted', warn: 'text-warn', error: 'text-err', ok: 'text-ok' };

/** Never colour alone: every tone also has a glyph and a spoken label. */
export function Notice({ tone = 'info', title, children, action }: { tone?: Tone; title?: string; children?: ReactNode; action?: ReactNode }) {
  const t = TONE[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-2xl border-2 bg-surface p-3 ${t.cls}`}>
      <span aria-hidden className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-current font-bold ${TONE_TEXT[tone]}`}>{t.glyph}</span>
      <div className="min-w-0 flex-1">
        <span className="sr-only">{t.label}: </span>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-[.95rem]">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string }[];
}) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const n = options[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length]!;
    onChange(n.value);
    (e.currentTarget.parentElement?.querySelectorAll('button')[options.indexOf(n)] as HTMLButtonElement | undefined)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-full border-2 border-ink bg-surface2 p-1">
      {options.map((o, i) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} tabIndex={value === o.value ? 0 : -1}
          onClick={() => onChange(o.value)} onKeyDown={(e) => onKey(e, i)}
          className={`min-h-[42px] rounded-full px-3 font-semibold ${value === o.value ? 'bg-ink text-bg' : 'text-ink'}`}>
          {value === o.value && <span aria-hidden>● </span>}{o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ label, value, onChange, tabs }: { label: string; value: T; onChange: (v: T) => void; tabs: { value: T; label: string }[] }) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!;
    onChange(n.value);
    (e.currentTarget.parentElement?.querySelectorAll('button')[tabs.indexOf(n)] as HTMLButtonElement | undefined)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="flex gap-2 border-b-2 border-line">
      {tabs.map((t, i) => (
        <button key={t.value} role="tab" id={`tab-${t.value}`} aria-selected={value === t.value} aria-controls={`panel-${t.value}`} tabIndex={value === t.value ? 0 : -1}
          onClick={() => onChange(t.value)} onKeyDown={(e) => onKey(e, i)}
          className={`-mb-0.5 min-h-[46px] border-b-4 px-4 font-semibold ${value === t.value ? 'border-brand text-ink' : 'border-transparent text-muted'}`}>{t.label}</button>
      ))}
    </div>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through to the legacy path */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

export function CopyButton({ text, label = 'Copy', className = '' }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <button type="button" className={`btn btn-sm ${className}`} onClick={async () => { setState((await copyText(text)) ? 'ok' : 'fail'); clearTimeout(t.current); t.current = setTimeout(() => setState('idle'), 1800); }}>
      {state === 'ok' ? '✓ Copied' : state === 'fail' ? 'Copy failed' : label}
      <span className="sr-only" aria-live="polite">{state === 'ok' ? 'Copied to clipboard' : state === 'fail' ? 'Could not copy' : ''}</span>
    </button>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div>
      <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ width: `${pct}%` }} /></div>
      <p className="mt-1 text-sm text-muted">{pct}%</p>
    </div>
  );
}

export interface Step { id: string; label: string }
export function Steps({ steps, current, failed }: { steps: Step[]; current: number; failed?: boolean }) {
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Progress">
      {steps.map((s, i) => {
        const done = i < current, active = i === current;
        return (
          <li key={s.id} aria-current={active ? 'step' : undefined}
            className={`flex items-center gap-2 rounded-full border-2 px-3 py-1 text-sm font-semibold ${active ? (failed ? 'border-err text-err' : 'step-active border-brand text-ink') : done ? 'border-ok text-ok' : 'border-line text-muted'}`}>
            <span aria-hidden>{done ? '✓' : active ? (failed ? '×' : '●') : '○'}</span>{s.label}
            <span className="sr-only">{done ? ' (done)' : active ? (failed ? ' (stopped)' : ' (now)') : ' (waiting)'}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function SuccessMark({ label = 'Done' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3" role="status">
      <svg className="success-mark" width="56" height="56" viewBox="0 0 56 56" aria-hidden>
        <circle cx="28" cy="28" r="25" fill="var(--ok)" opacity=".16" stroke="var(--ok)" strokeWidth="3" />
        <path d="M16 29l8 8 16-17" fill="none" stroke="var(--ok)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-xl font-bold">{label}</span>
    </div>
  );
}
