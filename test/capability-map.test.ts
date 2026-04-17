import { CAPABILITY_MAP, READ_TOPICS, WRITE_CAPS } from '../lib/capability-map';
import { KNOWN_SUFFIXES, WRITABLE_CAPS } from '../lib/topic-codec';

describe('capability-map', () => {
  test('every known inbound topic is in the map', () => {
    for (const suffix of KNOWN_SUFFIXES) {
      expect(READ_TOPICS).toContain(suffix);
    }
  });

  test('every writable capability is in the map', () => {
    for (const cap of WRITABLE_CAPS) {
      expect(WRITE_CAPS).toContain(cap);
    }
  });

  test('custom capabilities are enumerated', () => {
    const expected = [
      'mode', 'charge_current', 'nr_of_phases', 'max_current', 'max_sum_mains',
      'max_sum_mains_time', 'ev_plug_state', 'charger_state', 'access',
      'cable_lock', 'enable_c2', 'cp_pwm', 'cp_pwm_override',
      'ev_soc_initial', 'ev_soc_full', 'ev_soc_computed', 'ev_soc_remaining',
      'ev_time_until_full', 'ev_energy_capacity', 'ev_energy_request',
      'evccid', 'required_evccid', 'rfid_status', 'rfid_last_read',
      'led_color_off', 'led_color_normal', 'led_color_smart', 'led_color_solar', 'led_color_custom',
      'custom_button', 'ocpp', 'ocpp_connection', 'wifi_ssid', 'wifi_bssid',
      'measure_rssi', 'esp_uptime', 'load_bl', 'pairing_pin', 'solar_stop_timer',
      'online', 'error',
    ];
    for (const cap of expected) {
      expect(CAPABILITY_MAP.customCaps).toContain(cap);
    }
  });
});
