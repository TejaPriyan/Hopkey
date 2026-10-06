import { Link } from '../components/Link.tsx';
import { DownloadAppButton } from '../components/DownloadAppModal.tsx';

export function Home() {
  return (
    <div className="grid gap-8">
      <header className="hero-enter grid gap-3 pt-2">
        <h1 className="text-[clamp(2.6rem,12vw,4.5rem)]">Hop it across.</h1>
        <p className="m-0 max-w-[34ch] text-lg text-muted">Send text, links, images and files to any device. No accounts, and nothing is stored on a server.</p>
      </header>
      <div className="hero-cards grid gap-8 md:grid-cols-2">
        <Link to="/send" className="ticket ticket-gold block p-5 text-inherit no-underline">
          <h2 className="text-3xl">Send</h2>
          <p className="mb-5 mt-2">Add what you want to share, then pick a code or a QR animation.</p>
          <div className="stub pt-3 font-semibold">Start sharing →</div>
        </Link>
        <Link to="/receive" className="ticket block p-5 text-inherit no-underline">
          <h2 className="text-3xl">Receive</h2>
          <p className="mb-5 mt-2 text-muted">Type a 6-character code or scan a QR with your camera.</p>
          <div className="stub pt-3 font-semibold">Get something →</div>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border-2 border-line bg-surface p-4 sm:p-5">
        <div className="min-w-0 max-w-sm">
          <div className="flex items-center gap-2">
            <span className="font-bold text-ink">Install HOPKEY on your device</span>
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">PWA</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Launch instantly from your phone or desktop. Works offline in airplane mode with 1-tap access.
          </p>
        </div>
        <DownloadAppButton variant="hero" className="w-full sm:w-auto" />
      </div>

      <ul className="m-0 grid list-none gap-2 p-0 text-sm text-muted">
        <li><strong className="text-ink">Online code:</strong> devices connect directly over WebRTC, so files do not pass through a server.</li>
        <li><strong className="text-ink">Offline QR:</strong> works in airplane mode once this app has loaded. Best for small things.</li>
      </ul>
    </div>
  );
}

