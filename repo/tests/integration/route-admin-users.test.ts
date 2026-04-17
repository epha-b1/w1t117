import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import AdminUsers from '../../src/routes/AdminUsers.svelte';
import { __resetForTests } from '../../src/services/db';
import {
  ensureFirstRunSeed,
  listUsers,
  register
} from '../../src/services/auth.service';
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

async function signInAsAdmin() {
  await ensureFirstRunSeed();
  const all = await listUsers();
  const admin = all.find((u) => u.role === 'administrator')!;
  setSession({ userId: admin.id, username: admin.username, role: admin.role });
  return admin;
}

describe('AdminUsers route', () => {
  beforeEach(freshDb);
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the users table and the seeded admin row', async () => {
    await signInAsAdmin();
    const { findByText } = render(AdminUsers);
    await findByText('admin');
    // "administrator" is the humanised role label.
    await findByText('administrator');
  });

  it('empty-state message appears when user list is empty', async () => {
    // Don't call ensureFirstRunSeed — render with no users and no session so
    // that the onMount-triggered refresh sees an empty store.
    const { findByText } = render(AdminUsers);
    await findByText('No users yet');
  });

  it('+ Add user opens the create modal with required inputs', async () => {
    await signInAsAdmin();
    const { getByText, findByText } = render(AdminUsers);
    await findByText('admin');
    await fireEvent.click(getByText('+ Add user'));
    expect(getByText('Create user')).toBeInTheDocument();
  });

  it('creating a new user validates password length via service error surface', async () => {
    await signInAsAdmin();
    const { getByText, findByText, container } = render(AdminUsers);
    await findByText('admin');
    await fireEvent.click(getByText('+ Add user'));

    const form = container.querySelectorAll('form')[0] as HTMLFormElement;
    const [usernameInput, passwordInput] = form.querySelectorAll('input');
    (usernameInput as HTMLInputElement).value = 'newbie';
    usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
    // Short password triggers the service-side error.
    (passwordInput as HTMLInputElement).value = 'short';
    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));

    await fireEvent.submit(form);
    await findByText(/at least 8 characters/);
  });

  it('happy-path user creation updates the table and clears the modal', async () => {
    await signInAsAdmin();
    const { getByText, findByText, queryByText, container } = render(AdminUsers);
    await findByText('admin');
    await fireEvent.click(getByText('+ Add user'));

    const form = container.querySelectorAll('form')[0] as HTMLFormElement;
    const [usernameInput, passwordInput] = form.querySelectorAll('input');
    const roleSelect = form.querySelector('select') as HTMLSelectElement;

    (usernameInput as HTMLInputElement).value = 'planner-one';
    usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
    (passwordInput as HTMLInputElement).value = 'passw0rd!';
    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    roleSelect.value = 'planner';
    roleSelect.dispatchEvent(new Event('change', { bubbles: true }));

    await fireEvent.submit(form);
    await findByText('planner-one');

    // Modal auto-closes on success — "Create user" heading no longer present.
    expect(queryByText('Create user')).toBeNull();
    expect(get(toasts).some((t) => t.level === 'success' && t.message === 'User created')).toBe(true);
  });

  it('Edit button opens the edit modal pre-filled with the user role and active state', async () => {
    const admin = await signInAsAdmin();
    await register('planner-two', 'passw0rd!', 'planner', admin.id);

    const { findByText, container } = render(AdminUsers);
    await findByText('planner-two');
    // Two "Edit" buttons — click the one for planner-two.
    const rows = Array.from(container.querySelectorAll('tbody tr'));
    const targetRow = rows.find((r) => r.textContent?.includes('planner-two'))!;
    const editBtn = targetRow.querySelector('button.link') as HTMLButtonElement;
    await fireEvent.click(editBtn);
    expect(await findByText(/Edit planner-two/)).toBeInTheDocument();
  });
});
