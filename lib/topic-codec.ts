import {
  MODES, Mode, ACCESS, Access, PLUG_STATES, PlugState, ENABLE_C2, EnableC2,
} from './types';

export interface DecodeResult { capId: string; value: string | number | boolean; }

function parseNum(s: string): number | null {
  if (s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function matchEnum<T extends string>(allowed: readonly T[], raw: string): T | null {
  const lower = raw.toLowerCase();
  const hit = allowed.find((v) => v.toLowerCase() === lower);
  return hit ?? null;
}

type Decoder = (payload: string) => DecodeResult | null;

const num = (capId: string, factor = 1): Decoder => (p) => {
  const n = parseNum(p);
  if (n === null) return null;
  const raw = n * factor;
  // Round to 10 significant decimal digits to avoid IEEE-754 noise (e.g. -3 * 0.1)
  const value = parseFloat(raw.toPrecision(10));
  return { capId, value };
};

const text = (capId: string): Decoder => (p) => ({ capId, value: p });

const mode: Decoder = (p) => {
  const m = matchEnum<Mode>(MODES, p);
  return m ? { capId: 'mode', value: m } : null;
};

const access: Decoder = (p) => {
  const a = matchEnum<Access>(ACCESS, p);
  return a ? { capId: 'access', value: a } : null;
};

const plug: Decoder = (p) => {
  const s = matchEnum<PlugState>(PLUG_STATES, p);
  return s ? { capId: 'ev_plug_state', value: s } : null;
};

const enableC2: Decoder = (p) => {
  const e = matchEnum<EnableC2>(ENABLE_C2, p);
  if (e) return { capId: 'enable_c2', value: e };
  const n = parseNum(p);
  if (n !== null && n >= 0 && n < ENABLE_C2.length) {
    return { capId: 'enable_c2', value: ENABLE_C2[n] as EnableC2 };
  }
  return null;
};

const connected: Decoder = (p) => {
  if (p === 'online') return { capId: 'online', value: true };
  if (p === 'offline') return { capId: 'online', value: false };
  return null;
};

const DECODERS: Record<string, Decoder> = {
  MainsCurrentL1: num('measure_current.l1', 0.1),
  MainsCurrentL2: num('measure_current.l2', 0.1),
  MainsCurrentL3: num('measure_current.l3', 0.1),
  EVCurrentL1: num('measure_current.ev_l1', 0.1),
  EVCurrentL2: num('measure_current.ev_l2', 0.1),
  EVCurrentL3: num('measure_current.ev_l3', 0.1),
  HomeBatteryCurrent: num('measure_current.home_battery', 0.1),
  MainsImportActiveEnergy: num('meter_power.mains_import', 0.001),
  MainsExportActiveEnergy: num('meter_power.mains_export', 0.001),
  EVImportActiveEnergy: num('meter_power.ev_import', 0.001),
  EVExportActiveEnergy: num('meter_power.ev_export', 0.001),
  EVChargePower: num('measure_power', 1),
  EVEnergyCharged: num('meter_power.charged', 0.001),
  EVTotalEnergyCharged: num('meter_power.total_charged', 0.001),
  ESPTemp: num('measure_temperature.esp', 1),
  MaxCurrent: num('max_current', 0.1),
  MaxSumMains: num('max_sum_mains', 1),
  MaxSumMainsTime: num('max_sum_mains_time', 1),
  ChargeCurrent: num('charge_current', 0.1),
  ChargeCurrentOverride: num('charge_current', 0.1),
  NrOfPhases: (p) => (p === '1' || p === '3' ? { capId: 'nr_of_phases', value: p } : null),
  CPPWM: num('cp_pwm', 1),
  CPPWMOverride: num('cp_pwm_override', 1),
  EVInitialSoC: num('ev_soc_initial', 1),
  EVFullSoC: num('ev_soc_full', 1),
  EVComputedSoC: num('ev_soc_computed', 1),
  EVRemainingSoC: num('ev_soc_remaining', 1),
  EVTimeUntilFull: num('ev_time_until_full', 1),
  EVEnergyCapacity: num('ev_energy_capacity', 0.001),
  EVEnergyRequest: num('ev_energy_request', 0.001),
  WiFiRSSI: num('measure_rssi', 1),
  ESPUptime: num('esp_uptime', 1),
  LoadBl: num('load_bl', 1),
  SolarStopTimer: num('solar_stop_timer', 1),
  Mode: mode,
  Access: access,
  EVPlugState: plug,
  EnableC2: enableC2,
  State: text('charger_state'),
  Error: text('error'),
  RFID: text('rfid_status'),
  RFIDLastRead: text('rfid_last_read'),
  EVCCID: text('evccid'),
  RequiredEVCCID: text('required_evccid'),
  WiFiSSID: text('wifi_ssid'),
  WiFiBSSID: text('wifi_bssid'),
  PairingPin: text('pairing_pin'),
  OCPP: text('ocpp'),
  OCPPConnection: text('ocpp_connection'),
  LEDColorOff: text('led_color_off'),
  LEDColorNormal: text('led_color_normal'),
  LEDColorSmart: text('led_color_smart'),
  LEDColorSolar: text('led_color_solar'),
  LEDColorCustom: text('led_color_custom'),
  CableLock: num('cable_lock', 1),
  CustomButton: text('custom_button'),
  connected,
};

export function decode(suffix: string, payload: string): DecodeResult | null {
  const dec = DECODERS[suffix];
  return dec ? dec(payload) : null;
}

export const KNOWN_SUFFIXES = Object.keys(DECODERS);
