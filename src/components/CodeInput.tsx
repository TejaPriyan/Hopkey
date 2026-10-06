import { useEffect, useRef, useState } from 'react';
import { CODE_LENGTH } from '../lib/config.ts';
import { extractCode, normalizeCode } from '../lib/code.ts';

/** Six boxes: auto-uppercase, auto-advance, backspace goes back, paste fills all, auto-submits when full. */
export function CodeInput({ onComplete, disabled, initial = '' }: { onComplete: (code: string) => void; disabled?: boolean; initial?: string }) {
  const [chars, setChars] = useState<string[]>(() => Array.from({ length: CODE_LENGTH }, (_, i) => normalizeCode(initial)[i] ?? ''));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const submitted = useRef('');
  const [pasteStatus, setPasteStatus] = useState<'idle' | 'ok' | 'fail'>('idle');

  const commit = (next: string[]) => {
    setChars(next);
    const code = next.join('');
    if (code.length === CODE_LENGTH && code !== submitted.current) { submitted.current = code; onComplete(code); }
    if (code.length < CODE_LENGTH) submitted.current = '';
  };
  useEffect(() => { refs.current[0]?.focus(); }, []);

  const fill = (start: number, raw: string) => {
    const clean = extractCode(raw).slice(0, CODE_LENGTH - start);
    if (!clean) return;
    const next = [...chars];
    [...clean].forEach((ch, k) => { next[start + k] = ch; });
    commit(next);
    refs.current[Math.min(CODE_LENGTH - 1, start + clean.length)]?.focus();
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const clean = extractCode(text);
      if (clean.length === CODE_LENGTH) {
        const next = [...clean];
        commit(next);
        setPasteStatus('ok');
        refs.current[CODE_LENGTH - 1]?.focus();
      } else {
        setPasteStatus('fail');
      }
    } catch {
      setPasteStatus('fail');
    }
    setTimeout(() => setPasteStatus('idle'), 1800);
  };

  return (
    <div className="grid gap-3">
      <div role="group" aria-label="Enter the 6 character code" className="flex items-center justify-center gap-1.5">
        {chars.map((ch, i) => (
          <span key={i} className="contents">
            {i === 3 && <span className="code-sep" aria-hidden>-</span>}
            <input ref={(el) => { refs.current[i] = el; }} value={ch} disabled={disabled} inputMode="text" autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off" maxLength={8}
              aria-label={`Code character ${i + 1} of ${CODE_LENGTH}`}
              className="code-box mono h-16 w-11 rounded-xl border-2 border-ink bg-surface text-center text-3xl font-extrabold uppercase sm:h-20 sm:w-14 sm:text-4xl"
              onFocus={(e) => e.target.select()}
              onPaste={(e) => { e.preventDefault(); fill(i, e.clipboardData.getData('text')); }}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) {
                  const n = [...chars];
                  n[i] = '';
                  commit(n);
                } else {
                  const raw = chars[i] && v.length === 2 && v.startsWith(chars[i]!) ? v.slice(1) : v;
                  const clean = extractCode(raw);
                  if (!clean) {
                    e.target.value = chars[i] || '';
                    return;
                  }
                  fill(i, raw);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && !chars[i] && i > 0) { e.preventDefault(); const n = [...chars]; n[i - 1] = ''; commit(n); refs.current[i - 1]?.focus(); }
                if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
                if (e.key === 'ArrowRight' && i < CODE_LENGTH - 1) refs.current[i + 1]?.focus();
              }} />
          </span>
        ))}
      </div>
      <div className="flex justify-center">
        <button type="button" className="paste-btn" onClick={pasteFromClipboard} disabled={disabled} aria-label="Paste code from clipboard">
          {pasteStatus === 'ok' ? '✓ Pasted' : pasteStatus === 'fail' ? 'Nothing to paste' : (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Paste code</>
          )}
          <span className="sr-only" aria-live="polite">{pasteStatus === 'ok' ? 'Code pasted from clipboard' : pasteStatus === 'fail' ? 'Could not paste a valid code' : ''}</span>
        </button>
      </div>
    </div>
  );
}

