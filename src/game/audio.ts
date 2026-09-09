class Sfx {
  private ctx: AudioContext | null = null;
  enabled = true;
  volume = 0.85;

  private ac(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  unlock() {
    const ctx = this.ac();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  }

  private noiseBurst(dur: number, filterFreq = 1800, vol = 0.15, delay = 0) {
    if (!this.enabled) return;
    const ctx = this.ac();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime + delay;
      const bufferSize = Math.max(256, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(filterFreq, t0);
      filter.Q.setValueAtTime(3.0, t0);

      const gain = ctx.createGain();
      const actualVol = vol * this.volume;
      gain.gain.setValueAtTime(actualVol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      whiteNoise.connect(filter).connect(gain).connect(ctx.destination);
      whiteNoise.start(t0);
      whiteNoise.stop(t0 + dur + 0.02);
    } catch {
      /* audio not available */
    }
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType = 'sine',
    vol = 0.18,
    delay = 0,
    slideTo?: number,
  ) {
    if (!this.enabled) return;
    const ctx = this.ac();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
      }
      const actualVol = vol * this.volume;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(actualVol, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.04);
    } catch {
      /* audio not available */
    }
  }

  /* User clicks UI button */
  click() {
    this.unlock();
    this.tone(720, 0.04, 'sine', 0.12);
    this.tone(1080, 0.03, 'triangle', 0.08, 0.01);
  }

  /* Realistic dice shaking and tumbling */
  roll() {
    this.unlock();
    // Several quick clattering noise bursts mimicking dice tumbling in a cup / tray
    const bursts = [
      { delay: 0.0, freq: 1600, dur: 0.07, vol: 0.18 },
      { delay: 0.1, freq: 2400, dur: 0.06, vol: 0.22 },
      { delay: 0.22, freq: 1900, dur: 0.08, vol: 0.2 },
      { delay: 0.38, freq: 2800, dur: 0.05, vol: 0.16 },
      { delay: 0.52, freq: 2100, dur: 0.06, vol: 0.14 },
      { delay: 0.68, freq: 1700, dur: 0.07, vol: 0.12 },
    ];
    bursts.forEach((b) => {
      this.noiseBurst(b.dur, b.freq, b.vol, b.delay);
      this.tone(140 + Math.random() * 200, 0.04, 'triangle', 0.1, b.delay);
    });
  }

  /* Melodic marimba hop per step */
  hop(i: number) {
    this.unlock();
    // Warm marimba-like pentatonic pitch scale
    const scale = [330, 392, 440, 523, 587, 659, 784];
    const baseFreq = scale[i % scale.length];
    this.tone(baseFreq, 0.12, 'sine', 0.22);
    this.tone(baseFreq * 2, 0.08, 'triangle', 0.12);
  }

  /* Token lands firmly on regular square */
  land() {
    this.unlock();
    this.tone(220, 0.08, 'triangle', 0.18);
    this.tone(110, 0.12, 'sine', 0.22, 0.01);
  }

  /* Shimmering celesta chime when climbing ladder */
  ladder() {
    this.unlock();
    const chord = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    chord.forEach((f, idx) => {
      this.tone(f, 0.32, 'triangle', 0.2, idx * 0.09);
      this.tone(f * 2, 0.24, 'sine', 0.1, idx * 0.09 + 0.02);
    });
  }

  /* Ding for rolling a 6 or bonus */
  ding() {
    this.unlock();
    this.tone(1568, 0.28, 'sine', 0.22);
    this.tone(3136, 0.22, 'triangle', 0.14, 0.02);
  }

  /* Realistic serpent hiss + cartoon slide down whistle for snake bite */
  snake() {
    this.unlock();
    // Serpent hiss: textured high-frequency noise bursts mimicking snake hiss
    this.noiseBurst(0.25, 3800, 0.26, 0);
    this.noiseBurst(0.42, 4200, 0.22, 0.1);
    // Descending slide whistle
    this.tone(640, 0.55, 'sawtooth', 0.15, 0.06, 110);
    this.tone(490, 0.5, 'triangle', 0.13, 0.12, 90);
  }

  /* Comedic soft thud when hitting snake bottom */
  hit() {
    this.unlock();
    this.tone(85, 0.26, 'sine', 0.35);
    this.tone(180, 0.12, 'square', 0.12, 0.02);
  }

  /* Buzzer when exact roll is not met or bounce back */
  buzz() {
    this.unlock();
    this.tone(185, 0.2, 'sawtooth', 0.18);
    this.tone(138, 0.28, 'sawtooth', 0.16, 0.08);
  }

  /* Triumphant victory fanfare */
  win() {
    this.unlock();
    const fanfare = [
      { f: 523.25, d: 0.14, t: 0.0 },
      { f: 659.25, d: 0.14, t: 0.12 },
      { f: 783.99, d: 0.14, t: 0.24 },
      { f: 1046.5, d: 0.38, t: 0.36 },
      { f: 880.0, d: 0.16, t: 0.72 },
      { f: 1046.5, d: 0.55, t: 0.88 },
      { f: 1318.5, d: 0.75, t: 1.05 },
    ];
    fanfare.forEach((n) => {
      this.tone(n.f, n.d, 'triangle', 0.24, n.t);
      this.tone(n.f * 1.5, n.d * 0.8, 'sine', 0.12, n.t);
    });
    // Sub bass warm triumph
    this.tone(261.63, 1.2, 'sine', 0.18, 0.36);
    this.tone(196.0, 1.4, 'sine', 0.18, 0.88);
  }

  /* Pop sound when an emote reaction is sent or received */
  pop() {
    this.unlock();
    this.tone(880, 0.08, 'sine', 0.22, 0, 1320);
  }

  /* Subtle welcoming chime when a player joins the online room */
  chime() {
    this.unlock();
    this.tone(587.33, 0.16, 'triangle', 0.18, 0);
    this.tone(880, 0.22, 'sine', 0.16, 0.08);
  }
}

export const sfx = new Sfx();

