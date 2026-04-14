import { describe, it, expect } from 'vitest';
import { sanitizeText } from '../../src/utils/validation';

describe('input sanitization (XSS)', () => {
  it('strips <script> tags', () => {
    expect(sanitizeText('<script>alert(1)</script>x')).toBe('alert(1)x');
  });

  it('strips nested tags and encodings', () => {
    expect(sanitizeText('<img src=x onerror=alert(1)>y')).toBe('y');
  });

  it('removes control characters', () => {
    expect(sanitizeText('a\u0000b\u001Fc')).toBe('abc');
  });
});
