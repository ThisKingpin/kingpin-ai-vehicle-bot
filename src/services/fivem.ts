import { createHmac } from 'node:crypto';

function getConfig() {
  const secret = process.env.AI_VEHICLE_SECRET;
  const baseUrl = process.env.FIVEM_BASE_URL;
  if (!secret) throw new Error('AI_VEHICLE_SECRET env eksik');
  if (!baseUrl) throw new Error('FIVEM_BASE_URL env eksik');
  return { secret, baseUrl: baseUrl.replace(/\/$/, '') };
}

function signRequest(body: string): { timestamp: string; signature: string } {
  const { secret } = getConfig();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return { timestamp, signature };
}

async function post<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const { baseUrl } = getConfig();
  const body = JSON.stringify(payload);
  const { timestamp, signature } = signRequest(body);

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Timestamp': timestamp,
      'X-Signature': signature,
    },
    body,
  });

  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new FivemApiError(data.error ?? `HTTP ${res.status}`, res.status, data);
  }
  return data;
}

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

export async function verifyCharacter(discordId: string, characterName: string) {
  return post<import('../types.js').VerifyCharacterResponse>(
    '/api/ai-vehicles/verify-character',
    { discordId, characterName },
  );
}

export async function saveRequest(payload: Record<string, unknown>) {
  return post<{ success: boolean; requestId: string; grantToken: string; cached?: boolean }>(
    '/api/ai-vehicles/save-request',
    payload,
  );
}

export async function getCache(citizenid: string, storyHash: string, vehiclesVersion: number) {
  return post<{
    success: boolean;
    requestId: string;
    grantToken: string;
    aiProfileJson?: import('../types.js').AiAnalysis;
    recommendedVehiclesJson?: import('../types.js').ScoredVehicle[];
    status?: string;
  }>('/api/ai-vehicles/get-cache', { citizenid, storyHash, vehiclesVersion });
}

export async function grantVehicle(payload: {
  requestId: string;
  grantToken: string;
  model: string;
  citizenid: string;
  adminId: string;
}) {
  return post<{ success: boolean; vehicleId: number; model: string; label: string; garage: string }>(
    '/api/ai-vehicles/grant',
    payload,
  );
}

export async function rejectRequest(requestId: string, adminId: string, reason?: string) {
  return post<{ success: boolean }>('/api/ai-vehicles/reject', { requestId, adminId, reason });
}

export async function getLogs(citizenid: string) {
  return post<{ success: boolean; requests: Record<string, unknown>[] }>(
    '/api/ai-vehicles/get-logs',
    { citizenid },
  );
}

export async function healthCheck() {
  const { baseUrl } = getConfig();
  const res = await fetch(`${baseUrl}/api/ai-vehicles/health`);
  return res.json();
}
