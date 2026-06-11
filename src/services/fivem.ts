function getConfig() {
  const secret = process.env.AI_VEHICLE_SECRET?.trim();
  const baseUrl = process.env.FIVEM_BASE_URL?.trim().replace(/\/$/, '');
  if (!secret) throw new Error('AI_VEHICLE_SECRET env eksik');
  if (!baseUrl) throw new Error('FIVEM_BASE_URL env eksik');
  return { secret, baseUrl };
}

function authHeaders(): { timestamp: string; authorization: string } {
  const { secret } = getConfig();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return {
    timestamp,
    authorization: `Bearer ${secret}`,
  };
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

export class FivemConnectionError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'FivemConnectionError';
  }
}

function connectionHelp(baseUrl: string, path: string): string {
  const host = baseUrl.replace(/^https?:\/\//, '');
  return [
    `FiveM sunucusuna baglanilamadi (${path}).`,
    '',
    `FIVEM_BASE_URL: ${baseUrl}`,
    '',
    'Kontrol listesi:',
    '1. FiveM sunucusu acik mi? (kingpin-ai-vehicles calisiyor mu)',
    '2. Railway\'de FIVEM_BASE_URL = http://DIS_IP:30120 (127.0.0.1 veya localhost OLMAZ)',
    '3. Modem/router\'da 30120 TCP port yonlendirme acik mi',
    '4. Windows Firewall\'da 30120 inbound izinli mi',
    '5. Tarayicidan test: ' + baseUrl + '/api/ai-vehicles/health',
    '',
    `Hedef: ${host}`,
  ].join('\n');
}

async function fetchFivem(path: string, init?: RequestInit): Promise<Response> {
  const { baseUrl } = getConfig();
  const url = `${baseUrl}${path}`;

  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) {
      throw new FivemConnectionError(connectionHelp(baseUrl, path), err);
    }
    throw new FivemConnectionError(`FiveM istegi basarisiz (${path}): ${msg}`, err);
  }
}

async function post<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const body = JSON.stringify(payload);
  const { timestamp, authorization } = authHeaders();

  const res = await fetchFivem(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Timestamp': timestamp,
      Authorization: authorization,
    },
    body,
  });

  let data: T & { error?: string };
  try {
    data = (await res.json()) as T & { error?: string };
  } catch {
    throw new FivemConnectionError(
      `FiveM gecersiz yanit dondu (${path}, HTTP ${res.status}). kingpin-ai-vehicles HTTP handler aktif mi?`,
    );
  }

  if (!res.ok) {
    throw new FivemApiError(data.error ?? `HTTP ${res.status}`, res.status, data);
  }
  return data;
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

export async function healthCheck(): Promise<{ success?: boolean; resource?: string; vehicles?: number }> {
  const res = await fetchFivem('/api/ai-vehicles/health');
  return res.json();
}

export async function pingFivemOnStartup(): Promise<void> {
  const { baseUrl } = getConfig();
  try {
    const data = await healthCheck();
    if (data.success) {
      console.log(
        `[kingpin-ai-vehicle-bot] FiveM OK: ${data.resource} (${data.vehicles ?? '?'} arac) @ ${baseUrl}`,
      );
      return;
    }
    console.warn('[kingpin-ai-vehicle-bot] FiveM health beklenmeyen yanit:', data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[kingpin-ai-vehicle-bot] FiveM BAGLANTI HATASI — /aracal calismaz:');
    console.error(msg);
  }
}
