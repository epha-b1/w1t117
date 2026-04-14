export type WorkerToMain =
  | { jobId: string; kind: 'progress'; progress: number; partial?: unknown }
  | { jobId: string; kind: 'paused' }
  | { jobId: string; kind: 'resumed' }
  | { jobId: string; kind: 'complete'; result: unknown }
  | { jobId: string; kind: 'error'; message: string };

export type MainToWorker =
  | { cmd: 'start'; jobId: string; input: unknown }
  | { cmd: 'pause'; jobId: string }
  | { cmd: 'resume'; jobId: string }
  | { cmd: 'cancel'; jobId: string };
