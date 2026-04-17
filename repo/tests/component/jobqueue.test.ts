import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import JobQueue from '../../src/components/jobs/JobQueue.svelte';
import { jobService } from '../../src/services/job.service';
import { toasts } from '../../src/stores/toast.store';
import { setSession, clearSession } from '../../src/stores/session.store';
import type { Job } from '../../src/types/job.types';

function buildJob(overrides: Partial<Job> = {}): Job {
  return {
    id: overrides.id ?? 'j1',
    type: overrides.type ?? 'bom_compare',
    status: overrides.status ?? 'running',
    progress: overrides.progress ?? 20,
    inputRef: 'in1',
    resultRef: null,
    startedAt: overrides.startedAt ?? Date.now() - 1000,
    completedAt: null,
    errorMessage: overrides.errorMessage ?? null,
    runtimeMs: overrides.runtimeMs ?? null,
    ...overrides
  };
}

describe('<JobQueue>', () => {
  beforeEach(() => {
    toasts.set([]);
    clearSession();
    jobService.jobsStore.set([]);
  });
  afterEach(() => {
    toasts.set([]);
    clearSession();
    cleanup();
    vi.restoreAllMocks();
    jobService.jobsStore.set([]);
  });

  it('shows the empty state when no jobs', async () => {
    vi.spyOn(jobService, 'initJobStore').mockResolvedValue(undefined);
    const { findByText } = render(JobQueue);
    await findByText('No jobs yet');
  });

  it('lists a running job with type, status, progress%, and runtime placeholder', async () => {
    vi.spyOn(jobService, 'initJobStore').mockImplementation(async () => {
      jobService.jobsStore.set([buildJob({ status: 'running', progress: 42 })]);
    });
    const { findByText, container } = render(JobQueue);
    await findByText('bom_compare');
    expect(container.textContent).toContain('running');
    expect(container.textContent).toContain('42%');
    // No runtimeMs yet → renders the "running since …" branch.
    expect(container.textContent).toMatch(/running since/);
  });

  it('shows Pause + Cancel for running jobs and invokes service calls', async () => {
    const pauseSpy = vi.spyOn(jobService, 'pause').mockResolvedValue(undefined);
    vi.spyOn(jobService, 'initJobStore').mockImplementation(async () => {
      jobService.jobsStore.set([buildJob({ id: 'r1', status: 'running' })]);
    });
    setSession({ userId: 'u1', username: 'a', role: 'administrator' });

    const { findByText } = render(JobQueue);
    const pauseBtn = await findByText('Pause');
    await fireEvent.click(pauseBtn);
    expect(pauseSpy).toHaveBeenCalledWith('r1');
  });

  it('shows Resume + Cancel for paused jobs and invokes service.resume', async () => {
    const resumeSpy = vi.spyOn(jobService, 'resume').mockResolvedValue(undefined);
    vi.spyOn(jobService, 'initJobStore').mockImplementation(async () => {
      jobService.jobsStore.set([buildJob({ id: 'p1', status: 'paused', progress: 60 })]);
    });
    setSession({ userId: 'u1', username: 'a', role: 'administrator' });

    const { findByText, queryByText } = render(JobQueue);
    const resumeBtn = await findByText('Resume');
    await fireEvent.click(resumeBtn);
    expect(resumeSpy).toHaveBeenCalledWith('p1');
    // Paused jobs never show a Pause control.
    expect(queryByText('Pause')).toBeNull();
  });

  it('cancel pushes an info toast on success', async () => {
    const cancelSpy = vi
      .spyOn(jobService, 'cancel')
      .mockResolvedValue(undefined);
    vi.spyOn(jobService, 'initJobStore').mockImplementation(async () => {
      jobService.jobsStore.set([buildJob({ id: 'c1', status: 'running' })]);
    });
    setSession({ userId: 'u1', username: 'a', role: 'administrator' });

    const { findByText } = render(JobQueue);
    await fireEvent.click(await findByText('Cancel'));
    await Promise.resolve();
    expect(cancelSpy).toHaveBeenCalledWith('c1', 'u1');
    const list = get(toasts);
    expect(list.some((t) => t.level === 'info' && t.message === 'Job cancelled')).toBe(true);
  });

  it('cancel pushes an error toast when the service throws', async () => {
    vi.spyOn(jobService, 'cancel').mockRejectedValue(new Error('Role not permitted'));
    vi.spyOn(jobService, 'initJobStore').mockImplementation(async () => {
      jobService.jobsStore.set([buildJob({ id: 'c2', status: 'running' })]);
    });
    setSession({ userId: 'u1', username: 'a', role: 'administrator' });

    const { findByText } = render(JobQueue);
    await fireEvent.click(await findByText('Cancel'));
    // Wait for promise rejection to settle.
    await new Promise((r) => setTimeout(r, 5));
    const list = get(toasts);
    expect(list.some((t) => t.level === 'error' && t.message === 'Role not permitted')).toBe(true);
  });

  it('cancel is a no-op when no session (guard branch)', async () => {
    const cancelSpy = vi.spyOn(jobService, 'cancel').mockResolvedValue(undefined);
    vi.spyOn(jobService, 'initJobStore').mockImplementation(async () => {
      jobService.jobsStore.set([buildJob({ id: 'c3', status: 'running' })]);
    });
    // No session set.
    const { findByText } = render(JobQueue);
    await fireEvent.click(await findByText('Cancel'));
    await Promise.resolve();
    expect(cancelSpy).not.toHaveBeenCalled();
  });

  it('pause-error pushes an error toast', async () => {
    vi.spyOn(jobService, 'pause').mockRejectedValue(new Error('boom'));
    vi.spyOn(jobService, 'initJobStore').mockImplementation(async () => {
      jobService.jobsStore.set([buildJob({ id: 'pe', status: 'running' })]);
    });
    setSession({ userId: 'u1', username: 'a', role: 'administrator' });

    const { findByText } = render(JobQueue);
    await fireEvent.click(await findByText('Pause'));
    await new Promise((r) => setTimeout(r, 5));
    expect(get(toasts).some((t) => t.level === 'error' && t.message === 'boom')).toBe(true);
  });

  it('completed job shows runtime in seconds (not the "running since" placeholder)', async () => {
    vi.spyOn(jobService, 'initJobStore').mockImplementation(async () => {
      jobService.jobsStore.set([
        buildJob({
          id: 'done',
          status: 'completed',
          progress: 100,
          runtimeMs: 2500
        })
      ]);
    });
    const { findByText, container } = render(JobQueue);
    await findByText('completed');
    expect(container.textContent).toContain('2.5s');
    expect(container.textContent).not.toMatch(/running since/);
  });

  it('renders errorMessage when the job failed', async () => {
    vi.spyOn(jobService, 'initJobStore').mockImplementation(async () => {
      jobService.jobsStore.set([
        buildJob({
          id: 'f1',
          status: 'failed',
          progress: 30,
          errorMessage: 'worker crashed'
        })
      ]);
    });
    const { findByText } = render(JobQueue);
    await findByText('worker crashed');
  });
});
