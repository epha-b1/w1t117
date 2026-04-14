import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, put, get, getAll, ALL_STORES, __resetForTests } from '../../src/services/db';

async function resetDb() {
  await __resetForTests();
  const req = indexedDB.deleteDatabase('forgeops');
  await new Promise<void>((resolve, reject) => {
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

describe('IndexedDB schema initialization', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('creates all expected stores on first open', async () => {
    const db = await getDb();
    for (const name of ALL_STORES) {
      expect(db.objectStoreNames.contains(name)).toBe(true);
    }
  });

  it('round-trips a user record', async () => {
    await put('users', {
      id: 'u1',
      username: 'alice',
      passwordHash: 'h',
      salt: 's',
      role: 'administrator',
      isActive: true,
      createdAt: 1,
      updatedAt: 1
    });
    const fetched = await get('users', 'u1');
    expect(fetched?.username).toBe('alice');
    const all = await getAll('users');
    expect(all.length).toBe(1);
  });
});
