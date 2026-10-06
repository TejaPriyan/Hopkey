import { describe, expect, it } from 'vitest';
import { Sha256, sha256Hex } from './sha256.ts';
import { generateCode, normalizeCode, formatCode, isValidCode, generatePin, extractCode } from './code.ts';
import { CODE_ALPHABET } from './config.ts';
import { parseHttpUrl, sanitizeFilename, splitUrl } from './sanitize.ts';
import { formatBytes } from './format.ts';
import { checkLimits, textItem } from './items.ts';
import { asSource, toHex } from './bytes.ts';
import { randomData, seededRandom } from './testUtils.ts';

describe('sha256', () => {
  it('matches FIPS vectors and WebCrypto for odd chunking', async () => {
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(new Uint8Array(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    for (const n of [1, 55, 56, 63, 64, 65, 1000, 70001]) {
      const d = randomData(n, seededRandom(n));
      const h = new Sha256();
      for (let i = 0; i < n; i += 4099) h.update(d.subarray(i, i + 4099));
      expect(h.hex()).toBe(toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', asSource(d)))));
    }
  });
});

describe('codes', () => {
  it('generates 6 chars from the alphabet', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const c = generateCode();
      expect(c).toHaveLength(6);
      expect([...c].every((ch) => CODE_ALPHABET.includes(ch))).toBe(true);
      seen.add(c);
    }
    expect(seen.size).toBeGreaterThan(495);
  });
  it('normalises, formats, validates', () => {
    expect(normalizeCode(' abc-def ')).toBe('ABCDEF');
    expect(normalizeCode('0O1Il abc')).toBe('ABC'); // look-alikes are not in the alphabet
    expect(formatCode('ABCDEF')).toBe('ABC-DEF');
    expect(isValidCode('ABCDEF')).toBe(true);
    expect(isValidCode('ABCDE0')).toBe(false);
    expect(generatePin()).toHaveLength(4);
    expect(extractCode('https://hopkey.app/r/ABC-DEF')).toBe('ABCDEF');
    expect(extractCode('http://localhost:5173/#/r/K7M2QX')).toBe('K7M2QX');
    expect(extractCode(' 234-567 ')).toBe('234567');
  });
});

describe('sanitising', () => {
  it('cleans file names', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('_.._etc_passwd');
    expect(sanitizeFilename('..hidden')).toBe('hidden');
    expect(sanitizeFilename('a\u202Eb.txt')).toBe('ab.txt');
    expect(sanitizeFilename('CON.txt')).toBe('_CON.txt');
    expect(sanitizeFilename('   ')).toBe('file');
    expect(sanitizeFilename(42, 'x')).toBe('x');
    expect(sanitizeFilename('x'.repeat(300) + '.png').length).toBeLessThan(121);
    expect(sanitizeFilename('x'.repeat(300) + '.png').endsWith('.png')).toBe(true);
  });
  it('accepts only plain http(s) URLs', () => {
    expect(parseHttpUrl('javascript:alert(1)')).toBeNull();
    expect(parseHttpUrl('data:text/html,<b>')).toBeNull();
    expect(parseHttpUrl('https://user:pw@example.com')).toBeNull();
    expect(parseHttpUrl('example.com/path')).toBeNull();
    expect(parseHttpUrl('example.com/path', true)?.href).toBe('https://example.com/path');
    expect(parseHttpUrl('http://a.test/x y')).toBeNull();
    const parts = splitUrl(parseHttpUrl('https://xn--pple-43d.com/a?b')!);
    expect(parts.host).toBe('xn--pple-43d.com');
    expect(parts.punycode).toBe(true);
    expect(parts.rest).toBe('/a?b');
  });
  it('formats sizes and enforces limits', () => {
    expect(formatBytes(1536)).toBe('1.50 KB');
    expect(checkLimits([textItem('x'.repeat(200_000))])).toBeTruthy();
    expect(checkLimits(Array.from({ length: 21 }, () => textItem('a')))).toBeTruthy();
    expect(checkLimits([textItem('ok')])).toBeNull();
  });
});
