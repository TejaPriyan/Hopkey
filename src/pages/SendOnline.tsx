import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Item } from '../lib/types.ts';
import { SenderHost } from '../lib/senderHost.ts';
import type { HostSnapshot } from '../lib/senderHost.ts';
import { createTransport } from '../lib/transportFactory.ts';
import { formatCode, generatePin } from '../lib/code.ts';
import { joinUrl } from '../lib/router.ts';
import { makeQr } from '../lib/qr/render.ts';
import { describeSessionError, describeTransportError } from '../lib/messages.ts';
import { MAX_RECEIVERS } from '../lib/config.ts';
import { formatBytes } from '../lib/format.ts';
import { useCountdown, useOnline, useWakeLock, useWasHidden } from '../hooks.ts';
import { CodeDisplay } from '../components/CodeDisplay.tsx';
import { QrCanvas } from '../components/QrCanvas.tsx';
import { CopyButton, Notice, ProgressBar, Steps } from '../components/ui.tsx';

const STEPS = [{ id: 'wait', label: 'Waiting' }, { id: 'conn', label: 'Connected' }, { id: 'send', label: 'Sending' }, { id: 'done', label: 'Done' }];
const STEP_OF: Record<HostSnapshot['status'], number> = { starting: 0, waiting: 0, connected: 1, sending: 2, done: 3, expired: 0, error: 0 };

export function SendOnline({ items, onBack, onSwitchOffline }: { items: Item[]; onBack: () => void; onSwitchOffline: () => void }) {
  const online = useOnline();
  const [started, setStarted] = useState(false);
  const [usePin, setUsePin] = useState(false);
  const [pin, setPin] = useState(() => generatePin());
  const [receivers, setReceivers] = useState(1);
  const [snap, setSnap] = useState<HostSnapshot | null>(null);
  const host = useRef<SenderHost | null>(null);

  useEffect(() => {
    if (!started) return;
    const h = new SenderHost(createTransport(), items, { pin: usePin ? pin : undefined, maxReceivers: receivers }, setSnap);
    host.current = h;
    void h.start();
    return () => { h.stop(); host.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  const active = !!snap && ['waiting', 'connected', 'sending'].includes(snap.status);
  const wake = useWakeLock(active);
  const hidden = useWasHidden(active);
  const left = useCountdown(snap?.status === 'waiting' ? snap.expiresAt : null);
  const joinLink = useMemo(() => (snap?.code ? joinUrl(snap.code) : null), [snap?.code]);
  const qr = useMemo(() => (joinLink ? makeQr(joinLink, 'M') : null), [joinLink]);
  const total = items.reduce((n, i) => n + i.size, 0);

  const offlineNotice = (!online || (snap?.status === 'error' && ['offline', 'signaling', 'timeout'].includes(snap.error ?? ''))) && (
    <Notice tone="warn" title="Needs internet. Try Offline QR instead"
      action={<button type="button" className="btn btn-sm btn-primary" onClick={() => { host.current?.stop(); onSwitchOffline(); }}>Switch to Offline QR</button>}>
      Online code uses the internet to introduce the two devices.
    </Notice>
  );

  if (!started) {
    return (
      <div className="grid gap-5">
        <h1 className="text-4xl">Online code</h1>
        <p className="m-0 text-muted">{items.length} item{items.length === 1 ? '' : 's'} · {formatBytes(total)}</p>
        {offlineNotice}
        <fieldset className="panel grid gap-3">
          <legend className="px-1 font-semibold">Options</legend>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={usePin} onChange={(e) => { setUsePin(e.target.checked); if (e.target.checked) setPin(generatePin()); }} /> Require a 4-digit PIN</label>
          {usePin && <p className="m-0 text-sm">PIN: <strong className="mono text-xl tracking-widest">{pin}</strong> <span className="text-muted">Tell the receiver separately from the code.</span></p>}
          <label className="flex items-center gap-2">Allow up to
            <select className="field w-auto py-1" value={receivers} onChange={(e) => setReceivers(Number(e.target.value))}>{Array.from({ length: MAX_RECEIVERS }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>
            device{receivers === 1 ? '' : 's'}</label>
        </fieldset>
        <div className="flex gap-2">
          <button type="button" className="btn btn-quiet" onClick={onBack}>Back</button>
          <button type="button" className="btn btn-primary flex-1" disabled={!online} onClick={() => setStarted(true)}>Create code</button>
        </div>
      </div>
    );
  }

  const status = snap?.status ?? 'starting';
  const failed = status === 'error' || status === 'expired';
  const pending = snap?.sessions.filter((s) => s.state === 'pending') ?? [];
  const label = (id: string) => `Device ${(snap?.sessions.findIndex((s) => s.id === id) ?? 0) + 1}`;

  return (
    <div className="grid gap-5">
      <h1 className="text-4xl">Your code</h1>
      {offlineNotice}
      {snap?.code ? (
        <div className="ticket ticket-gold p-5" style={{ '--notch': '70%' } as CSSProperties}>
          <CodeDisplay code={snap.code} />
          <div className="stub mt-5 flex flex-wrap items-center justify-between gap-2 pt-3">
            <span className="text-sm font-semibold">{left !== null ? `Expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} if unclaimed` : status === 'done' ? 'Finished' : 'In use'}</span>
            <CopyButton text={formatCode(snap.code)} label="Copy code" />
          </div>
        </div>
      ) : !failed && <p className="m-0 text-lg" aria-live="polite">Getting a code…</p>}

      <Steps steps={STEPS} current={STEP_OF[status]} failed={failed} />

      {status === 'expired' && <Notice tone="error" title="Code expired">Nobody joined within 10 minutes. Create a new code.</Notice>}
      {status === 'error' && !offlineNotice && <Notice tone="error" title="Could not share">{describeTransportError(snap?.error ?? 'unknown')}</Notice>}

      {pending.map((s) => (
        <div key={s.id} role="alertdialog" aria-label="Allow this device?" className="panel grid gap-3 border-brand">
          <p className="m-0 text-lg font-bold">Allow this device?</p>
          <p className="m-0 text-muted">{label(s.id)} wants to receive {items.length} item{items.length === 1 ? '' : 's'} ({formatBytes(total)}). Only allow it if you just shared the code with someone.</p>
          <div className="flex gap-2"><button type="button" className="btn btn-primary" onClick={() => host.current?.approve(s.id)}>Allow</button><button type="button" className="btn" onClick={() => host.current?.deny(s.id)}>Deny</button></div>
        </div>
      ))}

      {snap?.sessions.filter((s) => s.state === 'offered').map((s) => <p key={s.id} className="m-0" aria-live="polite">{label(s.id)} is looking at your offer…</p>)}
      {snap?.sessions.filter((s) => s.state === 'sending').map((s) => <ProgressBar key={s.id} label={`Sending to ${label(s.id)}`} value={s.total ? s.sent / s.total : 1} />)}
      {snap?.sessions.filter((s) => s.error && s.state !== 'pending').map((s) => <Notice key={s.id} tone="warn" title={label(s.id)}>{describeSessionError(s.error, hidden)}</Notice>)}
      {status === 'done' && snap?.allOk && <Notice tone="ok" title="Delivered">Everything arrived and every file passed its SHA-256 check.</Notice>}

      {snap?.code && qr && (
        <details className="panel">
          <summary className="cursor-pointer font-semibold">Show a QR for this code</summary>
          <div className="mt-3 grid gap-2">
            <QrCanvas qr={qr} label={`QR code that opens the join link for code ${formatCode(snap.code)}`} maxPx={300} />
            <p className="m-0 text-sm text-muted">The receiver can scan it with their camera or in this app. It only contains the code, not your data.</p>
            <CopyButton text={joinLink ?? ''} label="Copy join link" className="justify-self-start" />
          </div>
        </details>
      )}

      {active && <Notice tone="warn" title="Keep this tab open until the transfer finishes.">{wake === 'none' ? 'Could not keep the screen awake. Turn off auto-lock for now.' : 'Your screen is being kept awake.'} The data comes from this page, so closing it stops the transfer.</Notice>}

      <div className="flex gap-2">
        <button type="button" className="btn" onClick={() => { host.current?.stop(); setStarted(false); setSnap(null); if (status === 'done') onBack(); }}>{status === 'done' ? 'Finish' : 'Stop sharing'}</button>
      </div>
    </div>
  );
}
