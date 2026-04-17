import { describe, it, expect, afterEach } from 'vitest';
import { uid } from '../../src/utils/uid';

describe('uid', () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    // Restore whatever was there before each manipulation below.
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto
    });
  });

  it('uses crypto.randomUUID when available', () => {
    const stub = { randomUUID: () => 'fixed-uuid-value' };
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: stub
    });
    expect(uid()).toBe('fixed-uuid-value');
  });

  it('falls back to a timestamp+random string when crypto.randomUUID is missing', () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {} as unknown as Crypto
    });
    const id = uid();
    // Fallback format: `${ts-hex}-${rnd}${rnd}-${rnd}` — contains two dashes.
    expect(id.split('-').length).toBe(3);
    // Each piece is hex.
    for (const part of id.split('-')) {
      expect(part).toMatch(/^[0-9a-f]+$/);
    }
  });

  it('falls back when crypto is entirely undefined', () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: undefined
    });
    const id = uid();
    expect(id).toMatch(/^[0-9a-f]+-[0-9a-f]+-[0-9a-f]+$/);
  });

  it('returns unique values on successive calls under the fallback path', () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {} as unknown as Crypto
    });
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) seen.add(uid());
    // With Date.now() + two random 16-bit pieces, collisions within 20 calls
    // are vanishingly unlikely. Assert >= 18 to stay flake-free.
    expect(seen.size).toBeGreaterThanOrEqual(18);
  });
});
