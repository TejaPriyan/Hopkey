import { useEffect, useState } from 'react';
import type { Item } from '../lib/types.ts';
import { parseInstant } from '../lib/pipeline/instant.ts';
import { ItemResults } from '../components/results.tsx';
import { Notice, SuccessMark } from '../components/ui.tsx';
import { Link } from '../components/Link.tsx';

/** Opened by scanning an Instant QR with any camera app: decodes the fragment locally, shows it as plain text/links. */
export function InstantPage({ payload }: { payload: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setItems(null); setFailed(false); parseInstant(payload).then(setItems).catch(() => setFailed(true)); }, [payload]);
  return (
    <div className="grid gap-5">
      <h1 className="text-4xl">Someone sent you this</h1>
      {failed && <Notice tone="error" title="Could not read this QR">It may be damaged or from a different version.</Notice>}
      {!items && !failed && <p className="m-0" aria-live="polite">Opening…</p>}
      {items && (<><SuccessMark label="Received" /><ItemResults items={items} /></>)}
      <p className="m-0 text-sm text-muted">This was decoded on your device. The data was in the part of the address after # and is never sent to a server.</p>
      <Link to="/" className="btn justify-self-start no-underline">Back to HOPKEY</Link>
    </div>
  );
}
