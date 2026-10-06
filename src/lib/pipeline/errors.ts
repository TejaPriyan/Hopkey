export type PayloadErrorCode = 'passphrase-required' | 'bad-passphrase' | 'corrupt' | 'integrity' | 'unsupported' | 'too-large';
export class PayloadError extends Error {
  code: PayloadErrorCode;
  constructor(code: PayloadErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'PayloadError';
    this.code = code;
  }
}
