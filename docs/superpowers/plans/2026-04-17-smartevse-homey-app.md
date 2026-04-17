# SmartEVSE Homey App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Homey SDK v3 app (`com.sortedbits.smartevse`) that exposes every SmartEVSE-3 MQTT topic as a Homey EV-charger device, with full EN/NL localisation and Jest unit-test coverage on every pure-logic layer.

**Architecture:** One app-level `MqttHub` (single `mqtt.js` client) routes messages to per-device handlers by topic prefix. Pure `TopicCodec` + `CapabilityMap` translate between MQTT topics and Homey capabilities. `SmartEvseDevice` is the only layer bridging Homey SDK and `MqttHub`. See `docs/superpowers/specs/2026-04-17-smartevse-homey-app-design.md`.

**Tech Stack:** TypeScript 5 (strict), Homey SDK v3, `mqtt` ^5, Jest 29 + ts-jest, ESLint (`eslint-config-athom`).

---

## Reference constants

These values are used throughout the plan. Copy them verbatim.

**Valid SmartEVSE modes (capitalisation matches firmware):** `Off`, `Normal`, `Smart`, `Solar`, `Pause`.

**`EnableC2` values (firmware accepts either number or string):**

| # | String |
|---|---|
| 0 | `Not present` |
| 1 | `Always Off` |
| 2 | `Solar Off` |
| 3 | `Always On` |
| 4 | `Auto` |

**`CableLock` values:** `0` … `4` (numeric, firmware-defined).

**Access values:** `Allow`, `Deny`, `Pause`.

**EVPlugState:** `Connected`, `Disconnected`.

**Derived `evcharger_charging_state` (enum values from Homey SDK):**
- `plugged_out` — when `EVPlugState === 'Disconnected'`
- `plugged_in_charging` — when `EVPlugState === 'Connected'` AND `State` starts with `'C'`
- `plugged_in_paused` — when `EVPlugState === 'Connected'` AND `Mode === 'Pause'`
- `plugged_in` — any other connected state

**Unit conversions:**
- Current on the wire: deci-Amps (`160` = `16.0 A`). Always `Math.round(A * 10)` on write, `raw / 10` on read.
- `target_power` (W) ↔ charge current: `A = round(W / (230 * phases))`. When `nr_of_phases` not yet known, assume `1`.
- Energy: device publishes Wh, capabilities store kWh → divide by `1000` on read.

---

## File layout (authoritative)

```
com.sortedbits.smartevse/
├─ app.ts                                # construct MqttHub from settings
├─ settings/
│  └─ index.html                         # broker config page
├─ lib/
│  ├─ types.ts                           # enums + interfaces
│  ├─ topic-codec.ts                     # pure encode/decode
│  ├─ capability-map.ts                  # declarative table
│  ├─ derived.ts                         # derived-capability computations
│  └─ mqtt-hub.ts                        # mqtt.js wrapper
├─ drivers/smartevse/
│  ├─ driver.ts
│  ├─ device.ts
│  ├─ driver.compose.json
│  └─ pair/
│     └─ enter_prefix.html
├─ .homeycompose/
│  ├─ app.json                           # already exists
│  ├─ capabilities/                      # one JSON per custom capability (EN+NL)
│  └─ flow/
│     ├─ actions/
│     ├─ triggers/
│     └─ conditions/
├─ locales/
│  ├─ en.json
│  └─ nl.json
├─ test/
│  ├─ topic-codec.test.ts
│  ├─ derived.test.ts
│  ├─ meter-payload.test.ts
│  ├─ capability-map.test.ts
│  └─ mqtt-hub.test.ts
├─ jest.config.ts
├─ tsconfig.json                         # strict, ES2022
└─ package.json                          # updated deps
```

---

## Task 1: Project bootstrap

**Files:**
- Create: `jest.config.ts`, `.gitignore`, `.eslintignore`
- Modify: `package.json`, `tsconfig.json`

- [ ] **Step 1: Initialise git if not already a repo**

Run: `cd /Volumes/Projects/sorted-bits/com.sortedbits.smartevse && [ -d .git ] || git init`
Expected: Either "Initialized empty Git repository…" or no output (already a repo).

- [ ] **Step 2: Replace `package.json` with the corrected dependency set**

File: `package.json`

```json
{
  "name": "com.sortedbits.smartevse",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc --noEmit",
    "lint": "eslint --ext .js,.ts --ignore-path .eslintignore .",
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "dependencies": {
    "mqtt": "^5.10.1"
  },
  "devDependencies": {
    "@tsconfig/node16": "^16.1.8",
    "@types/homey": "npm:homey-apps-sdk-v3-types@^0.3.12",
    "@types/jest": "^29.5.14",
    "@types/node": "^20.14.10",
    "eslint": "^8.57.0",
    "eslint-config-athom": "^3.1.5",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.5",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 3: Replace `tsconfig.json` with a stricter config**

File: `tsconfig.json`

```json
{
  "extends": "@tsconfig/node16/tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "outDir": ".homeybuild/"
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", ".homeybuild", "test"]
}
```

- [ ] **Step 4: Create `jest.config.ts`**

File: `jest.config.ts`

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  collectCoverageFrom: ['lib/**/*.ts'],
  clearMocks: true,
};

export default config;
```

- [ ] **Step 5: Update `.gitignore` and add `.eslintignore`**

File: `.gitignore` (overwrite)

```
node_modules/
.homeybuild/
coverage/
*.log
.DS_Store
env.json
```

File: `.eslintignore` (create)

```
node_modules/
.homeybuild/
coverage/
test/fixtures/
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: no errors, `node_modules/mqtt` and `node_modules/jest` present.

- [ ] **Step 7: Smoke-test tooling**

Run: `npx tsc --noEmit && npx jest --passWithNoTests`
Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: bootstrap tooling (mqtt, jest, ts-jest, strict tsconfig)"
```

---

## Task 2: Shared types (`lib/types.ts`)

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: Write the file**

File: `lib/types.ts`

```typescript
export const MODES = ['Off', 'Normal', 'Smart', 'Solar', 'Pause'] as const;
export type Mode = typeof MODES[number];

export const ACCESS = ['Allow', 'Deny', 'Pause'] as const;
export type Access = typeof ACCESS[number];

export const PLUG_STATES = ['Connected', 'Disconnected'] as const;
export type PlugState = typeof PLUG_STATES[number];

export const ENABLE_C2 = [
  'Not present', 'Always Off', 'Solar Off', 'Always On', 'Auto',
] as const;
export type EnableC2 = typeof ENABLE_C2[number];

export const CHARGING_STATES = [
  'plugged_out', 'plugged_in', 'plugged_in_charging', 'plugged_in_paused',
] as const;
export type ChargingState = typeof CHARGING_STATES[number];

export interface MqttConfig {
  host: string;
  port: number;
  protocol: 'mqtt' | 'mqtts' | 'ws' | 'wss';
  username?: string;
  password?: string;
}

export interface HubSubscription {
  prefix: string;
  onMessage: (suffix: string, payload: string) => void;
  onOnline: (online: boolean) => void;
}

export type RgbTuple = readonly [number, number, number];
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat(lib): shared types and enums"
```

---

## Task 3: Topic codec — decoders (TDD, pure)

The codec is a set of pure functions that turn raw MQTT payloads into typed capability values.

**Files:**
- Create: `lib/topic-codec.ts`, `test/topic-codec.test.ts`

- [ ] **Step 1: Write the failing test file**

File: `test/topic-codec.test.ts`

```typescript
import { decode, DecodeResult } from '../lib/topic-codec';

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
```

- [ ] **Step 2: Run the tests — confirm they fail (module not found)**

Run: `npx jest test/topic-codec.test.ts`
Expected: `Cannot find module '../lib/topic-codec'`.

- [ ] **Step 3: Implement the decoder**

File: `lib/topic-codec.ts`

```typescript
import { MODES, Mode, ACCESS, Access, PLUG_STATES, PlugState, ENABLE_C2, EnableC2 } from './types';

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
  return n === null ? null : { capId, value: n * factor };
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
  Mode,
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
```

- [ ] **Step 4: Run tests — all pass**

Run: `npx jest test/topic-codec.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/topic-codec.ts test/topic-codec.test.ts
git commit -m "feat(codec): topic decoders with exhaustive tests"
```

---

## Task 4: Topic codec — encoders (TDD, pure)

**Files:**
- Modify: `lib/topic-codec.ts`, `test/topic-codec.test.ts`

- [ ] **Step 1: Append failing tests to the existing test file**

Append to `test/topic-codec.test.ts`:

```typescript
import { encode } from '../lib/topic-codec';

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
```

- [ ] **Step 2: Run tests — fail (encode not exported)**

Run: `npx jest test/topic-codec.test.ts -t "encode"`
Expected: ReferenceError / import error.

- [ ] **Step 3: Append encoder to `lib/topic-codec.ts`**

Append to `lib/topic-codec.ts`:

```typescript
export interface EncodeResult { topic: string; payload: string; }
type Encoder = (value: unknown) => EncodeResult | null;

const RGB_RE = /^\d{1,3},\d{1,3},\d{1,3}$/;

const ENCODERS: Record<string, Encoder> = {
  mode: (v) => {
    const m = typeof v === 'string' ? matchEnum(MODES, v) : null;
    return m ? { topic: 'Set/Mode', payload: m } : null;
  },
  charge_current: (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    return { topic: 'Set/CurrentOverride', payload: String(Math.round(v * 10)) };
  },
  cable_lock: (v) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 4) return null;
    return { topic: 'Set/CableLock', payload: String(v) };
  },
  enable_c2: (v) => {
    if (typeof v === 'string' && matchEnum(ENABLE_C2, v)) {
      return { topic: 'Set/EnableC2', payload: v };
    }
    if (typeof v === 'number' && v >= 0 && v < ENABLE_C2.length) {
      return { topic: 'Set/EnableC2', payload: String(v) };
    }
    return null;
  },
  required_evccid: (v) => typeof v === 'string'
    ? { topic: 'Set/RequiredEVCCID', payload: v } : null,
  led_color_off: (v) => rgbEnc('Set/ColorOff', v),
  led_color_normal: (v) => rgbEnc('Set/ColorNormal', v),
  led_color_smart: (v) => rgbEnc('Set/ColorSmart', v),
  led_color_solar: (v) => rgbEnc('Set/ColorSolar', v),
  max_sum_mains: (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    const n = Math.round(v);
    if (n < 10 || n > 600) return null;
    return { topic: 'Set/CurrentMaxSumMains', payload: String(n) };
  },
  cp_pwm_override: (v) => typeof v === 'number' && Number.isFinite(v)
    ? { topic: 'Set/CPPWMOverride', payload: String(Math.round(v)) } : null,
  custom_button: (v) => (v === 'On' || v === 'Off')
    ? { topic: 'CustomButton', payload: v } : null,
};

function rgbEnc(topic: string, v: unknown): EncodeResult | null {
  if (typeof v !== 'string' || !RGB_RE.test(v)) return null;
  const parts = v.split(',').map(Number);
  if (parts.some((n) => n < 0 || n > 255)) return null;
  return { topic, payload: v };
}

export function encode(capId: string, value: unknown): EncodeResult | null {
  const enc = ENCODERS[capId];
  return enc ? enc(value) : null;
}

export const WRITABLE_CAPS = Object.keys(ENCODERS);
```

- [ ] **Step 4: Run tests — pass**

Run: `npx jest test/topic-codec.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/topic-codec.ts test/topic-codec.test.ts
git commit -m "feat(codec): topic encoders for writable capabilities"
```

---

## Task 5: Meter & helper payload encoders (TDD)

**Files:**
- Create: `lib/meter-payload.ts`, `test/meter-payload.test.ts`

- [ ] **Step 1: Write the failing test**

File: `test/meter-payload.test.ts`

```typescript
import {
  encodeMainsMeter, encodeEvMeter, encodeHomeBatteryCurrent, encodeRfidSwipe,
  wattsToDeciAmps,
} from '../lib/meter-payload';

describe('encodeMainsMeter', () => {
  test('A → deci-A, colon-joined', () => {
    expect(encodeMainsMeter(10.5, -0.3, 2.0)).toBe('105:-3:20');
  });
  test('integer currents', () => {
    expect(encodeMainsMeter(10, 10, 10)).toBe('100:100:100');
  });
});

describe('encodeEvMeter', () => {
  test('five-field payload', () => {
    expect(encodeEvMeter(10, 10, 10, 6900, 12345)).toBe('100:100:100:6900:12345');
  });
});

describe('encodeHomeBatteryCurrent', () => {
  test('positive charging', () => {
    expect(encodeHomeBatteryCurrent(5)).toBe('50');
  });
  test('negative discharging', () => {
    expect(encodeHomeBatteryCurrent(-3.2)).toBe('-32');
  });
});

describe('encodeRfidSwipe', () => {
  test('accepts 12-char hex', () => {
    expect(encodeRfidSwipe('112233445566')).toBe('112233445566');
  });
  test('accepts 14-char hex', () => {
    expect(encodeRfidSwipe('11223344556677')).toBe('11223344556677');
  });
  test('rejects wrong length', () => {
    expect(() => encodeRfidSwipe('1122')).toThrow();
  });
  test('rejects non-hex', () => {
    expect(() => encodeRfidSwipe('ZZZZZZZZZZZZ')).toThrow();
  });
  test('uppercases lowercase hex', () => {
    expect(encodeRfidSwipe('abcdef123456')).toBe('ABCDEF123456');
  });
});

describe('wattsToDeciAmps', () => {
  test('1-phase 1380W @ 230V = 60 deci-A', () => {
    expect(wattsToDeciAmps(1380, 1)).toBe(60);
  });
  test('3-phase 22080W @ 230V = 320 deci-A', () => {
    expect(wattsToDeciAmps(22080, 3)).toBe(320);
  });
  test('zero watts → zero deci-A', () => {
    expect(wattsToDeciAmps(0, 1)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — fail (module not found)**

Run: `npx jest test/meter-payload.test.ts`
Expected: module-not-found error.

- [ ] **Step 3: Implement**

File: `lib/meter-payload.ts`

```typescript
const HEX_RE = /^[0-9A-Fa-f]+$/;

function dA(a: number): number {
  return Math.round(a * 10);
}

export function encodeMainsMeter(l1: number, l2: number, l3: number): string {
  return `${dA(l1)}:${dA(l2)}:${dA(l3)}`;
}

export function encodeEvMeter(
  l1: number, l2: number, l3: number, powerW: number, energyWh: number,
): string {
  return `${dA(l1)}:${dA(l2)}:${dA(l3)}:${Math.round(powerW)}:${Math.round(energyWh)}`;
}

export function encodeHomeBatteryCurrent(ampsSigned: number): string {
  return String(dA(ampsSigned));
}

export function encodeRfidSwipe(uidHex: string): string {
  if (!HEX_RE.test(uidHex) || (uidHex.length !== 12 && uidHex.length !== 14)) {
    throw new Error(`Invalid RFID UID: expected 12 or 14 hex characters, got "${uidHex}"`);
  }
  return uidHex.toUpperCase();
}

export function wattsToDeciAmps(watts: number, phases: 1 | 3): number {
  const amps = watts / (230 * phases);
  return Math.round(amps * 10);
}
```

- [ ] **Step 4: Run tests — pass**

Run: `npx jest test/meter-payload.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/meter-payload.ts test/meter-payload.test.ts
git commit -m "feat(lib): meter payload encoders and watts→deci-A helper"
```

---

## Task 6: Derived capabilities (TDD, pure)

**Files:**
- Create: `lib/derived.ts`, `test/derived.test.ts`

- [ ] **Step 1: Write failing tests**

File: `test/derived.test.ts`

```typescript
import { deriveChargingState, deriveIsCharging, deriveTargetPower } from '../lib/derived';

describe('deriveChargingState', () => {
  test.each([
    [{ plug: 'Disconnected', state: 'State A', mode: 'Normal' }, 'plugged_out'],
    [{ plug: 'Connected', state: 'State C, Charging', mode: 'Normal' }, 'plugged_in_charging'],
    [{ plug: 'Connected', state: 'State B', mode: 'Pause' }, 'plugged_in_paused'],
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
  test('Normal → true', () => expect(deriveIsCharging('Normal')).toBe(true));
  test('Smart → true', () => expect(deriveIsCharging('Smart')).toBe(true));
  test('Solar → true', () => expect(deriveIsCharging('Solar')).toBe(true));
  test('Pause → false', () => expect(deriveIsCharging('Pause')).toBe(false));
  test('Off → false', () => expect(deriveIsCharging('Off')).toBe(false));
  test('undefined → false', () => expect(deriveIsCharging(undefined)).toBe(false));
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
```

- [ ] **Step 2: Run tests — fail**

Run: `npx jest test/derived.test.ts`
Expected: module-not-found.

- [ ] **Step 3: Implement**

File: `lib/derived.ts`

```typescript
import { ChargingState, Mode, PlugState } from './types';

export interface ChargingStateInputs {
  plug: PlugState | undefined;
  state: string | undefined;
  mode: Mode | undefined;
}

export function deriveChargingState({ plug, state, mode }: ChargingStateInputs): ChargingState {
  if (plug !== 'Connected') return 'plugged_out';
  if (state?.toUpperCase().startsWith('STATE C')) return 'plugged_in_charging';
  if (mode === 'Pause') return 'plugged_in_paused';
  return 'plugged_in';
}

export function deriveIsCharging(mode: Mode | undefined): boolean {
  return mode !== undefined && mode !== 'Pause' && mode !== 'Off';
}

export function deriveTargetPower(amps: number | undefined, phases: '1' | '3' | undefined): number {
  if (amps === undefined) return 0;
  const p = phases === '3' ? 3 : 1;
  return Math.round(amps * 230 * p);
}
```

- [ ] **Step 4: Run tests — pass**

Run: `npx jest test/derived.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/derived.ts test/derived.test.ts
git commit -m "feat(lib): derived capability computations"
```

---

## Task 7: Capability map (declarative)

**Files:**
- Create: `lib/capability-map.ts`, `test/capability-map.test.ts`

- [ ] **Step 1: Write the capability-map test first**

File: `test/capability-map.test.ts`

```typescript
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
```

- [ ] **Step 2: Run — fails (module not found)**

Run: `npx jest test/capability-map.test.ts`
Expected: module-not-found.

- [ ] **Step 3: Implement the map**

File: `lib/capability-map.ts`

```typescript
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
```

- [ ] **Step 4: Run tests — pass**

Run: `npx jest test/capability-map.test.ts`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add lib/capability-map.ts test/capability-map.test.ts
git commit -m "feat(lib): capability map + completeness test"
```

---

## Task 8: MqttHub — connect & publish (TDD, mqtt mocked)

**Files:**
- Create: `lib/mqtt-hub.ts`, `test/mqtt-hub.test.ts`

- [ ] **Step 1: Write a failing test**

File: `test/mqtt-hub.test.ts`

```typescript
import { EventEmitter } from 'events';
import { MqttHub } from '../lib/mqtt-hub';

type MockClient = EventEmitter & {
  connected: boolean;
  publish: jest.Mock;
  subscribe: jest.Mock;
  unsubscribe: jest.Mock;
  end: jest.Mock;
};

const mocks: { client?: MockClient; connect: jest.Mock } = {
  client: undefined,
  connect: jest.fn(),
};

jest.mock('mqtt', () => ({
  connect: (...args: unknown[]) => {
    mocks.connect(...args);
    const client = new EventEmitter() as MockClient;
    client.connected = false;
    client.publish = jest.fn((topic, payload, opts, cb) => {
      if (typeof opts === 'function') cb = opts;
      if (cb) (cb as Function)();
      return client;
    });
    client.subscribe = jest.fn((topic, opts, cb) => {
      if (typeof opts === 'function') cb = opts;
      if (cb) (cb as Function)(null);
      return client;
    });
    client.unsubscribe = jest.fn((topic, opts, cb) => {
      if (typeof opts === 'function') cb = opts;
      if (cb) (cb as Function)(null);
      return client;
    });
    client.end = jest.fn((force, opts, cb) => {
      if (typeof force === 'function') cb = force;
      else if (typeof opts === 'function') cb = opts;
      if (cb) (cb as Function)();
      return client;
    });
    mocks.client = client;
    return client;
  },
}));

function connectIt(): MockClient {
  const c = mocks.client!;
  c.connected = true;
  c.emit('connect');
  return c;
}

describe('MqttHub', () => {
  beforeEach(() => { mocks.connect.mockClear(); mocks.client = undefined; });

  test('connect() builds URL with protocol/host/port and creds', async () => {
    const hub = new MqttHub();
    const p = hub.connect({ protocol: 'mqtts', host: 'broker.local', port: 8883, username: 'u', password: 'p' });
    connectIt();
    await p;
    expect(mocks.connect).toHaveBeenCalledWith('mqtts://broker.local:8883', expect.objectContaining({
      username: 'u', password: 'p', reconnectPeriod: expect.any(Number),
    }));
  });

  test('publish with prefix joins with /', async () => {
    const hub = new MqttHub();
    const p = hub.connect({ protocol: 'mqtt', host: 'h', port: 1883 });
    const c = connectIt();
    await p;
    await hub.publish('SmartEVSE/8881', 'Set/Mode', 'Smart');
    expect(c.publish).toHaveBeenCalledWith('SmartEVSE/8881/Set/Mode', 'Smart',
      expect.objectContaining({ qos: 0, retain: false }), expect.any(Function));
  });

  test('close() ends the client', async () => {
    const hub = new MqttHub();
    const p = hub.connect({ protocol: 'mqtt', host: 'h', port: 1883 });
    const c = connectIt();
    await p;
    await hub.close();
    expect(c.end).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — fail**

Run: `npx jest test/mqtt-hub.test.ts -t MqttHub`
Expected: module-not-found.

- [ ] **Step 3: Implement minimal MqttHub**

File: `lib/mqtt-hub.ts`

```typescript
import mqtt, { IClientOptions, MqttClient } from 'mqtt';
import { MqttConfig, HubSubscription } from './types';

export interface HubLogger {
  log: (...a: unknown[]) => void;
  error: (...a: unknown[]) => void;
}

const DEFAULT_LOGGER: HubLogger = { log: () => {}, error: () => {} };

export class MqttHub {
  private client?: MqttClient;
  private subscriptions = new Map<string, HubSubscription>();
  private outbox: Array<{ topic: string; payload: string; retain: boolean }> = [];
  private logger: HubLogger;

  constructor(logger: HubLogger = DEFAULT_LOGGER) {
    this.logger = logger;
  }

  isConnected(): boolean {
    return this.client?.connected === true;
  }

  async connect(cfg: MqttConfig): Promise<void> {
    if (this.client) await this.close();

    const url = `${cfg.protocol}://${cfg.host}:${cfg.port}`;
    const opts: IClientOptions = {
      username: cfg.username,
      password: cfg.password,
      reconnectPeriod: 2000,
      keepalive: 30,
      queueQoSZero: true,
      clean: true,
    };
    const client = mqtt.connect(url, opts);
    this.client = client;

    client.on('message', (topic, payload) => this.route(topic, payload.toString()));
    client.on('connect', () => this.onConnected());
    client.on('error', (err) => this.logger.error('[mqtt]', err.message));
    client.on('offline', () => this.broadcastOffline());
    client.on('reconnect', () => this.logger.log('[mqtt] reconnecting'));

    await new Promise<void>((resolve, reject) => {
      const onConnect = () => { cleanup(); resolve(); };
      const onError = (err: Error) => { cleanup(); reject(err); };
      const cleanup = () => {
        client.off('connect', onConnect);
        client.off('error', onError);
      };
      client.once('connect', onConnect);
      client.once('error', onError);
    });
  }

  async close(): Promise<void> {
    const c = this.client;
    if (!c) return;
    this.client = undefined;
    await new Promise<void>((resolve) => c.end(false, {}, () => resolve()));
  }

  async publish(prefix: string, topic: string, payload: string, retain = false): Promise<void> {
    const full = `${prefix}/${topic}`;
    if (!this.client?.connected) {
      this.outbox.push({ topic: full, payload, retain });
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.client!.publish(full, payload, { qos: 0, retain }, (err) => {
        if (err) reject(err); else resolve();
      });
    });
  }

  subscribe(sub: HubSubscription): void {
    this.subscriptions.set(sub.prefix, sub);
    if (this.client?.connected) {
      this.client.subscribe(`${sub.prefix}/#`, { qos: 0 }, () => {});
    }
  }

  unsubscribe(prefix: string): void {
    this.subscriptions.delete(prefix);
    if (this.client?.connected) {
      this.client.unsubscribe(`${prefix}/#`, {}, () => {});
    }
  }

  private onConnected(): void {
    this.logger.log('[mqtt] connected');
    for (const sub of this.subscriptions.values()) {
      this.client!.subscribe(`${sub.prefix}/#`, { qos: 0 }, () => {});
    }
    while (this.outbox.length) {
      const m = this.outbox.shift()!;
      this.client!.publish(m.topic, m.payload, { qos: 0, retain: m.retain }, () => {});
    }
  }

  private broadcastOffline(): void {
    for (const sub of this.subscriptions.values()) sub.onOnline(false);
  }

  private route(topic: string, payload: string): void {
    // Longest-prefix match: iterate subscriptions sorted by prefix length desc.
    const entries = [...this.subscriptions.entries()].sort(
      (a, b) => b[0].length - a[0].length,
    );
    for (const [prefix, sub] of entries) {
      if (topic === `${prefix}/connected`) {
        sub.onOnline(payload === 'online');
        return;
      }
      if (topic.startsWith(`${prefix}/`)) {
        const suffix = topic.slice(prefix.length + 1);
        sub.onMessage(suffix, payload);
        return;
      }
    }
  }
}
```

- [ ] **Step 4: Run tests — pass**

Run: `npx jest test/mqtt-hub.test.ts`
Expected: the three tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/mqtt-hub.ts test/mqtt-hub.test.ts
git commit -m "feat(hub): MqttHub connect/publish with mocked mqtt.js"
```

---

## Task 9: MqttHub — subscribe, routing, LWT, queuing, reconnect (TDD)

**Files:**
- Modify: `test/mqtt-hub.test.ts` (only `lib/mqtt-hub.ts` may need tweaks)

- [ ] **Step 1: Append the remaining behaviour tests**

Append to `test/mqtt-hub.test.ts`:

```typescript
describe('MqttHub routing', () => {
  test('subscribe registers prefix and routes messages to handler', async () => {
    const hub = new MqttHub();
    const p = hub.connect({ protocol: 'mqtt', host: 'h', port: 1883 });
    const c = connectIt();
    await p;

    const msgs: Array<[string, string]> = [];
    hub.subscribe({
      prefix: 'SmartEVSE/8881',
      onMessage: (s, v) => msgs.push([s, v]),
      onOnline: () => {},
    });
    expect(c.subscribe).toHaveBeenCalledWith('SmartEVSE/8881/#', { qos: 0 }, expect.any(Function));

    c.emit('message', 'SmartEVSE/8881/Mode', Buffer.from('Smart'));
    expect(msgs).toEqual([['Mode', 'Smart']]);
  });

  test('LWT /connected routed via onOnline', async () => {
    const hub = new MqttHub();
    const p = hub.connect({ protocol: 'mqtt', host: 'h', port: 1883 });
    const c = connectIt();
    await p;

    const online: boolean[] = [];
    hub.subscribe({
      prefix: 'SmartEVSE/8881',
      onMessage: () => {},
      onOnline: (o) => online.push(o),
    });
    c.emit('message', 'SmartEVSE/8881/connected', Buffer.from('online'));
    c.emit('message', 'SmartEVSE/8881/connected', Buffer.from('offline'));
    expect(online).toEqual([true, false]);
  });

  test('overlapping prefixes use longest match', async () => {
    const hub = new MqttHub();
    const p = hub.connect({ protocol: 'mqtt', host: 'h', port: 1883 });
    const c = connectIt();
    await p;

    const shortMsgs: string[] = [];
    const longMsgs: string[] = [];
    hub.subscribe({ prefix: 'SmartEVSE/8881', onMessage: (s) => shortMsgs.push(s), onOnline: () => {} });
    hub.subscribe({ prefix: 'SmartEVSE/8881-test', onMessage: (s) => longMsgs.push(s), onOnline: () => {} });

    c.emit('message', 'SmartEVSE/8881-test/Mode', Buffer.from('Smart'));
    expect(longMsgs).toEqual(['Mode']);
    expect(shortMsgs).toEqual([]);

    c.emit('message', 'SmartEVSE/8881/Mode', Buffer.from('Normal'));
    expect(shortMsgs).toEqual(['Mode']);
  });

  test('publish while disconnected queues and flushes on reconnect', async () => {
    const hub = new MqttHub();
    const p = hub.connect({ protocol: 'mqtt', host: 'h', port: 1883 });
    const c = connectIt();
    await p;

    c.connected = false;
    c.emit('offline');
    await hub.publish('SmartEVSE/8881', 'Set/Mode', 'Smart');
    expect(c.publish).not.toHaveBeenCalled();

    c.connected = true;
    c.emit('connect');
    expect(c.publish).toHaveBeenCalledWith('SmartEVSE/8881/Set/Mode', 'Smart',
      expect.objectContaining({ qos: 0, retain: false }), expect.any(Function));
  });

  test('reconnect re-subscribes all registered prefixes', async () => {
    const hub = new MqttHub();
    const p = hub.connect({ protocol: 'mqtt', host: 'h', port: 1883 });
    const c = connectIt();
    await p;

    hub.subscribe({ prefix: 'a', onMessage: () => {}, onOnline: () => {} });
    hub.subscribe({ prefix: 'b', onMessage: () => {}, onOnline: () => {} });
    c.subscribe.mockClear();
    c.emit('connect');
    expect(c.subscribe).toHaveBeenCalledWith('a/#', { qos: 0 }, expect.any(Function));
    expect(c.subscribe).toHaveBeenCalledWith('b/#', { qos: 0 }, expect.any(Function));
  });

  test('offline event broadcasts onOnline(false) to every subscription', async () => {
    const hub = new MqttHub();
    const p = hub.connect({ protocol: 'mqtt', host: 'h', port: 1883 });
    const c = connectIt();
    await p;

    const aOnline: boolean[] = [];
    const bOnline: boolean[] = [];
    hub.subscribe({ prefix: 'a', onMessage: () => {}, onOnline: (o) => aOnline.push(o) });
    hub.subscribe({ prefix: 'b', onMessage: () => {}, onOnline: (o) => bOnline.push(o) });
    c.connected = false;
    c.emit('offline');
    expect(aOnline).toEqual([false]);
    expect(bOnline).toEqual([false]);
  });
});
```

- [ ] **Step 2: Run tests — all should pass (implementation already covers these)**

Run: `npx jest test/mqtt-hub.test.ts`
Expected: all hub tests pass. If any fail, fix `lib/mqtt-hub.ts` minimally to satisfy them.

- [ ] **Step 3: Commit**

```bash
git add test/mqtt-hub.test.ts lib/mqtt-hub.ts
git commit -m "test(hub): subscribe/LWT/queue/reconnect coverage"
```

---

## Task 10: Custom capability JSON files (part 1 — control / state)

Each custom capability lives in `.homeycompose/capabilities/<id>.json`. Homey merges these into the generated `app.json`.

**Files:**
- Create 13 files under `.homeycompose/capabilities/`:
  - `mode.json`, `charge_current.json`, `nr_of_phases.json`, `max_current.json`,
  - `max_sum_mains.json`, `max_sum_mains_time.json`, `ev_plug_state.json`,
  - `charger_state.json`, `access.json`, `cable_lock.json`, `enable_c2.json`,
  - `cp_pwm.json`, `cp_pwm_override.json`.

- [ ] **Step 1: Create `mode.json`**

File: `.homeycompose/capabilities/mode.json`

```json
{
  "type": "enum",
  "title": { "en": "Mode", "nl": "Modus" },
  "getable": true,
  "setable": true,
  "insights": false,
  "uiComponent": "picker",
  "values": [
    { "id": "Off", "title": { "en": "Off", "nl": "Uit" } },
    { "id": "Normal", "title": { "en": "Normal", "nl": "Normaal" } },
    { "id": "Smart", "title": { "en": "Smart", "nl": "Slim" } },
    { "id": "Solar", "title": { "en": "Solar", "nl": "Zon" } },
    { "id": "Pause", "title": { "en": "Pause", "nl": "Pauze" } }
  ],
  "icon": "/assets/icon.svg"
}
```

- [ ] **Step 2: Create `charge_current.json`**

File: `.homeycompose/capabilities/charge_current.json`

```json
{
  "type": "number",
  "title": { "en": "Charge current", "nl": "Laadstroom" },
  "units": { "en": "A", "nl": "A" },
  "min": 6,
  "max": 32,
  "step": 1,
  "decimals": 0,
  "getable": true,
  "setable": true,
  "uiComponent": "slider",
  "insights": true
}
```

- [ ] **Step 3: Create `nr_of_phases.json`**

File: `.homeycompose/capabilities/nr_of_phases.json`

```json
{
  "type": "enum",
  "title": { "en": "Number of phases", "nl": "Aantal fasen" },
  "getable": true,
  "setable": false,
  "values": [
    { "id": "1", "title": { "en": "1-phase", "nl": "1-fase" } },
    { "id": "3", "title": { "en": "3-phase", "nl": "3-fase" } }
  ]
}
```

- [ ] **Step 4: Create `max_current.json`**

File: `.homeycompose/capabilities/max_current.json`

```json
{
  "type": "number",
  "title": { "en": "Maximum current", "nl": "Maximale stroom" },
  "units": { "en": "A", "nl": "A" },
  "decimals": 1,
  "getable": true,
  "setable": false,
  "insights": true
}
```

- [ ] **Step 5: Create `max_sum_mains.json`**

File: `.homeycompose/capabilities/max_sum_mains.json`

```json
{
  "type": "number",
  "title": { "en": "Mains capacity limit", "nl": "Netaansluiting limiet" },
  "units": { "en": "A", "nl": "A" },
  "min": 10,
  "max": 600,
  "step": 1,
  "decimals": 0,
  "getable": true,
  "setable": true
}
```

- [ ] **Step 6: Create `max_sum_mains_time.json`**

File: `.homeycompose/capabilities/max_sum_mains_time.json`

```json
{
  "type": "number",
  "title": { "en": "Mains overload time", "nl": "Overschrijdingstijd" },
  "units": { "en": "s", "nl": "s" },
  "decimals": 0,
  "getable": true,
  "setable": false
}
```

- [ ] **Step 7: Create `ev_plug_state.json`**

File: `.homeycompose/capabilities/ev_plug_state.json`

```json
{
  "type": "enum",
  "title": { "en": "Plug state", "nl": "Stekkerstatus" },
  "getable": true,
  "setable": false,
  "values": [
    { "id": "Connected", "title": { "en": "Connected", "nl": "Aangesloten" } },
    { "id": "Disconnected", "title": { "en": "Disconnected", "nl": "Niet aangesloten" } }
  ]
}
```

- [ ] **Step 8: Create `charger_state.json`**

File: `.homeycompose/capabilities/charger_state.json`

```json
{
  "type": "string",
  "title": { "en": "Charger state", "nl": "Laderstatus" },
  "getable": true,
  "setable": false
}
```

- [ ] **Step 9: Create `access.json`**

File: `.homeycompose/capabilities/access.json`

```json
{
  "type": "enum",
  "title": { "en": "Access", "nl": "Toegang" },
  "getable": true,
  "setable": false,
  "values": [
    { "id": "Allow", "title": { "en": "Allow", "nl": "Toegestaan" } },
    { "id": "Deny", "title": { "en": "Deny", "nl": "Geweigerd" } },
    { "id": "Pause", "title": { "en": "Pause", "nl": "Pauze" } }
  ]
}
```

- [ ] **Step 10: Create `cable_lock.json`**

File: `.homeycompose/capabilities/cable_lock.json`

```json
{
  "type": "number",
  "title": { "en": "Cable lock", "nl": "Kabelslot" },
  "min": 0,
  "max": 4,
  "step": 1,
  "decimals": 0,
  "getable": true,
  "setable": true
}
```

- [ ] **Step 11: Create `enable_c2.json`**

File: `.homeycompose/capabilities/enable_c2.json`

```json
{
  "type": "enum",
  "title": { "en": "Phase contactor (C2)", "nl": "Fasecontactor (C2)" },
  "getable": true,
  "setable": true,
  "values": [
    { "id": "Not present", "title": { "en": "Not present", "nl": "Niet aanwezig" } },
    { "id": "Always Off", "title": { "en": "Always off", "nl": "Altijd uit" } },
    { "id": "Solar Off", "title": { "en": "Off on solar", "nl": "Uit bij zon" } },
    { "id": "Always On", "title": { "en": "Always on", "nl": "Altijd aan" } },
    { "id": "Auto", "title": { "en": "Auto", "nl": "Automatisch" } }
  ]
}
```

- [ ] **Step 12: Create `cp_pwm.json` and `cp_pwm_override.json`**

File: `.homeycompose/capabilities/cp_pwm.json`

```json
{
  "type": "number",
  "title": { "en": "Control pilot PWM", "nl": "CP PWM" },
  "decimals": 0,
  "getable": true,
  "setable": false
}
```

File: `.homeycompose/capabilities/cp_pwm_override.json`

```json
{
  "type": "number",
  "title": { "en": "Control pilot PWM override", "nl": "CP PWM override" },
  "decimals": 0,
  "getable": true,
  "setable": true
}
```

- [ ] **Step 13: Commit**

```bash
git add .homeycompose/capabilities
git commit -m "feat(caps): control/state custom capabilities (part 1/3)"
```

---

## Task 11: Custom capability JSON files (part 2 — SoC & identity)

**Files:**
- Create: `.homeycompose/capabilities/ev_soc_initial.json`, `ev_soc_full.json`, `ev_soc_computed.json`, `ev_soc_remaining.json`, `ev_time_until_full.json`, `ev_energy_capacity.json`, `ev_energy_request.json`, `evccid.json`, `required_evccid.json`, `rfid_status.json`, `rfid_last_read.json`

- [ ] **Step 1: Create the four SoC files**

For each of `ev_soc_initial`, `ev_soc_full`, `ev_soc_computed`, `ev_soc_remaining`, use this template (substituting the `id` and titles):

File: `.homeycompose/capabilities/ev_soc_initial.json`

```json
{
  "type": "number",
  "title": { "en": "Initial state of charge", "nl": "Begin-laadstatus" },
  "units": { "en": "%", "nl": "%" },
  "min": 0, "max": 100, "decimals": 0,
  "getable": true, "setable": false, "insights": true
}
```

File: `.homeycompose/capabilities/ev_soc_full.json`

```json
{
  "type": "number",
  "title": { "en": "Full state of charge", "nl": "Volle laadstatus" },
  "units": { "en": "%", "nl": "%" },
  "min": 0, "max": 100, "decimals": 0,
  "getable": true, "setable": false
}
```

File: `.homeycompose/capabilities/ev_soc_computed.json`

```json
{
  "type": "number",
  "title": { "en": "Computed state of charge", "nl": "Berekende laadstatus" },
  "units": { "en": "%", "nl": "%" },
  "min": 0, "max": 100, "decimals": 0,
  "getable": true, "setable": false, "insights": true
}
```

File: `.homeycompose/capabilities/ev_soc_remaining.json`

```json
{
  "type": "number",
  "title": { "en": "Remaining state of charge", "nl": "Resterende laadstatus" },
  "units": { "en": "%", "nl": "%" },
  "min": 0, "max": 100, "decimals": 0,
  "getable": true, "setable": false
}
```

- [ ] **Step 2: Create `ev_time_until_full.json`**

File: `.homeycompose/capabilities/ev_time_until_full.json`

```json
{
  "type": "number",
  "title": { "en": "Time until full", "nl": "Tijd tot vol" },
  "units": { "en": "min", "nl": "min" },
  "decimals": 0,
  "getable": true, "setable": false
}
```

- [ ] **Step 3: Create `ev_energy_capacity.json` and `ev_energy_request.json`**

File: `.homeycompose/capabilities/ev_energy_capacity.json`

```json
{
  "type": "number",
  "title": { "en": "Battery capacity", "nl": "Accucapaciteit" },
  "units": { "en": "kWh", "nl": "kWh" },
  "decimals": 2,
  "getable": true, "setable": false
}
```

File: `.homeycompose/capabilities/ev_energy_request.json`

```json
{
  "type": "number",
  "title": { "en": "Energy requested", "nl": "Gevraagde energie" },
  "units": { "en": "kWh", "nl": "kWh" },
  "decimals": 2,
  "getable": true, "setable": false
}
```

- [ ] **Step 4: Create EVCCID, RFID capabilities**

File: `.homeycompose/capabilities/evccid.json`

```json
{
  "type": "string",
  "title": { "en": "EVCCID", "nl": "EVCCID" },
  "getable": true, "setable": false
}
```

File: `.homeycompose/capabilities/required_evccid.json`

```json
{
  "type": "string",
  "title": { "en": "Required EVCCID", "nl": "Vereist EVCCID" },
  "getable": true, "setable": true
}
```

File: `.homeycompose/capabilities/rfid_status.json`

```json
{
  "type": "string",
  "title": { "en": "RFID status", "nl": "RFID-status" },
  "getable": true, "setable": false
}
```

File: `.homeycompose/capabilities/rfid_last_read.json`

```json
{
  "type": "string",
  "title": { "en": "Last RFID read", "nl": "Laatst gelezen RFID" },
  "getable": true, "setable": false
}
```

- [ ] **Step 5: Commit**

```bash
git add .homeycompose/capabilities
git commit -m "feat(caps): SoC and identity custom capabilities (part 2/3)"
```

---

## Task 12: Custom capability JSON files (part 3 — LEDs, diagnostics, connectivity)

**Files:**
- Create: `led_color_off.json`, `led_color_normal.json`, `led_color_smart.json`, `led_color_solar.json`, `led_color_custom.json`, `custom_button.json`, `ocpp.json`, `ocpp_connection.json`, `wifi_ssid.json`, `wifi_bssid.json`, `measure_rssi.json`, `esp_uptime.json`, `load_bl.json`, `pairing_pin.json`, `solar_stop_timer.json`, `online.json`, `error.json`.

- [ ] **Step 1: Create the five LED colour capabilities**

For each LED slot, use this template (substitute title where noted):

File: `.homeycompose/capabilities/led_color_off.json`

```json
{
  "type": "string",
  "title": { "en": "LED colour — off", "nl": "LED-kleur — uit" },
  "getable": true, "setable": true,
  "hint": { "en": "R,G,B (0-255)", "nl": "R,G,B (0-255)" }
}
```

Create `led_color_normal.json` with title `{ "en": "LED colour — normal", "nl": "LED-kleur — normaal" }`.
Create `led_color_smart.json` with title `{ "en": "LED colour — smart", "nl": "LED-kleur — slim" }`.
Create `led_color_solar.json` with title `{ "en": "LED colour — solar", "nl": "LED-kleur — zon" }`.
Create `led_color_custom.json` with title `{ "en": "LED colour — custom", "nl": "LED-kleur — aangepast" }` and `setable: false` (read-only; the firmware only exposes `Set/ColorCustom` via HA discovery; keep read-only).

- [ ] **Step 2: Create `custom_button.json`**

File: `.homeycompose/capabilities/custom_button.json`

```json
{
  "type": "enum",
  "title": { "en": "Custom button", "nl": "Aangepaste knop" },
  "getable": true, "setable": true,
  "values": [
    { "id": "On", "title": { "en": "On", "nl": "Aan" } },
    { "id": "Off", "title": { "en": "Off", "nl": "Uit" } }
  ]
}
```

- [ ] **Step 3: Create OCPP capabilities**

File: `.homeycompose/capabilities/ocpp.json`

```json
{
  "type": "string",
  "title": { "en": "OCPP", "nl": "OCPP" },
  "getable": true, "setable": false
}
```

File: `.homeycompose/capabilities/ocpp_connection.json`

```json
{
  "type": "string",
  "title": { "en": "OCPP connection", "nl": "OCPP-verbinding" },
  "getable": true, "setable": false
}
```

- [ ] **Step 4: Create Wi-Fi / RSSI / uptime / misc diagnostics**

File: `.homeycompose/capabilities/wifi_ssid.json`

```json
{
  "type": "string",
  "title": { "en": "Wi-Fi SSID", "nl": "Wi-Fi SSID" },
  "getable": true, "setable": false
}
```

File: `.homeycompose/capabilities/wifi_bssid.json`

```json
{
  "type": "string",
  "title": { "en": "Wi-Fi BSSID", "nl": "Wi-Fi BSSID" },
  "getable": true, "setable": false
}
```

File: `.homeycompose/capabilities/measure_rssi.json`

```json
{
  "type": "number",
  "title": { "en": "Wi-Fi signal strength", "nl": "Wi-Fi signaalsterkte" },
  "units": { "en": "dBm", "nl": "dBm" },
  "decimals": 0, "getable": true, "setable": false, "insights": true
}
```

File: `.homeycompose/capabilities/esp_uptime.json`

```json
{
  "type": "number",
  "title": { "en": "Uptime", "nl": "Uptime" },
  "units": { "en": "s", "nl": "s" },
  "decimals": 0, "getable": true, "setable": false
}
```

File: `.homeycompose/capabilities/load_bl.json`

```json
{
  "type": "number",
  "title": { "en": "Load balancing role", "nl": "Loadbalancing-rol" },
  "decimals": 0, "getable": true, "setable": false
}
```

File: `.homeycompose/capabilities/pairing_pin.json`

```json
{
  "type": "string",
  "title": { "en": "Pairing PIN", "nl": "Koppelings-PIN" },
  "getable": true, "setable": false
}
```

File: `.homeycompose/capabilities/solar_stop_timer.json`

```json
{
  "type": "number",
  "title": { "en": "Solar stop timer", "nl": "Zonne-stop timer" },
  "units": { "en": "s", "nl": "s" },
  "decimals": 0, "getable": true, "setable": false
}
```

- [ ] **Step 5: Create `online.json` and `error.json`**

File: `.homeycompose/capabilities/online.json`

```json
{
  "type": "boolean",
  "title": { "en": "Online", "nl": "Online" },
  "getable": true, "setable": false
}
```

File: `.homeycompose/capabilities/error.json`

```json
{
  "type": "string",
  "title": { "en": "Error", "nl": "Fout" },
  "getable": true, "setable": false
}
```

- [ ] **Step 6: Commit**

```bash
git add .homeycompose/capabilities
git commit -m "feat(caps): LED/diagnostics/connectivity custom capabilities (part 3/3)"
```

---

## Task 13: Locale files

**Files:**
- Modify: `locales/en.json`
- Create: `locales/nl.json`

- [ ] **Step 1: Populate `locales/en.json`**

File: `locales/en.json`

```json
{
  "app": {
    "name": "SmartEVSE",
    "description": "Full support for SmartEVSE"
  },
  "settings": {
    "title": "MQTT broker",
    "host": "Host",
    "port": "Port",
    "protocol": "Protocol",
    "username": "Username",
    "password": "Password",
    "save": "Save",
    "status_connected": "Connected",
    "status_retrying": "Retrying",
    "status_error": "Error"
  },
  "pair": {
    "title": "Add a SmartEVSE",
    "name": "Device name",
    "prefix": "Topic prefix",
    "prefix_hint": "e.g. SmartEVSE/8881",
    "test": "Test connection",
    "ok": "Device is online",
    "timeout": "No response within 5 seconds",
    "no_broker": "Configure the MQTT broker in app settings first"
  },
  "unavailable": {
    "broker_disconnected": "MQTT broker disconnected",
    "device_offline": "SmartEVSE is offline"
  }
}
```

- [ ] **Step 2: Populate `locales/nl.json`**

File: `locales/nl.json`

```json
{
  "app": {
    "name": "SmartEVSE",
    "description": "Volledige ondersteuning voor SmartEVSE"
  },
  "settings": {
    "title": "MQTT-broker",
    "host": "Host",
    "port": "Poort",
    "protocol": "Protocol",
    "username": "Gebruikersnaam",
    "password": "Wachtwoord",
    "save": "Opslaan",
    "status_connected": "Verbonden",
    "status_retrying": "Verbinding herstellen",
    "status_error": "Fout"
  },
  "pair": {
    "title": "SmartEVSE toevoegen",
    "name": "Apparaatnaam",
    "prefix": "Topic-prefix",
    "prefix_hint": "bijv. SmartEVSE/8881",
    "test": "Verbinding testen",
    "ok": "Apparaat is online",
    "timeout": "Geen reactie binnen 5 seconden",
    "no_broker": "Configureer eerst de MQTT-broker in de app-instellingen"
  },
  "unavailable": {
    "broker_disconnected": "MQTT-broker niet verbonden",
    "device_offline": "SmartEVSE is offline"
  }
}
```

- [ ] **Step 3: Add Dutch name/description to `app.json`**

Modify: `.homeycompose/app.json`

Replace `"name": { "en": "SmartEVSE" }` with:

```json
"name": { "en": "SmartEVSE", "nl": "SmartEVSE" },
"description": { "en": "Full support for SmartEVSE", "nl": "Volledige ondersteuning voor SmartEVSE" },
```

(Both `name` and `description` now have EN + NL keys.)

- [ ] **Step 4: Commit**

```bash
git add locales/ .homeycompose/app.json
git commit -m "feat(i18n): EN + NL locale files and app.json titles"
```

---

## Task 14: Driver compose + images

**Files:**
- Create: `.homeycompose/drivers/smartevse/driver.compose.json`
- Create: `.homeycompose/drivers/smartevse/driver.settings.compose.json`
- Create: `drivers/smartevse/assets/small.png`, `large.png`, `xlarge.png` (copy from app `assets/images/`)
- Create: `drivers/smartevse/pair/enter_prefix.html`

- [ ] **Step 1: Write `driver.compose.json`**

File: `.homeycompose/drivers/smartevse/driver.compose.json`

```json
{
  "id": "smartevse",
  "name": { "en": "SmartEVSE", "nl": "SmartEVSE" },
  "class": "evcharger",
  "platforms": ["local"],
  "connectivity": ["lan"],
  "images": {
    "small": "/drivers/smartevse/assets/small.png",
    "large": "/drivers/smartevse/assets/large.png",
    "xlarge": "/drivers/smartevse/assets/xlarge.png"
  },
  "capabilities": [
    "evcharger_charging",
    "evcharger_charging_state",
    "mode",
    "target_power",
    "target_power_mode",
    "charge_current",
    "measure_power",
    "meter_power.charged",
    "meter_power.total_charged",
    "meter_power.mains_import",
    "meter_power.mains_export",
    "meter_power.ev_import",
    "meter_power.ev_export",
    "measure_current.l1",
    "measure_current.l2",
    "measure_current.l3",
    "measure_current.ev_l1",
    "measure_current.ev_l2",
    "measure_current.ev_l3",
    "measure_current.home_battery",
    "measure_temperature.esp",
    "nr_of_phases",
    "max_current",
    "max_sum_mains",
    "max_sum_mains_time",
    "ev_plug_state",
    "charger_state",
    "access",
    "cable_lock",
    "enable_c2",
    "cp_pwm",
    "cp_pwm_override",
    "ev_soc_initial",
    "ev_soc_full",
    "ev_soc_computed",
    "ev_soc_remaining",
    "ev_time_until_full",
    "ev_energy_capacity",
    "ev_energy_request",
    "evccid",
    "required_evccid",
    "rfid_status",
    "rfid_last_read",
    "led_color_off",
    "led_color_normal",
    "led_color_smart",
    "led_color_solar",
    "led_color_custom",
    "custom_button",
    "ocpp",
    "ocpp_connection",
    "wifi_ssid",
    "wifi_bssid",
    "measure_rssi",
    "esp_uptime",
    "load_bl",
    "pairing_pin",
    "solar_stop_timer",
    "online",
    "error"
  ],
  "energy": {
    "evCharger": true
  },
  "pair": [
    { "id": "enter_prefix" }
  ]
}
```

- [ ] **Step 2: Copy driver images**

Run: `mkdir -p drivers/smartevse/assets && cp assets/icon.svg drivers/smartevse/assets/`

Placeholder PNGs: if `assets/images/small.png` etc. do not yet exist, create 75×75, 500×500, and 1000×1000 transparent placeholders using any tool (sharp-cli, ImageMagick) or hand-draw later. This plan does not block on final artwork — treat as follow-up.

- [ ] **Step 3: Commit**

```bash
git add .homeycompose/drivers drivers/smartevse
git commit -m "feat(driver): smartevse driver compose with full capability set"
```

---

## Task 15: Pair view HTML

**Files:**
- Create: `drivers/smartevse/pair/enter_prefix.html`

- [ ] **Step 1: Write the pair view**

File: `drivers/smartevse/pair/enter_prefix.html`

```html
<header class="homey-header">
  <h1 class="homey-title" data-i18n="pair.title">Add a SmartEVSE</h1>
</header>
<fieldset class="homey-form-fieldset">
  <div class="homey-form-group">
    <label class="homey-form-label" for="name" data-i18n="pair.name">Device name</label>
    <input id="name" type="text" class="homey-form-input" value="SmartEVSE" />
  </div>
  <div class="homey-form-group">
    <label class="homey-form-label" for="prefix" data-i18n="pair.prefix">Topic prefix</label>
    <input id="prefix" type="text" class="homey-form-input" placeholder="SmartEVSE/8881" />
    <small class="homey-form-help" data-i18n="pair.prefix_hint"></small>
  </div>
  <p id="status" class="homey-text-small"></p>
  <button id="testBtn" class="homey-button-primary-full" data-i18n="pair.test">Test connection</button>
</fieldset>
<script>
  const statusEl = document.getElementById('status');
  const btn = document.getElementById('testBtn');
  btn.addEventListener('click', async () => {
    statusEl.textContent = '…';
    const name = document.getElementById('name').value.trim();
    const prefix = document.getElementById('prefix').value.trim();
    try {
      await Homey.emit('validate', { prefix });
      statusEl.textContent = Homey.__('pair.ok');
      Homey.createDevice({ name, data: { id: prefix }, settings: { prefix } });
      Homey.done();
    } catch (err) {
      statusEl.textContent = err.message || Homey.__('pair.timeout');
    }
  });
</script>
```

- [ ] **Step 2: Commit**

```bash
git add drivers/smartevse/pair
git commit -m "feat(pair): enter_prefix pair view with test-connection flow"
```

---

## Task 16: Driver class — pair validation + meter-feed flow actions

**Files:**
- Create: `drivers/smartevse/driver.ts`
- Create: `.homeycompose/flow/actions/feed_mains_meter.json`, `feed_ev_meter.json`, `feed_home_battery_current.json`

- [ ] **Step 1: Write the driver class**

File: `drivers/smartevse/driver.ts`

```typescript
import Homey from 'homey';
import { MqttHub } from '../../lib/mqtt-hub';
import { MqttConfig } from '../../lib/types';
import {
  encodeMainsMeter, encodeEvMeter, encodeHomeBatteryCurrent, encodeRfidSwipe,
} from '../../lib/meter-payload';

type AppWithHub = Homey.App & { mqttHub: MqttHub; mqttConfig?: MqttConfig };

module.exports = class SmartEvseDriver extends Homey.Driver {
  private get hub(): MqttHub {
    return (this.homey.app as AppWithHub).mqttHub;
  }

  async onInit(): Promise<void> {
    this.registerFlowActions();
  }

  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    session.setHandler('validate', async ({ prefix }: { prefix: string }) => {
      const cfg = (this.homey.app as AppWithHub).mqttConfig;
      if (!cfg) throw new Error(this.homey.__('pair.no_broker'));

      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.hub.unsubscribe(prefix);
          reject(new Error(this.homey.__('pair.timeout')));
        }, 5000);
        this.hub.subscribe({
          prefix,
          onMessage: () => {},
          onOnline: (online) => {
            if (online) {
              clearTimeout(timer);
              this.hub.unsubscribe(prefix);
              resolve();
            }
          },
        });
      });
    });
  }

  private registerFlowActions(): void {
    const feedMains = this.homey.flow.getActionCard('feed_mains_meter');
    feedMains.registerRunListener(async (args: { device: any; l1: number; l2: number; l3: number }) => {
      await args.device.publish('Set/MainsMeter', encodeMainsMeter(args.l1, args.l2, args.l3));
    });

    const feedEv = this.homey.flow.getActionCard('feed_ev_meter');
    feedEv.registerRunListener(async (args: { device: any; l1: number; l2: number; l3: number; power: number; energy: number }) => {
      await args.device.publish('Set/EVMeter', encodeEvMeter(args.l1, args.l2, args.l3, args.power, args.energy));
    });

    const feedBattery = this.homey.flow.getActionCard('feed_home_battery_current');
    feedBattery.registerRunListener(async (args: { device: any; amps: number }) => {
      await args.device.publish('Set/HomeBatteryCurrent', encodeHomeBatteryCurrent(args.amps));
    });

    const simRfid = this.homey.flow.getActionCard('simulate_rfid_swipe');
    simRfid.registerRunListener(async (args: { device: any; uid: string }) => {
      await args.device.publish('Set/RFID', encodeRfidSwipe(args.uid));
    });
  }
};
```

- [ ] **Step 2: Create the three meter-feed action JSONs**

File: `.homeycompose/flow/actions/feed_mains_meter.json`

```json
{
  "id": "feed_mains_meter",
  "title": { "en": "Feed mains meter (L1/L2/L3)", "nl": "Netmeter voeden (L1/L2/L3)" },
  "titleFormatted": {
    "en": "Feed mains meter with [[l1]] A / [[l2]] A / [[l3]] A",
    "nl": "Voed netmeter met [[l1]] A / [[l2]] A / [[l3]] A"
  },
  "args": [
    { "name": "device", "type": "device", "filter": "driver_id=smartevse" },
    { "name": "l1", "type": "number", "min": -600, "max": 600, "step": 0.1, "placeholder": { "en": "L1 amps", "nl": "L1 ampère" } },
    { "name": "l2", "type": "number", "min": -600, "max": 600, "step": 0.1, "placeholder": { "en": "L2 amps", "nl": "L2 ampère" } },
    { "name": "l3", "type": "number", "min": -600, "max": 600, "step": 0.1, "placeholder": { "en": "L3 amps", "nl": "L3 ampère" } }
  ]
}
```

File: `.homeycompose/flow/actions/feed_ev_meter.json`

```json
{
  "id": "feed_ev_meter",
  "title": { "en": "Feed EV meter (L1/L2/L3/P/E)", "nl": "EV-meter voeden (L1/L2/L3/P/E)" },
  "titleFormatted": {
    "en": "Feed EV meter: [[l1]] A / [[l2]] A / [[l3]] A, [[power]] W, [[energy]] Wh",
    "nl": "Voed EV-meter: [[l1]] A / [[l2]] A / [[l3]] A, [[power]] W, [[energy]] Wh"
  },
  "args": [
    { "name": "device", "type": "device", "filter": "driver_id=smartevse" },
    { "name": "l1", "type": "number", "min": -600, "max": 600, "step": 0.1 },
    { "name": "l2", "type": "number", "min": -600, "max": 600, "step": 0.1 },
    { "name": "l3", "type": "number", "min": -600, "max": 600, "step": 0.1 },
    { "name": "power", "type": "number", "min": -200000, "max": 200000, "step": 1, "placeholder": { "en": "Power (W)", "nl": "Vermogen (W)" } },
    { "name": "energy", "type": "number", "min": 0, "max": 1000000000, "step": 1, "placeholder": { "en": "Total energy (Wh)", "nl": "Totale energie (Wh)" } }
  ]
}
```

File: `.homeycompose/flow/actions/feed_home_battery_current.json`

```json
{
  "id": "feed_home_battery_current",
  "title": { "en": "Feed home battery current", "nl": "Thuisaccustroom voeden" },
  "titleFormatted": {
    "en": "Feed home battery current [[amps]] A (positive = charging)",
    "nl": "Voed thuisaccustroom [[amps]] A (positief = laden)"
  },
  "args": [
    { "name": "device", "type": "device", "filter": "driver_id=smartevse" },
    { "name": "amps", "type": "number", "min": -600, "max": 600, "step": 0.1 }
  ]
}
```

File: `.homeycompose/flow/actions/simulate_rfid_swipe.json`

```json
{
  "id": "simulate_rfid_swipe",
  "title": { "en": "Simulate RFID swipe", "nl": "RFID-pas simuleren" },
  "titleFormatted": {
    "en": "Swipe RFID UID [[uid]]",
    "nl": "RFID-UID [[uid]] simuleren"
  },
  "args": [
    { "name": "device", "type": "device", "filter": "driver_id=smartevse" },
    { "name": "uid", "type": "text", "placeholder": { "en": "12 or 14 hex chars", "nl": "12 of 14 hex-tekens" } }
  ]
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add drivers/smartevse/driver.ts .homeycompose/flow/actions/feed_*.json .homeycompose/flow/actions/simulate_rfid_swipe.json
git commit -m "feat(driver): pair validator + meter-feed + RFID-swipe flow actions"
```

---

## Task 17: Flow actions — set_mode, set_current_override, set_led_color

**Files:**
- Create: `.homeycompose/flow/actions/set_mode.json`, `set_current_override.json`, `set_cable_lock.json`, `set_enable_c2.json`, `set_led_color.json`
- Modify: `drivers/smartevse/driver.ts`

- [ ] **Step 1: Create `set_mode.json`**

File: `.homeycompose/flow/actions/set_mode.json`

```json
{
  "id": "set_mode",
  "title": { "en": "Set charging mode", "nl": "Laadmodus instellen" },
  "titleFormatted": {
    "en": "Set charging mode to [[mode]]",
    "nl": "Laadmodus instellen op [[mode]]"
  },
  "args": [
    { "name": "device", "type": "device", "filter": "driver_id=smartevse" },
    {
      "name": "mode", "type": "dropdown",
      "values": [
        { "id": "Off", "label": { "en": "Off", "nl": "Uit" } },
        { "id": "Normal", "label": { "en": "Normal", "nl": "Normaal" } },
        { "id": "Smart", "label": { "en": "Smart", "nl": "Slim" } },
        { "id": "Solar", "label": { "en": "Solar", "nl": "Zon" } },
        { "id": "Pause", "label": { "en": "Pause", "nl": "Pauze" } }
      ]
    }
  ]
}
```

- [ ] **Step 2: Create `set_current_override.json`**

File: `.homeycompose/flow/actions/set_current_override.json`

```json
{
  "id": "set_current_override",
  "title": { "en": "Set charge current override", "nl": "Laadstroom-override instellen" },
  "titleFormatted": {
    "en": "Set charge current to [[amps]] A",
    "nl": "Laadstroom instellen op [[amps]] A"
  },
  "args": [
    { "name": "device", "type": "device", "filter": "driver_id=smartevse" },
    { "name": "amps", "type": "number", "min": 0, "max": 80, "step": 1 }
  ]
}
```

- [ ] **Step 3: Create `set_cable_lock.json`**

File: `.homeycompose/flow/actions/set_cable_lock.json`

```json
{
  "id": "set_cable_lock",
  "title": { "en": "Set cable lock", "nl": "Kabelslot instellen" },
  "titleFormatted": {
    "en": "Set cable lock to [[value]]",
    "nl": "Kabelslot instellen op [[value]]"
  },
  "args": [
    { "name": "device", "type": "device", "filter": "driver_id=smartevse" },
    { "name": "value", "type": "number", "min": 0, "max": 4, "step": 1 }
  ]
}
```

- [ ] **Step 4: Create `set_enable_c2.json`**

File: `.homeycompose/flow/actions/set_enable_c2.json`

```json
{
  "id": "set_enable_c2",
  "title": { "en": "Set phase contactor (C2)", "nl": "Fasecontactor (C2) instellen" },
  "titleFormatted": {
    "en": "Set phase contactor to [[mode]]",
    "nl": "Fasecontactor instellen op [[mode]]"
  },
  "args": [
    { "name": "device", "type": "device", "filter": "driver_id=smartevse" },
    {
      "name": "mode", "type": "dropdown",
      "values": [
        { "id": "Not present", "label": { "en": "Not present", "nl": "Niet aanwezig" } },
        { "id": "Always Off", "label": { "en": "Always off", "nl": "Altijd uit" } },
        { "id": "Solar Off", "label": { "en": "Off on solar", "nl": "Uit bij zon" } },
        { "id": "Always On", "label": { "en": "Always on", "nl": "Altijd aan" } },
        { "id": "Auto", "label": { "en": "Auto", "nl": "Automatisch" } }
      ]
    }
  ]
}
```

- [ ] **Step 5: Create `set_led_color.json`**

File: `.homeycompose/flow/actions/set_led_color.json`

```json
{
  "id": "set_led_color",
  "title": { "en": "Set LED colour", "nl": "LED-kleur instellen" },
  "titleFormatted": {
    "en": "Set LED [[slot]] to [[r]],[[g]],[[b]]",
    "nl": "LED [[slot]] instellen op [[r]],[[g]],[[b]]"
  },
  "args": [
    { "name": "device", "type": "device", "filter": "driver_id=smartevse" },
    {
      "name": "slot", "type": "dropdown",
      "values": [
        { "id": "Off", "label": { "en": "Off", "nl": "Uit" } },
        { "id": "Normal", "label": { "en": "Normal", "nl": "Normaal" } },
        { "id": "Smart", "label": { "en": "Smart", "nl": "Slim" } },
        { "id": "Solar", "label": { "en": "Solar", "nl": "Zon" } }
      ]
    },
    { "name": "r", "type": "number", "min": 0, "max": 255, "step": 1 },
    { "name": "g", "type": "number", "min": 0, "max": 255, "step": 1 },
    { "name": "b", "type": "number", "min": 0, "max": 255, "step": 1 }
  ]
}
```

- [ ] **Step 6: Add run-listeners in `driver.ts`**

Append inside `registerFlowActions()` in `drivers/smartevse/driver.ts`:

```typescript
    const setMode = this.homey.flow.getActionCard('set_mode');
    setMode.registerRunListener(async (args: { device: any; mode: string }) => {
      await args.device.setCapabilityValue('mode', args.mode);
    });

    const setCurrent = this.homey.flow.getActionCard('set_current_override');
    setCurrent.registerRunListener(async (args: { device: any; amps: number }) => {
      await args.device.setCapabilityValue('charge_current', args.amps);
    });

    const setLock = this.homey.flow.getActionCard('set_cable_lock');
    setLock.registerRunListener(async (args: { device: any; value: number }) => {
      await args.device.setCapabilityValue('cable_lock', args.value);
    });

    const setC2 = this.homey.flow.getActionCard('set_enable_c2');
    setC2.registerRunListener(async (args: { device: any; mode: string }) => {
      await args.device.setCapabilityValue('enable_c2', args.mode);
    });

    const setLed = this.homey.flow.getActionCard('set_led_color');
    setLed.registerRunListener(async (args: { device: any; slot: string; r: number; g: number; b: number }) => {
      const capId = `led_color_${args.slot.toLowerCase()}`;
      await args.device.setCapabilityValue(capId, `${args.r},${args.g},${args.b}`);
    });
```

- [ ] **Step 7: Commit**

```bash
git add .homeycompose/flow/actions drivers/smartevse/driver.ts
git commit -m "feat(flow): control actions (mode, current, cable lock, C2, LED)"
```

---

## Task 18: Flow triggers and conditions

**Files:**
- Create: `.homeycompose/flow/triggers/rfid_swiped.json`, `error_changed.json`, `charger_state_changed.json`
- Create: `.homeycompose/flow/conditions/is_mode.json`, `is_plugged_in.json`, `is_charging.json`, `has_error.json`

- [ ] **Step 1: Triggers**

File: `.homeycompose/flow/triggers/rfid_swiped.json`

```json
{
  "id": "rfid_swiped",
  "title": { "en": "RFID card swiped", "nl": "RFID-pas gescand" },
  "tokens": [
    { "name": "uid", "type": "string", "title": { "en": "UID", "nl": "UID" }, "example": { "en": "112233445566" } }
  ],
  "args": [{ "name": "device", "type": "device", "filter": "driver_id=smartevse" }]
}
```

File: `.homeycompose/flow/triggers/error_changed.json`

```json
{
  "id": "error_changed",
  "title": { "en": "Error changed", "nl": "Fout gewijzigd" },
  "tokens": [
    { "name": "error", "type": "string", "title": { "en": "Error", "nl": "Fout" }, "example": { "en": "NO_ERROR" } }
  ],
  "args": [{ "name": "device", "type": "device", "filter": "driver_id=smartevse" }]
}
```

File: `.homeycompose/flow/triggers/charger_state_changed.json`

```json
{
  "id": "charger_state_changed",
  "title": { "en": "Charger state changed", "nl": "Laderstatus gewijzigd" },
  "tokens": [
    { "name": "state", "type": "string", "title": { "en": "State", "nl": "Status" }, "example": { "en": "State C, Charging" } }
  ],
  "args": [{ "name": "device", "type": "device", "filter": "driver_id=smartevse" }]
}
```

- [ ] **Step 2: Conditions**

File: `.homeycompose/flow/conditions/is_mode.json`

```json
{
  "id": "is_mode",
  "title": { "en": "Mode !{{is|isn't}} [[mode]]", "nl": "Modus !{{is|is niet}} [[mode]]" },
  "args": [
    { "name": "device", "type": "device", "filter": "driver_id=smartevse" },
    {
      "name": "mode", "type": "dropdown",
      "values": [
        { "id": "Off", "label": { "en": "Off", "nl": "Uit" } },
        { "id": "Normal", "label": { "en": "Normal", "nl": "Normaal" } },
        { "id": "Smart", "label": { "en": "Smart", "nl": "Slim" } },
        { "id": "Solar", "label": { "en": "Solar", "nl": "Zon" } },
        { "id": "Pause", "label": { "en": "Pause", "nl": "Pauze" } }
      ]
    }
  ]
}
```

File: `.homeycompose/flow/conditions/is_plugged_in.json`

```json
{
  "id": "is_plugged_in",
  "title": { "en": "EV !{{is|isn't}} plugged in", "nl": "EV !{{is|is niet}} aangesloten" },
  "args": [{ "name": "device", "type": "device", "filter": "driver_id=smartevse" }]
}
```

File: `.homeycompose/flow/conditions/is_charging.json`

```json
{
  "id": "is_charging",
  "title": { "en": "!{{Is|Isn't}} charging", "nl": "!{{Laadt|Laadt niet}}" },
  "args": [{ "name": "device", "type": "device", "filter": "driver_id=smartevse" }]
}
```

File: `.homeycompose/flow/conditions/has_error.json`

```json
{
  "id": "has_error",
  "title": { "en": "Has !{{an error|no error}}", "nl": "Heeft !{{een fout|geen fout}}" },
  "args": [{ "name": "device", "type": "device", "filter": "driver_id=smartevse" }]
}
```

- [ ] **Step 3: Register condition handlers in `driver.ts`**

Add a new private method `registerFlowConditions()` to the driver and call it from `onInit` alongside `registerFlowActions()`. Use this snippet:

```typescript
  private registerFlowConditions(): void {
    this.homey.flow.getConditionCard('is_mode')
      .registerRunListener(async (args: { device: any; mode: string }) =>
        args.device.getCapabilityValue('mode') === args.mode);

    this.homey.flow.getConditionCard('is_plugged_in')
      .registerRunListener(async (args: { device: any }) =>
        args.device.getCapabilityValue('ev_plug_state') === 'Connected');

    this.homey.flow.getConditionCard('is_charging')
      .registerRunListener(async (args: { device: any }) =>
        Boolean(args.device.getCapabilityValue('evcharger_charging')));

    this.homey.flow.getConditionCard('has_error')
      .registerRunListener(async (args: { device: any }) => {
        const err = args.device.getCapabilityValue('error');
        return Boolean(err) && err !== 'NO_ERROR' && err !== 'None';
      });
  }
```

And call it from `onInit`:

```typescript
  async onInit(): Promise<void> {
    this.registerFlowActions();
    this.registerFlowConditions();
  }
```

- [ ] **Step 4: Commit**

```bash
git add .homeycompose/flow drivers/smartevse/driver.ts
git commit -m "feat(flow): triggers (rfid/error/state) and conditions"
```

---

## Task 19: Device class

**Files:**
- Create: `drivers/smartevse/device.ts`

- [ ] **Step 1: Write the device class**

File: `drivers/smartevse/device.ts`

```typescript
import Homey from 'homey';
import { MqttHub } from '../../lib/mqtt-hub';
import { decode, encode } from '../../lib/topic-codec';
import { deriveChargingState, deriveIsCharging, deriveTargetPower } from '../../lib/derived';
import { wattsToDeciAmps } from '../../lib/meter-payload';
import { ALL_CAPS } from '../../lib/capability-map';
import { Mode, PlugState } from '../../lib/types';

type AppWithHub = Homey.App & { mqttHub: MqttHub };

const DEBOUNCE_MS = 200;

module.exports = class SmartEvseDevice extends Homey.Device {
  private prefix!: string;
  private pendingPublish = new Map<string, NodeJS.Timeout>();
  private lastMode: Mode | undefined;
  private lastPlug: PlugState | undefined;
  private lastState: string | undefined;
  private lastPhases: '1' | '3' | undefined;

  private get hub(): MqttHub {
    return (this.homey.app as AppWithHub).mqttHub;
  }

  async onInit(): Promise<void> {
    const settings = this.getSettings() as { prefix: string };
    this.prefix = settings.prefix;

    await this.ensureCapabilities();
    this.registerWritableListeners();

    this.hub.subscribe({
      prefix: this.prefix,
      onMessage: (suffix, payload) => this.onTopic(suffix, payload),
      onOnline: (online) => this.onOnlineChange(online),
    });
  }

  async onDeleted(): Promise<void> {
    this.hub.unsubscribe(this.prefix);
    for (const t of this.pendingPublish.values()) clearTimeout(t);
  }

  async publish(topic: string, payload: string, retain = false): Promise<void> {
    await this.hub.publish(this.prefix, topic, payload, retain);
  }

  private async ensureCapabilities(): Promise<void> {
    for (const cap of ALL_CAPS) {
      if (!this.hasCapability(cap)) await this.addCapability(cap).catch(() => {});
    }
  }

  private registerWritableListeners(): void {
    const handle = (capId: string) => async (value: unknown) => {
      const enc = encode(capId, value);
      if (!enc) {
        this.error(`Cannot encode ${capId}=${String(value)}`);
        throw new Error(`Invalid value for ${capId}`);
      }
      this.schedulePublish(capId, enc.topic, enc.payload);
    };

    for (const cap of [
      'mode', 'charge_current', 'cable_lock', 'enable_c2',
      'required_evccid', 'cp_pwm_override', 'custom_button', 'max_sum_mains',
      'led_color_off', 'led_color_normal', 'led_color_smart', 'led_color_solar',
    ]) {
      this.registerCapabilityListener(cap, handle(cap));
    }

    // evcharger_charging: true → Mode=Normal, false → Mode=Pause
    this.registerCapabilityListener('evcharger_charging', async (on: boolean) => {
      await this.publish('Set/Mode', on ? 'Normal' : 'Pause');
    });

    // target_power (W) → Set/CurrentOverride (deci-A) using current nr_of_phases
    this.registerCapabilityListener('target_power', async (watts: number) => {
      const phases = this.lastPhases === '3' ? 3 : 1;
      const deciA = wattsToDeciAmps(watts, phases as 1 | 3);
      if (deciA < 60) {
        await this.publish('Set/Mode', 'Pause');
      } else {
        this.schedulePublish('target_power', 'Set/CurrentOverride', String(deciA));
      }
    });
  }

  private schedulePublish(key: string, topic: string, payload: string): void {
    const existing = this.pendingPublish.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.pendingPublish.delete(key);
      this.publish(topic, payload).catch((e) => this.error(e));
    }, DEBOUNCE_MS);
    this.pendingPublish.set(key, timer);
  }

  private onTopic(suffix: string, payload: string): void {
    const res = decode(suffix, payload);
    if (!res) return;

    // Cache inputs used for derived capabilities.
    if (res.capId === 'mode') this.lastMode = res.value as Mode;
    if (res.capId === 'ev_plug_state') this.lastPlug = res.value as PlugState;
    if (res.capId === 'charger_state') this.lastState = res.value as string;
    if (res.capId === 'nr_of_phases') this.lastPhases = res.value as '1' | '3';

    // Triggers for suffix-specific derived events.
    if (suffix === 'Error') this.tryTrigger('error_changed', { error: res.value });
    if (suffix === 'State') this.tryTrigger('charger_state_changed', { state: res.value });
    if (suffix === 'RFIDLastRead') this.tryTrigger('rfid_swiped', { uid: res.value });

    this.setCapabilityValue(res.capId, res.value).catch(() => {});
    this.updateDerived();
  }

  private updateDerived(): void {
    const cs = deriveChargingState({
      plug: this.lastPlug, state: this.lastState, mode: this.lastMode,
    });
    this.setCapabilityValue('evcharger_charging_state', cs).catch(() => {});

    const charging = deriveIsCharging(this.lastMode);
    this.setCapabilityValue('evcharger_charging', charging).catch(() => {});

    const cap = this.getCapabilityValue('charge_current') as number | undefined;
    const tp = deriveTargetPower(cap, this.lastPhases);
    this.setCapabilityValue('target_power', tp).catch(() => {});
  }

  private onOnlineChange(online: boolean): void {
    this.setCapabilityValue('online', online).catch(() => {});
    if (online) this.setAvailable().catch(() => {});
    else this.setUnavailable(this.homey.__('unavailable.device_offline')).catch(() => {});
  }

  private tryTrigger(id: string, tokens: Record<string, unknown>): void {
    const card = this.homey.flow.getDeviceTriggerCard
      ? this.homey.flow.getDeviceTriggerCard(id)
      : null;
    if (card?.trigger) card.trigger(this, tokens, {}).catch(() => {});
  }
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0. If the Homey typings complain about `registerCapabilityListener('evcharger_charging', …)` signature, cast the callback to `any` at the call site — this is an SDK typing gap, not a logic bug.

- [ ] **Step 3: Commit**

```bash
git add drivers/smartevse/device.ts
git commit -m "feat(device): capability wiring, derived caps, LWT availability"
```

---

## Task 20: App-level MQTT settings page

**Files:**
- Create: `settings/index.html`

- [ ] **Step 1: Write the page**

File: `settings/index.html`

```html
<!DOCTYPE html>
<html>
<head>
  <script type="text/javascript" src="/homey.js" data-origin="settings"></script>
</head>
<body>
  <header class="homey-header">
    <h1 class="homey-title" data-i18n="settings.title">MQTT broker</h1>
  </header>
  <fieldset class="homey-form-fieldset">
    <div class="homey-form-group">
      <label class="homey-form-label" data-i18n="settings.host">Host</label>
      <input id="host" type="text" class="homey-form-input" />
    </div>
    <div class="homey-form-group">
      <label class="homey-form-label" data-i18n="settings.port">Port</label>
      <input id="port" type="number" class="homey-form-input" value="1883" />
    </div>
    <div class="homey-form-group">
      <label class="homey-form-label" data-i18n="settings.protocol">Protocol</label>
      <select id="protocol" class="homey-form-input">
        <option value="mqtt">mqtt://</option>
        <option value="mqtts">mqtts://</option>
        <option value="ws">ws://</option>
        <option value="wss">wss://</option>
      </select>
    </div>
    <div class="homey-form-group">
      <label class="homey-form-label" data-i18n="settings.username">Username</label>
      <input id="username" type="text" class="homey-form-input" />
    </div>
    <div class="homey-form-group">
      <label class="homey-form-label" data-i18n="settings.password">Password</label>
      <input id="password" type="password" class="homey-form-input" />
    </div>
    <p id="status" class="homey-text-small"></p>
    <button id="save" class="homey-button-primary-full" data-i18n="settings.save">Save</button>
  </fieldset>
  <script>
    function onHomeyReady(Homey) {
      const ids = ['host', 'port', 'protocol', 'username', 'password'];
      Homey.get('mqtt', (err, saved) => {
        const cfg = saved || { host: '', port: 1883, protocol: 'mqtt' };
        for (const k of ids) {
          const el = document.getElementById(k);
          if (cfg[k] !== undefined) el.value = cfg[k];
        }
        Homey.ready();
      });
      document.getElementById('save').addEventListener('click', () => {
        const cfg = {
          host: document.getElementById('host').value.trim(),
          port: Number(document.getElementById('port').value),
          protocol: document.getElementById('protocol').value,
          username: document.getElementById('username').value || undefined,
          password: document.getElementById('password').value || undefined,
        };
        Homey.set('mqtt', cfg, (err) => {
          document.getElementById('status').textContent =
            err ? String(err) : Homey.__('settings.status_connected');
        });
      });
    }
  </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add settings/index.html
git commit -m "feat(settings): app-level MQTT broker configuration page"
```

---

## Task 21: App.onInit — wire MqttHub from settings

**Files:**
- Modify: `app.ts`

- [ ] **Step 1: Replace `app.ts`**

File: `app.ts`

```typescript
'use strict';

import Homey from 'homey';
import { MqttHub, HubLogger } from './lib/mqtt-hub';
import { MqttConfig } from './lib/types';

module.exports = class SmartEvseApp extends Homey.App {
  public mqttHub!: MqttHub;
  public mqttConfig?: MqttConfig;

  async onInit(): Promise<void> {
    const logger: HubLogger = {
      log: (...a) => this.log(...a),
      error: (...a) => this.error(...a),
    };
    this.mqttHub = new MqttHub(logger);

    this.homey.settings.on('set', (key: string) => {
      if (key === 'mqtt') this.reloadHub().catch((e) => this.error(e));
    });

    await this.reloadHub();
  }

  async onUninit(): Promise<void> {
    await this.mqttHub.close();
  }

  private async reloadHub(): Promise<void> {
    const cfg = this.homey.settings.get('mqtt') as MqttConfig | undefined;
    this.mqttConfig = cfg;
    if (!cfg?.host) {
      this.log('MQTT broker not configured yet; skipping connect.');
      return;
    }
    try {
      await this.mqttHub.close();
      await this.mqttHub.connect(cfg);
      this.log('MQTT broker connected');
    } catch (err) {
      this.error('MQTT connect failed:', err);
    }
  }
};
```

- [ ] **Step 2: Type-check & lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0 (fix any lint warnings minimally; prefer disabling no-unused-vars over behaviour changes).

- [ ] **Step 3: Commit**

```bash
git add app.ts
git commit -m "feat(app): wire MqttHub with settings-driven reconnect"
```

---

## Task 22: Final validation & README polish

**Files:**
- Modify: `README.txt`
- Create (if missing): `.homeychangelog.json` already exists

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --coverage`
Expected: all test suites pass; `lib/**` coverage ≥ 90% on lines.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 3: Validate the Homey app**

Run: `npx homey app validate -l debug || true`
Expected: no fatal errors. Warnings about placeholder PNG dimensions are acceptable for now; note them in follow-up.

- [ ] **Step 4: Update README**

File: `README.txt`

```
SmartEVSE for Homey
===================

A Homey SDK v3 app that exposes a SmartEVSE-3 charger over MQTT as a full
Homey EV charger: charging control, SoC, meters, RFID, LED colours, and
diagnostics. Works with any SmartEVSE firmware that has MQTT enabled.

Configuration
-------------
1. Open Settings → Apps → SmartEVSE and enter your MQTT broker details
   (host, port, protocol, optional credentials).
2. Add Device → SmartEVSE and enter the topic prefix shown in your
   SmartEVSE web UI (e.g. SmartEVSE/8881).

See docs/superpowers/specs/2026-04-17-smartevse-homey-app-design.md for the
full design, and docs/superpowers/plans/2026-04-17-smartevse-homey-app.md
for the implementation plan.
```

- [ ] **Step 5: Commit**

```bash
git add README.txt
git commit -m "docs: update README with configuration steps"
```

---

## Self-review checklist (for the implementer)

Before declaring done, verify:

- [ ] `npm test` passes with ≥ 90% line coverage on `lib/**`.
- [ ] `npm run lint` passes.
- [ ] `npx homey app validate` reports no errors.
- [ ] Pair flow works end-to-end against a live broker with a real SmartEVSE (or a `mosquitto_pub` simulation publishing at least `{prefix}/connected = online`).
- [ ] Toggling `evcharger_charging` publishes `Set/Mode Normal` / `Set/Mode Pause` and is reflected back via the retained `Mode` topic.
- [ ] Changing `target_power` publishes `Set/CurrentOverride` in deci-Amps using the live `NrOfPhases`.
- [ ] Meter-feed Flow actions publish the expected colon-joined payloads.
- [ ] LWT `offline` drops device into unavailable; `online` restores.
- [ ] Every capability in §5 of the spec is present on the device tile (or settable via Flow).
- [ ] All user-visible strings appear in both EN and NL (switch Homey language to nl to verify).

## Follow-ups (explicitly out of scope for this plan)

- Replace placeholder driver/app PNGs with final artwork.
- Home Assistant discovery–based pairing (spec §12).
- Auto-feed of mains meter from another Homey power device (spec §12).
