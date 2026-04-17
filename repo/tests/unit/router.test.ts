import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';

// router.ts reads window.location.hash at module-load time and subscribes to
// hashchange. Re-import via dynamic import so each test observes a fresh module
// instance tied to the current hash.
async function loadRouter() {
  vi.resetModules();
  return await import('../../src/router');
}

describe('router (hash-based)', () => {
  beforeEach(() => {
    window.location.hash = '';
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => {
    window.location.hash = '';
  });

  it('initializes currentPath to "/" when no hash is present', async () => {
    const { currentPath } = await loadRouter();
    expect(get(currentPath)).toBe('/');
  });

  it('parses a pre-existing hash on module load', async () => {
    window.location.hash = '#/leads';
    const { currentPath } = await loadRouter();
    expect(get(currentPath)).toBe('/leads');
  });

  it('strips the leading # but preserves slashes and query', async () => {
    window.location.hash = '#/plans?tab=history';
    const { currentPath } = await loadRouter();
    expect(get(currentPath)).toBe('/plans?tab=history');
  });

  it('navigate() sets window.location.hash with a leading slash', async () => {
    const { navigate } = await loadRouter();
    navigate('/leads');
    expect(window.location.hash).toBe('#/leads');
  });

  it('navigate() adds a missing leading slash', async () => {
    const { navigate } = await loadRouter();
    navigate('admin/users');
    expect(window.location.hash).toBe('#/admin/users');
  });

  it('navigate() to the current path falls back to store.set without hash change', async () => {
    const { navigate, currentPath } = await loadRouter();
    navigate('/leads');
    expect(window.location.hash).toBe('#/leads');
    // Calling again should be a no-op at the URL level, but store still reflects it.
    navigate('/leads');
    expect(get(currentPath)).toBe('/leads');
  });

  it('hashchange event updates the store reactively', async () => {
    const { currentPath } = await loadRouter();
    const seen: string[] = [];
    const unsubscribe = currentPath.subscribe((v) => seen.push(v));

    window.location.hash = '#/audit';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    window.location.hash = '#/jobs';
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    unsubscribe();
    // First value is the initial '/', then two changes.
    expect(seen).toContain('/audit');
    expect(seen).toContain('/jobs');
  });

  it('routeSegments splits path into non-empty segments', async () => {
    window.location.hash = '#/admin/users';
    const { routeSegments } = await loadRouter();
    expect(get(routeSegments)).toEqual(['admin', 'users']);
  });

  it('routeSegments returns [] for the root path', async () => {
    window.location.hash = '#/';
    const { routeSegments } = await loadRouter();
    expect(get(routeSegments)).toEqual([]);
  });

  it('routeSegments strips the query string before splitting', async () => {
    window.location.hash = '#/share/abc?ref=email';
    const { routeSegments } = await loadRouter();
    expect(get(routeSegments)).toEqual(['share', 'abc']);
  });

  it('queryParams returns an empty URLSearchParams when no ?', async () => {
    window.location.hash = '#/leads';
    const { queryParams } = await loadRouter();
    const p = get(queryParams);
    expect(p instanceof URLSearchParams).toBe(true);
    expect(p.toString()).toBe('');
  });

  it('queryParams exposes the query after ?', async () => {
    window.location.hash = '#/plans?tab=history&focus=v2';
    const { queryParams } = await loadRouter();
    const p = get(queryParams);
    expect(p.get('tab')).toBe('history');
    expect(p.get('focus')).toBe('v2');
  });
});
