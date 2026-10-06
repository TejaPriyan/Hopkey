// Text encodings for QR payloads.
//
// WHY BASE45 FOR THE ANIMATED STREAM: QR "alphanumeric" mode holds 45 symbols (0-9 A-Z space $ % * + - . /  :)
// at 5.5 bits per symbol. Base45 (RFC 9285) maps 2 bytes -> 3 symbols, i.e. 16 payload bits per 16.5 QR bits
// (~97 % efficient). Base64url forces QR *byte* mode: 8 QR bits per 6 payload bits (75 %). Binary byte mode would
// be denser still, but BarcodeDetector/jsQR/ZXing return JS strings and can mangle bytes >= 0x80 through UTF-8
// or Latin-1 decoding, so every frame must be plain ASCII. Base45 is the densest encoding that survives every decoder.
//
// WHY BASE64URL FOR THE INSTANT QR: it lives in a URL fragment, where "%", " " and ":" from base45 would need escaping.
const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const B45_INDEX = new Map<string, number>([...B45].map((c, i) => [c, i]));
export const BASE45_RE = /^[0-9A-Z $%*+\-./:]+$/;

export function base45Encode(data: Uint8Array): string {
  let out = '';
  for (let i = 0; i + 1 < data.length; i += 2) {
    let n = data[i]! * 256 + data[i + 1]!;
    const e = Math.floor(n / 2025); n -= e * 2025;
    const d = Math.floor(n / 45);
    out += B45[n - d * 45]! + B45[d]! + B45[e]!;
  }
  if (data.length % 2) { const n = data[data.length - 1]!; out += B45[n % 45]! + B45[Math.floor(n / 45)]!; }
  return out;
}

export function base45Decode(text: string): Uint8Array | null {
  if (text.length % 3 === 1) return null;
  const out = new Uint8Array(Math.floor(text.length / 3) * 2 + (text.length % 3 ? 1 : 0));
  let o = 0;
  for (let i = 0; i < text.length; i += 3) {
    const c = B45_INDEX.get(text[i]!), d = B45_INDEX.get(text[i + 1]!);
    if (c === undefined || d === undefined) return null;
    if (i + 2 < text.length) {
      const e = B45_INDEX.get(text[i + 2]!);
      if (e === undefined) return null;
      const n = c + d * 45 + e * 2025;
      if (n > 65535) return null;
      out[o++] = n >> 8; out[o++] = n & 255;
    } else {
      const n = c + d * 45;
      if (n > 255) return null;
      out[o++] = n;
    }
  }
  return out;
}

export function base64urlEncode(data: Uint8Array): string {
  let s = '';
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function base64urlDecode(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch { return null; }
}
