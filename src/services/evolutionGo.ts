import dotenv from 'dotenv';
dotenv.config();

const EVOLUTION_API_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const GLOBAL_API_KEY    = process.env.GLOBAL_API_KEY || '';

export interface EvolutionResponse {
  success:    boolean;
  data?:      unknown;
  error?:     string;
  httpStatus?: number;
  urlCalled?: string;
}

/* ── Helper genérico ── */
async function callApi(
  method:       'GET' | 'POST' | 'DELETE',
  path:         string,
  body?:        object,
  overrideUrl?: string,
  overrideKey?: string,
): Promise<EvolutionResponse> {
  const baseUrl = (overrideUrl || EVOLUTION_API_URL).replace(/\/$/, '');
  const apiKey  = overrideKey  || GLOBAL_API_KEY;

  if (!baseUrl) return { success: false, error: 'EVOLUTION_API_URL não configurada.' };
  if (!apiKey)  return { success: false, error: 'Chave da API (apikey) não configurada.' };

  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': apiKey,
  };

  console.log(`[Evolution GO] ▶ ${method} ${url}`);
  if (body) console.log('[Evolution GO] Body:', JSON.stringify(body));

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 15_000);

  try {
    const r = await fetch(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const rawBody = await r.text();
    console.log(`[Evolution GO] ◀ HTTP ${r.status}`, rawBody.slice(0, 600));

    let data: unknown;
    try { data = JSON.parse(rawBody); } catch { data = rawBody; }

    const d = data as Record<string, unknown> | null;
    const errorMsg = !r.ok
      ? ((d?.message as string) || (d?.error as string) || `Erro HTTP ${r.status}`)
      : undefined;

    return {
      success:    r.ok,
      data,
      httpStatus: r.status,
      urlCalled:  `${method} ${url}`,
      ...(errorMsg ? { error: errorMsg } : {}),
    };
  } catch (err: unknown) {
    clearTimeout(timeout);
    const msg = (err as Error).name === 'AbortError'
      ? 'Timeout: sem resposta em 15s'
      : (err as Error).message;
    console.error('[Evolution GO] ✖', msg);
    return { success: false, error: msg, urlCalled: `${method} ${url}` };
  }
}

/* ── 1. Criar instância ──────────────────────────────────────────────
   POST /instance/create
   Header: apikey: GLOBAL_API_KEY
   Body:   { instanceName, qrcode: true, token (opcional) }
*/
export async function createInstance(
  instanceName: string,
  token?:       string,
  overrideUrl?: string,
  overrideKey?: string,
): Promise<EvolutionResponse> {
  return callApi(
    'POST',
    '/instance/create',
    { instanceName, qrcode: true, token: token || '' },
    overrideUrl,
    overrideKey,
  );
}

/* ── 2. Conectar instância ───────────────────────────────────────────
   POST /instance/connect
   Header: apikey: <token da instância retornado pelo /create>
            *** NÃO usar GLOBAL_API_KEY aqui ***
   Body:   { instanceName }
*/
export async function connectInstance(
  instanceName:  string,
  instanceToken: string,   // token retornado pelo createInstance, NÃO o GLOBAL_API_KEY
  overrideUrl?:  string,
): Promise<EvolutionResponse> {
  if (!instanceToken) {
    return { success: false, error: 'Token da instância não fornecido para conexão.' };
  }
  return callApi(
    'POST',
    '/instance/connect',
    { instanceName },
    overrideUrl,
    instanceToken,    // passa o token da instância como apikey
  );
}

/* ── 3. Obter QR Code ────────────────────────────────────────────────
   GET /instance/get-qr-code?instanceName={name}
   Header: apikey: GLOBAL_API_KEY
   Sem fallbacks — endpoint único e oficial.
*/
export async function getQrCode(
  instanceName: string,
  overrideUrl?: string,
  overrideKey?: string,
): Promise<EvolutionResponse> {
  const enc = encodeURIComponent(instanceName);
  return callApi(
    'GET',
    `/instance/get-qr-code?instanceName=${enc}`,
    undefined,
    overrideUrl,
    overrideKey,
  );
}

/* ── 4. Desconectar instância ────────────────────────────────────────
   POST /instance/disconnect
   Header: apikey: GLOBAL_API_KEY
   Body:   { instanceName }
*/
export async function disconnectInstance(
  instanceName: string,
  overrideUrl?: string,
  overrideKey?: string,
): Promise<EvolutionResponse> {
  return callApi(
    'POST',
    '/instance/disconnect',
    { instanceName },
    overrideUrl,
    overrideKey,
  );
}

/* ── 5. Deletar instância ────────────────────────────────────────────
   DELETE /instance/delete
   Header: apikey: GLOBAL_API_KEY
   Body:   { instanceName }
*/
export async function deleteInstance(
  instanceName: string,
  overrideUrl?: string,
  overrideKey?: string,
): Promise<EvolutionResponse> {
  return callApi(
    'DELETE',
    '/instance/delete',
    { instanceName },
    overrideUrl,
    overrideKey,
  );
}
