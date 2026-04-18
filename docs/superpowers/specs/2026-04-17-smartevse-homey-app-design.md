# SmartEVSE Homey App — Design

- **Date:** 2026-04-17
- **App ID:** `com.sortedbits.smartevse`
- **Author:** Wim Haanstra
- **Homey SDK:** v3 (TypeScript, local runtime)
- **Target device:** SmartEVSE-3 firmware with MQTT enabled
- **Status:** Approved — ready for implementation plan

## 1. Goal

Build a Homey SDK v3 app that exposes a SmartEVSE-3 charger to Homey as a full-featured EV charger (per Homey's EV-charger spec), communicating entirely over MQTT. Every telemetry value and control topic documented by the SmartEVSE firmware is surfaced in Homey. Multiple SmartEVSE units on a shared broker are supported. The app is fully localised in English and Dutch. Logic layers are covered by Jest unit tests with `mqtt.js` mocked.

## 2. Scope decisions (from brainstorming)

| #     | Decision                    | Choice                                                                                            |
| ----- | --------------------------- | ------------------------------------------------------------------------------------------------- |
| Q1    | Device model                | Multi-device, broker credentials at app level                                                     |
| Q2    | Broker transport            | TCP + TLS + WebSockets (ws/wss), username/password optional                                       |
| Q3    | Mode ↔ `evcharger_charging` | Toggle pauses/resumes (`Normal` ↔ `Pause`); separate Mode picker for Normal/Smart/Solar/Off/Pause |
| Q4    | Charge-current control      | Expose **both** `target_power` (W) and custom `charge_current` (A)                                |
| Q5    | Meter feeding               | Flow actions for `feed_mains_meter`, `feed_ev_meter`, `feed_home_battery_current`                 |
| Q6    | Capability surface          | Every documented telemetry value is a visible capability                                          |
| Q7    | Pairing                     | Manual form (name + topic prefix), validated via `{prefix}/connected` within 5 s                  |
| Q8    | Tests                       | Unit only, Jest + ts-jest, `mqtt.js` mocked                                                       |
| extra | i18n                        | EN + NL for all user-facing strings                                                               |

## 3. Architecture

```
┌─────────────────────────── Homey App ──────────────────────────────┐
│                                                                    │
│  ┌──────────────┐    ┌───────────────────────────────────────────┐ │
│  │ App Settings │──▶ │ MqttHub                                   │ │
│  │ (host/port/  │    │  • single mqtt.js client                  │ │
│  │  tls/ws/     │    │  • reconnect + LWT-aware                  │ │
│  │  user/pass)  │    │  • subscribe(prefix, handler)             │ │
│  └──────────────┘    │  • publish(prefix, topic, payload)        │ │
│         ▲            └────────────────▲──────────────────────────┘ │
│         │                             │                            │
│         │                ┌────────────┴───────────┐                │
│         │                │                        │                │
│  ┌──────┴──────┐   ┌─────┴─────────┐      ┌──────┴──────────┐     │
│  │ Settings UI │   │ SmartEvseDrvr │      │ SmartEvseDevice │ × N │
│  │ (app page)  │   │  • pair flow  │◀────▶│  • prefix+name  │     │
│  └─────────────┘   │  • flow cards │      │  • capabilities │     │
│                    └───────────────┘      └──────┬──────────┘     │
│                                                  │                │
│                          ┌───────────────────────┴──────────┐     │
│                          │ TopicCodec                       │     │
│                          │  • telemetry topic → cap value   │     │
│                          │  • capability value → set-topic  │     │
│                          │  • unit conversions (dA↔A↔W)     │     │
│                          └──────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
                          ┌──────────────────┐
                          │  MQTT Broker     │
                          │  (Mosquitto/etc) │
                          └──────────────────┘
```

### Layering rules

- **`MqttHub`** — zero Homey knowledge; a thin router wrapping `mqtt.js`. Unit-testable in isolation.
- **`TopicCodec`** — pure functions (no I/O, no Homey imports). Single source of truth for unit conversion and enum mapping. 100% unit-testable.
- **`CapabilityMap`** — declarative table (TypeScript const) listing every capability with its inbound topic, outbound topic, direction, decode/encode refs, and i18n keys. Keeps `TopicCodec` and the device tile consistent.
- **`SmartEvseDevice`** — only layer that touches both Homey SDK and `MqttHub`. Wires codec ⇄ capabilities.
- **`SmartEvseDriver`** — pairing and Flow-action handlers (meter feeding, LED colours, RFID swipe simulation).

### Module chosen: approach A (app-level shared MQTT client)

One `MqttHub` instance per app lifecycle. Each device registers its prefix; the hub routes incoming messages by longest-prefix match, and exposes `publish(prefix, topic, payload)` outbound. One broker connection, one reconnect loop.

## 4. File layout

```
com.sortedbits.smartevse/
├─ app.ts                         # App.onInit: load settings, construct MqttHub
├─ settings/
│  └─ index.html                  # App settings page: broker host/port/tls/ws/user/pass
├─ lib/
│  ├─ mqtt-hub.ts                 # MqttHub (thin wrapper around mqtt.js)
│  ├─ topic-codec.ts              # Pure encode/decode + unit conversion
│  ├─ capability-map.ts           # Declarative topic ↔ capability table
│  └─ types.ts                    # Shared enums (Mode, State, EnableC2, CableLock…)
├─ drivers/smartevse/
│  ├─ driver.ts                   # pair flow, flow-action handlers
│  ├─ device.ts                   # binds capabilities ↔ hub
│  ├─ driver.compose.json         # capabilities, images, pair views
│  └─ pair/
│     └─ enter_prefix.html        # prefix + name form with "Test" button
├─ .homeycompose/
│  ├─ app.json
│  ├─ capabilities/               # one JSON per custom capability (EN + NL)
│  ├─ drivers/smartevse/
│  └─ flow/
│     ├─ actions/                 # set_mode, set_current_override, set_rfid,
│     │                           # set_cable_lock, set_enable_c2, set_led_color,
│     │                           # feed_mains_meter, feed_ev_meter, feed_home_battery
│     ├─ triggers/                # mode_changed, state_changed, error_changed,
│     │                           # rfid_swiped
│     └─ conditions/              # is_charging, is_plugged_in, is_mode, has_error
├─ locales/
│  ├─ en.json
│  └─ nl.json
├─ test/
│  ├─ topic-codec.test.ts
│  ├─ capability-map.test.ts
│  ├─ mqtt-hub.test.ts            # mqtt.js mocked
│  ├─ meter-payload.test.ts
│  └─ fixtures/                   # sample payloads
├─ jest.config.ts
├─ tsconfig.json                  # strict, target ES2022
└─ package.json                   # mqtt ^5.x, jest ^29, ts-jest, @types/jest
```

## 5. Capabilities

### 5.1 Homey-native capabilities

| Capability                                    | Type | Writable   | Source                                                                               |
| --------------------------------------------- | ---- | ---------- | ------------------------------------------------------------------------------------ |
| `evcharger_charging`                          | bool | yes        | Derived: `Mode !== Pause && Mode !== Off`. Write → `/Set/Mode` (`Normal` or `Pause`) |
| `evcharger_charging_state`                    | enum | no         | Derived from `{EVPlugState, State, Mode}`                                            |
| `measure_power`                               | W    | no         | `/EVChargePower`                                                                     |
| `target_power`                                | W    | yes        | Write → `/Set/CurrentOverride` (W / (230 × NrOfPhases) × 10)                         |
| `target_power_mode`                           | enum | (built-in) | Managed by Homey when Flow sets `target_power`                                       |
| `meter_power.charged`                         | kWh  | no         | `/EVEnergyCharged` (session)                                                         |
| `meter_power.total_charged`                   | kWh  | no         | `/EVTotalEnergyCharged`                                                              |
| `meter_power.mains_import`                    | kWh  | no         | `/MainsImportActiveEnergy`                                                           |
| `meter_power.mains_export`                    | kWh  | no         | `/MainsExportActiveEnergy`                                                           |
| `meter_power.ev_import`                       | kWh  | no         | `/EVImportActiveEnergy`                                                              |
| `meter_power.ev_export`                       | kWh  | no         | `/EVExportActiveEnergy`                                                              |
| `measure_current.l1` / `.l2` / `.l3`          | A    | no         | `/MainsCurrentL{1,2,3}` (÷10)                                                        |
| `measure_current.ev_l1` / `.ev_l2` / `.ev_l3` | A    | no         | `/EVCurrentL{1,2,3}` (÷10)                                                           |
| `measure_current.home_battery`                | A    | no         | `/HomeBatteryCurrent`                                                                |
| `measure_temperature.esp`                     | °C   | no         | `/ESPTemp`                                                                           |

### 5.2 Custom capabilities

All custom capabilities ship with EN + NL titles and enum value titles.

| Capability                                              | Type       | Writable | Values / units                                                | Source                                            |
| ------------------------------------------------------- | ---------- | -------- | ------------------------------------------------------------- | ------------------------------------------------- |
| `mode`                                                  | enum       | yes      | `Off`, `Normal`, `Smart`, `Solar`, `Pause`                    | `/Mode` ↔ `/Set/Mode`                             |
| `charge_current`                                        | number (A) | yes      | 6-32                                                          | `/ChargeCurrentOverride` ↔ `/Set/CurrentOverride` |
| `nr_of_phases`                                          | enum       | no       | `1`, `3`                                                      | `/NrOfPhases`                                     |
| `max_current`                                           | A          | no       | —                                                             | `/MaxCurrent` (÷10)                               |
| `max_sum_mains`                                         | A          | yes      | 10-600                                                        | `/MaxSumMains` ↔ `/Set/CurrentMaxSumMains`        |
| `max_sum_mains_time`                                    | s          | no       | —                                                             | `/MaxSumMainsTime`                                |
| `ev_plug_state`                                         | enum       | no       | `Connected`, `Disconnected`                                   | `/EVPlugState`                                    |
| `charger_state`                                         | text       | no       | raw state string                                              | `/State`                                          |
| `access`                                                | enum       | no       | `Allow`, `Deny`, `Pause`                                      | `/Access`                                         |
| `cable_lock`                                            | enum       | yes      | 0-4 (firmware values)                                         | `/CableLock` ↔ `/Set/CableLock`                   |
| `enable_c2`                                             | enum       | yes      | `Not present`, `Always Off`, `Solar Off`, `Always On`, `Auto` | `/EnableC2` ↔ `/Set/EnableC2`                     |
| `cp_pwm`                                                | number     | no       | —                                                             | `/CPPWM`                                          |
| `cp_pwm_override`                                       | number     | yes      | —                                                             | `/CPPWMOverride` ↔ `/Set/CPPWMOverride`           |
| `ev_soc_initial` / `_full` / `_computed` / `_remaining` | %          | no       | 0-100                                                         | `/EVInitialSoC` …                                 |
| `ev_time_until_full`                                    | min        | no       | —                                                             | `/EVTimeUntilFull`                                |
| `ev_energy_capacity` / `_request`                       | kWh        | no       | —                                                             | `/EVEnergyCapacity`, `/EVEnergyRequest`           |
| `evccid`                                                | text       | no       | —                                                             | `/EVCCID`                                         |
| `required_evccid`                                       | text       | yes      | —                                                             | `/Set/RequiredEVCCID`                             |
| `rfid_status`                                           | text       | no       | —                                                             | `/RFID`                                           |
| `rfid_last_read`                                        | text       | no       | hex                                                           | `/RFIDLastRead`                                   |
| `led_color_off`/`_normal`/`_smart`/`_solar`/`_custom`   | text       | yes      | `R,G,B`                                                       | read `/LEDColorX`, write `/Set/ColorX`            |
| `custom_button`                                         | enum       | yes      | `On`, `Off`                                                   | `/CustomButton`                                   |
| `ocpp`                                                  | enum       | no       | `Enabled`, `Disabled`                                         | `/OCPP`                                           |
| `ocpp_connection`                                       | enum       | no       | `Connected`, `Disconnected`                                   | `/OCPPConnection`                                 |
| `wifi_ssid` / `wifi_bssid`                              | text       | no       | —                                                             | `/WiFiSSID`, `/WiFiBSSID`                         |
| `measure_rssi`                                          | dBm        | no       | —                                                             | `/WiFiRSSI`                                       |
| `esp_uptime`                                            | s          | no       | —                                                             | `/ESPUptime`                                      |
| `load_bl`                                               | number     | no       | —                                                             | `/LoadBl`                                         |
| `pairing_pin`                                           | text       | no       | —                                                             | `/PairingPin`                                     |
| `solar_stop_timer`                                      | s          | no       | —                                                             | `/SolarStopTimer`                                 |
| `online`                                                | bool       | no       | availability flag                                             | `/connected` LWT                                  |
| `error`                                                 | text       | no       | firmware error string                                         | `/Error`                                          |

### 5.3 Derived-capability rules

- `evcharger_charging_state`
  - `EVPlugState=Disconnected` → `plugged_out`
  - `EVPlugState=Connected` ∧ `State=C…` → `plugged_in_charging`
  - `EVPlugState=Connected` ∧ `Mode=Pause` → `plugged_in_paused`
  - `EVPlugState=Connected` otherwise → `plugged_in`
- `evcharger_charging` ← `Mode !∈ {Pause, Off}`
- `online` ← `/connected` payload `online` / `offline`
- `target_power` (W) ← `ChargeCurrent` × 230 × `NrOfPhases`

## 6. Flow cards

### 6.1 Auto-generated from capabilities

Homey generates triggers, conditions, and actions for every writable capability. No manual wiring needed.

### 6.2 Custom Flow cards

**Actions**

- `feed_mains_meter(l1, l2, l3: A)` — publishes `/Set/MainsMeter` = `"${L1*10}:${L2*10}:${L3*10}"`
- `feed_ev_meter(l1, l2, l3: A, power: W, energy: Wh)` — publishes `/Set/EVMeter` = `"${L1*10}:${L2*10}:${L3*10}:${P}:${E}"`
- `feed_home_battery_current(a: A)` — publishes `/Set/HomeBatteryCurrent` (deci-A)
- `simulate_rfid_swipe(uid: hex)` — publishes `/Set/RFID`
- `set_led_color(slot: Off|Normal|Smart|Solar, r, g, b: 0-255)`

**Triggers**

- `rfid_swiped(uid)` — fires when `/RFIDLastRead` changes
- `error_changed(code)` — fires when `/Error` changes to a non-"NOERROR" value
- `charger_state_changed(state)` — fires when `/State` changes

**Conditions**

- Auto-generated from `evcharger_charging`, `ev_plug_state`, `mode`, `error`.

## 7. Data flow

### Inbound (broker → Homey)

```
broker ──▶ mqtt.js ──▶ MqttHub.onMessage(topic, payload)
                        │  strip matching prefix, route by prefix-registration
                        ▼
                      SmartEvseDevice.onTopic(suffix, payload)
                        │  lookup CapabilityMap[suffix]
                        ▼
                      TopicCodec.decode(suffix, payload) ──▶ { capId, value }
                        │
                        ├──▶ this.setCapabilityValue(capId, value)
                        ├──▶ update derived caps (evcharger_charging, charging_state)
                        └──▶ trigger Flow for derived events (rfid_swiped, …)
```

### Outbound (Homey → broker)

```
user / Flow ──▶ setCapabilityValue('mode', 'Smart')
                ──▶ registerCapabilityListener('mode')
                ──▶ TopicCodec.encode('mode', 'Smart') ──▶ { topic: 'Set/Mode', payload: 'Smart' }
                ──▶ MqttHub.publish(prefix, 'Set/Mode', 'Smart', { qos: 0, retain: false })
                ──▶ broker ──▶ SmartEVSE
                ──▶ (echoed back on retained /Mode → inbound path confirms state)
```

### Coalescing / rate-limit

- `target_power` and `charge_current` writes debounced 200 ms.
- Meter-feed Flow actions publish immediately (user controls cadence).
- Control publishes use `retain: false` (firmware expectation).

## 8. Error handling

### Broker-level

- **Connect failure / bad creds** → log, set all devices' `online = false`, `setUnavailable(i18n('broker_disconnected'))`. Exponential-backoff retry (1 → 2 → 4 … → 60 s) via `mqtt.js` `reconnectPeriod`. Settings page shows "Broker status: Connected / Retrying / Error".
- **TLS handshake failure** → distinguish "Certificate invalid" vs "Auth failed" in settings page.
- **WebSocket upgrade failure** → logged; no auto-fallback.
- **No broker configured** → `Driver.onPair` refuses with a localised message.

### Device-level

- **LWT `/connected = offline`** → `online = false` + `setUnavailable`. Returns to available on `online`.
- **Prefix validation timeout during pair (5 s)** → pair view shows error + Retry. No half-created device.
- **Unknown topic suffix** → `debug` log; ignored (forward compatibility).
- **Malformed payload** → codec returns `null`; capability not updated; warning logged once per (topic, payload-hash) per session.

### Control-path errors

- **Out-of-range `target_power`** → clamp to `[excludeMax, max]`, round to 230 W. Below `excludeMax` → publishes Mode = Pause instead.
- **Write before `nr_of_phases` known** → queue up to 10 s; fall back to 1-phase assumption.
- **Publish while disconnected** → `mqtt.js` `queueQoSZero: true` queues; flushed on reconnect.
- **Flow-action bad payload** → action throws a user-visible error.

### App lifecycle

- **Uninstall / re-init** → `MqttHub.close()` cleanly disconnects; `onDeleted` unsubscribes.
- **Settings changed at runtime** → hub reconnects with new creds; devices re-subscribe on reconnect.

## 9. Testing

**Stack:** Jest 29 + ts-jest. `npm test`. No Homey SDK invoked.

### Test files

- `topic-codec.test.ts`
  - Decode every published topic → capability value, incl. units (deci-A → A, Wh → kWh, `"r,g,b"` parsing, Mode enum case-insensitivity).
  - Encode every control (mode, cable_lock, enable_c2 both numeric and string forms; target_power → deci-A with 1-phase and 3-phase).
  - Edge cases: negative currents (export), zero, NaN, empty string, unknown enum values.
- `capability-map.test.ts`
  - Table completeness: every capability in §5 has at least one registered direction.
  - Derived-capability rules: all `{EVPlugState, State, Mode}` combinations → `evcharger_charging_state`.
  - `evcharger_charging` across every Mode value.
- `mqtt-hub.test.ts` (mocks `mqtt` via `jest.mock('mqtt')`)
  - Subscribe → routes to correct device by prefix.
  - Two devices with overlapping prefixes (`SmartEVSE/1234` vs `SmartEVSE/1234-test`) route correctly.
  - LWT delivered to device handler.
  - Reconnect re-subscribes all registered prefixes.
  - Publish while disconnected queues and flushes on reconnect.
  - `close()` unsubscribes all and disconnects.
- `meter-payload.test.ts`
  - `encodeMainsMeter(10.5, -0.3, 2.0)` → `"105:-3:20"`.
  - `encodeEvMeter(10, 10, 10, 6900, 12345)` → `"100:100:100:6900:12345"`.

**Out of scope (per Q8 A):** integration tests with a real broker; Homey SDK mocks.

**CI:** `.github/workflows/ci.yml` runs `npm ci && npm run lint && npm test` on push/PR.

## 10. Internationalisation

- `locales/en.json` and `locales/nl.json` with all app-level strings.
- Every custom capability JSON: `title`, `units`, and enum `values[].title` in EN + NL.
- Every Flow card: `title`, `titleFormatted`, argument labels, and enum values in EN + NL.
- Pair view `enter_prefix.html` localised via Homey's `data-i18n` / `__()` helper.
- App settings page localised via the same helper.

### NL glossary (selected)

| EN               | NL               |
| ---------------- | ---------------- |
| Mode             | Modus            |
| EV Plug State    | Stekkerstatus    |
| Cable Lock       | Kabelslot        |
| Access           | Toegang          |
| Solar Stop Timer | Zonne-stop timer |
| Charge Current   | Laadstroom       |
| Charger State    | Laderstatus      |
| Required EVCCID  | Vereist EVCCID   |
| Error            | Fout             |

## 11. Dependencies

### Runtime

- `mqtt` ^5.x (latest `mqtt.js`)
- `homey` (provided by Homey SDK v3, already present)

### Dev

- `typescript` (latest 5.x — note: existing `package.json` references a non-existent 6.x; correct to current stable during implementation)
- `@types/node`
- `jest` ^29 + `ts-jest` ^29 + `@types/jest`
- Existing `eslint` + `eslint-config-athom`

## 12. Open items / non-goals for v1

- No auto-discovery of SmartEVSE devices via Home Assistant discovery topics (Q7 B/C rejected).
- No integration tests with a live broker (Q8 B rejected).
- No auto-feed of mains meter from another Homey device (Q5 C rejected).
- No OCPP interaction beyond surfacing its status.
- No firmware-update flow via the app.
