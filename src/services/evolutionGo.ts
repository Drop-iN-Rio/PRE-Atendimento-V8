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
   Body:   { name, qrcode: true, token? }
   NOTA: Evolution GO usa "name", não "instanceName"
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
    { name: instanceName, qrcode: true, token: token || '' },
    overrideUrl,
    overrideKey,
  );
}

/* ── 2. Conectar instância ───────────────────────────────────────────
   POST /instance/connect
   Header: apikey: <token da instância>  *** NÃO usar GLOBAL_API_KEY ***
   Body:   { instanceName }
   Resposta: { data: { eventString, jid, webhookUrl } }
   (Inicia o cliente WhatsApp — gera QR code assincronamente)
*/
export async function connectInstance(
  instanceName:  string,
  instanceToken: string,
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
    instanceToken,
  );
}

/* ── 3. Obter QR Code ────────────────────────────────────────────────
   GET /instance/qr?instanceName={name}
   Header: apikey: <token da instância>  *** NÃO usar GLOBAL_API_KEY ***
   Retorna HTTP 400 com "no QR code available. Please wait a moment and try again"
   enquanto o cliente está iniciando — fazer polling até obter sucesso.
   NOTA: O endpoint correto é /instance/qr (não /instance/get-qr-code que retorna 404)
*/
export async function getQrCode(
  instanceName:  string,
  instanceToken: string,
  overrideUrl?:  string,
): Promise<EvolutionResponse> {
  if (!instanceToken) {
    return { success: false, error: 'Token da instância não fornecido para buscar QR Code.' };
  }
  const enc = encodeURIComponent(instanceName);
  return callApi(
    'GET',
    `/instance/qr?instanceName=${enc}`,
    undefined,
    overrideUrl,
    instanceToken,
  );
}

/* ── 4. Status da instância ──────────────────────────────────────────
   GET /instance/status?instanceName={name}
   Header: apikey: <token da instância>
   Retorna: { error: "client disconnected" } ou { error: "no active session found" }
*/
export async function getInstanceStatus(
  instanceName:  string,
  instanceToken: string,
  overrideUrl?:  string,
): Promise<EvolutionResponse> {
  const enc = encodeURIComponent(instanceName);
  return callApi(
    'GET',
    `/instance/status?instanceName=${enc}`,
    undefined,
    overrideUrl,
    instanceToken,
  );
}

/* ── 5. Desconectar instância ────────────────────────────────────────
   POST /instance/disconnect
   Header: apikey: <token da instância>  *** NÃO usar GLOBAL_API_KEY (retorna 401) ***
   Body:   { instanceName }
*/
export async function disconnectInstance(
  instanceName:  string,
  instanceToken: string,
  overrideUrl?:  string,
): Promise<EvolutionResponse> {
  if (!instanceToken) {
    return { success: false, error: 'Token da instância não fornecido para desconectar.' };
  }
  return callApi(
    'POST',
    '/instance/disconnect',
    { instanceName },
    overrideUrl,
    instanceToken,
  );
}

/* ── 6. Deletar instância ────────────────────────────────────────────
   DELETE /instance/delete/{uuid}
   Header: apikey: GLOBAL_API_KEY
   NOTA: O path usa UUID (não instanceName no body).
         O UUID vem da resposta do /instance/create (data.id) ou /instance/all.
*/
export async function deleteInstance(
  instanceUuid: string,   /* UUID da instância (não o nome) */
  overrideUrl?: string,
  overrideKey?: string,
): Promise<EvolutionResponse> {
  return callApi(
    'DELETE',
    `/instance/delete/${encodeURIComponent(instanceUuid)}`,
    undefined,
    overrideUrl,
    overrideKey,
  );
}
