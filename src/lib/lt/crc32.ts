const TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  TABLE[n] = c >>> 0;
}
/** CRC-32 (IEEE). Pass a previous result as `prev` to checksum several buffers as one stream. */
export function crc32(data: Uint8Array, prev = 0): number {
  let c = ~prev >>> 0;
  for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]!) & 255]! ^ (c >>> 8);
  return ~c >>> 0;
}
