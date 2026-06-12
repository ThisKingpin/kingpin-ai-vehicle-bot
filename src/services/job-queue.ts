import { randomUUID } from 'node:crypto';

export type JobStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface JobRecord {
  jobId: string;
  type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  createdAt: number;
  result?: unknown;
  error?: string;
  code?: string;
  httpStatus?: number;
}

const jobs = new Map<string, JobRecord>();
const waiters = new Map<string, { resolve: (job: JobRecord) => void; reject: (err: Error) => void }>();

const JOB_TTL_MS = 10 * 60 * 1000;

function purgeStaleJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff && job.status !== 'processing') {
      jobs.delete(id);
      const waiter = waiters.get(id);
      if (waiter) {
        waiter.reject(new Error('Islem zaman asimina ugradi (FiveM sunucusu bagli mi?)'));
        waiters.delete(id);
      }
    }
  }
}

export function enqueueJob(type: string, payload: Record<string, unknown>): string {
  purgeStaleJobs();
  const jobId = randomUUID();
  jobs.set(jobId, {
    jobId,
    type,
    payload,
    status: 'pending',
    createdAt: Date.now(),
  });
  return jobId;
}

export function pullNextJob(): JobRecord | null {
  purgeStaleJobs();
  for (const job of jobs.values()) {
    if (job.status === 'pending') {
      job.status = 'processing';
      return job;
    }
  }
  return null;
}

export function completeJob(
  jobId: string,
  outcome: {
    success: boolean;
    result?: unknown;
    error?: string;
    code?: string;
    status?: number;
  },
): boolean {
  const job = jobs.get(jobId);
  if (!job || job.status !== 'processing') return false;

  job.status = outcome.success ? 'done' : 'failed';
  job.result = outcome.result;
  job.error = outcome.error;
  job.code = outcome.code;
  job.httpStatus = outcome.status;

  const waiter = waiters.get(jobId);
  if (waiter) {
    waiter.resolve(job);
    waiters.delete(jobId);
  }

  return true;
}

export function waitForJob(jobId: string, timeoutMs = 90_000): Promise<JobRecord> {
  const existing = jobs.get(jobId);
  if (existing && (existing.status === 'done' || existing.status === 'failed')) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(jobId);
      const job = jobs.get(jobId);
      if (job && job.status === 'processing') {
        job.status = 'failed';
        job.error = 'FiveM sunucusu yanit vermedi. kingpin-ai-vehicles acik mi? ai_vehicle_bot_url dogru mu?';
      }
      reject(new Error('FiveM sunucusu yanit vermedi (90s). kingpin-ai-vehicles calisiyor mu?'));
    }, timeoutMs);

    waiters.set(jobId, {
      resolve: (job) => {
        clearTimeout(timer);
        resolve(job);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });
  });
}

export function getQueueStats() {
  let pending = 0;
  let processing = 0;
  for (const job of jobs.values()) {
    if (job.status === 'pending') pending++;
    if (job.status === 'processing') processing++;
  }
  return { pending, processing, total: jobs.size };
}
