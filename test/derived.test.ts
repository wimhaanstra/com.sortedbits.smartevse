import { deriveChargingState, deriveIsCharging, deriveTargetPower } from '../lib/derived';

describe('deriveChargingState', () => {
  test.each([
    [{ plug: 'Disconnected', state: 'Charging', mode: 'Normal' }, 'plugged_out'],
    [{ plug: 'Connected', state: 'Charging', mode: 'Normal' }, 'plugged_in_charging'],
    [{ plug: 'Connected', state: 'Charging', mode: 'Smart' }, 'plugged_in_charging'],
    [{ plug: 'Connected', state: 'Charging Stopped', mode: 'Smart' }, 'plugged_in'],
    [{ plug: 'Connected', state: 'Charging Stopped', mode: 'Pause' }, 'plugged_in_paused'],
    [{ plug: 'Connected', state: 'Charging Stopped', mode: 'Off' }, 'plugged_in_paused'],
    [{ plug: 'Connected', state: 'State B', mode: 'Pause' }, 'plugged_in_paused'],
    [{ plug: 'Connected', state: 'State B', mode: 'Off' }, 'plugged_in_paused'],
    [{ plug: 'Connected', state: 'State B', mode: 'Normal' }, 'plugged_in'],
    [{ plug: 'Connected', state: 'State B', mode: 'Smart' }, 'plugged_in'],
  ] as const)('%o → %s', (ctx, expected) => {
    expect(deriveChargingState(ctx)).toBe(expected);
  });

  test('handles undefined inputs → plugged_out', () => {
    expect(deriveChargingState({ plug: undefined, state: undefined, mode: undefined })).toBe('plugged_out');
  });
});

describe('deriveIsCharging', () => {
  test('Normal + Charging → true', () => expect(deriveIsCharging('Normal', 'Charging')).toBe(true));
  test('Smart + Charging → true', () => expect(deriveIsCharging('Smart', 'Charging')).toBe(true));
  test('Solar + Charging → true', () => expect(deriveIsCharging('Solar', 'Charging')).toBe(true));
  test('Smart + Connected to EV → false', () => expect(deriveIsCharging('Smart', 'Connected to EV')).toBe(false));
  test('Smart + Charging Stopped → false', () => expect(deriveIsCharging('Smart', 'Charging Stopped')).toBe(false));
  test('Pause + Charging → false', () => expect(deriveIsCharging('Pause', 'Charging')).toBe(false));
  test('Off + Charging → false', () => expect(deriveIsCharging('Off', 'Charging')).toBe(false));
  test('undefined mode → false', () => expect(deriveIsCharging(undefined, 'Charging')).toBe(false));
  test('undefined state → false', () => expect(deriveIsCharging('Smart', undefined)).toBe(false));
});

describe('deriveTargetPower', () => {
  test('16A × 230V × 1 phase', () => {
    expect(deriveTargetPower(16, '1')).toBe(3680);
  });
  test('32A × 230V × 3 phases', () => {
    expect(deriveTargetPower(32, '3')).toBe(22080);
  });
  test('undefined phase defaults to 1', () => {
    expect(deriveTargetPower(16, undefined)).toBe(3680);
  });
  test('undefined current → 0', () => {
    expect(deriveTargetPower(undefined, '1')).toBe(0);
  });
});
