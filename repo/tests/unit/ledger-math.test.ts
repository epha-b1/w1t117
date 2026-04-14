import { describe, it, expect } from 'vitest';
import {
  toCents,
  assertPositive,
  availableBalance,
  maskBankRef
} from '../../src/services/ledger.service';

describe('ledger pure helpers', () => {
  it('toCents rounds half to even-safe integers', () => {
    expect(toCents(10)).toBe(1000);
    expect(toCents(12.34)).toBe(1234);
    expect(toCents(0.1 + 0.2)).toBe(30); // 0.30000000000000004 -> 30
  });

  it('assertPositive throws on 0, negative, NaN, Infinity', () => {
    expect(() => assertPositive(1)).not.toThrow();
    expect(() => assertPositive(0)).toThrow(/positive/);
    expect(() => assertPositive(-1)).toThrow(/positive/);
    expect(() => assertPositive(NaN)).toThrow(/positive/);
    expect(() => assertPositive(Infinity)).toThrow(/positive/);
  });

  it('availableBalance = balance - frozen', () => {
    expect(availableBalance(10000, 3000)).toBe(7000);
    expect(availableBalance(0, 0)).toBe(0);
    expect(availableBalance(1000, 1000)).toBe(0);
  });

  it('maskBankRef shows only last 4 digits', () => {
    expect(maskBankRef('1234567890')).toBe('****7890');
  });
});
