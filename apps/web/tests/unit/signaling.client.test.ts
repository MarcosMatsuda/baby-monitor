import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

type Listener = (...args: unknown[]) => void;

class FakeSocket {
  public listeners = new Map<string, Listener[]>();
  public emitted: Array<{ event: string; payload: unknown }> = [];
  public disconnected = false;

  on(event: string, cb: Listener): void {
    const list = this.listeners.get(event) ?? [];
    list.push(cb);
    this.listeners.set(event, list);
  }

  emit(event: string, payload: unknown): void {
    this.emitted.push({ event, payload });
  }

  disconnect(): void {
    this.disconnected = true;
  }

  fire(event: string, ...args: unknown[]): void {
    for (const cb of this.listeners.get(event) ?? []) cb(...args);
  }
}

const fakeSocket = new FakeSocket();
const ioFactory = vi.fn(() => fakeSocket);

vi.mock('socket.io-client', () => ({
  io: (url: string, opts: unknown) => ioFactory(url, opts),
}));

import { SignalingClient } from '../../src/infrastructure/signaling/signaling.client';

describe('SignalingClient', () => {
  let client: SignalingClient;

  beforeEach(() => {
    fakeSocket.listeners.clear();
    fakeSocket.emitted = [];
    fakeSocket.disconnected = false;
    ioFactory.mockClear();
    client = new SignalingClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('connect', () => {
    test('opens the socket with reconnection options', async () => {
      const promise = client.connect('http://server.test');
      fakeSocket.fire('connect');
      await promise;

      expect(ioFactory).toHaveBeenCalledWith('http://server.test', {
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        transports: ['websocket', 'polling'],
      });
    });

    test('resolves when the socket emits connect', async () => {
      const promise = client.connect('http://server.test');
      fakeSocket.fire('connect');
      await expect(promise).resolves.toBeUndefined();
    });

    test('rejects with the underlying error on connect_error', async () => {
      const promise = client.connect('http://server.test');
      const err = new Error('boom');
      fakeSocket.fire('connect_error', err);
      await expect(promise).rejects.toBe(err);
    });
  });

  describe('emits', () => {
    beforeEach(async () => {
      const p = client.connect('http://server.test');
      fakeSocket.fire('connect');
      await p;
    });

    test('joinRoom emits join-room with the room code', () => {
      client.joinRoom('A7X3K2');
      expect(fakeSocket.emitted).toEqual([
        { event: 'join-room', payload: { roomCode: 'A7X3K2' } },
      ]);
    });

    test('sendSignal forwards the payload as-is', () => {
      const payload = { type: 'offer' as const, sdp: 'v=0...' };
      client.sendSignal(payload);
      expect(fakeSocket.emitted).toEqual([{ event: 'signal', payload }]);
    });
  });

  describe('listener registration', () => {
    beforeEach(async () => {
      const p = client.connect('http://server.test');
      fakeSocket.fire('connect');
      await p;
    });

    test('onPeerJoined invokes callback when peer-joined fires', () => {
      const cb = vi.fn();
      client.onPeerJoined(cb);
      const dto = { peerId: 'abc', role: 'baby' as const };
      fakeSocket.fire('peer-joined', dto);
      expect(cb).toHaveBeenCalledWith(dto);
    });

    test('onSignal invokes callback when signal fires', () => {
      const cb = vi.fn();
      client.onSignal(cb);
      const dto = { type: 'answer' as const, sdp: 'v=0' };
      fakeSocket.fire('signal', dto);
      expect(cb).toHaveBeenCalledWith(dto);
    });

    test('onPeerDisconnected invokes callback when peer-disconnected fires', () => {
      const cb = vi.fn();
      client.onPeerDisconnected(cb);
      fakeSocket.fire('peer-disconnected', { peerId: 'abc' });
      expect(cb).toHaveBeenCalledWith({ peerId: 'abc' });
    });

    test('onRoomError invokes callback when room-error fires', () => {
      const cb = vi.fn();
      client.onRoomError(cb);
      fakeSocket.fire('room-error', { message: 'Room not found' });
      expect(cb).toHaveBeenCalledWith({ message: 'Room not found' });
    });
  });

  describe('disconnect', () => {
    test('calls socket.disconnect and clears the reference', async () => {
      const p = client.connect('http://server.test');
      fakeSocket.fire('connect');
      await p;

      client.disconnect();

      expect(fakeSocket.disconnected).toBe(true);
      // After disconnect, further emits become no-ops
      client.joinRoom('XXXXXX');
      expect(fakeSocket.emitted).toEqual([]);
    });
  });

  describe('safety before connect', () => {
    test('emit methods are no-ops when socket is null', () => {
      expect(() => client.joinRoom('XXXXXX')).not.toThrow();
      expect(() => client.sendSignal({ type: 'offer', sdp: '' })).not.toThrow();
      expect(fakeSocket.emitted).toEqual([]);
    });

    test('listener registration methods are no-ops when socket is null', () => {
      expect(() => client.onPeerJoined(() => {})).not.toThrow();
      expect(() => client.onSignal(() => {})).not.toThrow();
      expect(() => client.onPeerDisconnected(() => {})).not.toThrow();
      expect(() => client.onRoomError(() => {})).not.toThrow();
    });

    test('disconnect is a no-op when socket is null', () => {
      expect(() => client.disconnect()).not.toThrow();
    });
  });
});
