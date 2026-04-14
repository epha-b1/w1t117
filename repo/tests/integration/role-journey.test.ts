import { describe, it, expect, beforeEach } from 'vitest';
import { __resetForTests } from '../../src/services/db';
import {
  ensureFirstRunSeed,
  listUsers,
  register,
  login,
  logout
} from '../../src/services/auth.service';
import { planService } from '../../src/services/plan.service';
import { deliveryService } from '../../src/services/delivery.service';
import { ledgerService } from '../../src/services/ledger.service';
import { listQueue } from '../../src/services/delivery-api.service';
import { canAccess, defaultRouteFor } from '../../src/guards/route-guard';
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

describe('role journeys (page-level integration)', () => {
  beforeEach(freshDb);

  it('dispatcher journey: route → create → schedule → queue export', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    await deliveryService.seedDefaultDepot();
    const dispatcher = await register('disp1', 'passw0rd!', 'dispatcher', admin.id);

    // Login simulation + default landing page
    const sess = await login('disp1', 'passw0rd!');
    expect(defaultRouteFor(sess.role)).toBe('/deliveries');
    expect(canAccess('deliveries', sess.role)).toBe(true);
    expect(canAccess('admin_users', sess.role)).toBe(false);

    // Create → schedule
    const d = await deliveryService.createDelivery(
      {
        recipientName: 'Acme',
        recipientAddress: '1 Main St',
        recipientZip: '10001',
        depotId: 'depot-default',
        items: [{ id: 'i1', description: 'Pipe', quantity: 1 }]
      },
      dispatcher.id
    );
    await deliveryService.scheduleDelivery(d.id, '2026-04-15', '09:00', dispatcher.id);

    // Adapter queue was written from the schedule
    const q = await listQueue();
    expect(q.some((e) => e.operation === 'scheduleDelivery')).toBe(true);

    // Logout is audited
    await logout();
    expect(getCurrentSession()).toBeNull();
    const logouts = await listEntries({ action: 'logout' });
    expect(logouts.length).toBe(1);
  });

  it('auditor journey: read-only ledger, blocked from mutations', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    const auditor = await register('aud1', 'passw0rd!', 'auditor', admin.id);

    const acct = await ledgerService.createAccount('o-1', 'order', '9999', admin.id);
    await ledgerService.depositToAccount(acct.id, 5000, admin.id);
    await ledgerService.freeze(acct.id, 10, admin.id);

    const sess = await login('aud1', 'passw0rd!');
    expect(defaultRouteFor(sess.role)).toBe('/audit');
    expect(canAccess('audit', sess.role)).toBe(true);
    expect(canAccess('ledger', sess.role)).toBe(true); // read
    expect(canAccess('leads', sess.role)).toBe(false);

    // Read OK
    const entries = await ledgerService.listEntries(acct.id);
    expect(entries.length).toBeGreaterThan(0);

    // Mutate blocked at service layer
    await expect(
      ledgerService.depositToAccount(acct.id, 10000, auditor.id)
    ).rejects.toThrow(/not permitted|Unauthorized/i);
  });

  it('planner journey: plans + jobs, cannot manage users', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    const planner = await register('plan1', 'passw0rd!', 'planner', admin.id);

    const sess = await login('plan1', 'passw0rd!');
    expect(defaultRouteFor(sess.role)).toBe('/plans');
    expect(canAccess('plans', sess.role)).toBe(true);
    expect(canAccess('jobs', sess.role)).toBe(true);
    expect(canAccess('admin_users', sess.role)).toBe(false);

    const plan = await planService.createPlan({ title: 'Bridge kit' }, planner.id);
    await planService.addBomItem(
      plan.id,
      { partNumber: 'A', description: 'Bolt', quantity: 2, unit: 'ea', unitCost: 0.5, sortOrder: 0 },
      planner.id
    );
    const v1 = await planService.saveVersion(plan.id, 'initial', planner.id);
    expect(v1.version).toBe(1);

    await expect(
      register('new_user', 'passw0rd!', 'dispatcher', planner.id)
    ).rejects.toThrow(/not permitted/i);
  });
});
