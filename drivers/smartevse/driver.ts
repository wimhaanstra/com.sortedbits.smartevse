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
    this.registerFlowConditions();
  }

  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    session.setHandler('validate', async ({ prefix }: { prefix: string }) => {
      const cfg = (this.homey.app as AppWithHub).mqttConfig;
      if (!cfg) throw new Error(this.homey.__('pair.no_broker'));

      return new Promise<void>((resolve, reject) => {
        const timer = this.homey.setTimeout(() => {
          this.hub.unsubscribe(prefix);
          reject(new Error(this.homey.__('pair.timeout')));
        }, 5000);
        this.hub.subscribe({
          prefix,
          onMessage: () => {},
          onOnline: (online) => {
            if (online) {
              this.homey.clearTimeout(timer);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    feedMains.registerRunListener(async (args: { device: any; l1: number; l2: number; l3: number }) => {
      await args.device.publish('Set/MainsMeter', encodeMainsMeter(args.l1, args.l2, args.l3));
    });

    const feedEv = this.homey.flow.getActionCard('feed_ev_meter');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    feedEv.registerRunListener(async (args: { device: any; l1: number; l2: number; l3: number; power: number; energy: number }) => {
      await args.device.publish('Set/EVMeter', encodeEvMeter(args.l1, args.l2, args.l3, args.power, args.energy));
    });

    const feedBattery = this.homey.flow.getActionCard('feed_home_battery_current');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    feedBattery.registerRunListener(async (args: { device: any; amps: number }) => {
      await args.device.publish('Set/HomeBatteryCurrent', encodeHomeBatteryCurrent(args.amps));
    });

    const simRfid = this.homey.flow.getActionCard('simulate_rfid_swipe');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    simRfid.registerRunListener(async (args: { device: any; uid: string }) => {
      await args.device.publish('Set/RFID', encodeRfidSwipe(args.uid));
    });

    const setMode = this.homey.flow.getActionCard('set_mode');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setMode.registerRunListener(async (args: { device: any; mode: string }) => {
      await args.device.setCapabilityValue('mode', args.mode);
    });

    const setCurrent = this.homey.flow.getActionCard('set_current_override');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setCurrent.registerRunListener(async (args: { device: any; amps: number }) => {
      await args.device.setCapabilityValue('charge_current', args.amps);
    });

    const setLock = this.homey.flow.getActionCard('set_cable_lock');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setLock.registerRunListener(async (args: { device: any; value: number }) => {
      await args.device.setCapabilityValue('cable_lock', args.value);
    });

    const setC2 = this.homey.flow.getActionCard('set_enable_c2');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setC2.registerRunListener(async (args: { device: any; mode: string }) => {
      await args.device.setCapabilityValue('enable_c2', args.mode);
    });

    const setLed = this.homey.flow.getActionCard('set_led_color');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setLed.registerRunListener(async (args: { device: any; slot: string; r: number; g: number; b: number }) => {
      const capId = `led_color_${args.slot.toLowerCase()}`;
      await args.device.setCapabilityValue(capId, `${args.r},${args.g},${args.b}`);
    });
  }

  private registerFlowConditions(): void {
    this.homey.flow.getConditionCard('is_mode')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .registerRunListener(async (args: { device: any; mode: string }) => args.device.getCapabilityValue('mode') === args.mode);

    this.homey.flow.getConditionCard('is_plugged_in')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .registerRunListener(async (args: { device: any }) => args.device.getCapabilityValue('ev_plug_state') === 'Connected');

    this.homey.flow.getConditionCard('is_charging')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .registerRunListener(async (args: { device: any }) => Boolean(args.device.getCapabilityValue('evcharger_charging')));

    this.homey.flow.getConditionCard('has_error')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .registerRunListener(async (args: { device: any }) => {
        const err = args.device.getCapabilityValue('error');
        return Boolean(err) && err !== 'NO_ERROR' && err !== 'None';
      });
  }
};
