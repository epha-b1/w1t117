import { describe, it, expect, beforeEach } from 'vitest';
import { __resetForTests } from '../../src/services/db';
import { authService, login } from '../../src/services/auth.service';
import { ensureFirstRunSeed } from '../../src/services/auth.service';
import { listEntries } from '../../src/services/audit.service';
import { clearSession, getCurrentSession } from '../../src/stores/session.store';

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

describe('logout audit', () => {
  beforeEach(freshDb);

  it('authService.logout() writes a logout audit entry and clears session', async () => {
    await ensureFirstRunSeed();
    await login('admin', 'Admin@12345');
    expect(getCurrentSession()).not.toBeNull();

    await authService.logout();

    const entries = await listEntries({ action: 'logout' });
    expect(entries.length).toBe(1);
    expect(getCurrentSession()).toBeNull();
  });
});
