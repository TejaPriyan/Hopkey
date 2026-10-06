export type ItemKind = 'text' | 'link' | 'image' | 'file';

/** One thing in a share. Used for both outgoing and received items. */
export interface Item {
  id: string;
  kind: ItemKind;
  name: string;
  mime: string;
  size: number; // bytes (UTF-8 length for text/link)
  text?: string; // text + link content
  blob?: Blob; // image + file content
  original?: Blob; // sender only: untouched image, so the optimizer can re-run from the source
  savedTo?: string; // receiver only: item was streamed straight to disk under this name
}
