import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import AuditLog from '../../src/routes/AuditLog.svelte';
import { clearAll } from '../../src/services/db';
import { ensureFirstRunSeed, listUsers } from '../../src/services/auth.service';
import * as audit from '../../src/services/audit.service';
import { setSession, clearSession } from '../../src/stores/session.store';
import { toasts } from '../../src/stores/toast.store';

async function freshDb() {
  await clearAll();
  clearSession();
  localStorage.clear();
  toasts.set([]);
}

describe('AuditLog route', () => {
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

  it('shows empty-state when filtering by a non-existent actor', async () => {
    await ensureFirstRunSeed(); // writes one entry (first_run_seed)
    const users = await listUsers();
    const admin = users.find((u) => u.role === 'administrator')!;
    setSession({ userId: admin.id, username: admin.username, role: admin.role });

    const { container } = render(AuditLog);
    // Wait for onMount.refresh() to populate the table with the seed row.
    await waitForText(container, 'first_run_seed');

    // Filter by a non-existent actor to force the empty state.
    const actorInput = container.querySelector('input[placeholder="Actor"]') as HTMLInputElement;
    actorInput.value = 'nobody';
    actorInput.dispatchEvent(new Event('input', { bubbles: true }));
    const applyBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Apply'
    )!;
    await fireEvent.click(applyBtn);

    await waitForText(container, 'No entries match current filters');
  });

  it('renders audit entries and opens the detail drawer on row click', async () => {
    await ensureFirstRunSeed();
    const users = await listUsers();
    const admin = users.find((u) => u.role === 'administrator')!;
    setSession({ userId: admin.id, username: admin.username, role: admin.role });

    await audit.log({
      actor: admin.id,
      action: 'custom_test_action',
      resourceType: 'test',
      resourceId: 'tr-1',
      detail: { marker: 42 }
    });

    const { container } = render(AuditLog);
    await waitForText(container, 'custom_test_action');

    const rows = Array.from(container.querySelectorAll('tbody tr'));
    const targetRow = rows.find((r) => r.textContent?.includes('custom_test_action'))!;
    await fireEvent.click(targetRow);

    await waitForText(container, /"marker": 42/);
  });

  it('Apply button re-runs listEntries respecting the Action filter', async () => {
    await ensureFirstRunSeed();
    const users = await listUsers();
    const admin = users.find((u) => u.role === 'administrator')!;
    setSession({ userId: admin.id, username: admin.username, role: admin.role });

    await audit.log({
      actor: admin.id,
      action: 'apple_action',
      resourceType: 'fruit',
      resourceId: 'a',
      detail: {}
    });
    await audit.log({
      actor: admin.id,
      action: 'banana_action',
      resourceType: 'fruit',
      resourceId: 'b',
      detail: {}
    });

    const { container } = render(AuditLog);
    await waitForText(container, 'apple_action');
    await waitForText(container, 'banana_action');

    const actionInput = container.querySelector('input[placeholder="Action"]') as HTMLInputElement;
    actionInput.value = 'apple_action';
    actionInput.dispatchEvent(new Event('input', { bubbles: true }));
    const applyBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Apply'
    )!;
    await fireEvent.click(applyBtn);

    // After Apply, 'apple_action' stays; 'banana_action' is filtered out.
    await waitForText(container, 'apple_action');
    // Allow the re-query to settle.
    await new Promise((r) => setTimeout(r, 40));
    expect(container.textContent).not.toContain('banana_action');
  });
});
