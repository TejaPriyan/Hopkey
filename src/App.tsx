import { lazy, Suspense } from 'react';
import { useOfflineReady, useRoute, useTheme } from './hooks.ts';
import { Link } from './components/Link.tsx';
import { DownloadAppButton } from './components/DownloadAppModal.tsx';
import { BuyMeCoffee } from './components/BuyMeCoffee.tsx';
import { Home } from './pages/Home.tsx';
import { SendPage } from './pages/Send.tsx';
import { ReceivePage } from './pages/Receive.tsx';
import { InstantPage } from './pages/Instant.tsx';
import { Notice } from './components/ui.tsx';

// The loopback page only exists in dev builds; the dead branch is removed from production bundles.
const Loopback = import.meta.env.DEV ? lazy(() => import('./dev/Loopback.tsx').then((m) => ({ default: m.Loopback }))) : null;

export function App() {
  const route = useRoute();
  const offlineReady = useOfflineReady();
  const [theme, cycleTheme] = useTheme();

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="mb-6 flex items-center justify-between gap-2">
        <Link to="/" className="flex items-center gap-2 text-inherit no-underline" ariaLabel="HOPKEY home">
          <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width="32" height="32" />
          <span className="text-xl font-extrabold tracking-tight">HOPKEY</span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {offlineReady && <span className="hidden md:inline-flex rounded-full border-2 border-ok px-2.5 py-0.5 text-xs font-semibold text-ok" title="Everything is cached, so Offline QR works without a connection"><span aria-hidden>✓ </span>Offline ready</span>}
          <DownloadAppButton />
          <button type="button" className="theme-toggle btn btn-quiet btn-sm" onClick={cycleTheme} aria-label={`Theme: ${theme}. Switch theme`}>
            <span className="theme-icon" key={theme}>
              {theme === 'light' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              ) : theme === 'dark' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
              )}
            </span>
            {theme === 'system' ? 'Auto' : theme === 'dark' ? 'Dark' : 'Light'}
          </button>
        </div>
      </header>
      <main className="flex-1">
        {route.name === 'home' && <Home />}
        {route.name === 'send' && <SendPage />}
        {route.name === 'receive' && <ReceivePage />}
        {route.name === 'join' && <ReceivePage key={route.code} initialCode={route.code} />}
        {route.name === 'instant' && <InstantPage payload={route.payload} />}
        {route.name === 'loopback' && (Loopback ? <Suspense fallback={<p>Loading…</p>}><Loopback /></Suspense> : <Notice tone="info">The loopback page is only available in dev builds.</Notice>)}
        {route.name === 'notfound' && <div className="grid gap-3"><h1 className="text-4xl">Page not found</h1><Link to="/" className="btn justify-self-start no-underline">Go home</Link></div>}
      </main>

      <BuyMeCoffee />

      <footer className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-line/60 pt-4 text-xs text-muted">
        <div>No accounts. No uploads to a server. Online code needs internet; Offline QR does not.</div>
        <div className="text-[11px] opacity-75">
          By <span className="font-semibold text-ink">Teja Priyan</span>
        </div>
      </footer>

      {/* Very tiny bottom corner badge (plain text, no link) */}
      <div className="fixed bottom-2 right-3 z-30 pointer-events-none select-none print:hidden">
        <div
          className="inline-flex items-center gap-1 rounded-full border border-line bg-surface/85 px-2 py-0.5 text-[10px] font-medium tracking-tight text-muted shadow-xs backdrop-blur-xs"
        >
          <span className="opacity-60">By</span>
          <span className="font-semibold text-ink">Teja Priyan</span>
        </div>
      </div>
    </div>
  );
}


