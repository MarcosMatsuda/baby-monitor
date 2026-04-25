import type { IAudioCaptureRepository } from '../../domain/repositories/i-audio-capture.repository';
import {
  AUDIO_CONSTRAINTS,
  MEDIA_CONSTRAINTS,
  ANALYSER_FFT_SIZE,
} from '@baby-monitor/webrtc-config';

export class AudioCaptureRepository implements IAudioCaptureRepository {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private buffer: Uint8Array<ArrayBuffer> | null = null;
  private keepAliveOsc: OscillatorNode | null = null;

  async requestMicrophone(): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
    return stream;
  }

  async requestAudioVideo(): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS);
  }

  startAnalyser(stream: MediaStream): void {
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = ANALYSER_FFT_SIZE;
    source.connect(this.analyser);
    this.buffer = new Uint8Array(this.analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
  }

  getDbLevel(): number {
    if (!this.analyser || !this.buffer) return -100;

    this.analyser.getByteFrequencyData(this.buffer);
    const sum = this.buffer.reduce((acc, val) => acc + val * val, 0);
    const rms = Math.sqrt(sum / this.buffer.length);

    return rms > 0 ? 20 * Math.log10(rms / 255) : -100;
  }

  stopAnalyser(): void {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.audioContext = null;
    this.analyser = null;
    this.buffer = null;
  }

  startKeepAlive(): void {
    if (!this.audioContext) return;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    gain.gain.value = 0.001;
    osc.connect(gain);
    gain.connect(this.audioContext.destination);
    osc.start();
    this.keepAliveOsc = osc;
  }

  stopKeepAlive(): void {
    if (this.keepAliveOsc) {
      this.keepAliveOsc.stop();
      this.keepAliveOsc = null;
    }
  }
}
