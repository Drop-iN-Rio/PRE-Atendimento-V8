import dotenv from 'dotenv';
dotenv.config();

const EVOLUTION_API_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const GLOBAL_API_KEY    = process.env.GLOBAL_API_KEY || '';

interface EvolutionResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  httpStatus?: number;
  urlCalled?: string;
  attemptLog?: string[];
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

export async function getQrCode(
  instanceName: string,
  overrideUrl?: string,
  overrideKey?: string,
): Promise<EvolutionResponse> {
  const baseUrl = (overrideUrl || EVOLUTION_API_URL).replace(/\/$/, '');
  const apiKey  = overrideKey  || GLOBAL_API_KEY;

  if (!baseUrl) return { success: false, error: 'EVOLUTION_API_URL não configurada.' };
  if (!apiKey)  return { success: false, error: 'GLOBAL_API_KEY não configurada.' };

  const enc = encodeURIComponent(instanceName);

  /* ── Candidatos em ordem de prioridade (baseado na documentação oficial Evolution GO) ──
     1. GET  /instance/get-qr-code?instanceName={name}   ← Evolution GO oficial (query param)
     2. GET  /instance/{name}/qrcode                     ← citado nas notas da doc Evolution GO
     3. POST /instance/connect  body:{instanceName}       ← Evolution GO "conectar + retorna QR"
     4. GET  /instance/connect/{name}                    ← Evolution API v2.0
     5. GET  /instance/connectionState/{name}            ← v2.0 status (pode ter QR)
  */
  type Candidate = { method: 'GET' | 'POST'; path: string; body?: string };
  const candidates: Candidate[] = [
    { method: 'GET',  path: `/instance/get-qr-code?instanceName=${enc}` },
    { method: 'GET',  path: `/instance/${enc}/qrcode` },
    { method: 'POST', path: `/instance/connect`,
      body: JSON.stringify({ instanceName }) },
    { method: 'GET',  path: `/instance/connect/${enc}` },
    { method: 'GET',  path: `/instance/connectionState/${enc}` },
  ];

  const headers  = { 'Content-Type': 'application/json', apikey: apiKey };
  const attempts: string[] = [];

  for (const c of candidates) {
    const url = `${baseUrl}${c.path}`;
    attempts.push(`${c.method} ${url}`);
    console.log(`[QRCode] ▶ ${c.method}`, url);

    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 12_000);

    try {
      const r = await fetch(url, {
        method:  c.method,
        headers,
        signal:  controller.signal,
        ...(c.body ? { body: c.body } : {}),
      });
      clearTimeout(timeout);
      const rawBody = await r.text();
      console.log(`[QRCode] ◀ HTTP ${r.status}`, rawBody.slice(0, 500));

      if (r.status === 404) {
        console.log('[QRCode] 404 — próximo candidato…');
        continue;
      }

      let data: unknown;
      try { data = JSON.parse(rawBody); } catch { data = rawBody; }

      return {
        success:    r.ok,
        data,
        httpStatus: r.status,
        urlCalled:  `${c.method} ${url}`,
        attemptLog: attempts,
        ...(r.ok ? {} : {
          error: (data as Record<string,unknown>)?.error as string
                 || (data as Record<string,unknown>)?.message as string
                 || `Erro HTTP ${r.status}`,
        }),
      };

    } catch (err: unknown) {
      clearTimeout(timeout);
      const msg = (err as Error).name === 'AbortError'
        ? `Timeout (12s) em ${url}`
        : (err as Error).message;
      console.error('[QRCode] ✖ Erro:', msg);
      return { success: false, error: msg, urlCalled: `${c.method} ${url}`, attemptLog: attempts };
    }
  }

  /* Todos os candidatos retornaram 404 */
  const msg = `Endpoint de QR Code não encontrado no servidor (todos retornaram 404).\nTentados:\n${attempts.join('\n')}`;
  console.error('[QRCode] ✖', msg);
  return { success: false, error: msg, urlCalled: attempts.join(' | '), attemptLog: attempts };
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
