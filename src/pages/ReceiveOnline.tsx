import { useEffect, useReducer, useRef, useState } from 'react';
import { ReceiverSession } from '../lib/sessions.ts';
import type { SinkFactory } from '../lib/sessions.ts';
import { TransportError } from '../lib/transport.ts';
import { createTransport } from '../lib/transportFactory.ts';
import { formatCode, peerIdFor } from '../lib/code.ts';
import { describeSessionError, describeTransportError } from '../lib/messages.ts';
import { canStreamToDisk, openFsSink, pickSaveFolder } from '../lib/chunker.ts';
import { STREAM_TO_DISK_MIN, WARN_MEMORY_BYTES } from '../lib/config.ts';
import { formatBytes } from '../lib/format.ts';
import { useOnline, useWasHidden } from '../hooks.ts';
import { ItemResults } from '../components/results.tsx';
import { Notice, ProgressBar, Steps, SuccessMark } from '../components/ui.tsx';

const STEPS = [{ id: 'c', label: 'Connecting' }, { id: 'a', label: 'Allowed' }, { id: 'r', label: 'Receiving' }, { id: 'd', label: 'Done' }];
const ICON = { text: '✎', link: '🔗', image: '🖼', file: '📄' } as const;

export function ReceiveOnline({ code, onExit, onUseQr }: { code: string; onExit: () => void; onUseQr: () => void }) {
  const online = useOnline();
  const [pin, setPin] = useState<string | undefined>();
  const [pinDraft, setPinDraft] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [rx, setRx] = useState<ReceiverSession | null>(null);
  const [, force] = useReducer((n: number) => n + 1, 0);
  const sessionRef = useRef<ReceiverSession | null>(null);
  const hidden = useWasHidden(true);

  useEffect(() => {
    if (!navigator.onLine) return;
    let cancelled = false;
    setConnectError(null); setRx(null);
    createTransport().connect(peerIdFor(code)).then((conn) => {
      if (cancelled) { conn.close(); return; }
      const s = new ReceiverSession(conn, { pin }, () => force());
      sessionRef.current = s;
      setRx(s);
      s.start();
    }).catch((e: unknown) => { if (!cancelled) setConnectError(describeTransportError(e instanceof TransportError ? e.kind : 'unknown')); });
    return () => { cancelled = true; sessionRef.current?.cancel(); sessionRef.current = null; };
  }, [code, pin, attempt]);

  const retry = () => setAttempt((n) => n + 1);
  const prevOnline = useRef(online);
  useEffect(() => { if (online && !prevOnline.current && !sessionRef.current) retry(); prevOnline.current = online; }, [online]);
  const state = rx?.state ?? 'handshake';

  if (!online) {
    return <Notice tone="warn" title="Needs internet. Try Offline QR instead" action={<button type="button" className="btn btn-sm btn-primary" onClick={onUseQr}>Scan a QR instead</button>}>Online code uses the internet to connect the two devices.</Notice>;
  }
  if (connectError) {
    return (
      <div className="grid gap-4">
        <Notice tone="error" title="Could not connect">{connectError}</Notice>
        <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-primary" onClick={retry}>Try again</button><button type="button" className="btn" onClick={onExit}>Use a different code</button><button type="button" className="btn btn-quiet" onClick={onUseQr}>Scan a QR instead</button></div>
      </div>
    );
  }

  if (rx && state === 'rejected' && (rx.error === 'pin-required' || rx.error === 'bad-pin')) {
    return (
      <form className="panel grid gap-3" onSubmit={(e) => { e.preventDefault(); if (/^\d{4}$/.test(pinDraft)) { setPin(pinDraft); setAttempt((n) => n + 1); } }}>
        <label htmlFor="pin" className="text-lg font-bold">Enter the 4-digit PIN</label>
        {rx.error === 'bad-pin' && <Notice tone="error">That PIN is not correct.</Notice>}
        <input id="pin" className="field mono text-center text-3xl tracking-[.5em]" inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="off" value={pinDraft} onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, ''))} autoFocus />
        <div className="flex gap-2"><button className="btn btn-primary flex-1" disabled={pinDraft.length !== 4}>Join</button><button type="button" className="btn" onClick={onExit}>Cancel</button></div>
      </form>
    );
  }

  const stepIdx = state === 'handshake' ? 0 : state === 'review' ? 1 : state === 'receiving' ? 2 : state === 'done' ? 3 : 0;
  const failed = state === 'failed' || state === 'rejected' || state === 'cancelled';
  const files = rx?.manifest.filter((m) => m.kind === 'image' || m.kind === 'file') ?? [];
  const big = (rx?.totalBytes ?? 0) >= STREAM_TO_DISK_MIN;

  const accept = async (toDisk: boolean) => {
    if (!rx) return;
    let sinks: SinkFactory | undefined;
    if (toDisk) {
      const dir = await pickSaveFolder(); // must run inside the click handler
      if (!dir) return;
      sinks = (m) => openFsSink(dir, m.name);
    }
    await rx.accept(sinks);
  };

  return (
    <div className="grid gap-4">
      <p className="m-0 text-muted">Code <strong className="mono text-ink">{formatCode(code)}</strong></p>
      <Steps steps={STEPS} current={stepIdx} failed={failed} />

      {state === 'handshake' && <p className="m-0 text-lg" aria-live="polite">{rx ? 'Waiting for the sender to allow this device…' : 'Connecting to the sender…'}</p>}

      {state === 'review' && rx && (
        <div className="panel grid gap-3">
          <h2 className="text-2xl">Incoming: {rx.manifest.length} item{rx.manifest.length === 1 ? '' : 's'}</h2>
          <ul className="m-0 grid list-none gap-1 p-0">
            {rx.manifest.map((m) => <li key={m.id} className="flex items-center gap-2 break-all"><span aria-hidden>{ICON[m.kind]}</span><span className="flex-1">{m.kind === 'text' ? 'Text' : m.kind === 'link' ? 'Link' : m.name}</span><span className="text-sm text-muted">{formatBytes(m.size)}</span></li>)}
          </ul>
          {rx.totalBytes >= WARN_MEMORY_BYTES && <Notice tone="warn" title="Very large transfer">{canStreamToDisk() ? 'Save to a folder so the browser does not have to hold it all in memory.' : 'This browser must keep everything in memory, which may fail above about 500 MB.'}</Notice>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => void accept(false)}>Accept</button>
            {files.length > 0 && big && canStreamToDisk() && <button type="button" className="btn btn-gold" onClick={() => void accept(true)}>Accept and save to a folder</button>}
            <button type="button" className="btn" onClick={() => rx.decline()}>Decline</button>
          </div>
        </div>
      )}

      {state === 'receiving' && rx && (<>
        <ProgressBar label="Receiving" value={rx.totalBytes ? rx.received / rx.totalBytes : 1} />
        <p className="m-0 text-sm text-muted">{formatBytes(rx.received)} of {formatBytes(rx.totalBytes)}. Keep this tab open and in front.</p>
        <button type="button" className="btn btn-quiet justify-self-start" onClick={() => rx.cancel()}>Cancel</button>
      </>)}

      {state === 'done' && rx && (<>
        <SuccessMark label="Received and verified" />
        <ItemResults items={rx.items} />
        <button type="button" className="btn justify-self-start" onClick={onExit}>Receive another</button>
      </>)}

      {failed && rx && (
        <div className="grid gap-3">
          <Notice tone="error" title={state === 'rejected' ? 'Not accepted' : state === 'cancelled' ? 'Cancelled' : 'Transfer failed'}>{describeSessionError(rx.error, hidden)}</Notice>
          <div className="flex gap-2"><button type="button" className="btn btn-primary" onClick={retry}>Try again</button><button type="button" className="btn" onClick={onExit}>Use a different code</button></div>
        </div>
      )}
    </div>
  );
}
