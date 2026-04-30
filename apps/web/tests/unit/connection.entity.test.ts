import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Connection } from '../../src/domain/entities/connection.entity';

describe('Connection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    test('starts in idle state with no room or connection time', () => {
      const conn = new Connection();
      expect(conn.state).toBe('idle');
      expect(conn.roomCode).toBeNull();
      expect(conn.connectedAt).toBeNull();
    });

    test('elapsedSeconds is 0 before any connection', () => {
      expect(new Connection().elapsedSeconds).toBe(0);
    });
  });

  describe('transition', () => {
    test('records connectedAt when transitioning to connected for the first time', () => {
      const conn = new Connection();
      conn.transition('connected');
      expect(conn.state).toBe('connected');
      expect(conn.connectedAt).toBe(Date.parse('2026-01-01T00:00:00Z'));
    });

    test('does not overwrite connectedAt on repeated connected transitions', () => {
      const conn = new Connection();
      conn.transition('connected');
      const firstConnectedAt = conn.connectedAt;

      vi.advanceTimersByTime(5_000);
      conn.transition('connected');

      expect(conn.connectedAt).toBe(firstConnectedAt);
    });

    test('keeps connectedAt while in reconnecting state', () => {
      const conn = new Connection();
      conn.transition('connected');
      const connectedAt = conn.connectedAt;

      conn.transition('reconnecting');

      expect(conn.state).toBe('reconnecting');
      expect(conn.connectedAt).toBe(connectedAt);
    });

    test('clears connectedAt when transitioning to disconnected', () => {
      const conn = new Connection();
      conn.transition('connected');
      conn.transition('disconnected');
      expect(conn.connectedAt).toBeNull();
    });

    test('clears connectedAt when transitioning back to idle', () => {
      const conn = new Connection();
      conn.transition('connected');
      conn.transition('idle');
      expect(conn.connectedAt).toBeNull();
    });
  });

  describe('elapsedSeconds', () => {
    test('counts seconds since connectedAt was set', () => {
      const conn = new Connection();
      conn.transition('connected');
      vi.advanceTimersByTime(12_500);
      expect(conn.elapsedSeconds).toBe(12);
    });

    test('returns 0 after disconnect resets connectedAt', () => {
      const conn = new Connection();
      conn.transition('connected');
      vi.advanceTimersByTime(10_000);
      conn.transition('disconnected');
      expect(conn.elapsedSeconds).toBe(0);
    });

    test('continues counting through reconnecting state', () => {
      const conn = new Connection();
      conn.transition('connected');
      vi.advanceTimersByTime(3_000);
      conn.transition('reconnecting');
      vi.advanceTimersByTime(2_000);
      expect(conn.elapsedSeconds).toBe(5);
    });
  });
});
