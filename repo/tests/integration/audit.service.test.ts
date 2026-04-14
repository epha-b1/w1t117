import { describe, it, expect, beforeEach } from 'vitest';
import { __resetForTests, getAll, put } from '../../src/services/db';
import { log, listEntries, purgeOldEntries } from '../../src/services/audit.service';
import { clearSession } from '../../src/stores/session.store';

async function freshDb() {
  __resetForTests();
  clearSession();
  localStorage.clear();
  const req = indexedDB.deleteDatabase('forgeops');
  await new Promise<void>((resolve) => {
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe('audit log', () => {
  beforeEach(freshDb);

  it('appends entries; listEntries returns newest first', async () => {
    await log({ actor: 'a', action: 'x', resourceType: 'user', resourceId: '1', detail: {} });
    await log({ actor: 'a', action: 'y', resourceType: 'user', resourceId: '1', detail: {} });
    const entries = await listEntries();
    expect(entries.length).toBe(2);
    expect(entries[0].action).toBe('y');
  });

  it('filters by actor, action, resourceType, and time window', async () => {
    const baseTs = Date.now();
    await put('audit_log', {
      id: '1', actor: 'alice', action: 'login', resourceType: 'user',
      resourceId: 'u1', detail: {}, timestamp: baseTs - 1000
    });
    await put('audit_log', {
      id: '2', actor: 'bob', action: 'lead_created', resourceType: 'lead',
      resourceId: 'l1', detail: {}, timestamp: baseTs
    });
    const byActor = await listEntries({ actor: 'alice' });
    expect(byActor).toHaveLength(1);
    const byAction = await listEntries({ action: 'lead_created' });
    expect(byAction).toHaveLength(1);
    const byRange = await listEntries({ from: baseTs - 500, to: baseTs + 500 });
    expect(byRange.map((e) => e.id)).toEqual(['2']);
  });

  it('purges entries older than 180 days', async () => {
    const now = Date.now();
    const old = now - 200 * 24 * 3600_000;
    await put('audit_log', {
      id: '1', actor: 'sys', action: 'x', resourceType: 'user',
      resourceId: 'u1', detail: {}, timestamp: old
    });
    await put('audit_log', {
      id: '2', actor: 'sys', action: 'x', resourceType: 'user',
      resourceId: 'u1', detail: {}, timestamp: now
    });
    const count = await purgeOldEntries(now);
    expect(count).toBe(1);
    const remaining = await getAll('audit_log');
    expect(remaining.map((e) => e.id)).toEqual(['2']);
  });
});
