import { describe, it, expect, beforeEach } from 'vitest';
import { __resetForTests } from '../../src/services/db';
import {
  ensureFirstRunSeed,
  register,
  listUsers,
  updateUser
} from '../../src/services/auth.service';
import { planService } from '../../src/services/plan.service';
import { leadService } from '../../src/services/lead.service';
import { deliveryService } from '../../src/services/delivery.service';
import { ledgerService } from '../../src/services/ledger.service';
import { exportQueue } from '../../src/services/delivery-api.service';
import { exportData } from '../../src/services/backup.service';
import { enqueue as enqueueJob } from '../../src/services/job.service';
import { getAll } from '../../src/services/db';
import { authorize, AuthorizationError } from '../../src/services/authz.service';
import { clearSession } from '../../src/stores/session.store';
import type { User } from '../../src/types/auth.types';

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

async function makeUsers(): Promise<{
  admin: User;
  sc: User;
  planner: User;
  dispatcher: User;
  auditor: User;
}> {
  await ensureFirstRunSeed();
  const [admin] = await listUsers();
  const sc = await register('sc1', 'passw0rd!', 'sales_coordinator', admin.id);
  const planner = await register('planner1', 'passw0rd!', 'planner', admin.id);
  const dispatcher = await register('disp1', 'passw0rd!', 'dispatcher', admin.id);
  const auditor = await register('aud1', 'passw0rd!', 'auditor', admin.id);
  return { admin, sc, planner, dispatcher, auditor };
}

describe('service-layer RBAC', () => {
  beforeEach(freshDb);

  it('authorize() rejects unknown actor and bypasses system', async () => {
    await ensureFirstRunSeed();
    await expect(authorize('nope', 'lead:create')).rejects.toThrow(AuthorizationError);
    await expect(authorize('system', 'lead:create')).resolves.toBeUndefined();
  });

  it('rejects sales_coordinator from creating plans', async () => {
    const { sc } = await makeUsers();
    await expect(
      planService.createPlan({ title: 'P' }, sc.id)
    ).rejects.toThrow(/not permitted|Unauthorized/i);
  });

  it('allows planner to create plans', async () => {
    const { planner } = await makeUsers();
    const p = await planService.createPlan({ title: 'P' }, planner.id);
    expect(p.title).toBe('P');
  });

  it('rejects dispatcher from mutating leads', async () => {
    const { dispatcher } = await makeUsers();
    await expect(
      leadService.createLead(
        {
          title: 'x',
          requirements: 'y',
          budget: 100,
          availabilityStart: Date.now(),
          availabilityEnd: Date.now() + 86_400_000,
          contactName: 'Jane',
          contactPhone: '555-111-2222',
          contactEmail: 'jane@ex.com'
        },
        dispatcher.id
      )
    ).rejects.toThrow(/not permitted/i);
  });

  it('rejects auditor from mutating anything; allows read', async () => {
    const { auditor, admin } = await makeUsers();
    await expect(
      ledgerService.createAccount('o-1', 'order', '1234', auditor.id)
    ).rejects.toThrow(/not permitted/i);
    // admin can create
    const acct = await ledgerService.createAccount('o-1', 'order', '1234', admin.id);
    // auditor can read entries (non-mutating)
    const entries = await ledgerService.listEntries(acct.id);
    expect(Array.isArray(entries)).toBe(true);
  });

  it('rejects planner from scheduling deliveries but allows dispatcher', async () => {
    const { planner, dispatcher, admin } = await makeUsers();
    await deliveryService.seedDefaultDepot();
    const d = await deliveryService.createDelivery(
      {
        recipientName: 'Acme',
        recipientAddress: '1 Main',
        recipientZip: '10001',
        depotId: 'depot-default',
        items: [{ id: 'i', description: 'Pipe', quantity: 1 }]
      },
      admin.id
    );
    await expect(
      deliveryService.scheduleDelivery(d.id, '2026-04-15', '08:00', planner.id)
    ).rejects.toThrow(/not permitted/i);
    const updated = await deliveryService.scheduleDelivery(
      d.id,
      '2026-04-15',
      '08:00',
      dispatcher.id
    );
    expect(updated.scheduledSlot).toBe('08:00');
  });

  it('rejects non-admin from creating or updating users', async () => {
    const { sc, planner } = await makeUsers();
    await expect(
      register('hacker', 'passw0rd!', 'administrator', sc.id)
    ).rejects.toThrow(/not permitted/i);
    await expect(
      updateUser(planner.id, { role: 'administrator' }, sc.id)
    ).rejects.toThrow(/not permitted/i);
  });

  it('rejects non-admin from backup export and delivery queue export', async () => {
    const { sc, admin, dispatcher } = await makeUsers();
    await expect(exportData(sc.id)).rejects.toThrow(/not permitted/i);
    const blob = await exportData(admin.id);
    expect(blob).toBeInstanceOf(Blob);

    await expect(exportQueue(sc.id)).rejects.toThrow(/not permitted/i);
    const qBlob = await exportQueue(dispatcher.id);
    expect(qBlob).toBeInstanceOf(Blob);
  });

  it('only admin/planner/dispatcher can enqueue jobs', async () => {
    const { auditor, planner } = await makeUsers();
    await expect(
      enqueueJob('bom_compare', { a: [], b: [] }, auditor.id)
    ).rejects.toThrow(/not permitted/i);

    // planner passes authz — Worker may fail to start in jsdom, but the
    // job record must still be persisted (authz ran before Worker spawn).
    let err: Error | null = null;
    try {
      await enqueueJob('bom_compare', { a: [], b: [] }, planner.id);
    } catch (e) {
      err = e as Error;
    }
    if (err) expect(err.message).not.toMatch(/not permitted|Unauthorized/i);
    const jobs = await getAll('jobs');
    expect(jobs.length).toBe(1);
  });

  it('inactive users lose all permissions', async () => {
    const { admin, planner } = await makeUsers();
    await updateUser(planner.id, { isActive: false }, admin.id);
    await expect(
      planService.createPlan({ title: 'X' }, planner.id)
    ).rejects.toThrow(/inactive/i);
  });
});
