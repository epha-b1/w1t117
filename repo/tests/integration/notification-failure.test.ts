import { describe, it, expect, beforeEach } from 'vitest';
import { __resetForTests } from '../../src/services/db';
import {
  dispatch,
  getRetryQueue,
  retry,
  listNotifications,
  updateDndSettings
} from '../../src/services/notification.service';
import { ensureFirstRunSeed, listUsers } from '../../src/services/auth.service';
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

describe('notification failure + retry', () => {
  beforeEach(async () => {
    await freshDb();
    await ensureFirstRunSeed();
  });

  it('unknown event type dispatches as failed (not silently defaulted)', async () => {
    const [admin] = await listUsers();
    const n = await dispatch('not_a_real_template', admin.id, { foo: 'bar' });
    expect(n.status).toBe('failed');
    expect(n.dispatchedAt).toBeNull();
  });

  it('missing recipient id produces a failed notification', async () => {
    const n = await dispatch('lead_status_default', '', { leadTitle: 'X' });
    expect(n.status).toBe('failed');
  });

  it('failed notifications appear in retry queue', async () => {
    const [admin] = await listUsers();
    await dispatch('not_a_real_template', admin.id, {});
    const q = await getRetryQueue(admin.id);
    expect(q.some((n) => n.status === 'failed')).toBe(true);
  });

  it('retry transitions failed -> dispatched when outside DND', async () => {
    const [admin] = await listUsers();
    const n = await dispatch('not_a_real_template', admin.id, {});
    expect(n.status).toBe('failed');
    await retry(n.id);
    const list = await listNotifications(admin.id);
    const updated = list.find((x) => x.id === n.id);
    expect(updated?.status).toBe('dispatched');
    expect(updated?.retryCount).toBe(1);
  });

  it('retry transitions failed -> queued when inside DND', async () => {
    const [admin] = await listUsers();
    const now = new Date();
    await updateDndSettings(admin.id, {
      userId: admin.id,
      startHour: now.getHours(),
      startMinute: 0,
      endHour: (now.getHours() + 1) % 24,
      endMinute: 0,
      enabled: true
    });
    const n = await dispatch('not_a_real_template', admin.id, {});
    expect(n.status).toBe('failed');
    await retry(n.id);
    const list = await listNotifications(admin.id);
    const updated = list.find((x) => x.id === n.id);
    expect(updated?.status).toBe('queued');
  });
});
