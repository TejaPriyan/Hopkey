import { useState } from 'react';
import { usePwaInstall } from '../hooks.ts';
import { promptInstallApp } from '../pwa.ts';

export function DownloadAppButton({ className = '', variant = 'header' }: { className?: string; variant?: 'header' | 'hero' }) {
  const { canInstall, isInstalled } = usePwaInstall();
  const [showModal, setShowModal] = useState(false);

  const handleClick = async () => {
    if (canInstall) {
      const outcome = await promptInstallApp();
      if (outcome === 'manual') setShowModal(true);
    } else {
      setShowModal(true);
    }
  };

  if (isInstalled && variant === 'header') {
    return (
      <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-ok/40 bg-ok/10 px-2.5 py-1 text-xs font-semibold text-ok" title="HOPKEY is running as an installed app">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        App Installed
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          variant === 'hero'
            ? `inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-surface px-5 py-3 font-semibold text-ink shadow-[3px_3px_0_var(--ink)] transition-transform hover:-translate-y-0.5 active:translate-y-0 ${className}`
            : `btn btn-quiet btn-sm flex items-center gap-1.5 font-medium ${className}`
        }
        aria-label="Download and install HOPKEY app"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span>Download App</span>
      </button>

      {showModal && <DownloadAppModal onClose={() => setShowModal(false)} />}
    </>
  );
}

export function DownloadAppModal({ onClose }: { onClose: () => void }) {
  const { canInstall, isInstalled } = usePwaInstall();

  const handleNativePrompt = async () => {
    const outcome = await promptInstallApp();
    if (outcome === 'accepted') onClose();
  };

  const handleDownloadShortcut = () => {
    const shortcutHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>HOPKEY</title>
  <meta http-equiv="refresh" content="0; url=https://hopkey.vercel.app/">
  <script>location.href = "https://hopkey.vercel.app/";</script>
</head>
<body style="font-family:sans-serif;text-align:center;padding:40px;">
  <h2>Launching HOPKEY...</h2>
  <p><a href="https://hopkey.vercel.app/">Click here if not redirected automatically.</a></p>
</body>
</html>`;
    const blob = new Blob([shortcutHtml], { type: 'text/html' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = 'HOPKEY-Launch.html';
    a.click();
    URL.revokeObjectURL(u);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs animate-in fade-in" role="dialog" aria-modal="true" aria-labelledby="download-modal-title">
      <div className="relative w-full max-w-md rounded-3xl border-2 border-ink bg-surface p-6 shadow-[6px_6px_0_var(--ink)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface2 hover:text-ink font-bold text-lg"
          aria-label="Close dialog"
        >
          ×
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand text-white shadow-sm">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <div>
            <h2 id="download-modal-title" className="text-xl font-bold tracking-tight">Install HOPKEY App</h2>
            <p className="text-xs text-muted">Use offline &amp; launch directly from your home screen</p>
          </div>
        </div>

        {isInstalled ? (
          <div className="rounded-2xl border-2 border-ok bg-ok/10 p-4 text-center my-4">
            <p className="font-semibold text-ok">HOPKEY is already installed on this device!</p>
            <p className="text-xs text-muted mt-1">You can open it anytime from your applications or home screen.</p>
          </div>
        ) : canInstall ? (
          <div className="my-5 grid gap-3">
            <p className="text-sm text-ink">
              Your browser supports direct installation. Click below to add HOPKEY to your device:
            </p>
            <button
              type="button"
              onClick={handleNativePrompt}
              className="btn btn-primary w-full justify-center py-3 text-base font-bold shadow-md"
            >
              Install HOPKEY Now
            </button>
          </div>
        ) : (
          <div className="my-4 grid gap-3 text-sm">
            <div className="rounded-2xl border border-line bg-surface2 p-3.5">
              <div className="flex items-center gap-2 font-semibold text-ink mb-1">
                <span>🍏 iOS / iPhone / iPad</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Tap the <strong className="text-ink">Share</strong> button (box with upward arrow) in Safari, then scroll down and tap <strong className="text-ink">Add to Home Screen</strong>.
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-surface2 p-3.5">
              <div className="flex items-center gap-2 font-semibold text-ink mb-1">
                <span>💻 Chrome / Edge / Windows / Mac</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Click the <strong className="text-ink">Install</strong> icon in the address bar (or Menu ⋮ &gt; <strong className="text-ink">Save and Share</strong> &gt; <strong className="text-ink">Install HOPKEY</strong>).
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-surface2 p-3.5">
              <div className="flex items-center gap-2 font-semibold text-ink mb-1">
                <span>🤖 Android</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Tap the browser menu (⋮) in Chrome and choose <strong className="text-ink">Install app</strong> or <strong className="text-ink">Add to Home screen</strong>.
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleDownloadShortcut}
            className="text-xs font-medium text-brand hover:underline flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download launcher shortcut (.html)
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-quiet btn-sm text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
