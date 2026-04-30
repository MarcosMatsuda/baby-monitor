import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AudioCaptureRepository } from '../../src/infrastructure/audio/audio-capture.repository';
import { installFakeAudioContext, type InstalledAudio } from '../helpers/fake-audio-context';

const installNavigatorMedia = (getUserMedia: ReturnType<typeof vi.fn>): void => {
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } } as Navigator);
};

describe('AudioCaptureRepository', () => {
  let repo: AudioCaptureRepository;
  let audio: InstalledAudio;

  beforeEach(() => {
    repo = new AudioCaptureRepository();
    audio = installFakeAudioContext();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('requestMicrophone', () => {
    test('asks for audio-only stream with the audio constraints', async () => {
      const stream = {} as MediaStream;
      const getUserMedia = vi.fn().mockResolvedValue(stream);
      installNavigatorMedia(getUserMedia);

      const result = await repo.requestMicrophone();

      expect(result).toBe(stream);
      expect(getUserMedia).toHaveBeenCalledOnce();
      const constraints = getUserMedia.mock.calls[0][0];
      expect(constraints.video).toBe(false);
      expect(constraints.audio).toMatchObject({
        echoCancellation: true,
        noiseSuppression: true,
      });
    });

    test('propagates errors from getUserMedia (permission denied)', async () => {
      const err = new DOMException('Permission denied', 'NotAllowedError');
      installNavigatorMedia(vi.fn().mockRejectedValue(err));

      await expect(repo.requestMicrophone()).rejects.toBe(err);
    });
  });

  describe('requestAudioVideo', () => {
    test('asks for audio + video constraints', async () => {
      const stream = {} as MediaStream;
      const getUserMedia = vi.fn().mockResolvedValue(stream);
      installNavigatorMedia(getUserMedia);

      const result = await repo.requestAudioVideo();

      expect(result).toBe(stream);
      const constraints = getUserMedia.mock.calls[0][0];
      expect(constraints.audio).toBeDefined();
      expect(constraints.video).toBeDefined();
    });
  });

  describe('startAnalyser', () => {
    test('builds a media-source -> analyser graph with fftSize 2048', () => {
      repo.startAnalyser({} as MediaStream);

      const ctx = audio.contexts[0];
      expect(ctx.createdSources).toHaveLength(1);
      expect(ctx.createdAnalysers).toHaveLength(1);

      const analyser = ctx.createdAnalysers[0];
      expect(analyser.fftSize).toBe(2048);
      expect(analyser.frequencyBinCount).toBe(1024);

      // The source must be wired into the analyser.
      expect(ctx.createdSources[0].connections).toContain(analyser);
    });
  });

  describe('getDbLevel', () => {
    test('returns -100 sentinel before startAnalyser is called', () => {
      expect(repo.getDbLevel()).toBe(-100);
    });

    test('returns -100 sentinel when the frequency buffer is silent (all zeros)', () => {
      repo.startAnalyser({} as MediaStream);
      // Default fake fills nothing -> buffer stays zero -> rms == 0.
      expect(repo.getDbLevel()).toBe(-100);
    });

    test('returns 0 dB when the buffer is fully saturated (all 255)', () => {
      repo.startAnalyser({} as MediaStream);
      const analyser = audio.contexts[0].createdAnalysers[0];
      analyser.nextFrequencyData = new Uint8Array(1024).fill(255);

      // 20 * log10(255 / 255) == 0
      expect(repo.getDbLevel()).toBeCloseTo(0, 5);
    });

    test('returns -6 dB when the buffer reads at half scale (~128)', () => {
      repo.startAnalyser({} as MediaStream);
      const analyser = audio.contexts[0].createdAnalysers[0];
      analyser.nextFrequencyData = new Uint8Array(1024).fill(128);

      // 20 * log10(128 / 255) ~= -5.99
      expect(repo.getDbLevel()).toBeCloseTo(-5.99, 1);
    });
  });

  describe('stopAnalyser', () => {
    test('closes the audio context and clears internal state', async () => {
      repo.startAnalyser({} as MediaStream);
      const ctx = audio.contexts[0];

      repo.stopAnalyser();

      expect(ctx.closed).toBe(true);
      expect(repo.getDbLevel()).toBe(-100);
    });

    test('does not call close on an already-closed context', () => {
      repo.startAnalyser({} as MediaStream);
      const ctx = audio.contexts[0];
      ctx.state = 'closed';
      const closeSpy = vi.spyOn(ctx, 'close');

      repo.stopAnalyser();

      expect(closeSpy).not.toHaveBeenCalled();
    });

    test('is safe to call before startAnalyser', () => {
      expect(() => repo.stopAnalyser()).not.toThrow();
    });
  });

  describe('startKeepAlive', () => {
    test('does nothing when no audio context exists yet', () => {
      repo.startKeepAlive();
      expect(audio.contexts).toHaveLength(0);
    });

    test('creates an inaudible oscillator wired through a low-gain node', () => {
      repo.startAnalyser({} as MediaStream);
      const ctx = audio.contexts[0];

      repo.startKeepAlive();

      expect(ctx.createdOscillators).toHaveLength(1);
      expect(ctx.createdGains).toHaveLength(1);
      expect(ctx.createdGains[0].gain.value).toBe(0.001);
      expect(ctx.createdOscillators[0].started).toBe(true);
    });
  });

  describe('stopKeepAlive', () => {
    test('stops the running oscillator and clears the reference', () => {
      repo.startAnalyser({} as MediaStream);
      repo.startKeepAlive();
      const osc = audio.contexts[0].createdOscillators[0];

      repo.stopKeepAlive();

      expect(osc.stopped).toBe(true);
      // Idempotent: calling again is a no-op (does not throw).
      expect(() => repo.stopKeepAlive()).not.toThrow();
    });

    test('is safe to call before startKeepAlive', () => {
      expect(() => repo.stopKeepAlive()).not.toThrow();
    });
  });
});
