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

export async function createInstance(
  instanceName: string,
  token?: string,
): Promise<EvolutionResponse> {
  if (!EVOLUTION_API_URL) {
    return { success: false, error: 'EVOLUTION_API_URL não configurada no servidor.' };
  }
  if (!GLOBAL_API_KEY) {
    return { success: false, error: 'GLOBAL_API_KEY não configurada no servidor.' };
  }

  const url = `${EVOLUTION_API_URL}/instance/create`;

  const payload = { name: instanceName, token: token || '' };

  console.log('[Evolution GO] ▶ POST', url);
  console.log('[Evolution GO] Headers:', { 'Content-Type': 'application/json', apikey: maskKey(GLOBAL_API_KEY) });
  console.log('[Evolution GO] Body:', JSON.stringify(payload));

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': GLOBAL_API_KEY,
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
