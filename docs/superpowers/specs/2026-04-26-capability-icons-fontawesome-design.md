# Capability Icons via FontAwesome — Design

## Goal

Give every custom SmartEVSE capability a recognizable icon in the Homey UI by adding FontAwesome Free **Solid** SVGs to the project and referencing them from each capability JSON.

## Current state

- 41 capability JSONs live in `.homeycompose/capabilities/`.
- Only `mode.json` has an `icon` field, and it incorrectly points at the app icon (`/assets/icon.svg`).
- No icons are bundled in `assets/` beyond the app icon set.
- One file (`measure_rssi.json`) redefines a standard Homey capability — it must NOT receive a custom icon.

## Decisions

1. **Icon source:** FontAwesome Free **Solid** style (`fas`) only — version 7.x as resolved by `npm install --no-save @fortawesome/fontawesome-free` (latest at install time). No mixing with `regular` or `brands` in this pass.
2. **Color treatment:** Keep FA SVGs as-shipped (black `<path>`, no `fill` attribute manipulation). May revisit later if Homey UI rendering looks wrong.
3. **Asset layout:** Files placed at `assets/icons/<capability_id>.svg`, referenced from capability JSON as `/assets/icons/<capability_id>.svg`.
4. **Scope rule:** Only add an `icon` field to truly custom capabilities. Standard Homey capability IDs (`measure_rssi` is the only one in this app) inherit Homey's built-in icon and must be left alone.
5. **Skip diagnostics:** Low-visibility / redundant / pure-diagnostic capabilities are intentionally left without icons rather than padded with generic glyphs.

## Capability → icon mapping

### Charging / EV core
| Capability | FA icon (solid) | Notes |
|---|---|---|
| `mode` | `bolt` | Replaces the placeholder `/assets/icon.svg` reference |
| `charger_state` | `plug-circle-bolt` | |
| `charge_current` | `gauge-high` | |
| `max_current` | `gauge` | |
| `nr_of_phases` | `bars-staggered` | |
| `cable_lock` | `lock` | |
| `ev_plug_state` | `plug` | |
| `custom_button` | `circle-dot` | |

### State of charge / energy
| Capability | FA icon | Notes |
|---|---|---|
| `ev_soc_computed` | `battery-three-quarters` | |
| `ev_soc_full` | `battery-full` | |
| `ev_soc_initial` | `battery-quarter` | |
| `ev_soc_remaining` | `battery-half` | |
| `ev_energy_capacity` | `car-battery` | |
| `ev_energy_request` | `bolt-lightning` | |
| `ev_time_until_full` | `hourglass-half` | |

### LED colors
| Capability | FA icon | Notes |
|---|---|---|
| `led_color_normal` | `lightbulb` | |
| `led_color_smart` | `lightbulb` | |
| `led_color_solar` | `sun` | |
| `led_color_off` | `power-off` | |
| `led_color_custom` | `palette` | |

### Identification / access
| Capability | FA icon | Notes |
|---|---|---|
| `access` | `shield-halved` | |
| `pairing_pin` | `key` | |
| `rfid_status` | `id-card` | |
| `rfid_last_read` | `id-card-clip` | |
| `evccid` | `address-card` | |
| `required_evccid` | `user-shield` | |

### Network / connectivity
| Capability | FA icon | Notes |
|---|---|---|
| `online` | `wifi` | |
| `wifi_ssid` | `wifi` | |
| `ocpp_connection` | `network-wired` | |

### Load balancing / mains
| Capability | FA icon | Notes |
|---|---|---|
| `load_bl` | `scale-balanced` | |
| `max_sum_mains` | `tower-broadcast` | |
| `solar_stop_timer` | `clock` | |

### Errors / status
| Capability | FA icon | Notes |
|---|---|---|
| `error` | `triangle-exclamation` | |

### Intentionally skipped
| Capability | Reason |
|---|---|
| `cp_pwm` | Internal CP signal diagnostic |
| `cp_pwm_override` | Internal CP signal diagnostic |
| `enable_c2` | Configuration enum (5 values, `setable`); editorial choice to keep visually distinct from the iconized `mode` enum |
| `esp_uptime` | Diagnostic uptime counter |
| `ocpp` | Companion to `ocpp_connection`, redundant |
| `wifi_bssid` | Diagnostic, redundant with `wifi_ssid` |
| `max_sum_mains_time` | Companion to `max_sum_mains`, redundant |
| `measure_rssi` | **Standard Homey capability — inherits built-in icon. Do not override.** |

### Tally
- Capabilities receiving an icon: **33** (32 newly added + 1 replacement on `mode`)
- Capabilities skipped: **8** (7 by editorial choice + 1 because it's a standard Homey cap)
- Total: **41** (matches the file count in `.homeycompose/capabilities/`)

## Implementation outline

1. Acquire FontAwesome Free Solid SVGs for the glyphs listed in the mapping (download from the FA Free release on GitHub or the FA CDN). Some glyphs are reused across capabilities (e.g. `wifi`, `lightbulb`), so unique-glyph count is lower than 33.
2. Place each at `assets/icons/<capability_id>.svg` (one file per capability, even when two capabilities share the same FA glyph — e.g. `online` and `wifi_ssid` both use `wifi.svg` content but get separate files for clarity and future divergence).
3. For each capability listed under "Capability → icon mapping" sections, add `"icon": "/assets/icons/<capability_id>.svg"` to its JSON in `.homeycompose/capabilities/`.
4. Run `homey app validate` (or equivalent) to confirm no broken icon references.
5. Regenerate `app.json` from the compose sources.
6. Commit assets, capability changes, and regenerated `app.json` together.

## Out of scope

- Color / theming changes to the SVGs (revisit if Homey UI rendering is unsatisfactory).
- Icons for any of the explicitly skipped capabilities.
- Icon changes to driver-level files outside `.homeycompose/capabilities/`.
- Reorganization of the existing `assets/` layout.
