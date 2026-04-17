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
  }
};
