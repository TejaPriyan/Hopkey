import { describe, expect, it } from 'vitest';
import { buildPayload, openPayload, peekPayload } from './payload.ts';
import { buildInstant, parseInstant } from './instant.ts';
import { buildContainer, parseContainer } from './container.ts';
import { fileItem, linkItem, textItem } from '../items.ts';
import { fileOf, randomData, rejection, seededRandom } from '../testUtils.ts';
import { LtEncoder } from '../lt/encoder.ts';
import { LtDecoder } from '../lt/decoder.ts';
import { textToFrame } from '../lt/frame.ts';
import { blobBytes } from '../bytes.ts';

const sample = () => [
  textItem('héllo wörld ✓'),
  linkItem(new URL('https://example.com/a?b=1#c')),
  fileItem(fileOf(new Uint8Array(4000).fill(9), '../report\u202Egpj.txt', 'text/plain')),
  fileItem(fileOf(randomData(3000, seededRandom(1)), 'photo.png', 'image/png')),
];

describe('Mode B payload pipeline', () => {
  for (const passphrase of [undefined, 'correct horse']) {
    it(`container -> compress -> ${passphrase ? 'encrypt -> decrypt' : 'plain'} -> verify`, async () => {
      const items = sample();
      const built = await buildPayload(items, { passphrase });
      expect(built.compressed).toBe(true);
      expect(built.encrypted).toBe(!!passphrase);
      expect(peekPayload(built.payload)?.encrypted).toBe(!!passphrase);
      const out = await openPayload(built.payload, passphrase);
      expect(out.map((i) => i.kind)).toEqual(['text', 'link', 'file', 'image']);
      expect(out[0]!.text).toBe('héllo wörld ✓');
      expect(out[1]!.text).toBe('https://example.com/a?b=1#c');
      expect(out[2]!.name.includes('/')).toBe(false);
      expect(out[2]!.name.includes('\u202e')).toBe(false);
      expect(Array.from(await blobBytes(out[3]!.blob!))).toEqual(Array.from(await blobBytes(items[3]!.blob!)));
    });
  }

  it('skips compression when it would grow the data', async () => {
    const built = await buildPayload([fileItem(fileOf(randomData(2000, seededRandom(2)), 'noise.bin'))]);
    expect(built.compressed).toBe(false);
    expect((await openPayload(built.payload)).length).toBe(1);
  });

  it('wrong or missing passphrase and tampering are detected', async () => {
    const built = await buildPayload(sample(), { passphrase: 'abc' });
    expect((await rejection(openPayload(built.payload, 'abd'))).code).toBe('bad-passphrase');
    expect((await rejection(openPayload(built.payload))).code).toBe('passphrase-required');
    const t = built.payload.slice(); t[t.length - 5]! ^= 1;
    expect((await rejection(openPayload(t, 'abc'))).code).toBe('bad-passphrase'); // AES-GCM auth failure
    const plain = await buildPayload([fileItem(fileOf(randomData(500, seededRandom(3)), 'x.bin'))]);
    const p = plain.payload.slice(); p[p.length - 1]! ^= 1; // flip a bit in the stored SHA-256 trailer
    const e = await rejection(openPayload(p));
    expect(['integrity', 'corrupt']).toContain(e.code);
  });

  it('rejects malformed containers', () => {
    expect(() => parseContainer(new Uint8Array([0, 0, 0, 5, 1]))).toThrow();
    expect(() => parseContainer(new Uint8Array(0))).toThrow();
  });

  it('refuses non-http links inside a container', async () => {
    const c = await buildContainer([{ id: 'x', kind: 'link', name: 'x', mime: 'text/uri-list', size: 18, text: 'javascript:alert(1)' }]);
    expect(() => parseContainer(c)).toThrow();
  });

  it('end to end: payload -> fountain frames (lossy) -> decoder -> items', async () => {
    const built = await buildPayload(sample(), { passphrase: 'pw' });
    const enc = new LtEncoder(built.payload, { blockSize: 120 });
    const dec = new LtDecoder();
    const rnd = seededRandom(5);
    while (!dec.complete) { const t = enc.nextText(); if (rnd() < 0.3) continue; dec.addFrame(textToFrame(t)!); }
    const items = await openPayload(dec.payload(), 'pw');
    expect(items.length).toBe(4);
  });

  it('Instant QR: only small text/link payloads', async () => {
    const s = await buildInstant([textItem('hi'), linkItem(new URL('https://example.com'))]);
    expect(s).toBeTruthy();
    expect((await parseInstant(s!)).map((i) => i.text)).toEqual(['hi', 'https://example.com/']);
    expect(await buildInstant([textItem(Array.from({ length: 4000 }, (_, i) => String(i * 7919 % 10007)).join(' '))])).toBeNull();
    expect(await buildInstant([fileItem(fileOf(new Uint8Array(3), 'a.bin'))])).toBeNull();
    expect((await rejection(parseInstant('!!!'))).code).toBe('corrupt');
  });
});
