import type { MainToWorker, WorkerToMain } from './protocol';

interface Input {
  leads: Array<{ id: string; title: string; recipientZip?: string }>;
  depotId: string;
}

interface DeliveryDraft {
  leadId: string;
  title: string;
  depotId: string;
  recipientZip: string;
}

const state: Record<string, { paused: boolean; cancelled: boolean }> = {};
function post(msg: WorkerToMain) { (self as unknown as Worker).postMessage(msg); }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function run(jobId: string, input: Input): Promise<void> {
  const s = state[jobId];
  const result: DeliveryDraft[] = [];
  for (let i = 0; i < input.leads.length; i++) {
    while (s.paused && !s.cancelled) {
      post({ jobId, kind: 'paused' });
      await sleep(50);
    }
    if (s.cancelled) return;
    const lead = input.leads[i];
    result.push({
      leadId: lead.id,
      title: lead.title,
      depotId: input.depotId,
      recipientZip: lead.recipientZip ?? ''
    });
    post({
      jobId,
      kind: 'progress',
      progress: Math.min(99, Math.round(((i + 1) / input.leads.length) * 100))
    });
    await sleep(10);
  }
  post({ jobId, kind: 'progress', progress: 100 });
  post({ jobId, kind: 'complete', result });
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
