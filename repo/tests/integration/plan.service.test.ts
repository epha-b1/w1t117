import { describe, it, expect, beforeEach } from 'vitest';
import { __resetForTests } from '../../src/services/db';
import { planService } from '../../src/services/plan.service';
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

describe('plan service', () => {
  beforeEach(freshDb);

  it('creates plan and adds BOM items', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    const plan = await planService.createPlan({ title: 'P1', tags: ['steel'] }, admin.id);
    await planService.addBomItem(plan.id, {
      partNumber: 'A', description: 'a', quantity: 2, unit: 'ea', unitCost: 10, sortOrder: 0
    });
    const full = await planService.getPlan(plan.id);
    expect(full?.bom.length).toBe(1);
  });

  it('saves versions with required note and increments currentVersion', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    const plan = await planService.createPlan({ title: 'P1' }, admin.id);
    await planService.addBomItem(plan.id, {
      partNumber: 'A', description: 'a', quantity: 1, unit: 'ea', unitCost: 10, sortOrder: 0
    });
    await expect(planService.saveVersion(plan.id, '', admin.id)).rejects.toThrow();
    const v1 = await planService.saveVersion(plan.id, 'initial', admin.id);
    expect(v1.version).toBe(1);
    const refreshed = await planService.getPlan(plan.id);
    expect(refreshed?.currentVersion).toBe(1);
  });

  it('rolls back plan BOM to prior version', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    const plan = await planService.createPlan({ title: 'P1' }, admin.id);
    await planService.addBomItem(plan.id, {
      partNumber: 'A', description: 'a', quantity: 1, unit: 'ea', unitCost: 10, sortOrder: 0
    });
    const v1 = await planService.saveVersion(plan.id, 'v1', admin.id);
    const after = await planService.getPlan(plan.id);
    for (const b of after!.bom) await planService.removeBomItem(b.id);
    await planService.addBomItem(plan.id, {
      partNumber: 'B', description: 'b', quantity: 5, unit: 'ea', unitCost: 20, sortOrder: 0
    });
    await planService.rollback(plan.id, v1.id, admin.id);
    const restored = await planService.getPlan(plan.id);
    expect(restored?.bom.length).toBe(1);
    expect(restored?.bom[0].partNumber).toBe('A');
  });

  it('diffs two versions', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    const plan = await planService.createPlan({ title: 'P1' }, admin.id);
    await planService.addBomItem(plan.id, {
      partNumber: 'A', description: 'a', quantity: 1, unit: 'ea', unitCost: 10, sortOrder: 0
    });
    const v1 = await planService.saveVersion(plan.id, 'v1', admin.id);
    const full = await planService.getPlan(plan.id);
    await planService.updateBomItem(full!.bom[0].id, { quantity: 5 });
    const v2 = await planService.saveVersion(plan.id, 'v2', admin.id);
    const d = await planService.diffById(v1.id, v2.id);
    expect(d.modified).toHaveLength(1);
    expect(d.modified[0].changedFields).toContain('quantity');
  });

  it('generates and validates share token, rejects after revoke', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    const plan = await planService.createPlan({ title: 'P1' }, admin.id);
    const token = await planService.generateShareToken(plan.id, 7, admin.id);
    const ok = await planService.validateShareToken(token.token);
    expect(ok?.id).toBe(plan.id);
    await planService.revokeShareToken(token.id, admin.id);
    expect(await planService.validateShareToken(token.token)).toBeNull();
  });

  it('rejects expired share tokens', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    const plan = await planService.createPlan({ title: 'P1' }, admin.id);
    const token = await planService.generateShareToken(plan.id, 1, admin.id);
    token.expiresAt = Date.now() - 1000;
    const { put } = await import('../../src/services/db');
    await put('share_tokens', token);
    expect(await planService.validateShareToken(token.token)).toBeNull();
  });
});
