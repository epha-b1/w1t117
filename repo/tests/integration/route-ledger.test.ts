import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Ledger from '../../src/routes/Ledger.svelte';
import { clearAll } from '../../src/services/db';
import { ensureFirstRunSeed, listUsers, register } from '../../src/services/auth.service';
import { ledgerService } from '../../src/services/ledger.service';
import { setSession, clearSession } from '../../src/stores/session.store';
import { toasts } from '../../src/stores/toast.store';

async function freshDb() {
  await clearAll();
  clearSession();
  localStorage.clear();
  toasts.set([]);
}

describe('Ledger route', () => {
  beforeEach(freshDb);
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('admin sees + New account and Reconcile buttons', async () => {
    await ensureFirstRunSeed();
    const admin = (await listUsers()).find((u) => u.role === 'administrator')!;
    setSession({ userId: admin.id, username: admin.username, role: admin.role });

    const { findByText } = render(Ledger);
    await findByText('+ New account');
    await findByText('Reconcile ledger');
  });

  it('auditor is read-only: no + New account, no Reconcile', async () => {
    await ensureFirstRunSeed();
    const admin = (await listUsers()).find((u) => u.role === 'administrator')!;
    const aud = await register('aud', 'passw0rd!', 'auditor', admin.id);
    setSession({ userId: aud.id, username: aud.username, role: aud.role });

    const { queryByText, findByText } = render(Ledger);
    // "Ledger" matches both the sidebar link and the topbar title — use the
    // unambiguous empty-state text to confirm the page mounted.
    await findByText('No ledger accounts');
    expect(queryByText('+ New account')).toBeNull();
    expect(queryByText('Reconcile ledger')).toBeNull();
  });

  it('shows the empty-accounts state when no ledger accounts exist', async () => {
    await ensureFirstRunSeed();
    const admin = (await listUsers()).find((u) => u.role === 'administrator')!;
    setSession({ userId: admin.id, username: admin.username, role: admin.role });
    const { findByText } = render(Ledger);
    await findByText('No ledger accounts');
  });

  it('renders masked bank ref for an existing account', async () => {
    await ensureFirstRunSeed();
    const admin = (await listUsers()).find((u) => u.role === 'administrator')!;
    setSession({ userId: admin.id, username: admin.username, role: admin.role });
    await ledgerService.createAccount('REF-1', 'order', 'BANK1234567890', admin.id, 10000);

    const { container } = render(Ledger);
    // Poll for the async refresh() to populate the accounts table.
    for (let i = 0; i < 400; i++) {
      if (container.textContent?.includes('****7890')) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(container.textContent).toContain('****7890');
  });
});
