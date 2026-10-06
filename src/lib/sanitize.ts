import { MAX_NAME_LEN } from './config.ts';

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Make a remote-supplied filename safe to show and to pass to `download=`. */
export function sanitizeFilename(input: unknown, fallback = 'file'): string {
  let name = typeof input === 'string' ? input : '';
  name = name.normalize('NFC')
    // control chars, bidi overrides/isolates (extension spoofing), zero-width chars, BOM
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+/, '') // no hidden files / "..": leading dots stripped
    .replace(/[.\s]+$/, ''); // Windows dislikes trailing dots/spaces
  if (!name) return fallback;
  const dot = name.lastIndexOf('.');
  let base = dot > 0 ? name.slice(0, dot) : name;
  let ext = dot > 0 ? name.slice(dot) : '';
  if (ext.length > 16) { base = name; ext = ''; }
  if (RESERVED.test(base)) base = `_${base}`;
  const room = Math.max(1, MAX_NAME_LEN - ext.length);
  if (base.length > room) base = base.slice(0, room);
  return base + ext;
}

/** Accept only plain http(s) URLs without embedded credentials. `assumeHttps` is for user-typed input only. */
export function parseHttpUrl(input: string, assumeHttps = false): URL | null {
  let s = input.trim();
  if (!s || /[\s\u0000-\u001f]/.test(s)) return null;
  if (assumeHttps && !/^[a-z][a-z0-9+.-]*:/i.test(s) && /^[^/?#:]+\.[^/?#:]+/.test(s)) s = `https://${s}`;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  return u;
}

export interface UrlParts { scheme: string; host: string; rest: string; punycode: boolean }
/** Split a URL for display with the domain emphasised. `host` is the punycode hostname, so look-alike domains are exposed. */
export function splitUrl(u: URL): UrlParts {
  return {
    scheme: `${u.protocol}//`,
    host: u.host,
    rest: `${u.pathname === '/' && !u.search && !u.hash ? '' : u.pathname}${u.search}${u.hash}`,
    punycode: u.hostname.split('.').some((l) => l.startsWith('xn--')),
  };
}
