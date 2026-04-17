import { KNOWN_SUFFIXES, WRITABLE_CAPS } from './topic-codec';

export const READ_TOPICS: readonly string[] = KNOWN_SUFFIXES;
export const WRITE_CAPS: readonly string[] = WRITABLE_CAPS;

export const CAPABILITY_MAP = {
  nativeCaps: [
    'evcharger_charging', 'evcharger_charging_state',
    'measure_power', 'target_power', 'target_power_mode',
    'meter_power.charged', 'meter_power.total_charged',
    'meter_power.mains_import', 'meter_power.mains_export',
    'meter_power.ev_import', 'meter_power.ev_export',
    'measure_current.l1', 'measure_current.l2', 'measure_current.l3',
    'measure_current.ev_l1', 'measure_current.ev_l2', 'measure_current.ev_l3',
    'measure_current.home_battery',
    'measure_temperature.esp',
  ] as const,

  customCaps: [
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
  ] as const,
} as const;

export type NativeCapId = typeof CAPABILITY_MAP.nativeCaps[number];
export type CustomCapId = typeof CAPABILITY_MAP.customCaps[number];
export type CapId = NativeCapId | CustomCapId;

export const ALL_CAPS: readonly string[] = [
  ...CAPABILITY_MAP.nativeCaps, ...CAPABILITY_MAP.customCaps,
];
