import type { MainToWorker, WorkerToMain } from './protocol';
import type { LedgerEntry } from '../types/ledger.types';

interface Input {
  entries: LedgerEntry[];
}

interface ReconciliationReport {
  accountTotals: Record<string, { deposits: number; settlements: number; refunds: number; withdrawals: number }>;
  count: number;
}

const state: Record<string, { paused: boolean; cancelled: boolean }> = {};
function post(msg: WorkerToMain) { (self as unknown as Worker).postMessage(msg); }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function run(jobId: string, input: Input): Promise<void> {
  const s = state[jobId];
  const totals: ReconciliationReport['accountTotals'] = {};
  for (let i = 0; i < input.entries.length; i++) {
    while (s.paused && !s.cancelled) {
      post({ jobId, kind: 'paused' });
      await sleep(50);
    }
    if (s.cancelled) return;
    const e = input.entries[i];
    const t = (totals[e.accountId] ??= { deposits: 0, settlements: 0, refunds: 0, withdrawals: 0 });
    if (e.type === 'settlement') t.settlements += e.amount;
    else if (e.type === 'refund') t.refunds += e.amount;
    else if (e.type === 'withdrawal') t.withdrawals += e.amount;
    if (i % 10 === 0 || i === input.entries.length - 1) {
      post({
        jobId,
        kind: 'progress',
        progress: Math.min(99, Math.round(((i + 1) / Math.max(1, input.entries.length)) * 100))
      });
      await sleep(5);
    }
  }
  const report: ReconciliationReport = { accountTotals: totals, count: input.entries.length };
  post({ jobId, kind: 'progress', progress: 100 });
  post({ jobId, kind: 'complete', result: report });
  delete state[jobId];
}

self.addEventListener('message', (e: MessageEvent<MainToWorker>) => {
  const msg = e.data;
  if (msg.cmd === 'start') {
    state[msg.jobId] = { paused: false, cancelled: false };
    run(msg.jobId, msg.input as Input).catch((err) =>
      post({ jobId: msg.jobId, kind: 'error', message: (err as Error).message })
    );
  } else if (msg.cmd === 'pause') {
    const s = state[msg.jobId]; if (s) s.paused = true;
  } else if (msg.cmd === 'resume') {
    const s = state[msg.jobId]; if (s) { s.paused = false; post({ jobId: msg.jobId, kind: 'resumed' }); }
  } else if (msg.cmd === 'cancel') {
    const s = state[msg.jobId]; if (s) s.cancelled = true;
  }
});
