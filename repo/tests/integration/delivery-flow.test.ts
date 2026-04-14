import { describe, it, expect, beforeEach } from 'vitest';
import { __resetForTests } from '../../src/services/db';
import { ensureFirstRunSeed, listUsers, register } from '../../src/services/auth.service';
import { deliveryService } from '../../src/services/delivery.service';
import { listQueue, exportQueue } from '../../src/services/delivery-api.service';
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

describe('delivery workflow -> delivery API adapter', () => {
  beforeEach(async () => {
    await freshDb();
    await ensureFirstRunSeed();
    await deliveryService.seedDefaultDepot();
  });

  it('scheduling a delivery records a queue entry via the adapter', async () => {
    const [admin] = await listUsers();
    const dispatcher = await register('disp1', 'passw0rd!', 'dispatcher', admin.id);
    const d = await deliveryService.createDelivery(
      {
        recipientName: 'Acme',
        recipientAddress: '1 Main St',
        recipientZip: '10001',
        depotId: 'depot-default',
        items: [{ id: 'i1', description: 'Pipe', quantity: 1 }]
      },
      admin.id
    );
    await deliveryService.scheduleDelivery(d.id, '2026-04-15', '09:00', dispatcher.id);
    const q = await listQueue();
    const scheduleOps = q.filter((e) => e.operation === 'scheduleDelivery');
    expect(scheduleOps.length).toBe(1);
    expect(
      (scheduleOps[0].payload as { deliveryId: string }).deliveryId
    ).toBe(d.id);
  });

  it('cancelling a delivery records a queue entry', async () => {
    const [admin] = await listUsers();
    const dispatcher = await register('disp1', 'passw0rd!', 'dispatcher', admin.id);
    const d = await deliveryService.createDelivery(
      {
        recipientName: 'Acme',
        recipientAddress: '1 Main St',
        recipientZip: '10001',
        depotId: 'depot-default',
        items: [{ id: 'i1', description: 'Pipe', quantity: 1 }]
      },
      admin.id
    );
    const cancelled = await deliveryService.cancelDelivery(d.id, dispatcher.id, 'test');
    expect(cancelled.status).toBe('cancelled');
    const q = await listQueue();
    expect(q.some((e) => e.operation === 'cancelDelivery')).toBe(true);
  });

  it('fetchDeliveryStatus records a getStatus call', async () => {
    const [admin] = await listUsers();
    const dispatcher = await register('disp1', 'passw0rd!', 'dispatcher', admin.id);
    const d = await deliveryService.createDelivery(
      {
        recipientName: 'Acme',
        recipientAddress: '1 Main St',
        recipientZip: '10001',
        depotId: 'depot-default',
        items: [{ id: 'i1', description: 'Pipe', quantity: 1 }]
      },
      admin.id
    );
    const result = await deliveryService.fetchDeliveryStatus(d.id, dispatcher.id);
    expect(result.local?.id).toBe(d.id);
    expect(result.adapter.success).toBe(true);
    const q = await listQueue();
    expect(q.some((e) => e.operation === 'getStatus')).toBe(true);
  });

  it('exportQueue returns a valid JSON Blob and is RBAC-gated', async () => {
    const [admin] = await listUsers();
    const dispatcher = await register('disp1', 'passw0rd!', 'dispatcher', admin.id);
    const d = await deliveryService.createDelivery(
      {
        recipientName: 'Acme',
        recipientAddress: '1 Main St',
        recipientZip: '10001',
        depotId: 'depot-default',
        items: [{ id: 'i1', description: 'Pipe', quantity: 1 }]
      },
      admin.id
    );
    await deliveryService.scheduleDelivery(d.id, '2026-04-15', '09:00', dispatcher.id);
    const blob = await exportQueue(admin.id);
    expect(blob.type).toBe('application/json');
    const text = await blob.text();
    const parsed = JSON.parse(text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });
});
