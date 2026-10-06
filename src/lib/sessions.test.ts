import { describe, expect, it } from 'vitest';
import { MockNetwork } from './mockTransport.ts';
import { SenderHost } from './senderHost.ts';
import type { HostSnapshot } from './senderHost.ts';
import { ReceiverSession } from './sessions.ts';
import { TransportError } from './transport.ts';
import { decodeChunk, encodeChunk, parseCtrl } from './protocol.ts';
import { BlobSink, Reassembler, readChunks } from './chunker.ts';
import { Sha256 } from './sha256.ts';
import { fileItem, linkItem, textItem } from './items.ts';
import { blobBytes } from './bytes.ts';
import { BUFFER_HIGH, CHUNK_SIZE } from './config.ts';
import { fileOf, randomData, rejection, seededRandom, waitFor } from './testUtils.ts';
import { peerIdFor } from './code.ts';

async function setup(opts: { pin?: string; max?: number; ttlMs?: number; fileSize?: number } = {}) {
  const net = new MockNetwork();
  const data = randomData(opts.fileSize ?? 100_000, seededRandom(1));
  const items = [textItem('hello'), linkItem(new URL('https://example.com/x')), fileItem(fileOf(data, 'data.bin'))];
  let snap: HostSnapshot | null = null;
  const host = new SenderHost(net.transport(), items, { pin: opts.pin, maxReceivers: opts.max, ttlMs: opts.ttlMs }, (s) => (snap = s));
  await host.start();
  return { net, host, data, snap: () => snap!, code: () => snap!.code! };
}
async function join(net: MockNetwork, code: string, pin?: string) {
  const conn = await net.transport().connect(peerIdFor(code));
  const rx = new ReceiverSession(conn, { pin }, () => undefined);
  rx.start();
  return rx;
}

describe('Mode A end to end (mock transport)', () => {
  it('transfers text, link and a multi-chunk file with SHA-256 verification', async () => {
    const t = await setup({ fileSize: 300_000 });
    expect(t.snap().status).toBe('waiting');
    const rx = await join(t.net, t.code());
    await waitFor(() => t.snap().status === 'connected', 3000, 'sender prompt');
    t.host.approve(t.snap().sessions[0]!.id);
    await waitFor(() => rx.state === 'review', 3000, 'manifest');
    expect(rx.manifest.map((m) => m.kind)).toEqual(['text', 'link', 'file']);
    await rx.accept();
    await waitFor(() => rx.state === 'done', 5000, 'receiver done');
    await waitFor(() => t.snap().status === 'done', 3000, 'sender done');
    expect(rx.items[0]!.text).toBe('hello');
    expect(rx.items[1]!.text).toBe('https://example.com/x');
    expect(Array.from(await blobBytes(rx.items[2]!.blob!))).toEqual(Array.from(t.data));
    expect(t.snap().allOk).toBe(true);
  });

  it('applies backpressure when the network is slow', async () => {
    const t = await setup({ fileSize: 6 * 1024 * 1024 });
    t.net.bytesPerTick = 512 * 1024;
    const rx = await join(t.net, t.code());
    await waitFor(() => t.snap().status === 'connected');
    t.host.approve(t.snap().sessions[0]!.id);
    await waitFor(() => rx.state === 'review');
    await rx.accept();
    await waitFor(() => rx.state === 'done', 20000);
    expect(t.net.maxBuffered).toBeLessThan(BUFFER_HIGH + 2 * CHUNK_SIZE);
  });

  it('PIN: required, wrong, then right', async () => {
    const t = await setup({ pin: '4821' });
    const none = await join(t.net, t.code());
    await waitFor(() => none.state === 'rejected');
    expect(none.error).toBe('pin-required');
    const wrong = await join(t.net, t.code(), '0000');
    await waitFor(() => wrong.state === 'rejected');
    expect(wrong.error).toBe('bad-pin');
    const ok = await join(t.net, t.code(), '4821');
    await waitFor(() => t.snap().status === 'connected');
    t.host.approve(t.snap().sessions.find((s) => s.state === 'pending')!.id);
    await waitFor(() => ok.state === 'review');
  });

  it('too many wrong PINs kill the code', async () => {
    const t = await setup({ pin: '1234' });
    for (let i = 0; i < 5; i++) { const rx = await join(t.net, t.code(), '9999'); await waitFor(() => rx.state === 'rejected'); }
    await waitFor(() => t.snap().status === 'error');
    expect(t.snap().error).toBe('pin');
  });

  it('sender can deny a device; receiver can decline an offer', async () => {
    const t = await setup({ max: 2 });
    const a = await join(t.net, t.code());
    await waitFor(() => t.snap().status === 'connected');
    t.host.deny(t.snap().sessions[0]!.id);
    await waitFor(() => a.state === 'rejected');
    expect(a.error).toBe('denied');
    const b = await join(t.net, t.code());
    await waitFor(() => t.snap().sessions.some((s) => s.state === 'pending'));
    t.host.approve(t.snap().sessions.find((s) => s.state === 'pending')!.id);
    await waitFor(() => b.state === 'review');
    b.decline();
    await waitFor(() => t.snap().sessions.some((s) => s.state === 'rejected' && s.error === 'declined'));
  });

  it('codes are single use by default', async () => {
    const t = await setup();
    const a = await join(t.net, t.code());
    await waitFor(() => t.snap().status === 'connected');
    t.host.approve(t.snap().sessions[0]!.id);
    await waitFor(() => a.state === 'review');
    const err = await rejection(t.net.transport().connect(peerIdFor(t.code())));
    expect(err.kind).toBe('peer-not-found'); // listener unregistered once the only slot is claimed
  });

  it('cancel mid-transfer from the receiver stops the sender', async () => {
    const t = await setup({ fileSize: 4 * 1024 * 1024 });
    t.net.bytesPerTick = 128 * 1024;
    const rx = await join(t.net, t.code());
    await waitFor(() => t.snap().status === 'connected');
    t.host.approve(t.snap().sessions[0]!.id);
    await waitFor(() => rx.state === 'review');
    await rx.accept();
    await waitFor(() => rx.received > 0);
    rx.cancel();
    await waitFor(() => t.snap().sessions[0]!.state === 'cancelled');
  });

  it('detects corruption in flight via SHA-256 and fails both sides', async () => {
    const t = await setup({ fileSize: 50_000 });
    t.net.tamper = (d) => { if (d.length > 1000) { const c = d.slice(); c[c.length - 3]! ^= 0xff; return c; } return d; };
    const rx = await join(t.net, t.code());
    await waitFor(() => t.snap().status === 'connected');
    t.host.approve(t.snap().sessions[0]!.id);
    await waitFor(() => rx.state === 'review');
    await rx.accept();
    await waitFor(() => rx.state === 'failed');
    expect(rx.error).toBe('integrity');
    await waitFor(() => t.snap().sessions[0]!.error === 'integrity');
  });

  it('lost connection during a transfer is reported', async () => {
    const t = await setup({ fileSize: 4 * 1024 * 1024 });
    t.net.bytesPerTick = 64 * 1024;
    const rx = await join(t.net, t.code());
    await waitFor(() => t.snap().status === 'connected');
    t.host.approve(t.snap().sessions[0]!.id);
    await waitFor(() => rx.state === 'review');
    await rx.accept();
    await waitFor(() => rx.received > 0);
    t.host.stop(); // sender tab closes
    await waitFor(() => rx.isTerminal);
    expect(['cancelled', 'failed']).toContain(rx.state);
  });
});

describe('codes and connectivity', () => {
  it('retries on id collision', async () => {
    const net = new MockNetwork();
    const seq = ['AAAAAA', 'AAAAAA', 'BBBBBB'];
    let first: HostSnapshot | null = null, second: HostSnapshot | null = null;
    const h1 = new SenderHost(net.transport(), [textItem('a')], { genCode: () => seq[0]! }, (s) => (first = s));
    await h1.start();
    const h2 = new SenderHost(net.transport(), [textItem('b')], { genCode: () => seq.splice(1, 1)[0]! }, (s) => (second = s));
    await h2.start();
    expect(first!.code).toBe('AAAAAA');
    expect(second!.code).toBe('BBBBBB');
  });
  it('unclaimed codes expire', async () => {
    const t = await setup({ ttlMs: 40 });
    await waitFor(() => t.snap().status === 'expired', 1000);
    expect((await rejection(t.net.transport().connect(peerIdFor(t.code())))).kind).toBe('peer-not-found');
  });
  it('reports offline and connect timeouts', async () => {
    const net = new MockNetwork();
    net.offline = true;
    let snap: HostSnapshot | null = null;
    await new SenderHost(net.transport(), [textItem('a')], {}, (s) => (snap = s)).start();
    expect(snap!.status).toBe('error');
    net.offline = false; net.blackhole = true;
    const e = await rejection(net.transport().connect('x', { timeoutMs: 20 }));
    expect(e instanceof TransportError && e.kind).toBe('timeout');
  });
});

describe('protocol and chunker', () => {
  it('validates untrusted control messages', () => {
    expect(parseCtrl('not json')).toBeNull();
    expect(parseCtrl('{"t":"nope"}')).toBeNull();
    expect(parseCtrl('{"t":"manifest","items":[{"id":"a","kind":"link","text":"javascript:alert(1)"}]}')).toBeNull();
    expect(parseCtrl('{"t":"manifest","items":[{"id":"a","kind":"file","name":"../x","size":-1}]}')).toBeNull();
    const ok = parseCtrl('{"t":"manifest","items":[{"id":"a","kind":"file","name":"../x.txt","mime":"text/plain","size":5}]}');
    expect(ok && ok.t === 'manifest' && ok.items[0]!.name).toBe('_x.txt');
    expect(parseCtrl('{"t":"done","id":"a","sha256":"zz"}')).toBeNull();
  });
  it('chunk frames round trip', () => {
    const d = decodeChunk(encodeChunk(3, 70000, new Uint8Array([1, 2, 3])))!;
    expect([d.index, d.seq, Array.from(d.data)]).toEqual([3, 70000, [1, 2, 3]]);
    expect(decodeChunk(new Uint8Array(3))).toBeNull();
  });
  it('reassembler checks order, size and hash', async () => {
    const data = randomData(40_000, seededRandom(4));
    const sha = new Sha256().update(data).hex();
    const make = () => new Reassembler(data.length, new BlobSink('x'));
    const good = make();
    let seq = 0;
    for await (const c of readChunks(new Blob([data as BlobPart]))) await good.push(seq++, c);
    const res = await good.finish(sha);
    expect(res.ok).toBe(true);
    const gap = make();
    await gap.push(0, data.subarray(0, 10));
    expect((await rejection(gap.push(2, data.subarray(10, 20)))).message).toContain('order');
    const over = new Reassembler(5, new BlobSink('x'));
    expect((await rejection(over.push(0, new Uint8Array(6)))).message).toContain('more data');
    const bad = make();
    await bad.push(0, data);
    const r = await bad.finish('0'.repeat(64));
    expect(r.ok).toBe(false);
  });
});
