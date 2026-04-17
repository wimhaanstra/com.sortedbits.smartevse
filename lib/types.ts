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
