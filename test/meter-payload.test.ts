import {
  encodeMainsMeter, encodeEvMeter, encodeHomeBatteryCurrent, encodeRfidSwipe,
  wattsToDeciAmps,
} from '../lib/meter-payload';

describe('encodeMainsMeter', () => {
  test('A → deci-A, colon-joined', () => {
    expect(encodeMainsMeter(10.5, -0.3, 2.0)).toBe('105:-3:20');
  });
  test('integer currents', () => {
    expect(encodeMainsMeter(10, 10, 10)).toBe('100:100:100');
  });
});

describe('encodeEvMeter', () => {
  test('five-field payload', () => {
    expect(encodeEvMeter(10, 10, 10, 6900, 12345)).toBe('100:100:100:6900:12345');
  });
});

describe('encodeHomeBatteryCurrent', () => {
  test('positive charging', () => {
    expect(encodeHomeBatteryCurrent(5)).toBe('50');
  });
  test('negative discharging', () => {
    expect(encodeHomeBatteryCurrent(-3.2)).toBe('-32');
  });
});

describe('encodeRfidSwipe', () => {
  test('accepts 12-char hex', () => {
    expect(encodeRfidSwipe('112233445566')).toBe('112233445566');
  });
  test('accepts 14-char hex', () => {
    expect(encodeRfidSwipe('11223344556677')).toBe('11223344556677');
  });
  test('rejects wrong length', () => {
    expect(() => encodeRfidSwipe('1122')).toThrow();
  });
  test('rejects non-hex', () => {
    expect(() => encodeRfidSwipe('ZZZZZZZZZZZZ')).toThrow();
  });
  test('uppercases lowercase hex', () => {
    expect(encodeRfidSwipe('abcdef123456')).toBe('ABCDEF123456');
  });
});

describe('wattsToDeciAmps', () => {
  test('1-phase 1380W @ 230V = 60 deci-A', () => {
    expect(wattsToDeciAmps(1380, 1)).toBe(60);
  });
  test('3-phase 22080W @ 230V = 320 deci-A', () => {
    expect(wattsToDeciAmps(22080, 3)).toBe(320);
  });
  test('zero watts → zero deci-A', () => {
    expect(wattsToDeciAmps(0, 1)).toBe(0);
  });
});
