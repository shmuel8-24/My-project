const SOUND_KEY = 'levy_ai_sound_enabled';

export function getSoundEnabled(): boolean {
  try { return localStorage.getItem(SOUND_KEY) !== 'false'; } catch { return true; }
}

export function toggleSound(): boolean {
  const next = !getSoundEnabled();
  try { localStorage.setItem(SOUND_KEY, String(next)); } catch {}
  return next;
}

function playTone(frequency: number, endFrequency: number, duration: number, volume = 0.08): void {
  if (!getSoundEnabled()) return;
  try {
    const ctx  = new AudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFrequency, ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration + 0.03);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration + 0.03);
  } catch {}
}

/** Soft click on course selection. */
export function playSwitch(): void {
  playTone(660, 220, 0.09);
}

/** Short pop on UI interactions. */
export function playPop(): void {
  playTone(440, 330, 0.06, 0.06);
}

/** Rising chime on quiz success. */
export function playSuccess(): void {
  playTone(440, 880, 0.18, 0.07);
}
