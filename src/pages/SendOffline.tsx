import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Item } from '../lib/types.ts';
import { buildPayload } from '../lib/pipeline/payload.ts';
import type { BuiltPayload } from '../lib/pipeline/payload.ts';
import { buildInstant } from '../lib/pipeline/instant.ts';
import { PayloadError } from '../lib/pipeline/errors.ts';
import { FPS_DEFAULT, FPS_EFFICIENCY, QR_MAX_PAYLOAD_BYTES, QR_PRESETS, QR_WARN_PAYLOAD_BYTES } from '../lib/config.ts';
import type { Ecc } from '../lib/config.ts';
import { formatBytes, formatDuration } from '../lib/format.ts';
import { instantUrl } from '../lib/router.ts';
import { makeQr } from '../lib/qr/render.ts';
import { ImageOptimizer } from '../components/ImageOptimizer.tsx';
import { QrCanvas } from '../components/QrCanvas.tsx';
import { StreamPlayer } from '../components/StreamPlayer.tsx';
import { Notice, Segmented } from '../components/ui.tsx';

type PresetId = (typeof QR_PRESETS)[number]['id'];

export function SendOffline({ items, setItems, onBack }: { items: Item[]; setItems: (f: (p: Item[]) => Item[]) => void; onBack: () => void }) {
  const [presetId, setPresetId] = useState<PresetId>('balanced');
  const preset = QR_PRESETS.find((p) => p.id === presetId)!;
  const [ecc, setEcc] = useState<Ecc>(preset.ecc);
  const [fps, setFps] = useState(FPS_DEFAULT);
  const [passphrase, setPassphrase] = useState('');
  const [built, setBuilt] = useState<BuiltPayload | null>(null);
  const [instant, setInstant] = useState<string | null>(null);
  const [forceStream, setForceStream] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const images = items.filter((i) => i.kind === 'image' && i.blob);

  // Rebuild the payload (container -> compress -> optional AES-GCM) whenever the items or passphrase change.
  useEffect(() => {
    let cancelled = false;
    setBusy(true); setError(null);
    const t = setTimeout(async () => {
      try {
        const b = await buildPayload(items, { passphrase: passphrase || undefined });
        const inst = passphrase ? null : await buildInstant(items);
        if (!cancelled) { setBuilt(b); setInstant(inst); }
      } catch (e) {
        if (!cancelled) { setBuilt(null); setInstant(null); setError(e instanceof PayloadError && e.code === 'too-large' ? 'That is far too much data for QR codes.' : 'Could not prepare the data.'); }
      } finally { if (!cancelled) setBusy(false); }
    }, passphrase ? 450 : 120);
    return () => { cancelled = true; clearTimeout(t); };
  }, [items, passphrase]);

  const size = built?.payload.length ?? 0;
  const K = built ? Math.ceil(size / preset.blockSize) : 0;
  const seconds = K / (fps * FPS_EFFICIENCY);
  const tooBig = size > QR_MAX_PAYLOAD_BYTES;
  const showInstant = !!instant && !forceStream && !passphrase;
  const instantLink = useMemo(() => (instant ? instantUrl(instant) : null), [instant]);
  const instantQr = useMemo(() => (instantLink ? makeQr(instantLink, instantLink.length > 700 ? 'L' : 'M') : null), [instantLink]);

  if (playing && built && !tooBig) {
    return (
      <div className="grid gap-4">
        <h1 className="text-4xl">Scan this</h1>
        <StreamPlayer payload={built.payload} encrypted={built.encrypted} blockSize={preset.blockSize} ecc={ecc} onEcc={setEcc} fps={fps} onFps={setFps} onStop={() => setPlaying(false)} />
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <h1 className="text-4xl">Offline QR</h1>
      <p className="m-0 text-muted">Works in airplane mode once this app has loaded. Nothing leaves this screen except light.</p>

      {images.length > 0 && (
        <section aria-label="Image sizes" className="grid gap-2">
          <h2 className="text-lg">Images</h2>
          {images.map((img) => (
            <div key={img.id} className="panel p-3"><strong className="break-all">{img.name}</strong>
              <ImageOptimizer item={img} blockSize={preset.blockSize} fps={fps} onChange={(next) => setItems((prev) => prev.map((p) => (p.id === next.id ? next : p)))} /></div>
          ))}
        </section>
      )}

      {busy ? <p className="m-0" aria-live="polite">Preparing…</p> : error ? <Notice tone="error">{error}</Notice> : built && (
        showInstant && instantQr ? (
          <section className="ticket p-5" style={{ '--notch': '88%' } as CSSProperties} aria-label="Instant QR">
            <h2 className="text-2xl">One static QR</h2>
            <p className="mb-4 mt-1 text-muted">Small enough for a single code. Any phone camera app can scan it and open the text or link. The data sits after the # in the address, so it is never sent to a server.</p>
            <QrCanvas qr={instantQr} label="Static QR code containing your text or link" maxPx={420} />
            <div className="stub mt-5 grid gap-2 pt-3">
              <p className="m-0 text-sm text-muted">The scanning phone needs to open this site once (it works offline if the app is installed).</p>
              <button type="button" className="btn btn-sm justify-self-start" onClick={() => setForceStream(true)}>Use the animated stream instead</button>
            </div>
          </section>
        ) : (
          <section className="grid gap-4" aria-label="Animated stream setup">
            <div className="grid gap-1"><span className="font-semibold">Speed preset</span>
              <Segmented<PresetId> label="Speed preset" value={presetId} onChange={(v) => { setPresetId(v); setEcc(QR_PRESETS.find((p) => p.id === v)!.ecc); }} options={QR_PRESETS.map((p) => ({ value: p.id, label: p.label }))} />
              <p className="m-0 text-sm text-muted">{preset.hint}</p></div>
            <label className="grid gap-1 font-semibold">Passphrase (optional)
              <input type="password" className="field font-normal" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="Leave empty for no encryption" />
              <span className="text-sm font-normal text-muted">Encrypts with AES-256-GCM. Share the passphrase another way.</span></label>
            <dl className="panel m-0 grid grid-cols-2 gap-x-3 gap-y-1 p-3 text-sm sm:grid-cols-4">
              <div><dt className="text-muted">Payload</dt><dd className="m-0 font-bold">{formatBytes(size)}</dd></div>
              <div><dt className="text-muted">Blocks (K)</dt><dd className="m-0 font-bold">{K}</dd></div>
              <div><dt className="text-muted">Estimated time</dt><dd className="m-0 font-bold">≈ {formatDuration(seconds)}</dd></div>
              <div><dt className="text-muted">Packing</dt><dd className="m-0 font-bold">{built.compressed ? 'compressed' : 'as is'}{built.encrypted ? ' + encrypted' : ''}</dd></div>
            </dl>
            {tooBig && <Notice tone="error" title="Too large for QR">The limit is {formatBytes(QR_MAX_PAYLOAD_BYTES)} after compression. Remove something, shrink the images, or use Online code.</Notice>}
            {!tooBig && size > QR_WARN_PAYLOAD_BYTES && <Notice tone="warn" title="This will take a while">Over {formatBytes(QR_WARN_PAYLOAD_BYTES)} means several minutes of steady holding. Shrink images or use Online code.</Notice>}
            <p className="m-0 text-sm text-muted">The receiver can start scanning at any point in the loop.</p>
          </section>
        )
      )}

      <div className="flex gap-2">
        <button type="button" className="btn btn-quiet" onClick={onBack}>Back</button>
        {!(showInstant && instantQr) && <button type="button" className="btn btn-primary flex-1" disabled={busy || !!error || !built || tooBig} onClick={() => setPlaying(true)}>Start the QR animation</button>}
      </div>
    </div>
  );
}
