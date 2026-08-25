class PipBoyAudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseGain = null;
    this.sources = [];
    this.burstTimer = 0;
    this.enabled = false;
  }

  buildGraph() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error("Web Audio is not supported in this browser.");

    this.ctx = new AudioContext();
    const now = this.ctx.currentTime;

    this.master = this.ctx.createGain();
    this.master.gain.setValueAtTime(0, now);
    this.master.connect(this.ctx.destination);

    const humFilter = this.ctx.createBiquadFilter();
    humFilter.type = "lowpass";
    humFilter.frequency.setValueAtTime(145, now);
    humFilter.Q.setValueAtTime(0.8, now);
    humFilter.connect(this.master);

    const coreHum = this.ctx.createOscillator();
    const coreGain = this.ctx.createGain();
    coreHum.type = "sine";
    coreHum.frequency.setValueAtTime(60, now);
    coreGain.gain.setValueAtTime(0.012, now);
    coreHum.connect(coreGain).connect(humFilter);

    const harmonic = this.ctx.createOscillator();
    const harmonicGain = this.ctx.createGain();
    harmonic.type = "triangle";
    harmonic.frequency.setValueAtTime(120, now);
    harmonicGain.gain.setValueAtTime(0.0024, now);
    harmonic.connect(harmonicGain).connect(humFilter);

    const bufferLength = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferLength, this.ctx.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let index = 0; index < bufferLength; index += 1) {
      samples[index] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const noiseHighpass = this.ctx.createBiquadFilter();
    noiseHighpass.type = "highpass";
    noiseHighpass.frequency.setValueAtTime(700, now);

    const noiseLowpass = this.ctx.createBiquadFilter();
    noiseLowpass.type = "lowpass";
    noiseLowpass.frequency.setValueAtTime(3200, now);

    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.setValueAtTime(0.00075, now);

    noise.connect(noiseHighpass).connect(noiseLowpass).connect(this.noiseGain).connect(this.master);

    coreHum.start();
    harmonic.start();
    noise.start();
    this.sources = [coreHum, harmonic, noise];
  }

  async start() {
    if (!this.ctx || this.ctx.state === "closed") this.buildGraph();
    await this.ctx.resume();

    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(1, now + 0.12);
    this.enabled = true;
    this.scheduleBurst();
  }

  async stop() {
    if (!this.ctx || this.ctx.state === "closed") return;

    this.enabled = false;
    window.clearTimeout(this.burstTimer);

    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 0.08);

    window.setTimeout(() => {
      if (!this.enabled && this.ctx?.state === "running") this.ctx.suspend().catch(() => {});
    }, 110);
  }

  async toggle() {
    if (this.enabled) {
      await this.stop();
      return false;
    }

    await this.start();
    return true;
  }

  click() {
    if (!this.enabled || this.ctx?.state !== "running") return;

    const now = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(180, now);
    oscillator.frequency.exponentialRampToValueAtTime(72, now + 0.045);
    gain.gain.setValueAtTime(0.0024, now);
    gain.gain.exponentialRampToValueAtTime(0.00001, now + 0.05);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.055);
  }

  scheduleBurst() {
    window.clearTimeout(this.burstTimer);
    if (!this.enabled || !this.noiseGain) return;

    this.burstTimer = window.setTimeout(() => {
      if (!this.enabled || this.ctx?.state !== "running") return;

      const now = this.ctx.currentTime;
      const duration = 0.035 + Math.random() * 0.09;
      this.noiseGain.gain.cancelScheduledValues(now);
      this.noiseGain.gain.setValueAtTime(0.00075, now);
      this.noiseGain.gain.linearRampToValueAtTime(0.0032 + Math.random() * 0.0018, now + 0.008);
      this.noiseGain.gain.exponentialRampToValueAtTime(0.00075, now + duration);
      this.scheduleBurst();
    }, 2600 + Math.random() * 5200);
  }

  async destroy() {
    window.clearTimeout(this.burstTimer);
    this.enabled = false;

    for (const source of this.sources) {
      try { source.stop(); } catch {}
    }
    this.sources = [];

    if (this.ctx && this.ctx.state !== "closed") await this.ctx.close();
    this.ctx = null;
  }
}

export const pipBoyAudio = new PipBoyAudioEngine();
