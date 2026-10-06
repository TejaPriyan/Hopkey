import type { Item } from '../lib/types.ts';
import { formatBytes } from '../lib/format.ts';
import { parseHttpUrl, sanitizeFilename, splitUrl } from '../lib/sanitize.ts';
import { RASTER_MIMES } from '../lib/items.ts';
import { useObjectUrl } from '../hooks.ts';
import { CopyButton, Notice } from './ui.tsx';

// Everything here renders received data as plain text/attributes only. No innerHTML, ever.

export function TextResult({ item }: { item: Item }) {
  return (
    <article className="panel" aria-label="Received text">
      <pre className="m-0 max-h-80 overflow-auto whitespace-pre-wrap break-words [font-family:inherit]">{item.text}</pre>
      <div className="mt-3 flex items-center justify-between gap-2"><span className="text-sm text-muted">{formatBytes(item.size)}</span><CopyButton text={item.text ?? ''} /></div>
    </article>
  );
}

export function LinkResult({ item }: { item: Item }) {
  const url = parseHttpUrl(item.text ?? '');
  if (!url) return <Notice tone="warn" title="Link blocked">Only http and https links are shown. This one was not.</Notice>;
  const p = splitUrl(url);
  return (
    <article className="panel" aria-label="Received link">
      <p className="m-0 break-all text-lg leading-snug">
        <span className="text-muted">{p.scheme}</span><strong className="mono">{p.host}</strong><span className="text-muted">{p.rest}</span>
      </p>
      {p.punycode && <p className="mt-2 text-sm text-warn">⚠ This domain uses encoded characters (xn--). Check it carefully: it may imitate another site.</p>}
      <p className="mt-2 text-sm text-muted">Links are never opened automatically.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a className="btn btn-primary btn-sm" href={url.href} target="_blank" rel="noopener noreferrer">Open link</a>
        <CopyButton text={url.href} label="Copy link" />
      </div>
    </article>
  );
}

function DownloadLink({ item, url }: { item: Item; url: string | null }) {
  if (item.savedTo) return <p className="m-0 text-sm font-semibold text-ok">✓ Saved to your folder as {item.savedTo}</p>;
  if (!url) return null;
  return <a className="btn btn-sm btn-primary" href={url} download={sanitizeFilename(item.name)}>Download</a>;
}

export function ImageResult({ item }: { item: Item }) {
  const url = useObjectUrl(item.blob);
  const previewable = RASTER_MIMES.has(item.mime) && !item.savedTo;
  return (
    <article className="panel" aria-label={`Received image ${item.name}`}>
      {previewable && url && <img src={url} alt={item.name} className="mx-auto max-h-96 w-auto max-w-full rounded-xl border-2 border-line" />}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 break-all text-sm"><strong>{item.name}</strong> · {formatBytes(item.size)}</span>
        <DownloadLink item={item} url={url} />
      </div>
    </article>
  );
}

export function FileResult({ item }: { item: Item }) {
  const url = useObjectUrl(item.blob);
  return (
    <article className="panel flex flex-wrap items-center justify-between gap-2" aria-label={`Received file ${item.name}`}>
      <span className="min-w-0 break-all"><span aria-hidden>📄 </span><strong>{item.name}</strong><br /><span className="text-sm text-muted">{formatBytes(item.size)}</span></span>
      <DownloadLink item={item} url={url} />
    </article>
  );
}

export function ItemResults({ items }: { items: Item[] }) {
  return (
    <div className="grid gap-3">
      {items.map((it) => it.kind === 'text' ? <TextResult key={it.id} item={it} /> : it.kind === 'link' ? <LinkResult key={it.id} item={it} /> : it.kind === 'image' ? <ImageResult key={it.id} item={it} /> : <FileResult key={it.id} item={it} />)}
    </div>
  );
}
