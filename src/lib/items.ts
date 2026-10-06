import type { Item } from './types.ts';
import { MAX_ITEMS, MAX_ONLINE_TOTAL_BYTES, MAX_TEXT_BYTES } from './config.ts';
import { blobBytes, toHex, utf8, randomBytes } from './bytes.ts';
import { sanitizeFilename } from './sanitize.ts';
import { formatBytes } from './format.ts';

/** Raster formats we are willing to preview. SVG is deliberately excluded (treated as a plain file). */
export const RASTER_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp']);

export const newId = (): string => toHex(randomBytes(6));

export function textItem(text: string): Item {
  return { id: newId(), kind: 'text', name: 'Text', mime: 'text/plain', size: utf8(text).length, text };
}
export function linkItem(url: URL): Item {
  return { id: newId(), kind: 'link', name: url.hostname, mime: 'text/uri-list', size: utf8(url.href).length, text: url.href };
}
export function fileItem(file: File): Item {
  const isImage = RASTER_MIMES.has(file.type);
  return {
    id: newId(), kind: isImage ? 'image' : 'file',
    name: sanitizeFilename(file.name, isImage ? 'image' : 'file'),
    mime: file.type || 'application/octet-stream', size: file.size, blob: file, original: isImage ? file : undefined,
  };
}

export async function itemBytes(it: Item): Promise<Uint8Array> {
  if (it.kind === 'text' || it.kind === 'link') return utf8(it.text ?? '');
  return it.blob ? blobBytes(it.blob) : new Uint8Array(0);
}

export const totalBytes = (items: Item[]): number => items.reduce((n, i) => n + i.size, 0);

/** Limits shared by both modes. Returns a human message or null. */
export function checkLimits(items: Item[]): string | null {
  if (items.length > MAX_ITEMS) return `You can share up to ${MAX_ITEMS} items at once.`;
  for (const i of items) {
    if ((i.kind === 'text' || i.kind === 'link') && i.size > MAX_TEXT_BYTES)
      return `Text is limited to ${formatBytes(MAX_TEXT_BYTES)}. Attach it as a .txt file instead.`;
  }
  if (totalBytes(items) > MAX_ONLINE_TOTAL_BYTES) return `That is more than ${formatBytes(MAX_ONLINE_TOTAL_BYTES)} in total. Send it in smaller batches.`;
  return null;
}

/** MIME type a received Blob is created with: only known raster images keep theirs; everything else cannot be rendered by the browser. */
export const safeBlobType = (kind: Item['kind'], mime: string): string => (kind === 'image' && RASTER_MIMES.has(mime) ? mime : 'application/octet-stream');
