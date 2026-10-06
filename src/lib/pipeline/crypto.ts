import { PBKDF2_ITERATIONS } from '../config.ts';
import { asSource, utf8 } from '../bytes.ts';

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', asSource(utf8(passphrase.normalize('NFKC'))), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: asSource(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

/** AES-256-GCM. `aad` (the payload header) is authenticated so it cannot be swapped. */
export async function encrypt(plain: Uint8Array, passphrase: string, salt: Uint8Array, iv: Uint8Array, aad: Uint8Array): Promise<Uint8Array> {
  const key = await deriveKey(passphrase, salt);
  const out = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asSource(iv), additionalData: asSource(aad) }, key, asSource(plain));
  return new Uint8Array(out);
}
export async function decrypt(cipher: Uint8Array, passphrase: string, salt: Uint8Array, iv: Uint8Array, aad: Uint8Array): Promise<Uint8Array> {
  const key = await deriveKey(passphrase, salt);
  const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: asSource(iv), additionalData: asSource(aad) }, key, asSource(cipher));
  return new Uint8Array(out);
}
