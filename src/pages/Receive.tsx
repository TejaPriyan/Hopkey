import { useState } from 'react';
import { isValidCode, normalizeCode } from '../lib/code.ts';
import { CodeInput } from '../components/CodeInput.tsx';
import { Notice, Tabs } from '../components/ui.tsx';
import { useOnline } from '../hooks.ts';
import { ReceiveOnline } from './ReceiveOnline.tsx';
import { ScanPanel } from './ScanPanel.tsx';

type Tab = 'code' | 'scan';

export function ReceivePage({ initialCode }: { initialCode?: string }) {
  const clean = initialCode ? normalizeCode(initialCode) : '';
  const [tab, setTab] = useState<Tab>('code');
  const [code, setCode] = useState<string | null>(clean && isValidCode(clean) ? clean : null);
  const online = useOnline();
  const badLink = !!initialCode && !(clean && isValidCode(clean));

  return (
    <div className="grid gap-5">
      <h1 className="text-4xl">Receive</h1>
      <Tabs<Tab> label="How are you receiving?" value={tab} onChange={setTab} tabs={[{ value: 'code', label: 'Enter code' }, { value: 'scan', label: 'Scan QR' }]} />
      {tab === 'code' ? (
        <div role="tabpanel" id="panel-code" aria-labelledby="tab-code" className="grid gap-4">
          {code ? <ReceiveOnline code={code} onExit={() => setCode(null)} onUseQr={() => { setCode(null); setTab('scan'); }} /> : (
            <>
              {badLink && <Notice tone="error">That link does not contain a valid code. Type the code instead.</Notice>}
              {!online && <Notice tone="warn" title="Needs internet. Try Offline QR instead" action={<button type="button" className="btn btn-sm btn-primary" onClick={() => setTab('scan')}>Scan a QR</button>}>Online code uses the internet to connect the two devices.</Notice>}
              <p className="m-0 text-muted">Ask the sender for their 6-character code.</p>
              <CodeInput onComplete={setCode} initial={clean} />
            </>
          )}
        </div>
      ) : (
        <div role="tabpanel" id="panel-scan" aria-labelledby="tab-scan">
          <ScanPanel onJoin={(c) => { setCode(c); setTab('code'); }} onInstant={(p) => { location.hash = `#/q/${p}`; }} />
        </div>
      )}
    </div>
  );
}
