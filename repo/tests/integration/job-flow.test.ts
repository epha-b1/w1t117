import { describe, it, expect, beforeEach } from 'vitest';
import { __resetForTests, get, getAll, put } from '../../src/services/db';
import { ensureFirstRunSeed, listUsers, register } from '../../src/services/auth.service';
import { planService } from '../../src/services/plan.service';
import { enqueue as enqueueJob, getJob, getJobResult } from '../../src/services/job.service';
import { clearSession } from '../../src/stores/session.store';
import type { BomDiff } from '../../src/types/plan.types';

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

/**
 * The app normally uses real Worker instances for jobs. Under vitest / jsdom,
 * Worker is unavailable so we simulate a completed job by seeding the
 * job store + job_results store directly.
 */
async function seedCompletedBomCompareJob(actor: string, result: BomDiff): Promise<string> {
  const { enqueue } = await import('../../src/services/job.service');
  // enqueueJob would start a Worker — avoid by writing directly.
  const jobId = 'job-' + Math.random().toString(16).slice(2);
  const inputRef = 'input-' + jobId;
  const resultRef = 'result-' + jobId;
  await put('job_inputs', { id: inputRef, data: { a: [], b: [] } });
  await put('job_results', { id: resultRef, data: result });
  await put('jobs', {
    id: jobId,
    type: 'bom_compare',
    status: 'completed',
    progress: 100,
    inputRef,
    resultRef,
    startedAt: Date.now() - 100,
    completedAt: Date.now(),
    errorMessage: null,
    runtimeMs: 100
  });
  // silence unused binding
  void enqueue;
  void actor;
  return jobId;
}

describe('async job-backed BOM compare flow', () => {
  beforeEach(freshDb);

  it('records enqueued jobs in the job store', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    const planner = await register('p1', 'passw0rd!', 'planner', admin.id);
    // Worker runtime is unavailable in jsdom; the Worker instantiation throws
    // synchronously. We still verify the job row is written before that.
    try {
      await enqueueJob('bom_compare', { a: [], b: [] }, planner.id);
    } catch {
      /* expected: Worker unavailable in jsdom */
    }
    const jobs = await getAll('jobs');
    expect(jobs.length).toBe(1);
    expect(jobs[0].type).toBe('bom_compare');
    expect(jobs[0].status).toMatch(/queued|running/);
  });

  it('returns result via getJobResult when job completed', async () => {
    const result: BomDiff = { added: [], removed: [], modified: [] };
    const jobId = await seedCompletedBomCompareJob('sys', result);
    const job = await getJob(jobId);
    expect(job?.status).toBe('completed');
    const res = await getJobResult<BomDiff>(jobId);
    expect(res).not.toBeNull();
    expect(res?.added).toEqual([]);
  });

  it('planService.diffById still works synchronously (used as fallback)', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    const planner = await register('p1', 'passw0rd!', 'planner', admin.id);
    const plan = await planService.createPlan({ title: 'P' }, planner.id);
    await planService.addBomItem(
      plan.id,
      { partNumber: 'A', description: 'a', quantity: 1, unit: 'ea', unitCost: 10, sortOrder: 0 },
      planner.id
    );
    const v1 = await planService.saveVersion(plan.id, 'v1', planner.id);
    const full = await planService.getPlan(plan.id);
    await planService.updateBomItem(full!.bom[0].id, { quantity: 9 }, planner.id);
    const v2 = await planService.saveVersion(plan.id, 'v2', planner.id);
    const diff = await planService.diffById(v1.id, v2.id);
    expect(diff.modified).toHaveLength(1);
  });

  it('job_results store is populated on completion (via seed)', async () => {
    const jobId = await seedCompletedBomCompareJob('sys', {
      added: [],
      removed: [],
      modified: []
    });
    const job = await get('jobs', jobId);
    expect(job?.resultRef).toBeTruthy();
    const rec = await get('job_results', job!.resultRef!);
    expect(rec).toBeDefined();
  });
});
