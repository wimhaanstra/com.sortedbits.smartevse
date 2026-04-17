const HEX_RE = /^[0-9A-Fa-f]+$/;

function dA(a: number): number {
  return Math.round(a * 10);
}

export function encodeMainsMeter(l1: number, l2: number, l3: number): string {
  return `${dA(l1)}:${dA(l2)}:${dA(l3)}`;
}

export function encodeEvMeter(
  l1: number, l2: number, l3: number, powerW: number, energyWh: number,
): string {
  return `${dA(l1)}:${dA(l2)}:${dA(l3)}:${Math.round(powerW)}:${Math.round(energyWh)}`;
}

export function encodeHomeBatteryCurrent(ampsSigned: number): string {
  return String(dA(ampsSigned));
}

export function encodeRfidSwipe(uidHex: string): string {
  if (!HEX_RE.test(uidHex) || (uidHex.length !== 12 && uidHex.length !== 14)) {
    throw new Error(`Invalid RFID UID: expected 12 or 14 hex characters, got "${uidHex}"`);
  }
  return uidHex.toUpperCase();
}

export function wattsToDeciAmps(watts: number, phases: 1 | 3): number {
  const amps = watts / (230 * phases);
  return Math.round(amps * 10);
}
