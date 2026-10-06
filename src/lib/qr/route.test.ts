import { describe, expect, it } from 'vitest';
import { classifyScan } from './route.ts';
import { LtEncoder } from '../lt/encoder.ts';
import { frameToText } from '../lt/frame.ts';

describe('scan routing', () => {
  it('recognises join links, instant links and stream frames', () => {
    expect(classifyScan('https://hopkey.example/r/ABC-DEF')).toEqual({ type: 'join', code: 'ABCDEF' });
    expect(classifyScan('https://hopkey.example/sub/r/abcdef?x=1')).toEqual({ type: 'join', code: 'ABCDEF' });
    expect(classifyScan('https://hopkey.example/#/r/K7M-2QX')).toEqual({ type: 'join', code: 'K7M2QX' });
    expect(classifyScan('ABC-DEF')).toEqual({ type: 'join', code: 'ABCDEF' });
    expect(classifyScan('ABCDEF')).toEqual({ type: 'join', code: 'ABCDEF' });
    expect(classifyScan('#/r/ABC-DEF')).toEqual({ type: 'join', code: 'ABCDEF' });
    expect(classifyScan('https://hopkey.example/#/q/abc_-123')).toEqual({ type: 'instant', payload: 'abc_-123' });
    expect(classifyScan('#/q/abc_-123')).toEqual({ type: 'instant', payload: 'abc_-123' });
    const f = new LtEncoder(new Uint8Array(300).fill(5), { blockSize: 100 }).next();
    const scan = classifyScan(frameToText(f));
    expect(scan.type).toBe('frame');
  });
  it('flags damaged frames and ignores everything else', () => {
    const t = frameToText(new LtEncoder(new Uint8Array(300).fill(5), { blockSize: 100 }).next());
    const bad = t.slice(0, 50) + (t[50] === 'A' ? 'B' : 'A') + t.slice(51);
    expect(classifyScan(bad).type).toBe('bad-frame');
    expect(classifyScan('https://example.com/r/ZZZZZZ0').type).toBe('unknown');
    expect(classifyScan('HELLO WORLD THIS IS SOME RANDOM UPPERCASE QR TEXT').type).toBe('unknown');
    expect(classifyScan('WIFI:S:net;T:WPA;P:pw;;').type).toBe('unknown');
  });
});
