import { describe, it, expect } from 'vitest';
import { computeErrorRate } from '../../src/services/job.service';
import type { Job } from '../../src/types/job.types';

function mk(status: Job['status'], completedAt: number, id = String(completedAt)): Job {
  return {
    id,
    type: 'bom_compare',
    status,
    progress: 100,
    inputRef: 'i',
    resultRef: null,
    startedAt: completedAt,
    completedAt,
    errorMessage: null,
    runtimeMs: 1
  };
}

describe('job error rate (pure)', () => {
  it('returns 0 for empty input', () => {
    expect(computeErrorRate([])).toBe(0);
  });

  it('returns 0 when no finished jobs exist', () => {
    expect(computeErrorRate([mk('running', 1, 'r1'), mk('queued', 2, 'q1')])).toBe(0);
  });

  it('ignores queued/running/paused jobs in denominator', () => {
    const jobs = [
      mk('running', 1, 'r1'),
      mk('paused', 2, 'p1'),
      mk('queued', 3, 'q1'),
      mk('failed', 4, 'f1'),
      mk('completed', 5, 'c1')
    ];
    expect(computeErrorRate(jobs)).toBe(0.5);
  });

  it('respects rolling window size', () => {
    const jobs: Job[] = [];
    for (let i = 0; i < 60; i++) jobs.push(mk('completed', i, String(i)));
    jobs.push(mk('failed', 100, 'f1'));
    expect(computeErrorRate(jobs, 50)).toBeCloseTo(1 / 50, 5);
  });

  it('uses most-recent finished jobs within the window', () => {
    const jobs: Job[] = [];
    for (let i = 0; i < 50; i++) jobs.push(mk('failed', i, `f${i}`));
    for (let i = 0; i < 50; i++) jobs.push(mk('completed', i + 1000, `c${i}`));
    expect(computeErrorRate(jobs, 50)).toBe(0);
  });
});
