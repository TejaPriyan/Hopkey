import { HASH_ROUTES } from './env.ts';

export type Route =
  | { name: 'home' } | { name: 'send' } | { name: 'receive' } | { name: 'loopback' }
  | { name: 'join'; code: string } | { name: 'instant'; payload: string } | { name: 'notfound' };

const BASE: string = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/');

export function parseRoute(pathname: string, hash: string): Route {
  const h = /^#\/(r|q)\/([^/?#]+)$/.exec(hash);
  if (h) return h[1] === 'r' ? { name: 'join', code: decodeURIComponent(h[2]!) } : { name: 'instant', payload: h[2]! };
  let p = pathname.startsWith(BASE) ? pathname.slice(BASE.length - 1) : pathname;
  p = p.replace(/\/+$/, '') || '/';
  if (p === '/') return { name: 'home' };
  if (p === '/send') return { name: 'send' };
  if (p === '/receive') return { name: 'receive' };
  if (p === '/dev/loopback') return { name: 'loopback' };
  const m = /^\/r\/([^/]+)$/.exec(p);
  if (m) return { name: 'join', code: decodeURIComponent(m[1]!) };
  return { name: 'notfound' };
}

export const href = (path: string): string => BASE + path.replace(/^\//, '');
export function navigate(path: string): void {
  history.pushState({}, '', href(path));
  window.dispatchEvent(new Event('hk-nav'));
  window.scrollTo(0, 0);
}

/** Absolute join link for a code (used in the sender's QR). */
export function joinUrl(code: string): string {
  return HASH_ROUTES ? `${location.origin}${BASE}#/r/${code}` : `${location.origin}${BASE}r/${code}`;
}
/** Absolute Instant QR link. The payload lives in the fragment, which browsers never send to a server. */
export const instantUrl = (b64: string): string => `${location.origin}${BASE}#/q/${b64}`;
