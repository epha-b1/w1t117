import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import ShareView from '../../src/routes/ShareView.svelte';
import { clearAll } from '../../src/services/db';
import {
  ensureFirstRunSeed,
  listUsers
} from '../../src/services/auth.service';
import { planService } from '../../src/services/plan.service';
import { setSession, clearSession } from '../../src/stores/session.store';

async function freshDb() {
  await clearAll();
  clearSession();
  localStorage.clear();
}

describe('ShareView route', () => {
  beforeEach(freshDb);
  afterEach(cleanup);

  async function waitForText(container: HTMLElement, needle: string | RegExp): Promise<void> {
    for (let i = 0; i < 400; i++) {
      const text = container.textContent ?? '';
      if (typeof needle === 'string' ? text.includes(needle) : needle.test(text)) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('waitForText timed out: ' + String(needle));
  }

  it('shows "Loading shared plan…" initially, then the invalid-token error for unknown tokens', async () => {
    const { container } = render(ShareView, { props: { token: 'does-not-exist' } });
    // After the async validateShareToken() resolves to null, ShareView swaps
    // the loading paragraph for the error-box text. Poll for the final state.
    await waitForText(container, /invalid, revoked, or has expired/);
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
    // Correct method name is generateShareToken (not createShareToken).
    const token = await planService.generateShareToken(plan.id, 7, admin.id);

    // ShareView should render without requiring an active session — clear it.
    clearSession();

    const { container, queryByText, queryByRole } = render(ShareView, {
      props: { token: token.token }
    });

    await waitForText(container, 'Shared Order 42');
    // BOM item renders in readOnly mode — partNumber shows as text, not an input value.
    await waitForText(container, 'PN-S');
    expect(queryByText('Add')).toBeNull();
    expect(queryByRole('button', { name: /Remove/i })).toBeNull();
  });
});
