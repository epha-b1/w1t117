import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import ShareView from '../../src/routes/ShareView.svelte';
import { __resetForTests } from '../../src/services/db';
import {
  ensureFirstRunSeed,
  listUsers
} from '../../src/services/auth.service';
import { planService } from '../../src/services/plan.service';
import { setSession, clearSession } from '../../src/stores/session.store';

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

describe('ShareView route', () => {
  beforeEach(freshDb);
  afterEach(cleanup);

  it('shows "Loading shared plan…" initially, then the invalid-token error for unknown tokens', async () => {
    const { findByText } = render(ShareView, { props: { token: 'does-not-exist' } });
    // Either the loading text (briefly) or the final error message should appear.
    await findByText(/invalid, revoked, or has expired/);
  });

  it('shows the plan title and BOM editor in readOnly mode for a valid token', async () => {
    await ensureFirstRunSeed();
    const users = await listUsers();
    const admin = users.find((u) => u.role === 'administrator')!;
    setSession({ userId: admin.id, username: admin.username, role: admin.role });

    const plan = await planService.createPlan(
      { title: 'Shared Order 42' },
      admin.id
    );
    await planService.addBomItem(
      plan.id,
      {
        partNumber: 'PN-S',
        description: 'Shared part',
        quantity: 2,
        unit: 'ea',
        unitCost: 7.5,
        sortOrder: 0
      },
      admin.id
    );
    const token = await planService.createShareToken(plan.id, 7, admin.id);

    // ShareView should render without requiring an active session — clear it.
    clearSession();

    const { findByText, queryByText, queryByRole } = render(ShareView, {
      props: { token: token.token }
    });

    // Plan title appears.
    await findByText('Shared Order 42');
    // BOM item row is visible.
    await findByText('PN-S');
    // readOnly=true → no "Add" tfoot button.
    expect(queryByText('Add')).toBeNull();
    // Read-only rows have no Remove links.
    expect(queryByRole('button', { name: /Remove/i })).toBeNull();
  });
});
