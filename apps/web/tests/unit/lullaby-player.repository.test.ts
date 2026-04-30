import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { LullabyPlayerRepository } from '../../src/infrastructure/lullaby/lullaby-player.repository';
import { installFakeAudioContext, type InstalledAudio } from '../helpers/fake-audio-context';

describe('LullabyPlayerRepository', () => {
  let repo: LullabyPlayerRepository;
  let audio: InstalledAudio;

  beforeEach(() => {
    vi.useFakeTimers();
    repo = new LullabyPlayerRepository();
    audio = installFakeAudioContext();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('play("white-noise")', () => {
    test('creates an audio context, fills a noise buffer, loops it through gain', () => {
      repo.play('white-noise');

      expect(audio.contexts).toHaveLength(1);
      const ctx = audio.contexts[0];

      expect(ctx.createdBufferSources).toHaveLength(1);
      const source = ctx.createdBufferSources[0];
      expect(source.loop).toBe(true);
      expect(source.started).toBe(true);
      expect(source.buffer).not.toBeNull();
    });

    test('writes random samples in the [-1, 1] range into the noise buffer', () => {
      repo.play('white-noise');
      const buffer = audio.contexts[0].createdBufferSources[0].buffer!;
      // Spot-check a 1000-sample window. Calling expect() on every entry
      // of a 96k buffer ran a third of a million assertions and timed out
      // in CI. 1000 samples is more than enough to catch out-of-range
      // values or an all-zero buffer.
      const SAMPLE_COUNT = 1000;
      const stride = Math.floor(buffer.data.length / SAMPLE_COUNT);
      let min = Infinity;
      let max = -Infinity;
      let nonZero = 0;
      for (let i = 0; i < buffer.data.length; i += stride) {
        const sample = buffer.data[i];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
        if (sample !== 0) nonZero++;
      }
      expect(min).toBeGreaterThanOrEqual(-1);
      expect(max).toBeLessThanOrEqual(1);
      expect(nonZero).toBeGreaterThan(0);
    });

    test('sets the noise gain below 1 to keep volume calibrated', () => {
      repo.play('white-noise');
      const ctx = audio.contexts[0];
      // Two gain nodes are created: mainGain (=1) and noiseGain (=0.25).
      const noiseGain = ctx.createdGains.find((g) => g.gain.value < 1);
      expect(noiseGain).toBeDefined();
      expect(noiseGain!.gain.value).toBeLessThanOrEqual(0.25);
    });
  });

  describe('play("heartbeat")', () => {
    test('schedules an immediate thump pair plus a recurring timer', () => {
      repo.play('heartbeat');
      const ctx = audio.contexts[0];

      // Each pair is two oscillators (lub + dub).
      expect(ctx.createdOscillators).toHaveLength(2);

      // Timer fires another pair every cycle (~1s for 60 BPM).
      vi.advanceTimersByTime(1000);
      expect(ctx.createdOscillators.length).toBeGreaterThanOrEqual(4);
    });

    test('does not start the noise buffer source for heartbeat', () => {
      repo.play('heartbeat');
      expect(audio.contexts[0].createdBufferSources).toHaveLength(0);
    });
  });

  describe('play idempotency and switching', () => {
    test('playing the same track twice is a no-op (does not rebuild the graph)', () => {
      repo.play('white-noise');
      const beforeSources = audio.contexts[0].createdBufferSources.length;

      repo.play('white-noise');

      expect(audio.contexts[0].createdBufferSources.length).toBe(beforeSources);
    });

    test('switching tracks stops the previous one before starting the new one', () => {
      repo.play('white-noise');
      const noiseSource = audio.contexts[0].createdBufferSources[0];

      repo.play('heartbeat');

      expect(noiseSource.stopped).toBe(true);
      expect(audio.contexts[0].createdOscillators.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('stop', () => {
    test('stops the noise source on white-noise', () => {
      repo.play('white-noise');
      const source = audio.contexts[0].createdBufferSources[0];

      repo.stop();

      expect(source.stopped).toBe(true);
    });

    test('clears the heartbeat interval timer', () => {
      repo.play('heartbeat');
      const beforeStop = audio.contexts[0].createdOscillators.length;

      repo.stop();
      vi.advanceTimersByTime(5000);

      expect(audio.contexts[0].createdOscillators.length).toBe(beforeStop);
    });

    test('is safe to call without a current track', () => {
      expect(() => repo.stop()).not.toThrow();
    });

    test('is safe when the underlying source was already stopped', () => {
      repo.play('white-noise');
      const source = audio.contexts[0].createdBufferSources[0];
      source.stopped = true; // simulate the engine having stopped it

      expect(() => repo.stop()).not.toThrow();
    });
  });

  describe('dispose', () => {
    test('closes the audio context and stops any active track', () => {
      repo.play('white-noise');
      const ctx = audio.contexts[0];

      repo.dispose();

      expect(ctx.closed).toBe(true);
    });

    test('rebuilds the context on the next play call', () => {
      repo.play('white-noise');
      repo.dispose();

      repo.play('white-noise');

      expect(audio.contexts).toHaveLength(2);
    });

    test('is safe to call before any play', () => {
      expect(() => repo.dispose()).not.toThrow();
    });
  });

  describe('suspended context recovery', () => {
    test('resumes a suspended context when play is called again', () => {
      repo.play('white-noise');
      const ctx = audio.contexts[0];
      ctx.state = 'suspended';

      repo.play('heartbeat');

      expect(ctx.resumed).toBe(true);
      expect(ctx.state).toBe('running');
    });
  });

  describe('volume control', () => {
    const mainGainOf = (ctx: ReturnType<typeof installFakeAudioContext>['contexts'][number]) => {
      // ensureContext creates the main gain first, before any track-
      // specific gain. It is the node connected straight to destination.
      return ctx.createdGains.find((g) => g.connections.includes(ctx.destination))!;
    };

    test('applies the volume passed to play() to the main gain node', () => {
      repo.play('white-noise', 0.4);
      const ctx = audio.contexts[0];
      expect(mainGainOf(ctx).gain.value).toBeCloseTo(0.4, 5);
    });

    test('clamps volumes above 1 down to 1', () => {
      repo.play('white-noise', 5);
      const ctx = audio.contexts[0];
      expect(mainGainOf(ctx).gain.value).toBe(1);
    });

    test('clamps negative volumes up to 0', () => {
      repo.play('white-noise', -0.5);
      const ctx = audio.contexts[0];
      expect(mainGainOf(ctx).gain.value).toBe(0);
    });

    test('treats NaN as 0 (defensive against bad data-channel input)', () => {
      repo.play('white-noise', Number.NaN);
      const ctx = audio.contexts[0];
      expect(mainGainOf(ctx).gain.value).toBe(0);
    });

    test('updates volume live without rebuilding the audio graph when the same track is re-played', () => {
      repo.play('white-noise', 0.3);
      const ctx = audio.contexts[0];
      const sourcesBefore = ctx.createdBufferSources.length;

      repo.play('white-noise', 0.8);

      expect(ctx.createdBufferSources.length).toBe(sourcesBefore);
      expect(mainGainOf(ctx).gain.value).toBeCloseTo(0.8, 5);
    });

    test('setVolume() updates the gain on the running track', () => {
      repo.play('white-noise', 0.3);
      const ctx = audio.contexts[0];

      repo.setVolume(0.65);

      expect(mainGainOf(ctx).gain.value).toBeCloseTo(0.65, 5);
    });

    test('setVolume() is a no-op when no audio context exists yet', () => {
      expect(() => repo.setVolume(0.5)).not.toThrow();
    });

    test('defaults to full volume (1) when play is called without a volume argument', () => {
      repo.play('white-noise');
      const ctx = audio.contexts[0];
      expect(mainGainOf(ctx).gain.value).toBe(1);
    });
  });
});
