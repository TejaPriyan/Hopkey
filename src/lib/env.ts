// Build-time configuration from Vite env vars. TURN credentials are NEVER hardcoded.
const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}) as Record<string, string | undefined>;

export const HASH_ROUTES = env.VITE_HASH_ROUTES === '1';

export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ];
  if (env.VITE_TURN_URL) {
    servers.push({ urls: env.VITE_TURN_URL.split(',').map((s) => s.trim()), username: env.VITE_TURN_USER, credential: env.VITE_TURN_PASS });
  }
  return servers;
}

export function peerOptions() {
  const o: { host?: string; port?: number; path?: string; secure?: boolean; debug: number; config: RTCConfiguration } = {
    debug: 0,
    config: { iceServers: iceServers() },
  };
  if (env.VITE_PEER_HOST) {
    o.host = env.VITE_PEER_HOST;
    if (env.VITE_PEER_PORT) o.port = Number(env.VITE_PEER_PORT);
    if (env.VITE_PEER_PATH) o.path = env.VITE_PEER_PATH;
    o.secure = env.VITE_PEER_SECURE ? env.VITE_PEER_SECURE === '1' || env.VITE_PEER_SECURE === 'true' : true;
  }
  return o;
}
