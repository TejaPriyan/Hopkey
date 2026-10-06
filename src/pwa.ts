import { registerSW } from 'virtual:pwa-register';

// "Offline ready" = the service worker has precached the whole app (first install) or is already controlling this page.
let ready = typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
const subs = new Set<() => void>();
export const subscribeOffline = (f: () => void): (() => void) => { subs.add(f); return () => subs.delete(f); };
export const getOfflineReady = (): boolean => ready;

export function initPwa(): void {
  registerSW({ immediate: true, onOfflineReady() { ready = true; subs.forEach((f) => f()); } });
}
