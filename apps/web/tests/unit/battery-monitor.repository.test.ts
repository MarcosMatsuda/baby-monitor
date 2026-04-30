import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { BatteryMonitorRepository } from '../../src/infrastructure/battery/battery-monitor.repository';

class FakeBatteryManager {
  level: number;
  charging: boolean;
  private listeners = new Map<string, Array<() => void>>();

  constructor(level: number, charging: boolean) {
    this.level = level;
    this.charging = charging;
  }

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

const installNavigator = (overrides: Partial<{ getBattery: () => Promise<FakeBatteryManager> }> = {}): void => {
  vi.stubGlobal('navigator', { ...overrides } as Navigator);
};

describe('BatteryMonitorRepository', () => {
  let repo: BatteryMonitorRepository;

  beforeEach(() => {
    repo = new BatteryMonitorRepository();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('start', () => {
    test('returns false when getBattery API is unavailable', async () => {
      installNavigator(); // no getBattery
      const onChange = vi.fn();

      const ok = await repo.start(onChange);

      expect(ok).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
    });

    test('returns true and registers listeners when API is available', async () => {
      const battery = new FakeBatteryManager(0.85, false);
      installNavigator({ getBattery: () => Promise.resolve(battery) });

      const ok = await repo.start(vi.fn());

      expect(ok).toBe(true);
      expect(battery.listenerCount('levelchange')).toBe(1);
      expect(battery.listenerCount('chargingchange')).toBe(1);
    });

    test('invokes onChange with current snapshot when level changes', async () => {
      const battery = new FakeBatteryManager(0.85, false);
      installNavigator({ getBattery: () => Promise.resolve(battery) });
      const onChange = vi.fn();

      await repo.start(onChange);
      battery.level = 0.42;
      battery.fire('levelchange');

      expect(onChange).toHaveBeenCalledWith({ level: 0.42, charging: false });
    });

    test('invokes onChange with current snapshot when charging state changes', async () => {
      const battery = new FakeBatteryManager(0.85, false);
      installNavigator({ getBattery: () => Promise.resolve(battery) });
      const onChange = vi.fn();

      await repo.start(onChange);
      battery.charging = true;
      battery.fire('chargingchange');

      expect(onChange).toHaveBeenCalledWith({ level: 0.85, charging: true });
    });
  });

  describe('getSnapshot', () => {
    test('returns null before start', () => {
      expect(repo.getSnapshot()).toBeNull();
    });

    test('returns current battery state after start', async () => {
      const battery = new FakeBatteryManager(0.5, true);
      installNavigator({ getBattery: () => Promise.resolve(battery) });

      await repo.start(vi.fn());

      expect(repo.getSnapshot()).toEqual({ level: 0.5, charging: true });
    });

    test('reflects live changes on the underlying battery manager', async () => {
      const battery = new FakeBatteryManager(0.5, true);
      installNavigator({ getBattery: () => Promise.resolve(battery) });

      await repo.start(vi.fn());
      battery.level = 0.1;

      expect(repo.getSnapshot()).toEqual({ level: 0.1, charging: true });
    });

    test('returns null after stop', async () => {
      const battery = new FakeBatteryManager(0.5, true);
      installNavigator({ getBattery: () => Promise.resolve(battery) });

      await repo.start(vi.fn());
      repo.stop();

      expect(repo.getSnapshot()).toBeNull();
    });
  });

  describe('stop', () => {
    test('removes the registered listeners from the manager', async () => {
      const battery = new FakeBatteryManager(0.5, true);
      installNavigator({ getBattery: () => Promise.resolve(battery) });

      await repo.start(vi.fn());
      repo.stop();

      expect(battery.listenerCount('levelchange')).toBe(0);
      expect(battery.listenerCount('chargingchange')).toBe(0);
    });

    test('is safe to call before start', () => {
      expect(() => repo.stop()).not.toThrow();
    });

    test('is safe to call twice in a row', async () => {
      const battery = new FakeBatteryManager(0.5, true);
      installNavigator({ getBattery: () => Promise.resolve(battery) });

      await repo.start(vi.fn());
      repo.stop();
      expect(() => repo.stop()).not.toThrow();
    });
  });
});
