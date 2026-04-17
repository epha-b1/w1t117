import { describe, it, expect } from 'vitest';
import {
  sanitizeText,
  validateEmail,
  validatePhone,
  validateBudget,
  requireNonEmpty
} from '../../src/utils/validation';

describe('validation utilities', () => {
  it('strips HTML tags', () => {
    expect(sanitizeText('<script>alert(1)</script>hello')).toBe('alert(1)hello');
    expect(sanitizeText('<b>bold</b> text')).toBe('bold text');
  });

  it('strips control characters and trims', () => {
    expect(sanitizeText('  \u0000hello\u001F world \u007F  ')).toBe('hello world');
  });

  it('returns empty string for null / undefined / missing input', () => {
    expect(sanitizeText(null)).toBe('');
    expect(sanitizeText(undefined)).toBe('');
  });

  it('coerces non-string inputs before sanitizing', () => {
    expect(sanitizeText(42)).toBe('42');
    expect(sanitizeText(true)).toBe('true');
  });

  it('validates email', () => {
    expect(validateEmail('a@b.co')).toBe(true);
    expect(validateEmail('bad@')).toBe(false);
    expect(validateEmail('')).toBe(false);
    // trailing/leading whitespace tolerated
    expect(validateEmail('  a@b.co  ')).toBe(true);
    // no @
    expect(validateEmail('abc')).toBe(false);
    // no TLD
    expect(validateEmail('a@b')).toBe(false);
  });

  it('validateEmail returns false for non-string input', () => {
    // Exercises the `typeof email !== 'string'` guard.
    expect(validateEmail(42 as unknown as string)).toBe(false);
    expect(validateEmail(null as unknown as string)).toBe(false);
    expect(validateEmail(undefined as unknown as string)).toBe(false);
  });

  it('validates phone', () => {
    expect(validatePhone('555-123-4567')).toBe(true);
    expect(validatePhone('123')).toBe(false);
    // 16 digits is too long
    expect(validatePhone('1234567890123456')).toBe(false);
    // exactly 7 and 15 are the inclusive bounds
    expect(validatePhone('1234567')).toBe(true);
    expect(validatePhone('123456789012345')).toBe(true);
  });

  it('validatePhone returns false for non-string input', () => {
    expect(validatePhone(5551234567 as unknown as string)).toBe(false);
  });

  it('validates budget', () => {
    expect(validateBudget(100)).toBe(true);
    expect(validateBudget(-1)).toBe(false);
    expect(validateBudget('abc')).toBe(false);
    expect(validateBudget(0)).toBe(true);
    expect(validateBudget('42.5')).toBe(true);
    // Non-finite numbers rejected
    expect(validateBudget(Number.POSITIVE_INFINITY)).toBe(false);
    expect(validateBudget(Number.NaN)).toBe(false);
  });

  it('requireNonEmpty returns the sanitized value when non-empty', () => {
    expect(requireNonEmpty('  hi  ', 'Field')).toBe('hi');
    expect(requireNonEmpty('<b>x</b>', 'Field')).toBe('x');
  });

  it('requireNonEmpty throws a labelled error for empty / whitespace / sanitized-to-empty input', () => {
    expect(() => requireNonEmpty('', 'Title')).toThrow('Title is required');
    expect(() => requireNonEmpty('   ', 'Title')).toThrow('Title is required');
    expect(() => requireNonEmpty(null, 'Title')).toThrow('Title is required');
    expect(() => requireNonEmpty('<b></b>', 'Title')).toThrow('Title is required');
  });
});
