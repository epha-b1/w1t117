import { describe, it, expect, beforeEach } from 'vitest';
import { __resetForTests } from '../../src/services/db';
import {
  OfflineStubAdapter,
  listQueue,
  exportQueue
} from '../../src/services/delivery-api.service';

async function freshDb() {
  await __resetForTests();
  const req = indexedDB.deleteDatabase('forgeops');
  await new Promise<void>((resolve) => {
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe('delivery API adapter (offline stub)', () => {
  beforeEach(freshDb);

  it('logs scheduleDelivery and returns mock response', async () => {
    const a = new OfflineStubAdapter();
    const res = await a.scheduleDelivery({
      deliveryId: 'd1',
      recipientName: 'n',
      recipientAddress: 'addr',
      recipientZip: '10001',
      scheduledDate: '2026-04-15',
      scheduledSlot: '09:00',
      items: []
    });
    expect(res.success).toBe(true);
    expect(res.externalId).toBeTruthy();
    const q = await listQueue();
    expect(q).toHaveLength(1);
    expect(q[0].operation).toBe('scheduleDelivery');
  });

  it('logs cancel and status ops', async () => {
    const a = new OfflineStubAdapter();
    await a.cancelDelivery('d1');
    await a.getStatus('d1');
    const q = await listQueue();
    expect(q.map((e) => e.operation).sort()).toEqual(['cancelDelivery', 'getStatus']);
  });

  it('exports queue as JSON and stamps exportedAt', async () => {
    const a = new OfflineStubAdapter();
    await a.scheduleDelivery({
      deliveryId: 'd2', recipientName: 'n', recipientAddress: 'a',
      recipientZip: '10001', scheduledDate: '2026-04-15',
      scheduledSlot: '09:00', items: []
    });
    const blob = await exportQueue();
    const text = await blob.text();
    const parsed = JSON.parse(text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    const q = await listQueue();
    expect(q[0].exportedAt).not.toBeNull();
  });
});
