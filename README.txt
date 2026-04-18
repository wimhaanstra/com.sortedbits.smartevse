SmartEVSE for Homey
===================

A Homey SDK v3 app that exposes a SmartEVSE-3 charger over MQTT as a full
Homey EV charger: charging control, SoC, meters, RFID, LED colours, and
diagnostics. Works with any SmartEVSE firmware that has MQTT enabled.

Configuration
-------------
1. Make sure you have your SmartEVSE connected to your MQTT server.
2. Open Settings → Apps → SmartEVSE via MQTT → Configure and enter your MQTT broker details
   (host, port, protocol, optional credentials).
3. Add Device → SmartEVSE and enter the topic prefix shown in your
   SmartEVSE web UI (e.g. SmartEVSE/1234).
