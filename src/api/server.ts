import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { completeJob, getQueueStats, pullNextJob } from '../services/job-queue.js';
import { handleStageRoute } from './stage-routes.js';
import { getStageImportQueueSize } from '../stage/import-queue.js';

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

function getBearerToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function authorize(req: IncomingMessage): boolean {
  const secret = process.env.AI_VEHICLE_SECRET?.trim();
  if (!secret) return false;
  return getBearerToken(req) === secret;
}

export function startApiServer(): void {
  const port = Number(process.env.PORT ?? 8080);

  const server = createServer(async (req, res) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    if (method === 'GET' && url === '/health') {
      const stats = getQueueStats();
      return sendJson(res, 200, {
        ok: true,
        service: 'kingpin-ai-vehicle-bot',
        queue: stats,
        stageImportQueue: getStageImportQueueSize(),
      });
    }

    if (method === 'GET' && url === '/api/fivem/pull') {
      if (!authorize(req)) return sendJson(res, 401, { error: 'Yetkisiz' });

      const job = pullNextJob();
      if (!job) return sendJson(res, 200, { job: null });

      return sendJson(res, 200, {
        job: {
          jobId: job.jobId,
          type: job.type,
          payload: job.payload,
        },
      });
    }

    if (method === 'POST' && url === '/api/fivem/complete') {
      if (!authorize(req)) return sendJson(res, 401, { error: 'Yetkisiz' });

      let body: {
        jobId?: string;
        success?: boolean;
        result?: unknown;
        error?: string;
        code?: string;
        status?: number;
      };

      try {
        body = JSON.parse(await readBody(req));
      } catch {
        return sendJson(res, 400, { error: 'Gecersiz JSON' });
      }

      if (!body.jobId) return sendJson(res, 400, { error: 'jobId gerekli' });

      const ok = completeJob(body.jobId, {
        success: body.success === true,
        result: body.result,
        error: body.error,
        code: body.code,
        status: body.status,
      });

      if (!ok) return sendJson(res, 404, { error: 'Job bulunamadi veya zaten tamamlandi' });

      return sendJson(res, 200, { success: true });
    }

    if (url.startsWith('/api/stage/')) {
      if (!authorize(req)) return sendJson(res, 401, { error: 'Yetkisiz' });
      const handled = await handleStageRoute(req, res, url, method);
      if (handled) return;
    }

    sendJson(res, 404, { error: 'Route bulunamadi' });
  });

  server.listen(port, '0.0.0.0', () => {
    const domain = process.env.RAILWAY_PUBLIC_DOMAIN;
    const publicUrl = domain ? `https://${domain}` : `http://0.0.0.0:${port}`;
    console.log(`[kingpin-ai-vehicle-bot] API dinleniyor: ${publicUrl}`);
    console.log('[kingpin-ai-vehicle-bot] FiveM server.cfg: set ai_vehicle_bot_url "' + publicUrl + '"');
  });
}
