import { enqueueJob, waitForJob } from './job-queue.js';

export class FivemApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public payload: unknown,
  ) {
    super(message);
    this.name = 'FivemApiError';
  }
}

export class FivemConnectionError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'FivemConnectionError';
  }
}

async function runJob<T>(type: string, payload: Record<string, unknown>): Promise<T> {
  const jobId = enqueueJob(type, payload);

  let job;
  try {
    job = await waitForJob(jobId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new FivemConnectionError(msg, err);
  }

  const result = job.result as (T & { success?: boolean; error?: string; code?: string }) | undefined;

  if (!result || result.success === false) {
    throw new FivemApiError(
      job.error ?? result?.error ?? 'FiveM islemi basarisiz',
      job.httpStatus ?? 500,
      { code: job.code ?? result?.code, error: job.error ?? result?.error },
    );
  }

  return result;
}

export async function verifyCharacter(discordId: string, characterName: string) {
  return runJob<import('../types.js').VerifyCharacterResponse>('verify_character', {
    discordId,
    characterName,
  });
}

export async function saveRequest(payload: Record<string, unknown>) {
  return runJob<{ success: boolean; requestId: string; grantToken: string; cached?: boolean }>(
    'save_request',
    payload,
  );
}

export async function getCache(citizenid: string, storyHash: string, vehiclesVersion: number) {
  return runJob<{
    success: boolean;
    requestId: string;
    grantToken: string;
    aiProfileJson?: import('../types.js').AiAnalysis;
    recommendedVehiclesJson?: import('../types.js').ScoredVehicle[];
    status?: string;
  }>('get_cache', { citizenid, storyHash, vehiclesVersion });
}

export async function grantVehicle(payload: {
  requestId: string;
  grantToken: string;
  model: string;
  citizenid: string;
  adminId: string;
}) {
  return runJob<{ success: boolean; vehicleId: number; model: string; label: string; garage: string }>(
    'grant',
    payload,
  );
}

export async function saveAndGrant(payload: Record<string, unknown>) {
  return runJob<{ success: boolean; vehicleId: number; model: string; label: string; garage: string; requestId: string; grantToken: string }>(
    'save_and_grant',
    payload,
  );
}

export async function adminRegrant(payload: Record<string, unknown>) {
  return runJob<{
    success: boolean;
    vehicleId: number;
    model: string;
    label: string;
    garage: string;
    requestId?: string;
    replaced?: boolean;
  }>('admin_regrant', payload);
}

export async function rejectRequest(requestId: string, adminId: string, reason?: string) {
  return runJob<{ success: boolean }>('reject', { requestId, adminId, reason });
}

export async function getLogs(citizenid: string) {
  return runJob<{ success: boolean; requests: Record<string, unknown>[] }>('get_logs', { citizenid });
}

export async function pingBridgeOnStartup(): Promise<void> {
  const secret = process.env.AI_VEHICLE_SECRET?.trim();
  if (!secret) {
    console.warn('[kingpin-ai-vehicle-bot] AI_VEHICLE_SECRET eksik');
    return;
  }

  const domain = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (domain) {
    console.log(`[kingpin-ai-vehicle-bot] Pull modu aktif — FiveM bu URL'ye baglanacak: https://${domain}`);
  } else {
    console.log('[kingpin-ai-vehicle-bot] Pull modu aktif — FiveM server.cfg ai_vehicle_bot_url ayarlayin');
  }

  console.log('[kingpin-ai-vehicle-bot] FIVEM_BASE_URL artik gerekli degil (port acmaya gerek yok)');
}
