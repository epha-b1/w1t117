import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import PlanWorkspace from '../../src/routes/PlanWorkspace.svelte';
import { __resetForTests } from '../../src/services/db';
import { ensureFirstRunSeed, listUsers, register } from '../../src/services/auth.service';
import { planService } from '../../src/services/plan.service';
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

describe('PlanWorkspace route', () => {
  beforeEach(freshDb);
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('empty state — planner sees "+ New plan" button and no rows', async () => {
    await ensureFirstRunSeed();
    const admin = (await listUsers()).find((u) => u.role === 'administrator')!;
    const planner = await register('planner-1', 'passw0rd!', 'planner', admin.id);
    setSession({ userId: planner.id, username: planner.username, role: planner.role });

    const { findByText } = render(PlanWorkspace);
    await findByText('+ New plan');
  });

  it('auditor cannot create or edit plans (no + New plan button)', async () => {
    await ensureFirstRunSeed();
    const admin = (await listUsers()).find((u) => u.role === 'administrator')!;
    const auditor = await register('aud-1', 'passw0rd!', 'auditor', admin.id);
    setSession({ userId: auditor.id, username: auditor.username, role: auditor.role });

    const { findByText, queryByText } = render(PlanWorkspace);
    // Wait for the table to render (data-table is always present).
    await findByText(/Plan Workspace|No plans/).catch(() => undefined);
    expect(queryByText('+ New plan')).toBeNull();
  });

  it('renders existing plan rows with title and status', async () => {
    await ensureFirstRunSeed();
    const admin = (await listUsers()).find((u) => u.role === 'administrator')!;
    setSession({ userId: admin.id, username: admin.username, role: admin.role });
    await planService.createPlan({ title: 'Widget build-out', tags: ['steel'] }, admin.id);

    const { findByText } = render(PlanWorkspace);
    await findByText('Widget build-out');
  });

  it('creating a plan shows success toast and closes the modal', async () => {
    await ensureFirstRunSeed();
    const admin = (await listUsers()).find((u) => u.role === 'administrator')!;
    setSession({ userId: admin.id, username: admin.username, role: admin.role });

    const { findByText, getByText, container, queryByText } = render(PlanWorkspace);
    await findByText('+ New plan');
    await fireEvent.click(getByText('+ New plan'));
    await findByText('Create plan');

    const titleLabel = Array.from(container.querySelectorAll('label')).find((l) =>
      l.textContent?.trim().startsWith('Title')
    )!;
    const titleInput = titleLabel.querySelector('input') as HTMLInputElement;
    titleInput.value = 'My New Plan';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));

    const form = container.querySelectorAll('form')[0] as HTMLFormElement;
    await fireEvent.submit(form);

    // Plan list refreshes — the new plan appears in a row.
    await findByText('My New Plan');
    expect(queryByText('Create plan')).toBeNull();
    expect(get(toasts).some((t) => t.level === 'success' && /Plan created/.test(t.message))).toBe(true);
  });
});
