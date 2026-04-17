import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import AuditLog from '../../src/routes/AuditLog.svelte';
import { __resetForTests } from '../../src/services/db';
import { ensureFirstRunSeed, listUsers } from '../../src/services/auth.service';
import * as audit from '../../src/services/audit.service';
import { setSession, clearSession } from '../../src/stores/session.store';
import { toasts } from '../../src/stores/toast.store';

async function freshDb() {
  await __resetForTests();
  clearSession();
  localStorage.clear();
  toasts.set([]);
  const req = indexedDB.deleteDatabase('forgeops');
  await new Promise<void>((resolve) => {
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe('AuditLog route', () => {
  beforeEach(freshDb);
  afterEach(cleanup);

  it('shows empty-state when there are no audit entries', async () => {
    await ensureFirstRunSeed(); // writes one entry (first_run_seed)
    // Even so, the empty state should render only after filtering yields 0.
    const users = await listUsers();
    const admin = users.find((u) => u.role === 'administrator')!;
    setSession({ userId: admin.id, username: admin.username, role: admin.role });

    const { findByText, container } = render(AuditLog);
    // The seeded first_run entry is present — confirm table rendering.
    await findByText('first_run_seed');

    // Filter by a non-existent actor to force the empty state.
    const actorInput = container.querySelector('input[placeholder="Actor"]') as HTMLInputElement;
    actorInput.value = 'nobody';
    actorInput.dispatchEvent(new Event('input', { bubbles: true }));
    const applyBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Apply'
    )!;
    await fireEvent.click(applyBtn);

    await findByText('No entries match current filters');
  });

  it('renders audit entries and opens the detail drawer on row click', async () => {
    await ensureFirstRunSeed();
    const users = await listUsers();
    const admin = users.find((u) => u.role === 'administrator')!;
    setSession({ userId: admin.id, username: admin.username, role: admin.role });

    // Add a recognisable audit entry.
    await audit.log({
      actor: admin.id,
      action: 'custom_test_action',
      resourceType: 'test',
      resourceId: 'tr-1',
      detail: { marker: 42 }
    });

    const { findByText, getByText, container } = render(AuditLog);
    await findByText('custom_test_action');

    // Click the row for the custom action.
    const rows = Array.from(container.querySelectorAll('tbody tr'));
    const targetRow = rows.find((r) => r.textContent?.includes('custom_test_action'))!;
    await fireEvent.click(targetRow);

    // Drawer shows the detail JSON with the marker.
    expect(getByText(/"marker": 42/)).toBeInTheDocument();
  });

  it('Apply button re-runs listEntries respecting the Action filter', async () => {
    await ensureFirstRunSeed();
    const users = await listUsers();
    const admin = users.find((u) => u.role === 'administrator')!;
    setSession({ userId: admin.id, username: admin.username, role: admin.role });

    await audit.log({
      actor: admin.id,
      action: 'apple',
      resourceType: 'fruit',
      resourceId: 'a',
      detail: {}
    });
    await audit.log({
      actor: admin.id,
      action: 'banana',
      resourceType: 'fruit',
      resourceId: 'b',
      detail: {}
    });

    const { findByText, queryByText, container } = render(AuditLog);
    await findByText('apple');
    expect(await findByText('banana')).toBeInTheDocument();

    // Filter by 'apple'.
    const actionInput = container.querySelector('input[placeholder="Action"]') as HTMLInputElement;
    actionInput.value = 'apple';
    actionInput.dispatchEvent(new Event('input', { bubbles: true }));
    const applyBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Apply'
    )!;
    await fireEvent.click(applyBtn);

    await findByText('apple');
    expect(queryByText('banana')).toBeNull();
  });
});
