import { useRef, useState } from 'react';
import { LtEncoder } from '../lib/lt/encoder.ts';
import { LtDecoder } from '../lib/lt/decoder.ts';
import { textToFrame } from '../lib/lt/frame.ts';
import { buildPayload, openPayload } from '../lib/pipeline/payload.ts';
import { fileItem, textItem } from '../lib/items.ts';
import { QR_PRESETS } from '../lib/config.ts';
import { BlockGrid } from '../components/BlockGrid.tsx';
import { formatBytes } from '../lib/format.ts';
import { blobBytes } from '../lib/bytes.ts';

/** DEV ONLY (/dev/loopback): feeds encoder frames straight into the decoder with simulated loss. No camera needed. */
export function Loopback() {
  const [kb, setKb] = useState(64);
  const [loss, setLoss] = useState(30);
  const [bs, setBs] = useState(500);
  const [pass, setPass] = useState('');
  const [, bump] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const dec = useRef(new LtDecoder());
  const running = useRef(false);

  const run = async () => {
    if (running.current) return;
    running.current = true; setLog([]);
    const bytes = new Uint8Array(kb * 1024);
    for (let o = 0; o < bytes.length; o += 65536) crypto.getRandomValues(bytes.subarray(o, Math.min(bytes.length, o + 65536)));
    const items = [textItem('loopback test'), fileItem(new File([bytes], 'random.bin'))];
    const built = await buildPayload(items, { passphrase: pass || undefined });
    const enc = new LtEncoder(built.payload, { blockSize: bs });
    dec.current = new LtDecoder();
    let sent = 0, got = 0;
    const lines = [`payload ${formatBytes(built.payload.length)}, K=${enc.K}, compressed=${built.compressed}, encrypted=${built.encrypted}`];
    while (!dec.current.complete && sent < enc.K * 20 + 100) {
      for (let i = 0; i < 40 && !dec.current.complete; i++) {
        const text = enc.nextText(); sent++;
        if (Math.random() * 100 < loss) continue;
        const f = textToFrame(text); if (!f) continue;
        got++; dec.current.addFrame(f);
      }
      bump((n) => n + 1);
      await new Promise((r) => setTimeout(r, 16));
    }
    if (!dec.current.complete) lines.push('FAILED to decode');
    else {
      const out = await openPayload(dec.current.payload(), pass || undefined);
      const same = out[1] && (await blobBytes(out[1].blob!)).every((v, i) => v === bytes[i]) && out[1].size === bytes.length;
      lines.push(`decoded after ${sent} frames sent, ${got} received (${(got / enc.K).toFixed(2)}×K). Round trip ${same ? 'OK ✓' : 'MISMATCH ✗'}`);
    }
    setLog(lines); running.current = false; bump((n) => n + 1);
  };

  const d = dec.current;
  return (
    <div className="grid gap-4">
      <h1 className="text-3xl">Loopback (dev)</h1>
      <label className="grid gap-1">Random file: {kb} KB<input type="range" min={1} max={1024} value={kb} onChange={(e) => setKb(Number(e.target.value))} /></label>
      <label className="grid gap-1">Packet loss: {loss}%<input type="range" min={0} max={90} value={loss} onChange={(e) => setLoss(Number(e.target.value))} /></label>
      <label className="grid gap-1">Block size
        <select className="field" value={bs} onChange={(e) => setBs(Number(e.target.value))}>{QR_PRESETS.map((p) => <option key={p.id} value={p.blockSize}>{p.label} ({p.blockSize} B)</option>)}</select></label>
      <label className="grid gap-1">Passphrase (optional)<input className="field" value={pass} onChange={(e) => setPass(e.target.value)} /></label>
      <button className="btn btn-primary" onClick={() => void run()}>Run</button>
      {d.K > 0 && <><p className="m-0">{d.solvedCount}/{d.K} blocks ({Math.round(d.progress * 100)}%)</p><BlockGrid solved={d.solved} K={d.K} /></>}
      {log.map((l) => <p key={l} className="mono m-0 text-sm">{l}</p>)}
    </div>
  );
}
