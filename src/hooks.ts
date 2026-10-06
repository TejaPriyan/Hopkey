import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { parseRoute } from './lib/router.ts';
import type { Route } from './lib/router.ts';
import { acquireWakeLock } from './lib/wakelock.ts';
import { getOfflineReady, subscribeOffline, subscribeInstall, canNativeInstall, isStandaloneApp } from './pwa.ts';

function subscribeNav(cb: () => void): () => void {
  window.addEventListener('popstate', cb); window.addEventListener('hashchange', cb); window.addEventListener('hk-nav', cb);
  return () => { window.removeEventListener('popstate', cb); window.removeEventListener('hashchange', cb); window.removeEventListener('hk-nav', cb); };
}
export function useRoute(): Route {
  const key = useSyncExternalStore(subscribeNav, () => location.pathname + '\n' + location.hash);
  return useMemo(() => { const [p, h] = key.split('\n'); return parseRoute(p!, h!); }, [key]);
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => { window.addEventListener('online', cb); window.addEventListener('offline', cb); return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb); }; },
    () => navigator.onLine,
  );
}
export const useOfflineReady = (): boolean => useSyncExternalStore(subscribeOffline, getOfflineReady);
export function usePwaInstall(): { canInstall: boolean; isInstalled: boolean } {
  const canInstall = useSyncExternalStore(subscribeInstall, canNativeInstall);
  const isInstalled = useSyncExternalStore(subscribeInstall, isStandaloneApp);
  return { canInstall, isInstalled };
}

export type ThemeMode = 'system' | 'light' | 'dark';
export function useTheme(): [ThemeMode, () => void] {
  const [mode, setMode] = useState<ThemeMode>(() => { try { return (localStorage.getItem('hk-theme') as ThemeMode) || 'system'; } catch { return 'system'; } });
  useEffect(() => {
    const apply = () => document.documentElement.classList.toggle('dark', mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches));
    apply();
    try { localStorage.setItem('hk-theme', mode); } catch { /* private mode */ }
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [mode]);
  const cycle = useCallback(() => setMode((m) => (m === 'system' ? 'light' : m === 'light' ? 'dark' : 'system')), []);
  return [mode, cycle];
}

/** Blob -> object URL that is revoked automatically. */
export function useObjectUrl(blob: Blob | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) { setUrl(null); return; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function useWakeLock(active: boolean): 'wakelock' | 'video' | 'none' | null {
  const [method, setMethod] = useState<'wakelock' | 'video' | 'none' | null>(null);
  useEffect(() => {
    if (!active) { setMethod(null); return; }
    let cancelled = false;
    let release = () => {};
    void acquireWakeLock().then((h) => { if (cancelled) h.release(); else { release = () => h.release(); setMethod(h.method); } });
    return () => { cancelled = true; release(); };
  }, [active]);
  return method;
}

/** True if the tab was ever hidden while `active` (mobile browsers pause background tabs). */
export function useWasHidden(active: boolean): boolean {
  const hidden = useRef(false);
  useEffect(() => {
    if (!active) return;
    const f = () => { if (document.hidden) hidden.current = true; };
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [active]);
  return hidden.current;
}

export function useCountdown(until: number | null): number | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (until === null) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [until]);
  return until === null ? null : Math.max(0, Math.ceil((until - now) / 1000));
}
