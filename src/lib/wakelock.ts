// Keep the screen awake while a transfer runs. Native Screen Wake Lock where available; otherwise a tiny looping
// muted video (the NoSleep.js trick), generated at runtime so no binary asset is needed. Best effort: returns method 'none' on failure.
export interface WakeHandle { method: 'wakelock' | 'video' | 'none'; release(): void }

async function makeSilentVideo(): Promise<HTMLVideoElement | null> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    const stream = canvas.captureStream(5);
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
    rec.start();
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#000' : '#010101'; ctx.fillRect(0, 0, 16, 16); await new Promise((r) => setTimeout(r, 120)); }
    rec.stop(); await stopped;
    const v = document.createElement('video');
    v.muted = true; v.loop = true; v.setAttribute('playsinline', '');
    v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;left:0;top:0';
    v.src = URL.createObjectURL(new Blob(chunks, { type: chunks[0]?.type || 'video/webm' }));
    document.body.appendChild(v);
    await v.play();
    return v;
  } catch { return null; }
}

export async function acquireWakeLock(): Promise<WakeHandle> {
  const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };
  if (nav.wakeLock) {
    let sentinel: { release(): Promise<void> } | null = null;
    let wanted = true;
    const grab = async () => { try { sentinel = await nav.wakeLock!.request('screen'); } catch { sentinel = null; } };
    const onVis = () => { if (wanted && document.visibilityState === 'visible') void grab(); }; // the lock is dropped when the tab is hidden
    await grab();
    if (sentinel) {
      document.addEventListener('visibilitychange', onVis);
      return { method: 'wakelock', release() { wanted = false; document.removeEventListener('visibilitychange', onVis); void sentinel?.release().catch(() => undefined); } };
    }
  }
  const video = await makeSilentVideo();
  if (video) return { method: 'video', release() { video.pause(); URL.revokeObjectURL(video.src); video.remove(); } };
  return { method: 'none', release() { /* nothing to release */ } };
}
