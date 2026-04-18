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

// "Inbox" is ambiguous — it matches both the Sidebar's "Lead Inbox" link and
// the page body's <h3>Inbox ...</h3>. Assert via a direct querySelector on h3
// rather than findByText(/Inbox/).
async function waitForInboxHeading(container: HTMLElement): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const h3s = Array.from(container.querySelectorAll('h3'));
    if (h3s.some((h) => (h.textContent ?? '').trim().startsWith('Inbox'))) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('waitForInboxHeading timed out');
}

async function waitForText(container: HTMLElement, needle: string): Promise<void> {
  for (let i = 0; i < 300; i++) {
    if ((container.textContent ?? '').includes(needle)) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('waitForText timed out: ' + needle);
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

    const { container } = render(NotificationCenter);
    await waitForInboxHeading(container);
    await waitForText(container, 'No notifications');
  });

  it('renders a dispatched notification for the signed-in user', async () => {
    await ensureFirstRunSeed();
    const admin = (await listUsers()).find((u) => u.role === 'administrator')!;
    setSession({ userId: admin.id, username: admin.username, role: admin.role });

    await notificationService.dispatch('lead_status_default', admin.id, {
      leadTitle: 'Fab order 123',
      status: 'quoted'
    });

    const { container } = render(NotificationCenter);
    // The list renders only `renderedSubject` ("Lead status changed" for
    // the lead_status_default template) — the body with "Fab order 123"
    // only appears in the detail modal on click. Assert on the subject.
    await waitForText(container, 'Lead status changed');
  });

  it('does not render notifications addressed to a different user', async () => {
    await ensureFirstRunSeed();
    const admin = (await listUsers()).find((u) => u.role === 'administrator')!;
    setSession({ userId: admin.id, username: admin.username, role: admin.role });

    await notificationService.dispatch('lead_status_default', 'some-other-user', {
      leadTitle: 'Hidden lead',
      status: 'new'
    });

    const { container } = render(NotificationCenter);
    await waitForInboxHeading(container);
    await new Promise((r) => setTimeout(r, 50));
    expect(container.textContent).not.toContain('Hidden lead');
    expect(container.textContent).toContain('No notifications');
  });
});
