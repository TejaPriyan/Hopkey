import { CODE_ALPHABET, CODE_LENGTH, PEER_PREFIX } from './config.ts';
import { randomBytes } from './bytes.ts';

const N = CODE_ALPHABET.length; // 31
const LIMIT = 256 - (256 % N); // rejection sampling keeps the distribution uniform

export function generateCode(rand: (n: number) => Uint8Array = randomBytes): string {
  let out = '';
  while (out.length < CODE_LENGTH) {
    for (const b of rand(CODE_LENGTH * 2)) {
      if (b < LIMIT && out.length < CODE_LENGTH) out += CODE_ALPHABET[b % N];
    }
  }
  return out;
}

/** Uppercase and drop anything that is not in the alphabet (spaces, hyphens, ...). */
export function normalizeCode(input: string): string {
  let out = '';
  for (const ch of input.toUpperCase()) if (CODE_ALPHABET.includes(ch)) out += ch;
  return out.slice(0, CODE_LENGTH);
}
export const isValidCode = (c: string): boolean => c.length === CODE_LENGTH && [...c].every((ch) => CODE_ALPHABET.includes(ch));
export const formatCode = (c: string): string => `${c.slice(0, 3)}-${c.slice(3)}`;
export const peerIdFor = (code: string): string => `${PEER_PREFIX}-${code}`;

/** Extracts a 6-char code from either plain text (like 'ABC-DEF') or a full join URL (like 'https://.../r/ABC-DEF'). */
export function extractCode(input: string): string {
  const trimmed = input.trim();
  const match = /(?:\/r\/|#\/r\/)([A-Za-z0-9]{3}-?[A-Za-z0-9]{3})/i.exec(trimmed);
  if (match) return normalizeCode(match[1]!.replace('-', ''));
  return normalizeCode(trimmed);
}

export function generatePin(rand: (n: number) => Uint8Array = randomBytes): string {
  let out = '';
  while (out.length < 4) for (const b of rand(8)) if (b < 250 && out.length < 4) out += String(b % 10);
  return out;
}
