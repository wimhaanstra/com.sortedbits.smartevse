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
    await super.onInit();

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
    for (const t of this.pendingPublish.values()) this.homey.clearTimeout(t);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.registerCapabilityListener(cap, handle(cap) as any);
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
    if (existing) this.homey.clearTimeout(existing);
    const timer = this.homey.setTimeout(() => {
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

    const charging = deriveIsCharging(this.lastMode, this.lastState);
    this.setCapabilityValue('evcharger_charging', charging).catch(() => {});

    const cap = this.getCapabilityValue('charge_current') as number | undefined;
    const tp = deriveTargetPower(cap ?? undefined, this.lastPhases);
    this.setCapabilityValue('target_power', tp).catch(() => {});
  }

  private onOnlineChange(online: boolean): void {
    this.setCapabilityValue('online', online).catch(() => {});
    if (online) this.setAvailable().catch(() => {});
    else this.setUnavailable(this.homey.__('unavailable.device_offline')).catch(() => {});
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tryTrigger(id: string, tokens: Record<string, unknown>): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = this.homey.flow as any;
    if (typeof api.getDeviceTriggerCard !== 'function') return;
    const card = api.getDeviceTriggerCard(id);
    if (card?.trigger) card.trigger(this, tokens, {}).catch(() => {});
  }
};
