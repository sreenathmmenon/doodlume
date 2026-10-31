/** Original synthesized score and foley. No remote audio, downloads or autoplay. */
export class Soundscape {
  private context?: AudioContext;
  private master?: GainNode;
  private active = false;
  private muted = true;
  private lastPhrase = -1;
  private theme: string;
  constructor(theme: string) {
    this.theme = theme;
  }
  setState(active: boolean, muted: boolean) {
    this.active = active;
    this.muted = muted;
    if (!muted && active) {
      try {
        if (!this.context) {
          this.context = new AudioContext();
          this.master = this.context.createGain();
          this.master.gain.value = 0;
          this.master.connect(this.context.destination);
        }
        void this.context.resume().catch(() => {});
      } catch {
        return;
      }
    }
    if (this.context && this.master)
      this.master.gain.setTargetAtTime(
        active && !muted ? 0.35 : 0,
        this.context.currentTime,
        0.08,
      );
  }
  private note(
    hz: number,
    duration: number,
    volume: number,
    type: OscillatorType = "sine",
    delay = 0,
    endHz = hz,
  ) {
    if (!this.context || !this.master || !this.active || this.muted) return;
    const t = this.context.currentTime + delay;
    const o = this.context.createOscillator(),
      g = this.context.createGain();
    o.type = type;
    o.frequency.setValueAtTime(hz, t);
    o.frequency.exponentialRampToValueAtTime(endHz, t + duration);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + Math.min(0.025, duration / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + duration + 0.02);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  tick(time: number) {
    if (!this.active || this.muted) return;
    const phrase = Math.floor(time / 5200);
    if (phrase === this.lastPhrase) return;
    this.lastPhrase = phrase;
    const roots =
      this.theme === "moon"
        ? [146.83, 174.61, 130.81, 164.81]
        : this.theme === "sunset"
          ? [164.81, 130.81, 146.83, 110]
          : [130.81, 164.81, 146.83, 110];
    const root = roots[phrase % roots.length];
    [1, 1.5, 2.5].forEach((ratio, i) =>
      this.note(root * ratio, 4.8, 0.024, "sine", i * 0.11),
    );
    [2, 3, 2.5].forEach((ratio, i) =>
      this.note(root * ratio * 2, 1.6, 0.018, "triangle", 1 + i * 1.15),
    );
  }
  cue(
    kind: "jump" | "land" | "step" | "collect" | "gate" | "finish" | "return",
    variation = 0,
  ) {
    if (kind === "jump") this.note(190, 0.16, 0.1, "sine", 0, 480);
    if (kind === "land") this.note(105, 0.15, 0.09, "triangle", 0, 48);
    if (kind === "step")
      this.note(100 + (variation % 3) * 19, 0.045, 0.035, "triangle", 0, 65);
    if (kind === "collect")
      [1, 1.5, 2].forEach((r, i) =>
        this.note((520 + variation * 45) * r, 0.42, 0.07, "sine", i * 0.055),
      );
    if (kind === "gate")
      [130.81, 196, 261.63, 392].forEach((hz, i) =>
        this.note(hz, 0.8, 0.055, "triangle", i * 0.11),
      );
    if (kind === "finish")
      [261.63, 329.63, 392, 523.25, 659.25].forEach((hz, i) =>
        this.note(hz, 1.2, 0.08, "sine", i * 0.13),
      );
    if (kind === "return")
      [392, 329.63, 261.63].forEach((hz, i) =>
        this.note(hz, 0.35, 0.04, "sine", i * 0.09),
      );
  }
  close() {
    void this.context?.close().catch(() => {});
  }
}
