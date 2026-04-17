import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import NotificationCenter from '../../src/routes/NotificationCenter.svelte';
import { __resetForTests } from '../../src/services/db';
import { ensureFirstRunSeed, listUsers } from '../../src/services/auth.service';
import { notificationService } from '../../src/services/notification.service';
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

describe('NotificationCenter route', () => {
  beforeEach(freshDb);
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the page heading and empty notification list', async () => {
    await ensureFirstRunSeed();
    const admin = (await listUsers()).find((u) => u.role === 'administrator')!;
    setSession({ userId: admin.id, username: admin.username, role: admin.role });

    const { findByText } = render(NotificationCenter);
    await findByText('Notifications');
  });

  it('renders a dispatched notification for the signed-in user', async () => {
    await ensureFirstRunSeed();
    const admin = (await listUsers()).find((u) => u.role === 'administrator')!;
    setSession({ userId: admin.id, username: admin.username, role: admin.role });

    await notificationService.dispatch('lead_status_default', admin.id, {
      leadTitle: 'Fab order 123',
      status: 'quoted'
    });

    const { findByText } = render(NotificationCenter);
    // Rendered subject should contain the lead title.
    await findByText(/Fab order 123|Lead status changed/);
  });

  it('does not render notifications addressed to a different user', async () => {
    await ensureFirstRunSeed();
    const admin = (await listUsers()).find((u) => u.role === 'administrator')!;
    setSession({ userId: admin.id, username: admin.username, role: admin.role });

    // Notification for a *different* user id → filtered out by recipient.
    await notificationService.dispatch('lead_status_default', 'some-other-user', {
      leadTitle: 'Hidden lead',
      status: 'new'
    });

    const { queryByText, findByText } = render(NotificationCenter);
    await findByText('Notifications');
    // Give refresh() time to run.
    await new Promise((r) => setTimeout(r, 20));
    expect(queryByText(/Hidden lead/)).toBeNull();
  });
});
