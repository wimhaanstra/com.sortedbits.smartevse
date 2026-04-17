'use strict';

import Homey from 'homey';
import { MqttHub, HubLogger } from './lib/mqtt-hub';
import { MqttConfig } from './lib/types';

module.exports = class SmartEvseApp extends Homey.App {
  public mqttHub!: MqttHub;
  public mqttConfig?: MqttConfig;

  async onInit(): Promise<void> {
    this.log('[APP] onInit entered');
    try {
      const logger: HubLogger = {
        log: (...a) => this.log(...a),
        error: (...a) => this.error(...a),
      };
      this.mqttHub = new MqttHub(logger);

      this.homey.settings.on('set', (key: string) => {
        if (key === 'mqtt') this.reloadHub().catch((e) => this.error(e));
      });

      await this.reloadHub();
      this.log('[APP] onInit completed');
    } catch (err) {
      this.error('[APP] onInit FAILED', err);
      throw err;
    }
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
