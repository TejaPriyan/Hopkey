import { registerSW } from 'virtual:pwa-register';

// "Offline ready" = the service worker has precached the whole app (first install) or is already controlling this page.
let ready = typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
const subs = new Set<() => void>();
export const subscribeOffline = (f: () => void): (() => void) => { subs.add(f); return () => subs.delete(f); };
export const getOfflineReady = (): boolean => ready;

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installSubs = new Set<() => void>();
const notifyInstallSubs = () => { installSubs.forEach((f) => f()); };

export const subscribeInstall = (f: () => void): (() => void) => {
  installSubs.add(f);
  return () => installSubs.delete(f);
};

export const canNativeInstall = (): boolean => deferredPrompt !== null;

export const isStandaloneApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as unknown as { standalone?: boolean }).standalone)
  );
};

export async function promptInstallApp(): Promise<'accepted' | 'dismissed' | 'manual'> {
  if (deferredPrompt) {
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      notifyInstallSubs();
      return choice.outcome;
    } catch {
      return 'manual';
    }
  }
  return 'manual';
}

export function initPwa(): void {
  registerSW({ immediate: true, onOfflineReady() { ready = true; subs.forEach((f) => f()); } });

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      notifyInstallSubs();
    });

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      notifyInstallSubs();
    });
  }
}

