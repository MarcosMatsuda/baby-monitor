// Wraps the (Chromium-only) Battery Status API into a tiny lifecycle
// helper. Firefox removed the API for fingerprinting reasons, and
// Safari never shipped it — in those browsers `start` becomes a no-op
// and `getSnapshot` returns null, which the caller treats as
// "battery unavailable" and simply skips status broadcasting.

interface BatteryManagerLike {
  level: number;
  charging: boolean;
  addEventListener(event: string, listener: () => void): void;
  removeEventListener(event: string, listener: () => void): void;
}

interface NavigatorWithBattery extends Navigator {
  getBattery?: () => Promise<BatteryManagerLike>;
}

export interface BatterySnapshot {
  readonly level: number; // 0..1
  readonly charging: boolean;
}

export class BatteryMonitorRepository {
  private manager: BatteryManagerLike | null = null;
  private listener: (() => void) | null = null;

  async start(onChange: (snapshot: BatterySnapshot) => void): Promise<boolean> {
    const nav = navigator as NavigatorWithBattery;
    if (typeof nav.getBattery !== 'function') return false;

    this.manager = await nav.getBattery();
    this.listener = () => {
      if (this.manager) {
        onChange({
          level: this.manager.level,
          charging: this.manager.charging,
        });
      }
    };

    this.manager.addEventListener('levelchange', this.listener);
    this.manager.addEventListener('chargingchange', this.listener);
    return true;
  }

  getSnapshot(): BatterySnapshot | null {
    if (!this.manager) return null;
    return {
      level: this.manager.level,
      charging: this.manager.charging,
    };
  }

  stop(): void {
    if (this.manager && this.listener) {
      this.manager.removeEventListener('levelchange', this.listener);
      this.manager.removeEventListener('chargingchange', this.listener);
    }
    this.manager = null;
    this.listener = null;
  }
}
