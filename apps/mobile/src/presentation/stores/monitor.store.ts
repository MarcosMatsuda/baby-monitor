import { create } from 'zustand';
import { DEFAULT_THRESHOLD_DB, type AlertState } from '@baby-monitor/shared-types';

interface IMonitorStoreState {
  currentDb: number;
  threshold: number;
  alertState: AlertState;
  lastNoiseAt: number | null;
  readings: number[];
  babyBattery: number | null;
  babyCharging: boolean;
  babyStatusAt: number | null;

  pushReading: (db: number) => void;
  setThreshold: (threshold: number) => void;
  setAlertState: (state: AlertState) => void;
  setBabyStatus: (battery: number, charging: boolean) => void;
  reset: () => void;
}

const READINGS_BUFFER_SIZE = 100;

const useMonitorStoreBase = create<IMonitorStoreState>((set) => ({
  currentDb: -100,
  threshold: DEFAULT_THRESHOLD_DB,
  alertState: 'idle',
  lastNoiseAt: null,
  readings: [],
  babyBattery: null,
  babyCharging: false,
  babyStatusAt: null,

  pushReading: (db) =>
    set((prev) => {
      const readings = [...prev.readings, db];
      if (readings.length > READINGS_BUFFER_SIZE) readings.shift();

      return {
        currentDb: db,
        readings,
        lastNoiseAt: db > -45 ? Date.now() : prev.lastNoiseAt,
      };
    }),

  setThreshold: (threshold) => set({ threshold }),

  setAlertState: (alertState) => set({ alertState }),

  setBabyStatus: (battery, charging) =>
    set({ babyBattery: battery, babyCharging: charging, babyStatusAt: Date.now() }),

  reset: () =>
    set({
      currentDb: -100,
      threshold: DEFAULT_THRESHOLD_DB,
      alertState: 'idle',
      lastNoiseAt: null,
      readings: [],
      babyBattery: null,
      babyCharging: false,
      babyStatusAt: null,
    }),
}));

// Hook wrapper
export function useMonitor() {
  return useMonitorStoreBase();
}

export { useMonitorStoreBase };
