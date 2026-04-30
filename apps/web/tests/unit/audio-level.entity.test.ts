import { describe, expect, test } from 'vitest';
import { AudioLevel } from '../../src/domain/entities/audio-level.entity';

describe('AudioLevel', () => {
  describe('isAboveThreshold', () => {
    test('returns true when db is strictly greater than threshold', () => {
      const level = new AudioLevel(-30, Date.now(), -35);
      expect(level.isAboveThreshold).toBe(true);
    });

    test('returns false when db equals threshold', () => {
      const level = new AudioLevel(-35, Date.now(), -35);
      expect(level.isAboveThreshold).toBe(false);
    });

    test('returns false when db is below threshold', () => {
      const level = new AudioLevel(-50, Date.now(), -35);
      expect(level.isAboveThreshold).toBe(false);
    });

    test('uses default threshold of -35 when not provided', () => {
      expect(new AudioLevel(-30).isAboveThreshold).toBe(true);
      expect(new AudioLevel(-40).isAboveThreshold).toBe(false);
    });
  });

  describe('isSilence', () => {
    test('returns true when db is strictly below -45', () => {
      expect(new AudioLevel(-46).isSilence).toBe(true);
      expect(new AudioLevel(-100).isSilence).toBe(true);
    });

    test('returns false when db equals -45', () => {
      expect(new AudioLevel(-45).isSilence).toBe(false);
    });

    test('returns false when db is above -45', () => {
      expect(new AudioLevel(-30).isSilence).toBe(false);
    });
  });

  describe('toJson', () => {
    test('serializes to db message format with rounded value to 1 decimal', () => {
      const level = new AudioLevel(-42.37, 1700000000000);
      expect(level.toJson()).toBe('{"type":"db","value":-42.4,"ts":1700000000000}');
    });

    test('keeps integer dB values without floating noise', () => {
      const level = new AudioLevel(-30, 1700000000000);
      expect(level.toJson()).toBe('{"type":"db","value":-30,"ts":1700000000000}');
    });

    test('rounds half away from zero per Math.round semantics', () => {
      const level = new AudioLevel(-42.35, 1700000000000);
      const parsed = JSON.parse(level.toJson());
      expect(parsed.value).toBeCloseTo(-42.3, 5);
    });
  });

  describe('construction', () => {
    test('defaults ts to current time when omitted', () => {
      const before = Date.now();
      const level = new AudioLevel(-30);
      const after = Date.now();
      expect(level.ts).toBeGreaterThanOrEqual(before);
      expect(level.ts).toBeLessThanOrEqual(after);
    });

    test('exposes db as a readonly property', () => {
      const level = new AudioLevel(-30);
      expect(level.db).toBe(-30);
    });
  });
});
