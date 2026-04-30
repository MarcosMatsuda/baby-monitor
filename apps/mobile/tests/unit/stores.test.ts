import { useConnectionStoreBase } from '../../src/presentation/stores/connection.store';
import { useMonitorStoreBase } from '../../src/presentation/stores/monitor.store';

describe('ConnectionStore', () => {
  beforeEach(() => {
    useConnectionStoreBase.getState().reset();
  });

  it('should start in idle state', () => {
    const state = useConnectionStoreBase.getState();
    expect(state.state).toBe('idle');
    expect(state.roomCode).toBeNull();
    expect(state.connectedAt).toBeNull();
  });

  it('should transition to connected and set connectedAt', () => {
    const store = useConnectionStoreBase.getState();
    store.setState('connected');

    const updated = useConnectionStoreBase.getState();
    expect(updated.state).toBe('connected');
    expect(updated.connectedAt).toBeGreaterThan(0);
  });

  it('should clear connectedAt on disconnect', () => {
    const store = useConnectionStoreBase.getState();
    store.setState('connected');
    store.setState('disconnected');

    const updated = useConnectionStoreBase.getState();
    expect(updated.connectedAt).toBeNull();
  });

  it('should set room code', () => {
    useConnectionStoreBase.getState().setRoomCode('ABC123');
    expect(useConnectionStoreBase.getState().roomCode).toBe('ABC123');
  });

  it('should reset all state', () => {
    const store = useConnectionStoreBase.getState();
    store.setRoomCode('ABC123');
    store.setState('connected');
    store.reset();

    const updated = useConnectionStoreBase.getState();
    expect(updated.state).toBe('idle');
    expect(updated.roomCode).toBeNull();
  });
});

describe('MonitorStore', () => {
  beforeEach(() => {
    useMonitorStoreBase.getState().reset();
  });

  it('should start with default values', () => {
    const state = useMonitorStoreBase.getState();
    expect(state.currentDb).toBe(-100);
    expect(state.threshold).toBe(-35);
    expect(state.alertState).toBe('idle');
    expect(state.readings).toHaveLength(0);
  });

  it('should push readings and update currentDb', () => {
    useMonitorStoreBase.getState().pushReading(-42);
    const state = useMonitorStoreBase.getState();

    expect(state.currentDb).toBe(-42);
    expect(state.readings).toHaveLength(1);
    expect(state.readings[0]).toBe(-42);
  });

  it('should cap readings buffer at 100', () => {
    const store = useMonitorStoreBase.getState();
    for (let i = 0; i < 110; i++) {
      store.pushReading(-40 + (i % 10));
    }

    expect(useMonitorStoreBase.getState().readings.length).toBeLessThanOrEqual(100);
  });

  it('should track last noise timestamp', () => {
    const before = Date.now();
    useMonitorStoreBase.getState().pushReading(-30); // above -45, counts as noise

    const state = useMonitorStoreBase.getState();
    expect(state.lastNoiseAt).toBeGreaterThanOrEqual(before);
  });

  it('should not update lastNoiseAt for silence', () => {
    useMonitorStoreBase.getState().pushReading(-50); // below -45, silence

    const state = useMonitorStoreBase.getState();
    expect(state.lastNoiseAt).toBeNull();
  });

  it('should update threshold', () => {
    useMonitorStoreBase.getState().setThreshold(-25);
    expect(useMonitorStoreBase.getState().threshold).toBe(-25);
  });

  it('should update alert state', () => {
    useMonitorStoreBase.getState().setAlertState('triggered');
    expect(useMonitorStoreBase.getState().alertState).toBe('triggered');
  });

  it('should start with default lullaby volume (0.5)', () => {
    expect(useMonitorStoreBase.getState().lullabyVolume).toBe(0.5);
  });

  it('should update lullaby volume', () => {
    useMonitorStoreBase.getState().setLullabyVolume(0.8);
    expect(useMonitorStoreBase.getState().lullabyVolume).toBe(0.8);
  });

  it('should reset lullaby volume to default', () => {
    const store = useMonitorStoreBase.getState();
    store.setLullabyVolume(0.1);
    store.reset();
    expect(useMonitorStoreBase.getState().lullabyVolume).toBe(0.5);
  });
});
