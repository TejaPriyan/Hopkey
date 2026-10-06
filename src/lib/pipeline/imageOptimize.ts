export interface OptimizeOptions { maxDim: number; quality: number; type: 'image/webp' | 'image/jpeg' }

export async function imageSize(blob: Blob): Promise<{ w: number; h: number }> {
  const bmp = await createImageBitmap(blob);
  const r = { w: bmp.width, h: bmp.height };
  bmp.close();
  return r;
}

/** Downscale + re-encode an image (first frame only for animated formats). Falls back to JPEG if WebP encoding is unsupported. */
export async function optimizeImage(src: Blob, o: OptimizeOptions): Promise<{ blob: Blob; ext: string }> {
  const bmp = await createImageBitmap(src, { imageOrientation: 'from-image' });
  const scale = Math.min(1, o.maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // JPEG has no alpha
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const encode = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, o.quality));
  let blob = await encode(o.type);
  if (!blob || blob.type !== o.type) blob = await encode('image/jpeg'); // Safari returns PNG for unsupported types
  if (!blob) throw new Error('Could not encode image');
  return { blob, ext: blob.type === 'image/webp' ? 'webp' : 'jpg' };
}
