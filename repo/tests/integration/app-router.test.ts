import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import App from '../../src/App.svelte';
import { clearAll } from '../../src/services/db';
import { ensureFirstRunSeed, register } from '../../src/services/auth.service';
import { setSession, clearSession } from '../../src/stores/session.store';
import { get } from 'svelte/store';
import { toasts } from '../../src/stores/toast.store';

// The App test mounts real route components, which each call services against
// fake-indexeddb. We seed a clean DB per test, then change the window.location
// hash to drive the router.

async function freshDb() {
  await clearAll();
  clearSession();
  localStorage.clear();
  toasts.set([]);
}

function setHash(path: string): void {
  const next = path.startsWith('#') ? path : '#' + (path.startsWith('/') ? path : '/' + path);
  window.location.hash = next;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

async function tick(ms = 0) {
  await new Promise((r) => setTimeout(r, ms));
}

describe('App — hash-based routing integration', () => {
  beforeEach(async () => {
    await freshDb();
    setHash('/');
  });
  afterEach(() => {
    cleanup();
    clearSession();
    setHash('/');
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders Login when no session and path is /', async () => {
    const { findByText } = render(App);
    // Login shows "ForgeOps" headline and Sign-in button.
    await findByText('ForgeOps');
    await findByText('Sign in');
  });

  it('renders Login when navigating to /login explicitly', async () => {
    setHash('/login');
    const { findByText } = render(App);
    await findByText('Sign in');
  });

  it('no session + protected path is redirected to /login', async () => {
    // Attempt to access /leads without a session.
    setHash('/leads');
    const { findByText } = render(App);
    // Wait for the enforceAccess redirect, which bumps hash to /login.
    await findByText('Sign in');
    expect(window.location.hash).toBe('#/login');
  });

  it('authenticated user on "/" lands on their role-default route', async () => {
    await ensureFirstRunSeed();
    const users = (await import('../../src/services/auth.service')).listUsers;
    const all = await users();
    const admin = all.find((u) => u.role === 'administrator')!;
    setSession({ userId: admin.id, username: admin.username, role: admin.role });

    setHash('/');
    const { container } = render(App);

    // Admins default to /leads. App.svelte resolves the route *in memory* —
    // it does not navigate the URL — so the assertion is on the rendered
    // route, not on the hash. "No leads match the current filters" is the
    // LeadInbox empty-state placeholder text, uniquely found on that page.
    for (let i = 0; i < 300; i++) {
      if (container.textContent?.includes('No leads match the current filters')) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(container.textContent).toContain('No leads match the current filters');
  });

  it('auditor hitting a forbidden area is redirected to /audit and sees a warning toast', async () => {
    await ensureFirstRunSeed();
    const listUsers = (await import('../../src/services/auth.service')).listUsers;
    const all = await listUsers();
    const admin = all.find((u) => u.role === 'administrator')!;
    const auditor = await register('aud1', 'passw0rd!', 'auditor', admin.id);

    setSession({ userId: auditor.id, username: auditor.username, role: auditor.role });
    setHash('/leads');

    render(App);
    await tick(30);

    // enforceAccess should have redirected the auditor to /audit.
    expect(window.location.hash).toBe('#/audit');

    // And a warning toast should be queued.
    const list = get(toasts);
    expect(list.some((t) => t.level === 'warning' && /Access denied/i.test(t.message))).toBe(true);
  });

  it('unknown route renders NotFound and does NOT redirect', async () => {
    await ensureFirstRunSeed();
    const listUsers = (await import('../../src/services/auth.service')).listUsers;
    const all = await listUsers();
    const admin = all.find((u) => u.role === 'administrator')!;
    setSession({ userId: admin.id, username: admin.username, role: admin.role });

    setHash('/this/does/not/exist');
    const { findByText } = render(App);
    await findByText('Page not found');
    // NotFound is not an area that enforceAccess redirects away from.
    expect(window.location.hash).toBe('#/this/does/not/exist');
  });

  it('/share/:token renders ShareView even when logged out (public route)', async () => {
    setHash('/share/some-invalid-token');
    const { findByText } = render(App);
    // ShareView initially renders "Loading shared plan…" then an error message
    // for the unknown token. Assert the error, which proves we're on ShareView
    // (not on Login) without a session.
    await findByText(/This share link is invalid|Loading shared plan/);
    // Must NOT have been kicked to /login.
    expect(window.location.hash).toBe('#/share/some-invalid-token');
  });

  it('idle timeout clears session and navigates to /login', async () => {
    await ensureFirstRunSeed();
    const listUsers = (await import('../../src/services/auth.service')).listUsers;
    const all = await listUsers();
    const admin = all.find((u) => u.role === 'administrator')!;
    setSession({ userId: admin.id, username: admin.username, role: admin.role });

    setHash('/leads');
    // Install fake timers BEFORE render so the setTimeout in App.svelte's
    // onMount(resetIdle) is scheduled on the fake clock. Leave Date/IDB alone
    // — we only need to fake setTimeout/clearTimeout.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    render(App);

    // Flush microtasks so onMount runs and registers the idle setTimeout.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    // Fast-forward past the 15-minute idle timeout.
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000 + 1000);
    vi.useRealTimers();
    // Let any queued microtasks from the timer callback finish (including
    // the hashchange event handler that updates currentPath).
    await tick(50);

    expect(window.location.hash).toBe('#/login');
  });
});
