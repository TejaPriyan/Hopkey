import { Link } from '../components/Link.tsx';

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
      <ul className="m-0 grid list-none gap-2 p-0 text-sm text-muted">
        <li><strong className="text-ink">Online code:</strong> devices connect directly over WebRTC, so files do not pass through a server.</li>
        <li><strong className="text-ink">Offline QR:</strong> works in airplane mode once this app has loaded. Best for small things.</li>
      </ul>
    </div>
  );
}
