import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';

import {
  session,
  currentRole,
  isAuthenticated,
  setSession,
  clearSession,
  refreshSession,
  getCurrentSession,
  IDLE_TIMEOUT_MS
} from '../../src/stores/session.store';
import { lsGet, LS_KEYS } from '../../src/utils/local-storage';
import type { Session } from '../../src/types/auth.types';

describe('session store', () => {
  beforeEach(() => {
    localStorage.clear();
    clearSession();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with no session / null derived values when localStorage is empty', () => {
    expect(get(session)).toBeNull();
    expect(get(currentRole)).toBeNull();
    expect(get(isAuthenticated)).toBe(false);
  });

  it('setSession writes to localStorage and updates derived stores', () => {
    setSession({ userId: 'u1', username: 'alice', role: 'administrator' });
    const s = get(session);
    expect(s).not.toBeNull();
    expect(s!.userId).toBe('u1');
    expect(s!.username).toBe('alice');
    expect(s!.role).toBe('administrator');
    expect(s!.expiresAt).toBeGreaterThan(Date.now());
    expect(get(currentRole)).toBe('administrator');
    expect(get(isAuthenticated)).toBe(true);

    const stored = lsGet<Session>(LS_KEYS.SESSION);
    expect(stored).not.toBeNull();
    expect(stored!.userId).toBe('u1');
  });

  it('clearSession removes from localStorage and resets stores', () => {
    setSession({ userId: 'u1', username: 'alice', role: 'planner' });
    expect(get(isAuthenticated)).toBe(true);
    clearSession();
    expect(get(session)).toBeNull();
    expect(get(currentRole)).toBeNull();
    expect(get(isAuthenticated)).toBe(false);
    expect(lsGet(LS_KEYS.SESSION)).toBeNull();
  });

  it('refreshSession extends expiresAt', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    setSession({ userId: 'u1', username: 'alice', role: 'dispatcher' });
    const before = get(session)!.expiresAt;

    vi.setSystemTime(new Date('2026-01-01T00:10:00Z')); // 10 minutes later
    refreshSession();
    const after = get(session)!.expiresAt;

    expect(after).toBeGreaterThan(before);
    expect(after - Date.now()).toBe(IDLE_TIMEOUT_MS);
  });

  it('refreshSession is a no-op when no session is stored', () => {
    refreshSession();
    expect(get(session)).toBeNull();
  });

  it('getCurrentSession returns the stored session when valid', () => {
    setSession({ userId: 'u1', username: 'alice', role: 'auditor' });
    const s = getCurrentSession();
    expect(s).not.toBeNull();
    expect(s!.role).toBe('auditor');
  });

  it('getCurrentSession clears expired session and returns null', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    setSession({ userId: 'u1', username: 'alice', role: 'sales_coordinator' });

    // Move past the idle timeout.
    vi.setSystemTime(new Date(Date.now() + IDLE_TIMEOUT_MS + 1));
    const s = getCurrentSession();

    expect(s).toBeNull();
    expect(get(session)).toBeNull();
    expect(lsGet(LS_KEYS.SESSION)).toBeNull();
  });

  it('getCurrentSession returns null and resets the store when localStorage lacks a session', () => {
    localStorage.clear();
    const s = getCurrentSession();
    expect(s).toBeNull();
    expect(get(session)).toBeNull();
  });

  it('IDLE_TIMEOUT_MS is 15 minutes', () => {
    expect(IDLE_TIMEOUT_MS).toBe(15 * 60 * 1000);
  });
});
