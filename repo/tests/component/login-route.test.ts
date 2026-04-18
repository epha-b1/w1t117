import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import Login from '../../src/routes/Login.svelte';
import { __resetForTests } from '../../src/services/db';
import { ensureFirstRunSeed, register } from '../../src/services/auth.service';
import { clearSession } from '../../src/stores/session.store';
import { lsSet, LS_KEYS } from '../../src/utils/local-storage';

async function freshDb() {
  await __resetForTests();
  clearSession();
  localStorage.clear();
  const req = indexedDB.deleteDatabase('forgeops');
  await new Promise<void>((resolve) => {
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe('<Login> route', () => {
  beforeEach(async () => {
    await freshDb();
    window.location.hash = '';
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the first-run notice when the seed just ran', async () => {
    const { findByRole, container } = render(Login);
    await findByRole('button', { name: /Sign in/i });
    // Wait for onMount's ensureFirstRunSeed to flip `seeded=true` and the
    // first-run `.notice` to render. The credential string is split across
    // a <code> element so assert on the overall textContent.
    for (let i = 0; i < 300; i++) {
      if (container.querySelector('.notice')) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(container.querySelector('.notice')).not.toBeNull();
    expect(container.textContent).toContain('admin / Admin@12345');
  });

  it('does NOT show the first-run notice when users already exist', async () => {
    await ensureFirstRunSeed(); // pre-seed outside the component
    const { findByRole, queryByText } = render(Login);
    // Wait for onMount to complete: the Sign-in button is always rendered.
    await findByRole('button', { name: /Sign in/i });
    expect(queryByText(/admin \/ Admin@12345/)).toBeNull();
  });

  it('rejects submit with empty fields', async () => {
    const { container, findByText, findByRole } = render(Login);
    await findByRole('button', { name: /Sign in/i });
    await fireEvent.submit(container.querySelector('form')!);
    await findByText('Username and password are required');
  });

  it('sets a friendly error message for bad credentials', async () => {
    await ensureFirstRunSeed();
    const { container, findByRole } = render(Login);
    await findByRole('button', { name: /Sign in/i });

    const [usernameInput, passwordInput] = Array.from(
      container.querySelectorAll('input')
    ) as HTMLInputElement[];
    usernameInput.value = 'admin';
    usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
    passwordInput.value = 'wrong-pass';
    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));

    await fireEvent.submit(container.querySelector('form')!);
    // PBKDF2 verify is slow in jsdom; the default 1 s findByText timeout
    // can expire before the error message lands. Poll for up to 3 s.
    for (let i = 0; i < 300; i++) {
      if (container.textContent?.includes('Invalid credentials')) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(container.textContent).toContain('Invalid credentials');
  });

  it('disables inputs and button when the anomaly cooldown is active', async () => {
    // Seed >10 recent failed-login timestamps to trigger the anomaly branch
    // that disables the form. We intentionally do NOT use fake timers here —
    // Login.svelte starts a 1 s setInterval for the cooldown which can hang
    // under fake timers. The assertion only checks the *initial* disabled
    // state, which is set synchronously inside refreshAnomaly().
    const now = Date.now();
    const recent = Array.from({ length: 11 }, (_, i) => now - i * 1000);
    lsSet(LS_KEYS.FAILED_LOGINS, recent);

    const { container } = render(Login);
    // Poll for the anomaly banner — onMount's ensureFirstRunSeed involves
    // PBKDF2 hashing which can exceed findByText's default 1s timeout.
    for (let i = 0; i < 300; i++) {
      if (container.textContent?.includes('Too many failed attempts')) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(container.textContent).toContain('Too many failed attempts');
    const inputs = container.querySelectorAll('input');
    for (const input of inputs) {
      expect((input as HTMLInputElement).disabled).toBe(true);
    }
    const btn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('successful login navigates to the role default route', async () => {
    await ensureFirstRunSeed();
    const { container, findByRole } = render(Login);
    await findByRole('button', { name: /Sign in/i });

    const [usernameInput, passwordInput] = Array.from(
      container.querySelectorAll('input')
    ) as HTMLInputElement[];
    usernameInput.value = 'admin';
    usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
    passwordInput.value = 'Admin@12345';
    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));

    await fireEvent.submit(container.querySelector('form')!);

    // Wait for the async login to complete and the navigate call to fire.
    await new Promise<void>((resolve) => {
      const check = () => {
        if (window.location.hash === '#/leads') resolve();
        else setTimeout(check, 10);
      };
      check();
    });
    expect(window.location.hash).toBe('#/leads');
  });
});
