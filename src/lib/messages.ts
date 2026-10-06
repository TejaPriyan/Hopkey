import type { TransportErrorKind } from './transport.ts';
import type { SessionError } from './sessions.ts';
import type { PayloadErrorCode } from './pipeline/errors.ts';
import { CONNECT_TIMEOUT_MS } from './config.ts';

export function describeTransportError(kind: TransportErrorKind | string): string {
  switch (kind) {
    case 'peer-not-found': return 'That code was not found. It may have expired or already been used. Ask the sender for a fresh code.';
    case 'timeout': return `Could not connect within ${CONNECT_TIMEOUT_MS / 1000} seconds. Strict networks, corporate Wi-Fi and VPNs can block direct connections. Try another network, switch the VPN off, or use Offline QR.`;
    case 'offline': return 'You appear to be offline. Online code needs an internet connection.';
    case 'signaling': return 'Could not reach the connection server. Check your internet connection and try again.';
    case 'id-taken': return 'Could not reserve a code. Please try again.';
    case 'unsupported': return 'This browser does not support WebRTC, which Online code needs. Try a current Chrome, Safari, Edge or Firefox.';
    case 'pin': return 'Too many wrong PIN attempts. This code has been closed. Create a new one.';
    default: return 'Something went wrong while connecting. Please try again.';
  }
}

export function describeSessionError(code: SessionError | undefined, wasHidden: boolean): string {
  switch (code) {
    case 'connection-lost':
      return 'The connection dropped.' + (wasHidden ? ' This tab was in the background, and phones often pause background tabs. Keep it open and in front until the transfer finishes.' : ' The other device may have gone offline or closed the tab.');
    case 'bad-pin': return 'That PIN is not correct.';
    case 'pin-required': return 'This code needs a 4-digit PIN.';
    case 'denied': return 'The sender did not allow this device.';
    case 'declined': return 'The transfer was declined.';
    case 'full': return 'This code has already been claimed by another device.';
    case 'version': return 'The two devices run incompatible versions. Reload both pages and try again.';
    case 'integrity': return 'The data arrived damaged (checksum mismatch). Nothing was saved. Please try again.';
    case 'peer-cancelled': return 'The other device cancelled the transfer.';
    case 'too-large': return 'That is more data than this browser can accept.';
    default: return 'The transfer failed. Please try again.';
  }
}

export function describePayloadError(code: PayloadErrorCode | string): string {
  switch (code) {
    case 'bad-passphrase': return 'That passphrase did not work. Check it and try again.';
    case 'passphrase-required': return 'This transfer is protected with a passphrase.';
    case 'integrity': return 'The reassembled data failed its SHA-256 check. Scan again from the start.';
    case 'unsupported': return 'This transfer uses a feature this browser does not support.';
    case 'too-large': return 'The decoded data is larger than allowed.';
    default: return 'The data could not be read. Scan again from the start.';
  }
}
