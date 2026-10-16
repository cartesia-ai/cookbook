export function playChime(kind: "start" | "finish"): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = kind === "start" ? [523.25, 659.25] : [523.25, 659.25, 783.99];
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.connect(gain).connect(ctx.destination);
    const t0 = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t0);
    notes.forEach((f, i) => {
      osc.frequency.setValueAtTime(f, t0 + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.14 + 0.13);
    });
    osc.start(t0);
    osc.stop(t0 + notes.length * 0.14 + 0.05);
    osc.onended = () => void ctx.close();
  } catch {
    return;
  }
}
