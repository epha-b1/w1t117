import { get, getAll, put } from './db';
import { uid } from '../utils/uid';
import type { Job, JobStatus, JobType } from '../types/job.types';
import { writable } from 'svelte/store';
import type { MainToWorker, WorkerToMain } from '../workers/protocol';
import * as notif from './notification.service';
import * as audit from './audit.service';

const LONG_RUN_MS = 30_000;
const ERROR_RATE_WINDOW = 50;
const ERROR_RATE_THRESHOLD = 0.02;

export const jobsStore = writable<Job[]>([]);

interface RunningJob {
  worker: Worker;
  startedAt: number;
  longRunTimer: number | null;
  onComplete?: (result: unknown) => void;
  onError?: (err: Error) => void;
}

const running = new Map<string, RunningJob>();

function makeWorker(type: JobType): Worker {
  if (type === 'bom_compare') {
    return new Worker(new URL('../workers/bom-compare.worker.ts', import.meta.url), { type: 'module' });
  }
  if (type === 'bulk_delivery') {
    return new Worker(new URL('../workers/bulk-delivery.worker.ts', import.meta.url), { type: 'module' });
  }
  return new Worker(new URL('../workers/ledger-reconcile.worker.ts', import.meta.url), { type: 'module' });
}

async function refreshStore() {
  const all = await getAll('jobs');
  jobsStore.set(all.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0)));
}

async function updateJob(id: string, patch: Partial<Job>): Promise<Job | undefined> {
  const job = await get('jobs', id);
  if (!job) return;
  const updated: Job = { ...job, ...patch };
  await put('jobs', updated);
  await refreshStore();
  return updated;
}

export async function enqueue(type: JobType, input: unknown, actorId = 'system'): Promise<Job> {
  const id = uid();
  const inputRef = uid();
  await put('job_inputs', { id: inputRef, data: input });
  const job: Job = {
    id,
    type,
    status: 'queued',
    progress: 0,
    inputRef,
    resultRef: null,
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    runtimeMs: null
  };
  await put('jobs', job);
  await refreshStore();
  await audit.log({
    actor: actorId,
    action: 'job_enqueued',
    resourceType: 'job',
    resourceId: id,
    detail: { type }
  });
  startJob(job);
  return job;
}

function startJob(job: Job) {
  const worker = makeWorker(job.type);
  const startedAt = Date.now();
  void updateJob(job.id, { status: 'running', startedAt });

  const longRunTimer = window.setTimeout(() => {
    void notif
      .dispatch('job_long_running', 'system', { jobId: job.id })
      .catch(() => {});
  }, LONG_RUN_MS);

  running.set(job.id, { worker, startedAt, longRunTimer: longRunTimer as unknown as number });

  worker.onmessage = async (e: MessageEvent<WorkerToMain>) => {
    const msg = e.data;
    if (msg.kind === 'progress') {
      await updateJob(job.id, { progress: msg.progress });
    } else if (msg.kind === 'paused') {
      await updateJob(job.id, { status: 'paused' });
    } else if (msg.kind === 'resumed') {
      await updateJob(job.id, { status: 'running' });
    } else if (msg.kind === 'complete') {
      const resultRef = uid();
      await put('job_results', { id: resultRef, data: msg.result });
      await updateJob(job.id, {
        status: 'completed',
        progress: 100,
        resultRef,
        completedAt: Date.now(),
        runtimeMs: Date.now() - startedAt
      });
      cleanup(job.id);
      await checkErrorRate();
    } else if (msg.kind === 'error') {
      await updateJob(job.id, {
        status: 'failed',
        errorMessage: msg.message,
        completedAt: Date.now(),
        runtimeMs: Date.now() - startedAt
      });
      cleanup(job.id);
      await checkErrorRate();
    }
  };

  const inputPromise = get('job_inputs', job.inputRef);
  void inputPromise.then((rec) => {
    const payload: MainToWorker = { cmd: 'start', jobId: job.id, input: rec?.data };
    worker.postMessage(payload);
  });
}

function cleanup(jobId: string) {
  const r = running.get(jobId);
  if (!r) return;
  if (r.longRunTimer) window.clearTimeout(r.longRunTimer);
  r.worker.terminate();
  running.delete(jobId);
}

async function checkErrorRate(): Promise<number> {
  const rate = await getErrorRate();
  if (rate > ERROR_RATE_THRESHOLD) {
    await notif
      .dispatch('job_error_rate', 'system', { rate: (rate * 100).toFixed(1) })
      .catch(() => {});
  }
  return rate;
}

export async function getErrorRate(): Promise<number> {
  const all = await getAll('jobs');
  const finished = all
    .filter((j) => j.status === 'completed' || j.status === 'failed')
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    .slice(0, ERROR_RATE_WINDOW);
  if (finished.length === 0) return 0;
  const failed = finished.filter((j) => j.status === 'failed').length;
  return failed / finished.length;
}

export async function pause(jobId: string): Promise<void> {
  const r = running.get(jobId);
  if (!r) return;
  r.worker.postMessage({ cmd: 'pause', jobId } as MainToWorker);
}

export async function resume(jobId: string): Promise<void> {
  const r = running.get(jobId);
  if (!r) return;
  r.worker.postMessage({ cmd: 'resume', jobId } as MainToWorker);
}

export async function cancel(jobId: string): Promise<void> {
  const r = running.get(jobId);
  if (r) {
    r.worker.postMessage({ cmd: 'cancel', jobId } as MainToWorker);
    cleanup(jobId);
  }
  await updateJob(jobId, { status: 'failed', errorMessage: 'Cancelled', completedAt: Date.now() });
}

export async function listJobs(): Promise<Job[]> {
  const all = await getAll('jobs');
  return all.sort((a, b) => (b.startedAt ?? b.completedAt ?? 0) - (a.startedAt ?? a.completedAt ?? 0));
}

export async function getJob(id: string): Promise<Job | undefined> {
  return await get('jobs', id);
}

export async function initJobStore(): Promise<void> {
  await refreshStore();
}

export const jobService = {
  enqueue,
  pause,
  resume,
  cancel,
  listJobs,
  getJob,
  getErrorRate,
  initJobStore,
  jobsStore
};
