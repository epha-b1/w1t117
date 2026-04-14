import { describe, it, expect, beforeEach } from 'vitest';
import { __resetForTests } from '../../src/services/db';
import { deliveryService } from '../../src/services/delivery.service';
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

describe('delivery service', () => {
  beforeEach(async () => {
    await freshDb();
    await ensureFirstRunSeed();
    await deliveryService.seedDefaultDepot();
  });

  it('provides 20 half-hour slots from 08:00 to 17:30', () => {
    const slots = deliveryService.getAvailableSlots();
    expect(slots[0]).toBe('08:00');
    expect(slots[slots.length - 1]).toBe('17:30');
    expect(slots).toHaveLength(20);
  });

  it('denies coverage for ZIPs out of range', async () => {
    const r = await deliveryService.checkCoverage('90210', 'depot-default');
    expect(r.covered).toBe(false);
    expect(r.reason).toMatch(/not in depot coverage/i);
  });

  it('allows coverage for ZIP in range and within 120 miles', async () => {
    const r = await deliveryService.checkCoverage('10001', 'depot-default');
    expect(r.covered).toBe(true);
    expect(r.distanceMiles).toBeLessThan(120);
  });

  it('creates delivery and computes freight cost', async () => {
    const [admin] = await listUsers();
    const d = await deliveryService.createDelivery(
      {
        recipientName: 'Acme',
        recipientAddress: '123 Main St',
        recipientZip: '10001',
        depotId: 'depot-default',
        items: [{ id: 'i1', description: 'Beam', length: 10, quantity: 1 }]
      },
      admin.id
    );
    expect(d.hasOversizeItem).toBe(true);
    expect(d.freightCost).toBeGreaterThanOrEqual(4500 + 7500);
  });

  it('schedules to valid slot and rejects invalid slot', async () => {
    const [admin] = await listUsers();
    const d = await deliveryService.createDelivery(
      {
        recipientName: 'Acme',
        recipientAddress: '123 Main St',
        recipientZip: '10001',
        depotId: 'depot-default',
        items: [{ id: 'i1', description: 'Pipe', length: 4, quantity: 1 }]
      },
      admin.id
    );
    await deliveryService.scheduleDelivery(d.id, '2026-04-15', '08:30', admin.id);
    await expect(
      deliveryService.scheduleDelivery(d.id, '2026-04-15', '08:45', admin.id)
    ).rejects.toThrow();
  });

  it('captures POD and marks delivery delivered', async () => {
    const [admin] = await listUsers();
    const d = await deliveryService.createDelivery(
      {
        recipientName: 'Acme',
        recipientAddress: '123 Main St',
        recipientZip: '10001',
        depotId: 'depot-default',
        items: [{ id: 'i1', description: 'Pipe', quantity: 1 }]
      },
      admin.id
    );
    await deliveryService.capturePod(d.id, { signatureName: 'Jane' }, admin.id);
    const updated = await deliveryService.getDelivery(d.id);
    expect(updated?.status).toBe('delivered');
  });

  it('logs exception and marks delivery exception', async () => {
    const [admin] = await listUsers();
    const d = await deliveryService.createDelivery(
      {
        recipientName: 'Acme',
        recipientAddress: '123 Main St',
        recipientZip: '10001',
        depotId: 'depot-default',
        items: [{ id: 'i1', description: 'Pipe', quantity: 1 }]
      },
      admin.id
    );
    await deliveryService.logException(
      d.id,
      { type: 'refused', reason: 'Recipient unavailable' },
      admin.id
    );
    const updated = await deliveryService.getDelivery(d.id);
    expect(updated?.status).toBe('exception');
  });
});
