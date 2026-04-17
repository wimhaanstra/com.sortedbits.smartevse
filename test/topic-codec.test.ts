import { decode } from '../lib/topic-codec';

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
