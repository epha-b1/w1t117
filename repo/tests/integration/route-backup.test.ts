import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import Backup from '../../src/routes/Backup.svelte';
import { __resetForTests } from '../../src/services/db';
import { ensureFirstRunSeed, listUsers } from '../../src/services/auth.service';
import { backupService } from '../../src/services/backup.service';
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
}

describe('Backup route', () => {
  beforeEach(async () => {
    await freshDb();
    // jsdom doesn't implement URL.createObjectURL by default in some setups; stub just in case.
    if (!URL.createObjectURL) {
      (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:stub';
      (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
    } else {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stub');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    }
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders both sections: plain JSON and encrypted', async () => {
    await signInAsAdmin();
    const { getByText } = render(Backup);
    expect(getByText('Plain JSON')).toBeInTheDocument();
    expect(getByText(/Encrypted backup/)).toBeInTheDocument();
    expect(getByText('Download export')).toBeInTheDocument();
    expect(getByText('Export encrypted')).toBeInTheDocument();
  });

  it('Encrypted export is disabled until a passphrase is entered', async () => {
    await signInAsAdmin();
    const { getByText, container } = render(Backup);
    const encryptBtn = getByText('Export encrypted') as HTMLButtonElement;
    expect(encryptBtn.disabled).toBe(true);

    // Find the passphrase input in the encrypted section (first password input).
    const pwInput = container.querySelector('input[type="password"]') as HTMLInputElement;
    pwInput.value = 'open-sesame';
    pwInput.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
    expect(encryptBtn.disabled).toBe(false);
  });

  it('Download export calls backupService.exportData and pushes success toast', async () => {
    await signInAsAdmin();
    const blob = new Blob(['{}'], { type: 'application/json' });
    const spy = vi.spyOn(backupService, 'exportData').mockResolvedValue(blob);
    const { getByText } = render(Backup);
    await fireEvent.click(getByText('Download export'));
    await new Promise((r) => setTimeout(r, 5));
    expect(spy).toHaveBeenCalled();
    expect(get(toasts).some((t) => t.level === 'success' && /Export downloaded/.test(t.message))).toBe(true);
  });

  it('Export encrypted calls backupService.exportEncrypted with the passphrase', async () => {
    await signInAsAdmin();
    const blob = new Blob(['ENC'], { type: 'application/json' });
    const spy = vi.spyOn(backupService, 'exportEncrypted').mockResolvedValue(blob);
    const { getByText, container } = render(Backup);

    const pwInput = container.querySelector('input[type="password"]') as HTMLInputElement;
    pwInput.value = 'my-passphrase';
    pwInput.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();

    await fireEvent.click(getByText('Export encrypted'));
    await new Promise((r) => setTimeout(r, 5));
    expect(spy).toHaveBeenCalledWith('my-passphrase', expect.any(String));
  });

  it('Plain restore button is disabled when no file is picked', async () => {
    await signInAsAdmin();
    const { getByText } = render(Backup);
    expect((getByText('Restore') as HTMLButtonElement).disabled).toBe(true);
  });
});
