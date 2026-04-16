import dotenv from 'dotenv';
dotenv.config();

const EVOLUTION_API_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const GLOBAL_API_KEY    = process.env.GLOBAL_API_KEY || '';

interface EvolutionResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  httpStatus?: number;
}

function maskKey(key: string): string {
  if (!key || key.length <= 6) return '***';
  return key.slice(0, 4) + '***' + key.slice(-2);
}

async function callDelete(path: string, overrideUrl?: string, overrideKey?: string): Promise<EvolutionResponse> {
  const baseUrl = (overrideUrl || EVOLUTION_API_URL).replace(/\/$/, '');
  const apiKey  = overrideKey  || GLOBAL_API_KEY;

  if (!baseUrl) return { success: false, error: 'EVOLUTION_API_URL não configurada.' };
  if (!apiKey)  return { success: false, error: 'GLOBAL_API_KEY não configurada.' };

  const url = `${baseUrl}${path}`;
  console.log('[Evolution GO] ▶ DELETE', url);

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 10_000);

  try {
    const r = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const rawBody = await r.text();
    console.log(`[Evolution GO] ◀ HTTP ${r.status}`, rawBody.slice(0, 200));
    let data: unknown;
    try { data = JSON.parse(rawBody); } catch { data = rawBody; }
    return { success: r.ok, data, httpStatus: r.status };
  } catch (err: unknown) {
    clearTimeout(timeout);
    const msg = (err as Error).name === 'AbortError' ? 'Timeout: sem resposta em 10s' : (err as Error).message;
    console.error('[Evolution GO] ✖', msg);
    return { success: false, error: msg };
  }
}

export async function disconnectInstance(
  instanceName: string,
  overrideUrl?: string,
  overrideKey?: string,
): Promise<EvolutionResponse> {
  return callDelete(`/instance/logout/${encodeURIComponent(instanceName)}`, overrideUrl, overrideKey);
}

export async function deleteInstance(
  instanceName: string,
  overrideUrl?: string,
  overrideKey?: string,
): Promise<EvolutionResponse> {
  return callDelete(`/instance/delete/${encodeURIComponent(instanceName)}`, overrideUrl, overrideKey);
}

export async function createInstance(
  instanceName: string,
  token?: string,
  overrideUrl?: string,
  overrideKey?: string,
): Promise<EvolutionResponse> {
  const baseUrl = (overrideUrl || EVOLUTION_API_URL).replace(/\/$/, '');
  const apiKey  = overrideKey  || GLOBAL_API_KEY;

  if (!baseUrl) {
    return { success: false, error: 'EVOLUTION_API_URL não configurada no servidor.' };
  }
  if (!apiKey) {
    return { success: false, error: 'GLOBAL_API_KEY não configurada no servidor.' };
  }

  const url = `${baseUrl}/instance/create`;

  const payload = { name: instanceName, token: token || '' };

  console.log('[Evolution GO] ▶ POST', url);
  console.log('[Evolution GO] Headers:', { 'Content-Type': 'application/json', apikey: maskKey(apiKey) });
  console.log('[Evolution GO] Body:', JSON.stringify(payload));

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const rawBody = await response.text();
    console.log(`[Evolution GO] ◀ HTTP ${response.status}`);
    console.log('[Evolution GO] Response body:', rawBody);

    let data: unknown;
    try { data = JSON.parse(rawBody); } catch { data = rawBody; }

    const d = data as Record<string, unknown>;

    if (d?.message === 'success') {
      return { success: true, data, httpStatus: response.status };
    }

    const errorMsg =
      (d?.message as string) ||
      (d?.error as string) ||
      `Erro HTTP ${response.status}`;

    return { success: false, data, error: errorMsg, httpStatus: response.status };

  } catch (err: unknown) {
    clearTimeout(timeout);
    const isTimeout = (err as Error).name === 'AbortError';
    const message   = isTimeout ? 'Timeout: sem resposta em 10s' : (err as Error).message;
    console.error('[Evolution GO] ✖ Erro:', message);
    return { success: false, error: message };
  }
}
