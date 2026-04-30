// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { semantic, getDbColor } from '@baby-monitor/design-tokens';
import { BabyStationUi } from '../../src/presentation/components/baby-station.ui';

const html = `
  <div id="app">
    <div id="status"></div>
    <div id="db-meter"></div>
    <div id="db-value"></div>
    <div id="timer"></div>
    <button id="disconnect-btn"></button>
    <div id="error" style="display:none"></div>
  </div>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

describe('BabyStationUi', () => {
  let ui: BabyStationUi;

  beforeEach(() => {
    document.body.innerHTML = html;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    ui = new BabyStationUi();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  describe('setConnectionState', () => {
    test('renders the Portuguese label and muted color for idle', () => {
      ui.setConnectionState('idle');
      expect($('status').textContent).toBe('Inicializando...');
      expect($('status').style.color).toBeTruthy();
    });

    test('uses the connected color and label for connected', () => {
      ui.setConnectionState('connected');
      expect($('status').textContent).toBe('Transmitindo');
      expect($('status').style.color).toBe(toCssColor(semantic.status.connected));
    });

    test('uses the reconnecting color for waiting / connecting / reconnecting', () => {
      const expectedColor = toCssColor(semantic.status.reconnecting);

      ui.setConnectionState('waiting');
      expect($('status').textContent).toBe('Aguardando parent...');
      expect($('status').style.color).toBe(expectedColor);

      ui.setConnectionState('connecting');
      expect($('status').textContent).toBe('Conectando...');
      expect($('status').style.color).toBe(expectedColor);

      ui.setConnectionState('reconnecting');
      expect($('status').textContent).toBe('Reconectando...');
      expect($('status').style.color).toBe(expectedColor);
    });

    test('uses the disconnected color for disconnected', () => {
      ui.setConnectionState('disconnected');
      expect($('status').textContent).toBe('Desconectado');
      expect($('status').style.color).toBe(toCssColor(semantic.status.disconnected));
    });

    test('on connected: starts the timer, dims the screen, reveals the disconnect button', () => {
      ui.setConnectionState('connected');

      expect($<HTMLButtonElement>('disconnect-btn').style.display).toBe('block');
      expect($('app').style.filter).toBe('brightness(0.3)');

      vi.advanceTimersByTime(1000);
      expect($('timer').textContent).toBe('00:00:01');
    });

    test('on disconnected: stops the timer and undims the screen', () => {
      ui.setConnectionState('connected');
      vi.advanceTimersByTime(2000);
      const timerSnapshot = $('timer').textContent;

      ui.setConnectionState('disconnected');
      vi.advanceTimersByTime(5000);

      expect($('timer').textContent).toBe(timerSnapshot);
      expect($('app').style.filter).toBe('none');
    });
  });

  describe('updateDbLevel', () => {
    test('writes the rounded dB value with the dB suffix', () => {
      ui.updateDbLevel(-42.6);
      expect($('db-value').textContent).toBe('-43 dB');
    });

    test('clamps the meter width between 0% and 100%', () => {
      ui.updateDbLevel(-100); // very quiet -> below the visible range
      expect($('db-meter').style.width).toBe('0%');

      ui.updateDbLevel(0); // very loud -> saturates the meter
      expect($('db-meter').style.width).toBe('100%');
    });

    test('maps mid-range dB to a proportional meter width', () => {
      ui.updateDbLevel(-30);
      // (-30 + 60) / 60 * 100 = 50
      expect($('db-meter').style.width).toBe('50%');
    });

    test('paints meter and value with the same threshold-based color', () => {
      ui.updateDbLevel(-10);
      const color = toCssColor(getDbColor(-10));
      expect($('db-meter').style.backgroundColor).toBe(color);
      expect($('db-value').style.color).toBe(color);
    });
  });

  describe('showError', () => {
    test('writes the message and reveals the error element', () => {
      ui.showError('Sala não encontrada');
      expect($('error').textContent).toBe('Sala não encontrada');
      expect($('error').style.display).toBe('block');
    });
  });

  describe('onDisconnect', () => {
    test('invokes the callback when the button is clicked', () => {
      const cb = vi.fn();
      ui.onDisconnect(cb);

      $<HTMLButtonElement>('disconnect-btn').click();

      expect(cb).toHaveBeenCalledOnce();
    });

    test('supports multiple subscribers (does not replace previous handler)', () => {
      const a = vi.fn();
      const b = vi.fn();
      ui.onDisconnect(a);
      ui.onDisconnect(b);

      $<HTMLButtonElement>('disconnect-btn').click();

      expect(a).toHaveBeenCalledOnce();
      expect(b).toHaveBeenCalledOnce();
    });
  });

  describe('timer formatting', () => {
    test('pads hours, minutes, and seconds to two digits', () => {
      ui.setConnectionState('connected');

      vi.advanceTimersByTime(9_000);
      expect($('timer').textContent).toBe('00:00:09');

      vi.advanceTimersByTime(51_000); // total 60s
      expect($('timer').textContent).toBe('00:01:00');

      vi.advanceTimersByTime(3_540_000); // total 3600s
      expect($('timer').textContent).toBe('01:00:00');
    });
  });
});

// happy-dom returns CSS color strings in `rgb(...)` form. Convert
// hex tokens to the same shape so equality checks work regardless of
// the underlying token format.
const toCssColor = (token: string): string => {
  const probe = document.createElement('div');
  probe.style.color = token;
  return probe.style.color;
};
