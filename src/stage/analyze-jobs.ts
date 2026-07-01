import { analyzeStoryForStage } from './analyze-story.js';

export type AnalyzeJobStatus = 'pending' | 'done' | 'failed';

export interface AnalyzeJob {
  threadId: string;
  status: AnalyzeJobStatus;
  vehicle?: string;
  vehicleLabel?: string;
  analysisReason?: string;
  error?: string;
  startedAt: number;
}

const jobs = new Map<string, AnalyzeJob>();
const JOB_TTL_MS = 30 * 60 * 1000;

function purgeStaleJobs(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.startedAt < cutoff) jobs.delete(id);
  }
}

export function startAnalyzeJob(threadId: string, story: string, characterName?: string): boolean {
  purgeStaleJobs();

  const existing = jobs.get(threadId);
  if (existing?.status === 'pending') return false;

  const job: AnalyzeJob = {
    threadId,
    status: 'pending',
    startedAt: Date.now(),
  };
  jobs.set(threadId, job);

  const seed = `stage:${threadId}:${characterName ?? 'unknown'}`;

  void (async () => {
    try {
      const result = await analyzeStoryForStage(story, seed);
      jobs.set(threadId, {
        ...job,
        status: 'done',
        vehicle: result.vehicle,
        vehicleLabel: result.vehicleLabel,
        analysisReason: result.analysisReason,
      });
      console.log(`[stage/analyze] Tamamlandi: ${threadId} → ${result.vehicle}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[stage/analyze] Basarisiz (${threadId}): ${msg}`);
      jobs.set(threadId, { ...job, status: 'failed', error: msg });
    }
  })();

  return true;
}

export function getAnalyzeJob(threadId: string): AnalyzeJob | null {
  purgeStaleJobs();
  return jobs.get(threadId) ?? null;
}
