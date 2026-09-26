/** Small synthesised sound set (Web Audio, no files). Muted state persists per browser. */
let ctx: AudioContext | null = null;
const MUTE_KEY = 'pc.muted';

export const isMuted = (): boolean => localStorage.getItem(MUTE_KEY) === '1';
export const setMuted = (m: boolean): void => localStorage.setItem(MUTE_KEY, m ? '1' : '0');

function tone(freq: number, at: number, dur: number, type: OscillatorType, gain: number): void {
  if (isMuted()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch {
    // Audio unavailable; stay silent.
  }
}

export const sound = {
  pick: () => tone(420, 0, 0.05, 'triangle', 0.05),
  snap: () => {
    tone(880, 0, 0.06, 'square', 0.06);
    tone(1320, 0.03, 0.08, 'triangle', 0.05);
  },
  tick: () => tone(700, 0, 0.05, 'sine', 0.08),
  go: () => {
    tone(523, 0, 0.1, 'triangle', 0.1);
    tone(784, 0.09, 0.16, 'triangle', 0.1);
  },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.22, 'triangle', 0.1)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.14, 0.26, 'sine', 0.1)),
};

export function buzz(ms: number): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms);
}
