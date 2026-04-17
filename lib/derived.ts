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
