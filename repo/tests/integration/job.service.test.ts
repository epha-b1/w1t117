import { describe, it, expect, beforeEach } from 'vitest';
import { __resetForTests, put } from '../../src/services/db';
import { getErrorRate } from '../../src/services/job.service';
import { clearSession } from '../../src/stores/session.store';
import type { Job } from '../../src/types/job.types';

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

function mkJob(status: Job['status'], t: number, id = String(t)): Job {
  return {
    id,
    type: 'bom_compare',
    status,
    progress: 100,
    inputRef: 'i',
    resultRef: null,
    startedAt: t,
    completedAt: t,
    errorMessage: null,
    runtimeMs: 1
  };
}

describe('job service — error rate', () => {
  beforeEach(freshDb);

  it('returns 0 when no finished jobs', async () => {
    expect(await getErrorRate()).toBe(0);
  });

  it('computes failures / finished in last 50', async () => {
    for (let i = 0; i < 50; i++) {
      await put('jobs', mkJob(i < 48 ? 'completed' : 'failed', i, String(i)));
    }
    const rate = await getErrorRate();
    expect(rate).toBeCloseTo(2 / 50, 5);
  });

  it('excludes queued/running/paused jobs from denominator', async () => {
    await put('jobs', mkJob('running', 1, 'r1'));
    await put('jobs', mkJob('queued', 2, 'q1'));
    await put('jobs', mkJob('completed', 3, 'c1'));
    await put('jobs', mkJob('failed', 4, 'f1'));
    const rate = await getErrorRate();
    expect(rate).toBe(0.5);
  });
});
