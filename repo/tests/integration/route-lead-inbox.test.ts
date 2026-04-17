import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import LeadInbox from '../../src/routes/LeadInbox.svelte';
import { __resetForTests } from '../../src/services/db';
import { ensureFirstRunSeed, listUsers, register } from '../../src/services/auth.service';
import { leadService } from '../../src/services/lead.service';
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

async function seedAndSignIn(role: 'administrator' | 'sales_coordinator' | 'auditor') {
  await ensureFirstRunSeed();
  const admin = (await listUsers()).find((u) => u.role === 'administrator')!;
  if (role === 'administrator') {
    setSession({ userId: admin.id, username: admin.username, role: admin.role });
    return admin;
  }
  const user = await register(
    role === 'sales_coordinator' ? 'sc1' : 'aud1',
    'passw0rd!',
    role,
    admin.id
  );
  setSession({ userId: user.id, username: user.username, role: user.role });
  return user;
}

describe('LeadInbox route', () => {
  beforeEach(freshDb);
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the empty-state row when no leads exist', async () => {
    await seedAndSignIn('administrator');
    const { findByText } = render(LeadInbox);
    await findByText('No leads match the current filters');
  });

  it('sales_coordinator sees the "+ New lead" button', async () => {
    await seedAndSignIn('sales_coordinator');
    const { findByText } = render(LeadInbox);
    await findByText('+ New lead');
  });

  it('auditor DOES NOT see the "+ New lead" button', async () => {
    await seedAndSignIn('auditor');
    // auditor is not in the canCreateLead roles.
    const { queryByText, findByText } = render(LeadInbox);
    await findByText('No leads match the current filters');
    expect(queryByText('+ New lead')).toBeNull();
  });

  it('renders existing leads with title + status label', async () => {
    const admin = await seedAndSignIn('administrator');
    await leadService.createLead(
      {
        title: 'Fabricated widget order',
        requirements: 'Spec rev B',
        budget: 500,
        availabilityStart: Date.now(),
        availabilityEnd: Date.now() + 86_400_000,
        contactName: 'Bob',
        contactPhone: '5551234567',
        contactEmail: 'bob@x.y'
      },
      admin.id
    );
    const { findByText } = render(LeadInbox);
    await findByText('Fabricated widget order');
    await findByText('New'); // status badge label
  });

  it('+ New lead submit creates the lead and pushes success toast', async () => {
    await seedAndSignIn('administrator');
    const { findByText, getByText, container } = render(LeadInbox);
    await findByText('No leads match the current filters');
    await fireEvent.click(getByText('+ New lead'));

    // Fill the LeadForm fields inside the Modal.
    const byLabel = (label: string): HTMLInputElement | HTMLTextAreaElement => {
      const lab = Array.from(container.querySelectorAll('label')).find((l) =>
        l.textContent?.trim().startsWith(label)
      )!;
      return lab.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement;
    };
    const set = (label: string, val: string) => {
      const el = byLabel(label);
      (el as HTMLInputElement).value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('Title', 'Gizmo order');
    set('Requirements', 'as quoted');
    set('Budget', '250');
    set('Availability start', '2026-05-01');
    set('Availability end', '2026-05-10');
    set('Contact name', 'Cass');
    set('Contact phone', '5559876543');
    set('Contact email', 'cass@example.com');

    // Submit the LeadForm (second form is inside the Modal).
    const forms = container.querySelectorAll('form');
    await fireEvent.submit(forms[forms.length - 1]);
    await findByText('Gizmo order');
    expect(get(toasts).some((t) => t.level === 'success' && /Lead created/.test(t.message))).toBe(true);
  });
});
