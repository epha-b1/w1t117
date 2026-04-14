import { describe, it, expect } from 'vitest';
import { maskBankRef } from '../../src/utils/format';

describe('masked bank reference display', () => {
  it('always shows only last 4 digits with asterisk prefix', () => {
    expect(maskBankRef('1234567890')).toBe('****7890');
    expect(maskBankRef('ABCD1234')).toBe('****1234');
  });
  it('short refs still keep a mask prefix', () => {
    expect(maskBankRef('12')).toBe('****12');
  });
  it('empty ref renders as empty string', () => {
    expect(maskBankRef('')).toBe('');
  });
});
