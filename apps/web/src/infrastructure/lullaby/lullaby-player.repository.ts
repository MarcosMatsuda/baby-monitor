import type { LullabyTrack } from '@baby-monitor/shared-types';

// Synthesizes soothing audio on the baby phone speaker, driven by
// commands from the parent. We avoid bundling audio assets — every
// track is generated live with the Web Audio API:
//
//  - white-noise: a 2s buffer filled with random samples, looped.
//  - heartbeat:   two short low-frequency thumps per cycle (~60 BPM)
//                 scheduled with envelope shaping.

const WHITE_NOISE_BUFFER_SECONDS = 2;
const HEARTBEAT_BPM = 60;
const HEARTBEAT_GAIN = 0.4;
const WHITE_NOISE_GAIN = 0.25;

export class LullabyPlayerRepository {
  private context: AudioContext | null = null;
  private currentTrack: LullabyTrack | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private mainGain: GainNode | null = null;

  play(track: LullabyTrack): void {
    if (this.currentTrack === track) return;

    this.stop();
    this.ensureContext();

    if (track === 'white-noise') {
      this.startWhiteNoise();
    } else if (track === 'heartbeat') {
      this.startHeartbeat();
    }
    this.currentTrack = track;
  }

  stop(): void {
    if (this.noiseSource) {
      try {
        this.noiseSource.stop();
      } catch {
        // already stopped
      }
      this.noiseSource.disconnect();
      this.noiseSource = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.currentTrack = null;
  }

  dispose(): void {
    this.stop();
    if (this.context && this.context.state !== 'closed') {
      this.context.close().catch(() => {});
    }
    this.context = null;
    this.mainGain = null;
  }

  private ensureContext(): void {
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext();
      this.mainGain = this.context.createGain();
      this.mainGain.gain.value = 1;
      this.mainGain.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') {
      this.context.resume().catch(() => {});
    }
  }

  private startWhiteNoise(): void {
    if (!this.context || !this.mainGain) return;

    const ctx = this.context;
    const buffer = ctx.createBuffer(
      1,
      ctx.sampleRate * WHITE_NOISE_BUFFER_SECONDS,
      ctx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gain = ctx.createGain();
    gain.gain.value = WHITE_NOISE_GAIN;

    source.connect(gain);
    gain.connect(this.mainGain);
    source.start();

    this.noiseSource = source;
  }

  private startHeartbeat(): void {
    if (!this.context) return;

    const intervalMs = 60000 / HEARTBEAT_BPM;
    // Two thumps per cycle: lub (strong) and dub (softer) ~150ms apart.
    const tick = () => this.scheduleHeartbeatPair();

    tick();
    this.heartbeatTimer = setInterval(tick, intervalMs);
  }

  private scheduleHeartbeatPair(): void {
    if (!this.context || !this.mainGain) return;
    const ctx = this.context;
    const t0 = ctx.currentTime;
    this.scheduleThump(t0, 60, HEARTBEAT_GAIN);
    this.scheduleThump(t0 + 0.15, 50, HEARTBEAT_GAIN * 0.7);
  }

  private scheduleThump(startAt: number, freq: number, peakGain: number): void {
    if (!this.context || !this.mainGain) return;
    const ctx = this.context;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startAt);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, startAt);
    env.gain.linearRampToValueAtTime(peakGain, startAt + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18);

    osc.connect(env);
    env.connect(this.mainGain);

    osc.start(startAt);
    osc.stop(startAt + 0.2);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }
}
