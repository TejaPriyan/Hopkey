import { useState } from 'react';
import type { Item } from '../lib/types.ts';
import { checkLimits } from '../lib/items.ts';
import { Composer } from '../components/Composer.tsx';
import { Notice, Segmented } from '../components/ui.tsx';
import { SendOnline } from './SendOnline.tsx';
import { SendOffline } from './SendOffline.tsx';

type Mode = 'online' | 'offline';
const EXPLAIN: Record<Mode, string> = {
  online: 'You get a 6-character code. The other device types it and the data travels straight between you. Needs internet on both.',
  offline: 'Your screen plays a looping QR animation and the other device scans it with its camera. No internet needed. Best for small things.',
};

export function SendPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [mode, setMode] = useState<Mode>('online');
  const [sharing, setSharing] = useState(false);
  const problem = checkLimits(items);

  if (sharing) {
    return mode === 'online'
      ? <SendOnline items={items} onBack={() => setSharing(false)} onSwitchOffline={() => setMode('offline')} />
      : <SendOffline items={items} setItems={(f) => setItems(f)} onBack={() => setSharing(false)} />;
  }
  return (
    <div className="grid gap-6">
      <h1 className="text-4xl">Send</h1>
      <Composer items={items} setItems={(f) => setItems(f)} />
      <section aria-label="How to deliver" className="grid gap-2">
        <h2 className="text-lg">How should it travel?</h2>
        <Segmented<Mode> label="Delivery mode" value={mode} onChange={setMode} options={[{ value: 'online', label: 'Online code' }, { value: 'offline', label: 'Offline QR' }]} />
        <p className="m-0 text-muted" aria-live="polite">{EXPLAIN[mode]}</p>
      </section>
      {problem && <Notice tone="error">{problem}</Notice>}
      <button type="button" className="btn btn-primary" disabled={items.length === 0 || !!problem} onClick={() => setSharing(true)}>
        {mode === 'online' ? 'Get a code' : 'Prepare QR animation'}
      </button>
    </div>
  );
}
