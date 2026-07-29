let soundEnabled = () => true;
let context;

export function configureAudio(isEnabled) { soundEnabled = isEnabled; }
export function playSound(type) {
  if (!soundEnabled()) return;
  try {
    context ??= new AudioContext();
    const patterns = { bid: [340, 0.06], reveal: [520, 0.12], win: [660, 0.16], sell: [260, 0.09] };
    const [frequency, duration] = patterns[type] ?? patterns.bid;
    const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.frequency.value = frequency; oscillator.type = type === 'win' ? 'triangle' : 'sine'; gain.gain.setValueAtTime(0.05, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + duration);
  } catch { /* Audio is optional on restricted browsers. */ }
}
