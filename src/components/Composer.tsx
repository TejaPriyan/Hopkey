import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { Item } from '../lib/types.ts';
import { checkLimits, fileItem, linkItem, textItem } from '../lib/items.ts';
import { MAX_ITEMS, MAX_TEXT_BYTES } from '../lib/config.ts';
import { formatBytes } from '../lib/format.ts';
import { parseHttpUrl } from '../lib/sanitize.ts';
import { utf8 } from '../lib/bytes.ts';
import { useObjectUrl } from '../hooks.ts';
import { Notice, Segmented } from './ui.tsx';

type AddKind = 'text' | 'link' | 'image' | 'file';

function Thumb({ item }: { item: Item }) {
  const url = useObjectUrl(item.kind === 'image' ? item.blob : undefined);
  if (item.kind === 'image' && url) return <img src={url} alt="" className="h-14 w-14 shrink-0 rounded-lg border-2 border-line object-cover" />;
  return <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border-2 border-line bg-surface2 text-2xl">{item.kind === 'text' ? '✎' : item.kind === 'link' ? '🔗' : '📄'}</span>;
}

export function Composer({ items, setItems }: { items: Item[]; setItems: (f: (prev: Item[]) => Item[]) => void }) {
  const [kind, setKind] = useState<AddKind>('text');
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const add = (incoming: Item[]) => {
    const next = [...itemsRef.current, ...incoming];
    const problem = checkLimits(next);
    if (problem) { setError(problem); return false; }
    setError(null); setItems(() => next);
    return true;
  };
  const addFiles = (files: FileList | File[], only?: 'image') => {
    const list = Array.from(files).filter((f) => !only || f.type.startsWith('image/'));
    if (!list.length) { setError(only ? 'That is not an image file.' : 'No files found.'); return; }
    add(list.map(fileItem));
  };

  // Paste anywhere on the page: images and files become items. Plain text pastes stay in the focused field.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) { e.preventDefault(); addFiles(files); }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files, kind === 'image' ? 'image' : undefined); };
  const textBytes = utf8(text).length;

  return (
    <section aria-label="Add things to share" className="grid gap-4">
      <Segmented<AddKind> label="What do you want to add?" value={kind} onChange={(k) => { setKind(k); setError(null); }}
        options={[{ value: 'text', label: 'Text' }, { value: 'link', label: 'Link' }, { value: 'image', label: 'Image' }, { value: 'file', label: 'File' }]} />

      {kind === 'text' && (
        <div className="grid gap-2">
          <label htmlFor="hk-text" className="font-semibold">Text to send</label>
          <textarea id="hk-text" className="field min-h-32" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or paste anything" />
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm ${textBytes > MAX_TEXT_BYTES ? 'text-err' : 'text-muted'}`}>{formatBytes(textBytes)} of {formatBytes(MAX_TEXT_BYTES)}</span>
            <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={() => { if (add([textItem(text)])) setText(''); }}>Add text</button>
          </div>
        </div>
      )}

      {kind === 'link' && (
        <div className="grid gap-2">
          <label htmlFor="hk-link" className="font-semibold">Link to send</label>
          <input id="hk-link" className="field" type="url" inputMode="url" autoCapitalize="none" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://example.com/page" />
          <button type="button" className="btn btn-primary justify-self-end" disabled={!link.trim()} onClick={() => {
            const u = parseHttpUrl(link, true);
            if (!u) { setError('Only http and https links can be shared.'); return; }
            if (add([linkItem(u)])) setLink('');
          }}>Add link</button>
        </div>
      )}

      {(kind === 'image' || kind === 'file') && (
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
          className={`grid place-items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center ${drag ? 'border-brand bg-surface2' : 'border-line'}`}>
          <p className="m-0 font-semibold">{kind === 'image' ? 'Drop an image here' : 'Drop files here'}</p>
          <p className="m-0 text-sm text-muted">or paste ({navigator.platform.includes('Mac') ? '⌘V' : 'Ctrl+V'}) or</p>
          <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()}>{kind === 'image' ? 'Choose images' : 'Choose files'}</button>
          <input ref={fileInput} type="file" multiple hidden accept={kind === 'image' ? 'image/*' : undefined}
            onChange={(e) => { if (e.target.files) addFiles(e.target.files, kind === 'image' ? 'image' : undefined); e.target.value = ''; }} />
        </div>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      <div>
        <h2 className="mb-2 text-lg">Ready to send <span className="text-muted">({items.length}/{MAX_ITEMS})</span></h2>
        {items.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden>✦</span>
            <p className="m-0 text-center font-semibold">Nothing to send yet</p>
            <p className="m-0 text-center text-sm text-muted">Add text, a link, an image or a file using the tabs above.</p>
          </div>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {items.map((it) => (
              <li key={it.id} className="panel flex items-center gap-3 p-2">
                <Thumb item={it} />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate">{it.kind === 'text' ? (it.text ?? '').slice(0, 60) : it.kind === 'link' ? it.text : it.name}</strong>
                  <span className="text-sm text-muted">{it.kind} · {formatBytes(it.size)}</span>
                </span>
                <button type="button" className="btn btn-quiet btn-sm" aria-label={`Remove ${it.kind} ${it.name}`} onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
