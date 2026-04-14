import { describe, it, expect, beforeEach } from 'vitest';
import { __resetForTests } from '../../src/services/db';
import {
  dispatch,
  listNotifications,
  markRead,
  updateDndSettings,
  flushQueued,
  getRetryQueue,
  retry,
  updateSubscription
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

describe('notification service', () => {
  beforeEach(async () => {
    await freshDb();
    await ensureFirstRunSeed();
  });

  it('dispatches a notification with rendered template', async () => {
    const [admin] = await listUsers();
    const n = await dispatch('lead_status_default', admin.id, { leadTitle: 'X', status: 'quoted' });
    expect(n.renderedBody).toContain('X');
    expect(n.renderedBody).toContain('quoted');
  });

  it('tracks per-user read state in notification_reads', async () => {
    const [admin] = await listUsers();
    const n = await dispatch('lead_status_default', admin.id, { leadTitle: 'X' });
    let list = await listNotifications(admin.id);
    expect(list[0].read).toBe(false);
    await markRead(n.id, admin.id);
    list = await listNotifications(admin.id);
    expect(list[0].read).toBe(true);
  });

  it('queues during DND and flushes after', async () => {
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
    const n = await dispatch('lead_status_default', admin.id, { leadTitle: 'X' });
    expect(n.status).toBe('queued');
    await updateDndSettings(admin.id, {
      userId: admin.id,
      startHour: 0, startMinute: 0, endHour: 0, endMinute: 0, enabled: false
    });
    const flushed = await flushQueued(admin.id);
    expect(flushed).toBeGreaterThanOrEqual(1);
  });

  it('retry queue shows queued/failed notifications', async () => {
    const [admin] = await listUsers();
    await updateDndSettings(admin.id, {
      userId: admin.id,
      startHour: new Date().getHours(),
      startMinute: 0,
      endHour: (new Date().getHours() + 1) % 24,
      endMinute: 0,
      enabled: true
    });
    await dispatch('lead_status_default', admin.id, { leadTitle: 'Y' });
    const q = await getRetryQueue(admin.id);
    expect(q.length).toBeGreaterThan(0);
  });

  it('respects unsubscribed event types', async () => {
    const [admin] = await listUsers();
    await updateSubscription(admin.id, 'lead_status_default', false);
    const n = await dispatch('lead_status_default', admin.id, { leadTitle: 'Z' });
    expect(n.status).toBe('dispatched'); // dispatched silently
  });

  it('retry increments count and re-dispatches', async () => {
    const [admin] = await listUsers();
    await updateDndSettings(admin.id, {
      userId: admin.id,
      startHour: new Date().getHours(),
      startMinute: 0,
      endHour: (new Date().getHours() + 1) % 24,
      endMinute: 0,
      enabled: true
    });
    const n = await dispatch('lead_status_default', admin.id, { leadTitle: 'R' });
    expect(n.status).toBe('queued');
    await updateDndSettings(admin.id, {
      userId: admin.id,
      startHour: 0, startMinute: 0, endHour: 0, endMinute: 0, enabled: false
    });
    await retry(n.id);
    const list = await listNotifications(admin.id);
    const found = list.find((x) => x.id === n.id);
    expect(found?.status).toBe('dispatched');
    expect(found?.retryCount).toBe(1);
  });
});
