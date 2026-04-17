import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatDate,
  formatDateOnly,
  maskBankRef
} from '../../src/utils/format';

describe('format utilities', () => {
  it('formats cents as currency', () => {
    expect(formatCurrency(4500)).toBe('$45.00');
    expect(formatCurrency(12075)).toBe('$120.75');
    expect(formatCurrency(0)).toBe('$0.00');
    expect(formatCurrency(-500)).toBe('-$5.00');
  });

  it('pads cents remainder to two digits', () => {
    expect(formatCurrency(105)).toBe('$1.05');
    expect(formatCurrency(100)).toBe('$1.00');
  });

  it('groups thousands in the dollar portion', () => {
    expect(formatCurrency(1_234_567)).toMatch(/^\$12,345\.67$/);
  });

  it('masks bank references to last 4 digits', () => {
    expect(maskBankRef('1234567890')).toBe('****7890');
    expect(maskBankRef('9999')).toBe('****9999');
    expect(maskBankRef('')).toBe('');
  });

  it('short bank refs keep the mask prefix', () => {
    // `.slice(-4)` on short input returns the whole string.
    expect(maskBankRef('12')).toBe('****12');
  });

  it('formatDate returns empty string for falsy epoch', () => {
    expect(formatDate(0)).toBe('');
  });

  it('formatDate produces a non-empty locale string for real epochs', () => {
    const s = formatDate(Date.UTC(2026, 0, 2, 3, 4, 5));
    expect(s).toBeTruthy();
    expect(typeof s).toBe('string');
  });

  it('formatDateOnly returns empty string for falsy epoch', () => {
    expect(formatDateOnly(0)).toBe('');
  });

  it('formatDateOnly produces a non-empty locale date for real epochs', () => {
    const s = formatDateOnly(Date.UTC(2026, 5, 15));
    expect(s).toBeTruthy();
    // Sanity: formatDate (with time) should differ from formatDateOnly.
    expect(s).not.toBe(formatDate(Date.UTC(2026, 5, 15)));
  });
});
