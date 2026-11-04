/**
 * Ambient sound for the cabin, synthesised with the Web Audio API so the app
 * needs no audio files: a crackling fire, crickets at night, and a wolf howl
 * when the night falls.
 */
export class Ambience {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private crickets: GainNode | null = null;
  private fire: GainNode | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private enabled = true;
  private night = false;
  private disposed = false;

  /** Starts the sound. Must follow a user gesture, which joining a room always does. */
  start(): void {
    if (this.context || this.disposed || typeof AudioContext === "undefined") return;
    const context = new AudioContext();
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = this.enabled ? 0.5 : 0;
    this.master.connect(context.destination);

    const noise = this.noiseBuffer(context);

    // The low roar of the fire.
    const rumble = context.createBufferSource();
    rumble.buffer = noise;
    rumble.loop = true;
    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 380;
    this.fire = context.createGain();
    this.fire.gain.value = 0.22;
    rumble.connect(lowpass).connect(this.fire).connect(this.master);
    rumble.start();

    this.crickets = context.createGain();
    this.crickets.gain.value = 0;
    this.crickets.connect(this.master);

    this.scheduleCrackle(noise);
    this.scheduleCrickets();
    void context.resume();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(enabled ? 0.5 : 0, this.context.currentTime, 0.1);
    }
  }

  /** Crickets and a louder fire at night. */
  setNight(night: boolean): void {
    const wasNight = this.night;
    this.night = night;
    if (!this.context) return;
    const now = this.context.currentTime;
    this.crickets?.gain.setTargetAtTime(night ? 0.18 : 0, now, 0.8);
    this.fire?.gain.setTargetAtTime(night ? 0.3 : 0.22, now, 0.8);
    if (night && !wasNight) this.howl();
  }

  /** A distant howl: a sliding, wavering tone through a soft filter. */
  howl(): void {
    const context = this.context;
    if (!context || !this.master || !this.enabled) return;
    const now = context.currentTime;
    const voice = context.createOscillator();
    voice.type = "sawtooth";
    voice.frequency.setValueAtTime(260, now);
    voice.frequency.exponentialRampToValueAtTime(560, now + 1.1);
    voice.frequency.exponentialRampToValueAtTime(420, now + 2.8);
    voice.frequency.exponentialRampToValueAtTime(300, now + 3.6);
    const vibrato = context.createOscillator();
    vibrato.frequency.value = 5.5;
    const vibratoDepth = context.createGain();
    vibratoDepth.gain.value = 9;
    vibrato.connect(vibratoDepth).connect(voice.frequency);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.8);
    gain.gain.setValueAtTime(0.06, now + 2.6);
    gain.gain.linearRampToValueAtTime(0, now + 3.8);
    voice.connect(filter).connect(gain).connect(this.master);
    voice.start(now);
    vibrato.start(now);
    voice.stop(now + 4);
    vibrato.stop(now + 4);
  }

  dispose(): void {
    this.disposed = true;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    void this.context?.close();
    this.context = null;
  }

  private noiseBuffer(context: AudioContext): AudioBuffer {
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** Sharp little pops at random moments. */
  private scheduleCrackle(noise: AudioBuffer): void {
    const pop = (): void => {
      const context = this.context;
      if (!context || !this.master) return;
      // Nothing to hear when muted or in a background tab: skip the work, keep the schedule.
      if (!this.enabled || document.hidden) {
        this.timers.push(setTimeout(pop, 1000));
        return;
      }
      const source = context.createBufferSource();
      source.buffer = noise;
      const filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1500 + Math.random() * 3000;
      const gain = context.createGain();
      const now = context.currentTime;
      gain.gain.setValueAtTime(0.25 * Math.random() + 0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04 + Math.random() * 0.05);
      source.connect(filter).connect(gain).connect(this.master);
      source.start(now, Math.random());
      source.stop(now + 0.12);
      this.timers.push(setTimeout(pop, 60 + Math.random() * 500));
    };
    pop();
  }

  /** Groups of chirps, only audible at night. */
  private scheduleCrickets(): void {
    const chirp = (): void => {
      const context = this.context;
      if (!context || !this.crickets) return;
      if (this.night && this.enabled && !document.hidden) {
        const now = context.currentTime;
        for (let i = 0; i < 3; i++) {
          const osc = context.createOscillator();
          osc.frequency.value = 4300 + Math.random() * 300;
          const gain = context.createGain();
          const at = now + i * 0.11;
          gain.gain.setValueAtTime(0, at);
          gain.gain.linearRampToValueAtTime(0.5, at + 0.02);
          gain.gain.linearRampToValueAtTime(0, at + 0.07);
          osc.connect(gain).connect(this.crickets);
          osc.start(at);
          osc.stop(at + 0.09);
        }
      }
      this.timers.push(setTimeout(chirp, 700 + Math.random() * 900));
    };
    chirp();
  }
}
