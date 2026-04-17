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
