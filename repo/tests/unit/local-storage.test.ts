import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { lsGet, lsSet, lsRemove, LS_KEYS } from '../../src/utils/local-storage';

describe('local-storage helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips a typed object', () => {
    interface Shape { a: number; b: string }
    lsSet<Shape>('demo', { a: 1, b: 'x' });
    expect(lsGet<Shape>('demo')).toEqual({ a: 1, b: 'x' });
  });

  it('returns null when the key is absent', () => {
    expect(lsGet<unknown>('missing')).toBeNull();
  });

  it('removes a stored key', () => {
    lsSet('to-remove', { n: 1 });
    lsRemove('to-remove');
    expect(lsGet('to-remove')).toBeNull();
  });

  it('prefixes keys with "forgeops:" so it cannot collide with foreign keys', () => {
    lsSet('prefix-check', 123);
    // The raw key should include the prefix; reading the bare key returns null.
    expect(localStorage.getItem('prefix-check')).toBeNull();
    expect(localStorage.getItem('forgeops:prefix-check')).toBe('123');
  });

  it('lsGet returns null when the stored value is corrupt JSON', () => {
    localStorage.setItem('forgeops:corrupt', '{not-json');
    expect(lsGet('corrupt')).toBeNull();
  });

  it('lsSet swallows quota/serialization errors without throwing', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    expect(() => lsSet('k', { x: 1 })).not.toThrow();
    expect(spy).toHaveBeenCalled();
  });

  it('lsRemove swallows errors without throwing', () => {
    const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('unavailable');
    });
    expect(() => lsRemove('k')).not.toThrow();
    expect(spy).toHaveBeenCalled();
  });

  it('exposes a frozen set of canonical keys', () => {
    expect(LS_KEYS).toMatchObject({
      SESSION: 'session',
      FAILED_LOGINS: 'failed_logins',
      ROUND_ROBIN: 'round_robin_state',
      UI_PREFS: 'ui_prefs',
      FIRST_RUN_BANNER_DISMISSED: 'first_run_banner_dismissed'
    });
  });
});
