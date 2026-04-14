import { describe, it, expect, beforeEach } from 'vitest';
import { __resetForTests } from '../../src/services/db';
import {
  ensureFirstRunSeed,
  login,
  register,
  updateUser,
  changePassword,
  getRecentFailedLoginCount,
  resetFailedLogins,
  listUsers
} from '../../src/services/auth.service';
import { listEntries } from '../../src/services/audit.service';
import { clearSession } from '../../src/stores/session.store';

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

describe('authentication', () => {
  beforeEach(freshDb);

  it('seeds a default admin on first run only', async () => {
    const first = await ensureFirstRunSeed();
    expect(first.seeded).toBe(true);
    const users = await listUsers();
    expect(users).toHaveLength(1);
    expect(users[0].username).toBe('admin');
    expect(users[0].role).toBe('administrator');

    const second = await ensureFirstRunSeed();
    expect(second.seeded).toBe(false);
  });

  it('logs in with correct credentials and records audit entry', async () => {
    await ensureFirstRunSeed();
    const session = await login('admin', 'Admin@12345');
    expect(session.role).toBe('administrator');
    const entries = await listEntries({ action: 'login' });
    expect(entries.length).toBeGreaterThan(0);
  });

  it('rejects bad credentials and records failed_login', async () => {
    await ensureFirstRunSeed();
    await expect(login('admin', 'wrong')).rejects.toThrow();
    expect(getRecentFailedLoginCount()).toBe(1);
    const failed = await listEntries({ action: 'failed_login' });
    expect(failed.length).toBe(1);
  });

  it('flags anomaly after >10 failed logins in 5 minutes', async () => {
    await ensureFirstRunSeed();
    resetFailedLogins();
    // Use a nonexistent username so we exercise the unknown-user branch
    // (no PBKDF2 verify). The anomaly counter and audit path are identical
    // to bad-password attempts, but the test runs in a fraction of the time.
    for (let i = 0; i < 11; i++) {
      await login('ghost', 'bad').catch(() => {});
    }
    const anomaly = await listEntries({ action: 'anomaly_failed_logins' });
    expect(anomaly.length).toBeGreaterThan(0);
  });

  it('logs before/after on role change', async () => {
    await ensureFirstRunSeed();
    const admin = (await listUsers())[0];
    const u = await register('bob', 'pass1234', 'sales_coordinator', admin.id);
    await updateUser(u.id, { role: 'planner' }, admin.id);
    const changes = await listEntries({ action: 'role_change' });
    expect(changes.length).toBe(1);
    expect(changes[0].detail).toMatchObject({
      before: { role: 'sales_coordinator' },
      after: { role: 'planner' }
    });
  });

  it('changes password and verifies the new one works', async () => {
    await ensureFirstRunSeed();
    const admin = (await listUsers())[0];
    await changePassword(admin.id, 'Admin@12345', 'NewPass123');
    await expect(login('admin', 'Admin@12345')).rejects.toThrow();
    const s = await login('admin', 'NewPass123');
    expect(s.userId).toBe(admin.id);
  });
});
