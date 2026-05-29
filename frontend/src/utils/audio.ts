'use client';

/**
 * Creamy Matcha Audio Engine
 *
 * Synthesises soft UI micro-sounds via the Web Audio API.
 * – No network requests; all sounds are procedurally generated.
 * – Fails silently on autoplay blocks, missing API, or muted state.
 * – Sound-enabled flag persisted to localStorage('unote_sound').
 */

/* ── Types ─────────────────────────────────────────────────────────────── */

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

/* ── Module state ───────────────────────────────────────────────────────── */

let _ctx:     AudioContext | null = null;
let _enabled: boolean             = true;

// Read user preference from localStorage on the client (safe on server too)
if (typeof window !== 'undefined') {
  try {
    const stored = localStorage.getItem('unote_sound');
    if (stored === '0') _enabled = false;
  } catch { /* ignore */ }
}

/* ── AudioContext management ────────────────────────────────────────────── */

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!_ctx || _ctx.state === 'closed') {
      const Ctor =
        window.AudioContext ??
        (window as WebkitWindow).webkitAudioContext;
      if (!Ctor) return null;
      _ctx = new Ctor();
    }
    if (_ctx.state === 'suspended') {
      void _ctx.resume();
    }
    return _ctx;
  } catch {
    return null;
  }
}

function guard(): AudioContext | null {
  return _enabled ? getCtx() : null;
}

/* ── Public state API ───────────────────────────────────────────────────── */

export function getSoundEnabled(): boolean {
  return _enabled;
}

export function setSoundEnabled(v: boolean): void {
  _enabled = v;
  if (typeof window !== 'undefined') {
    try { localStorage.setItem('unote_sound', v ? '1' : '0'); } catch { /* ignore */ }
  }
}

/** Flips the enabled state, persists it, and returns the new value. */
export function toggleSound(): boolean {
  setSoundEnabled(!_enabled);
  return _enabled;
}

/* ── Sound palette ──────────────────────────────────────────────────────── */

/**
 * playPop — soft detuned sine burst (~70 ms).
 * Use for: primary button clicks, sending a chat message, adding a course.
 */
export function playPop(): void {
  const ctx = guard();
  if (!ctx) return;
  try {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.07);

    gain.gain.setValueAtTime(0,    ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.10, ctx.currentTime + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.07);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  } catch { /* ignore */ }
}

/**
 * playSuccess — gentle three-note ascending chime (C5 → E5 → G5, ~550 ms).
 * Use for: quiz high-score, major completion milestones.
 */
export function playSuccess(): void {
  const ctx = guard();
  if (!ctx) return;
  try {
    // C5, E5, G5 – a soft major triad
    const freqs = [523.25, 659.25, 783.99];
    freqs.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type    = 'sine';
      osc.frequency.value = freq;

      const t = ctx.currentTime + i * 0.14;
      gain.gain.setValueAtTime(0,    t);
      gain.gain.linearRampToValueAtTime(0.09, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.40);

      osc.start(t);
      osc.stop(t + 0.42);
    });
  } catch { /* ignore */ }
}

/**
 * playSwitch — soft downward frequency sweep (~90 ms).
 * Use for: course selection, tab navigation.
 */
export function playSwitch(): void {
  const ctx = guard();
  if (!ctx) return;
  try {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(540, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(175, ctx.currentTime + 0.09);

    gain.gain.setValueAtTime(0,    ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.007);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.10);
  } catch { /* ignore */ }
}
