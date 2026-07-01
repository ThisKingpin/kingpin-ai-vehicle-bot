import type { IncomingMessage, ServerResponse } from 'node:http';
import { ackStageImport, pullNextStageImport } from '../stage/import-queue.js';
import { getAnalyzeJob, startAnalyzeJob } from '../stage/analyze-jobs.js';
import { analyzeStoryForStage } from '../stage/analyze-story.js';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export async function handleStageRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  method: string,
): Promise<boolean> {
  if (method === 'GET' && url === '/api/stage/import/pull') {
    const form = pullNextStageImport();
    sendJson(res, 200, { form });
    return true;
  }

  if (method === 'POST' && url === '/api/stage/import/ack') {
    let body: { threadId?: string; success?: boolean };
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { error: 'Gecersiz JSON' });
      return true;
    }

    if (!body.threadId) {
      sendJson(res, 400, { error: 'threadId gerekli' });
      return true;
    }

    const ok = ackStageImport(body.threadId, body.success === true);
    sendJson(res, ok ? 200 : 404, { success: ok });
    return true;
  }

  // Async analiz baslat (hemen doner — FiveM timeout olmaz)
  if (method === 'POST' && url === '/api/stage/analyze/start') {
    let body: { story?: string; characterName?: string; threadId?: string };
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { error: 'Gecersiz JSON' });
      return true;
    }

    if (!body.threadId) {
      sendJson(res, 400, { success: false, error: 'threadId gerekli' });
      return true;
    }

    const story = body.story?.trim() ?? '';
    if (!story) {
      const err = 'Hikaye metni bos — forum mesaji veya PDF okunamamis olabilir.';
      console.error(`[stage/analyze] Start reddedildi (${body.threadId}): ${err}`);
      sendJson(res, 400, { success: false, error: err });
      return true;
    }

    const started = startAnalyzeJob(body.threadId, story, body.characterName);
    sendJson(res, 202, { success: true, accepted: started, threadId: body.threadId });
    return true;
  }

  // Async analiz sonucu poll
  if (method === 'GET' && url.startsWith('/api/stage/analyze/result?')) {
    const threadId = new URL(url, 'http://localhost').searchParams.get('threadId');
    if (!threadId) {
      sendJson(res, 400, { error: 'threadId gerekli' });
      return true;
    }

    const job = getAnalyzeJob(threadId);
    if (!job) {
      sendJson(res, 404, { success: false, status: 'missing' });
      return true;
    }

    if (job.status === 'pending') {
      sendJson(res, 200, { success: true, status: 'pending' });
      return true;
    }

    if (job.status === 'failed') {
      sendJson(res, 200, { success: false, status: 'failed', error: job.error ?? 'Analiz basarisiz' });
      return true;
    }

    sendJson(res, 200, {
      success: true,
      status: 'done',
      vehicle: job.vehicle,
      vehicleLabel: job.vehicleLabel,
      analysisReason: job.analysisReason,
    });
    return true;
  }

  // Legacy sync endpoint (geriye uyumluluk)
  if (method === 'POST' && url === '/api/stage/analyze') {
    let body: { story?: string; characterName?: string; threadId?: string };
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { error: 'Gecersiz JSON' });
      return true;
    }

    if (!body.story?.trim()) {
      sendJson(res, 400, { error: 'story gerekli' });
      return true;
    }

    try {
      const seed = `stage:${body.threadId ?? 'unknown'}:${body.characterName ?? 'unknown'}`;
      const result = await analyzeStoryForStage(body.story, seed);
      sendJson(res, 200, { success: true, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { success: false, error: msg });
    }
    return true;
  }

  return false;
}
