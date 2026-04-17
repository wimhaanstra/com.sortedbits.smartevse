import { decode, encode } from '../lib/topic-codec';

describe('decode', () => {
  test('MainsCurrentL1 deci-A → A', () => {
    expect(decode('MainsCurrentL1', '105')).toEqual({ capId: 'measure_current.l1', value: 10.5 });
  });

  test('MainsCurrentL2 negative (exporting)', () => {
    expect(decode('MainsCurrentL2', '-3')).toEqual({ capId: 'measure_current.l2', value: -0.3 });
  });

  test('EVCurrentL3 deci-A → A', () => {
    expect(decode('EVCurrentL3', '160')).toEqual({ capId: 'measure_current.ev_l3', value: 16.0 });
  });

  test('MainsImportActiveEnergy Wh → kWh', () => {
    expect(decode('MainsImportActiveEnergy', '12345')).toEqual({
      capId: 'meter_power.mains_import', value: 12.345,
    });
  });

  test('EVChargePower raw W', () => {
    expect(decode('EVChargePower', '6900')).toEqual({ capId: 'measure_power', value: 6900 });
  });

  test('EVEnergyCharged Wh → kWh', () => {
    expect(decode('EVEnergyCharged', '500')).toEqual({ capId: 'meter_power.charged', value: 0.5 });
  });

  test('Mode string', () => {
    expect(decode('Mode', 'Smart')).toEqual({ capId: 'mode', value: 'Smart' });
  });

  test('Mode is case-insensitive', () => {
    expect(decode('Mode', 'smart')).toEqual({ capId: 'mode', value: 'Smart' });
  });

  test('Mode unknown → null', () => {
    expect(decode('Mode', 'Bogus')).toBeNull();
  });

  test('MaxCurrent deci-A ×10 (firmware publishes MaxCurrent*10) → A', () => {
    // firmware code: MQTTclient.publish(.../MaxCurrent, MaxCurrent * 10) — deci-A
    expect(decode('MaxCurrent', '160')).toEqual({ capId: 'max_current', value: 16 });
  });

  test('ChargeCurrentOverride deci-A → A', () => {
    expect(decode('ChargeCurrentOverride', '100')).toEqual({ capId: 'charge_current', value: 10 });
  });

  test('EVPlugState', () => {
    expect(decode('EVPlugState', 'Connected')).toEqual({ capId: 'ev_plug_state', value: 'Connected' });
  });

  test('State passthrough text', () => {
    expect(decode('State', 'State C, Charging')).toEqual({ capId: 'charger_state', value: 'State C, Charging' });
  });

  test('LEDColorOff RGB parse', () => {
    expect(decode('LEDColorOff', '0,255,0')).toEqual({ capId: 'led_color_off', value: '0,255,0' });
  });

  test('WiFiRSSI dBm', () => {
    expect(decode('WiFiRSSI', '-62')).toEqual({ capId: 'measure_rssi', value: -62 });
  });

  test('connected → online=true', () => {
    expect(decode('connected', 'online')).toEqual({ capId: 'online', value: true });
  });

  test('connected → online=false', () => {
    expect(decode('connected', 'offline')).toEqual({ capId: 'online', value: false });
  });

  test('NrOfPhases → string enum', () => {
    expect(decode('NrOfPhases', '3')).toEqual({ capId: 'nr_of_phases', value: '3' });
  });

  test('empty payload returns null', () => {
    expect(decode('MainsCurrentL1', '')).toBeNull();
  });

  test('NaN number payload returns null', () => {
    expect(decode('MainsCurrentL1', 'abc')).toBeNull();
  });

  test('unknown topic returns null', () => {
    expect(decode('NonExistentTopic', '123')).toBeNull();
  });
});

describe('encode', () => {
  test('mode capability → Set/Mode payload', () => {
    expect(encode('mode', 'Smart')).toEqual({ topic: 'Set/Mode', payload: 'Smart' });
  });

  test('mode unknown value → null', () => {
    expect(encode('mode', 'Bogus')).toBeNull();
  });

  test('charge_current A → Set/CurrentOverride deci-A', () => {
    expect(encode('charge_current', 16)).toEqual({ topic: 'Set/CurrentOverride', payload: '160' });
  });

  test('charge_current rounds to nearest deci-A', () => {
    expect(encode('charge_current', 6.04)).toEqual({ topic: 'Set/CurrentOverride', payload: '60' });
  });

  test('cable_lock numeric', () => {
    expect(encode('cable_lock', 2)).toEqual({ topic: 'Set/CableLock', payload: '2' });
  });

  test('cable_lock out-of-range rejected', () => {
    expect(encode('cable_lock', 9)).toBeNull();
  });

  test('enable_c2 string', () => {
    expect(encode('enable_c2', 'Auto')).toEqual({ topic: 'Set/EnableC2', payload: 'Auto' });
  });

  test('required_evccid', () => {
    expect(encode('required_evccid', 'ABCD1234')).toEqual({ topic: 'Set/RequiredEVCCID', payload: 'ABCD1234' });
  });

  test('led_color_normal RGB', () => {
    expect(encode('led_color_normal', '0,255,0')).toEqual({ topic: 'Set/ColorNormal', payload: '0,255,0' });
  });

  test('led_color_normal rejects bad format', () => {
    expect(encode('led_color_normal', 'green')).toBeNull();
  });

  test('max_sum_mains A integer (clamped 10-600)', () => {
    expect(encode('max_sum_mains', 300)).toEqual({ topic: 'Set/CurrentMaxSumMains', payload: '300' });
  });

  test('max_sum_mains out-of-range rejected', () => {
    expect(encode('max_sum_mains', 700)).toBeNull();
  });

  test('cp_pwm_override numeric passthrough', () => {
    expect(encode('cp_pwm_override', 50)).toEqual({ topic: 'Set/CPPWMOverride', payload: '50' });
  });

  test('unknown capability returns null', () => {
    expect(encode('nope', 'x')).toBeNull();
  });
});
