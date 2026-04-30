import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { WakeLockRepository } from '../../src/infrastructure/screen/wake-lock.repository';

class FakeWakeLockSentinel {
  released = false;
  private listeners: Array<() => void> = [];

  addEventListener(event: string, cb: () => void): void {
    if (event === 'release') this.listeners.push(cb);
  }

  async release(): Promise<void> {
    this.released = true;
    for (const cb of this.listeners) cb();
  }

  fireRelease(): void {
    this.released = true;
    for (const cb of this.listeners) cb();
  }
}

class FakeWakeLockApi {
  public requestCount = 0;
  public lastRequestType: string | null = null;
  public nextSentinel: FakeWakeLockSentinel | null = null;
  public nextError: unknown = null;

  request = (type: string): Promise<FakeWakeLockSentinel> => {
    this.requestCount++;
    this.lastRequestType = type;
    if (this.nextError) {
      const err = this.nextError;
      this.nextError = null;
      return Promise.reject(err);
    }
    const sentinel = this.nextSentinel ?? new FakeWakeLockSentinel();
    this.nextSentinel = null;
    return Promise.resolve(sentinel);
  };
}

class FakeDocument {
  public visibilityState: 'visible' | 'hidden' = 'visible';
  private listeners = new Map<string, Array<() => void>>();

  addEventListener(event: string, cb: () => void): void {
    const list = this.listeners.get(event) ?? [];
    list.push(cb);
    this.listeners.set(event, list);
  }

  removeEventListener(event: string, cb: () => void): void {
    const list = this.listeners.get(event);
    if (!list) return;
    const idx = list.indexOf(cb);
    if (idx >= 0) list.splice(idx, 1);
  }

  fire(event: string): void {
    for (const cb of this.listeners.get(event) ?? []) cb();
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.length ?? 0;
  }
}

const installNavigator = (api: FakeWakeLockApi | null): void => {
  vi.stubGlobal('navigator', api ? { wakeLock: api } : {});
};

const installDocument = (doc: FakeDocument): void => {
  vi.stubGlobal('document', doc);
};

describe('WakeLockRepository', () => {
  let repo: WakeLockRepository;
  let api: FakeWakeLockApi;
  let doc: FakeDocument;

  beforeEach(() => {
    repo = new WakeLockRepository();
    api = new FakeWakeLockApi();
    doc = new FakeDocument();
    installDocument(doc);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('isSupported', () => {
    test('returns false when navigator has no wakeLock property', () => {
      installNavigator(null);
      expect(repo.isSupported()).toBe(false);
    });

    test('returns true when navigator exposes wakeLock', () => {
      installNavigator(api);
      expect(repo.isSupported()).toBe(true);
    });
  });

  describe('acquire', () => {
    test('returns false and does nothing when API is unsupported', async () => {
      installNavigator(null);
      const ok = await repo.acquire();
      expect(ok).toBe(false);
      expect(doc.listenerCount('visibilitychange')).toBe(0);
    });

    test('requests a screen sentinel and returns true on success', async () => {
      installNavigator(api);
      const ok = await repo.acquire();
      expect(ok).toBe(true);
      expect(api.requestCount).toBe(1);
      expect(api.lastRequestType).toBe('screen');
    });

    test('returns false when the request rejects (permission denied)', async () => {
      installNavigator(api);
      api.nextError = new Error('NotAllowedError');
      const ok = await repo.acquire();
      expect(ok).toBe(false);
    });

    test('registers a single visibilitychange listener', async () => {
      installNavigator(api);
      await repo.acquire();
      expect(doc.listenerCount('visibilitychange')).toBe(1);
    });

    test('does not stack multiple visibility listeners across re-acquires', async () => {
      installNavigator(api);
      await repo.acquire();
      await repo.acquire();
      expect(doc.listenerCount('visibilitychange')).toBe(1);
    });
  });

  describe('release', () => {
    test('releases the held sentinel and removes the visibility listener', async () => {
      installNavigator(api);
      const sentinel = new FakeWakeLockSentinel();
      api.nextSentinel = sentinel;

      await repo.acquire();
      await repo.release();

      expect(sentinel.released).toBe(true);
      expect(doc.listenerCount('visibilitychange')).toBe(0);
    });

    test('is safe to call before any acquire', async () => {
      installNavigator(api);
      await expect(repo.release()).resolves.toBeUndefined();
    });

    test('does not throw when the sentinel was already released by the OS', async () => {
      installNavigator(api);
      const sentinel = new FakeWakeLockSentinel();
      sentinel.release = () => Promise.reject(new Error('already released'));
      api.nextSentinel = sentinel;

      await repo.acquire();
      await expect(repo.release()).resolves.toBeUndefined();
    });

    test('skips the release call when the sentinel is already flagged released', async () => {
      installNavigator(api);
      const sentinel = new FakeWakeLockSentinel();
      const releaseSpy = vi.spyOn(sentinel, 'release');
      api.nextSentinel = sentinel;

      await repo.acquire();
      sentinel.released = true;
      await repo.release();

      expect(releaseSpy).not.toHaveBeenCalled();
    });
  });

  describe('visibilitychange handling', () => {
    test('re-acquires the sentinel when page returns to visible after OS release', async () => {
      installNavigator(api);
      const first = new FakeWakeLockSentinel();
      api.nextSentinel = first;
      await repo.acquire();

      // Simulate OS releasing the sentinel while the tab was hidden.
      first.fireRelease();
      doc.visibilityState = 'visible';
      doc.fire('visibilitychange');

      // Microtask flush so the requestSentinel promise resolves.
      await Promise.resolve();
      await Promise.resolve();

      expect(api.requestCount).toBe(2);
    });

    test('does not re-acquire when the page is hidden', async () => {
      installNavigator(api);
      const first = new FakeWakeLockSentinel();
      api.nextSentinel = first;
      await repo.acquire();

      first.fireRelease();
      doc.visibilityState = 'hidden';
      doc.fire('visibilitychange');

      await Promise.resolve();

      expect(api.requestCount).toBe(1);
    });

    test('does not re-acquire after an explicit release', async () => {
      installNavigator(api);
      await repo.acquire();
      await repo.release();

      doc.visibilityState = 'visible';
      doc.fire('visibilitychange');
      await Promise.resolve();

      expect(api.requestCount).toBe(1);
    });
  });
});
