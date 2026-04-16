import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from './db/migrate.js';
import {
  createInstanceAndPersist,
  listInstances,
  disconnectInstanceService,
  deleteInstanceService,
} from './services/instanceService.js';
import { getQrCode, connectInstance } from './services/evolutionGo.js';
import { supabaseAdmin } from './services/supabase.js';
import { loginUser, registerUser } from './services/authService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT;

app.use(cors());
app.use(express.json());

/* ── Cabeçalhos globais: sem cache + iframe liberado ── */
app.use((_req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  if (process.env.NODE_ENV !== 'production') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

app.use(express.static(path.join(__dirname, '../public')));

/* ── Configuração ── */
app.get('/api/config', (_req, res) => {
  const supabaseUrl     = process.env.SUPABASE_DB_URL   || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
  const jwtConfigured   = !!process.env.SUPABASE_JWT_SECRET;
  const dbConfigured    = !!process.env.SUPABASE_POSTGRES_URL;

  const missing: string[] = [];
  if (!supabaseUrl)     missing.push('SUPABASE_DB_URL');
  if (!supabaseAnonKey) missing.push('SUPABASE_ANON_KEY');
  if (!jwtConfigured)   missing.push('SUPABASE_JWT_SECRET');
  if (!dbConfigured)    missing.push('SUPABASE_POSTGRES_URL');

  res.json({ supabaseUrl, supabaseAnonKey, jwtConfigured, dbConfigured, ready: missing.length === 0, missing });
});

app.get('/health', (_req, res) => {
  res.json({ message: '✅ PRE-Atendimento-V8 iniciado com sucesso!', version: '1.0.0', status: 'running' });
});

/* ── Auth ── */
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ success: false, error: 'E-mail e senha são obrigatórios.' });
    return;
  }
  try {
    const result = await loginUser(email, password);
    res.status(result.success ? 200 : 401).json(result);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role } = req.body as {
    name?: string; email?: string; password?: string; role?: string;
  };
  if (!name || !email || !password) {
    res.status(400).json({ success: false, error: 'Nome, e-mail e senha são obrigatórios.' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ success: false, error: 'A senha deve ter pelo menos 6 caracteres.' });
    return;
  }
  try {
    const result = await registerUser(name, email, password, role || 'user');
    res.status(result.success ? 201 : 409).json(result);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/* ── Criar instância ──
   Fluxo interno: POST /instance/create → POST /instance/connect
*/
app.post('/api/instances', async (req, res) => {
  const { instanceName, token, evolutionUrl, apiKey } = req.body as {
    instanceName?: string;
    token?:        string;
    evolutionUrl?: string;
    apiKey?:       string;
  };

  if (!instanceName || typeof instanceName !== 'string' || instanceName.trim() === '') {
    res.status(400).json({ success: false, error: 'instanceName é obrigatório.' });
    return;
  }

  try {
    const result = await createInstanceAndPersist(
      instanceName.trim(),
      token?.trim()        || undefined,
      evolutionUrl?.trim() || undefined,
      apiKey?.trim()       || undefined,
    );
    res.status(result.success ? 201 : (result.error?.includes('já existe') ? 409 : 502)).json(result);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/* ── Listar instâncias ── */
app.get('/api/instances', async (_req, res) => {
  try {
    const result = await listInstances();
    res.status(result.success ? 200 : 500).json(result);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/* ── QR Code — GET /instance/qr?instanceName={name} ──────────────────
   Endpoint correto: /instance/qr (não /instance/get-qr-code que retorna 404)
   Auth:             token da instância (não GLOBAL_API_KEY)
   Polling:          retorna { polling: true } quando QR ainda não está disponível,
                     para o frontend saber que deve tentar novamente.
*/
app.get('/api/instances/:name/qrcode', async (req, res) => {
  const { name } = req.params;
  const evolutionUrl   = (req.query.evolutionUrl   as string | undefined)?.trim() || undefined;
  let   instanceToken  = (req.query.instanceToken  as string | undefined)?.trim() || '';

  /* Se token não veio do frontend, buscar no banco via metadata */
  if (!instanceToken) {
    try {
      const { data: inst } = await supabaseAdmin
        .from('instances')
        .select('metadata')
        .eq('instance_name', name)
        .maybeSingle();

      if (inst?.metadata) {
        const meta = inst.metadata as Record<string, unknown>;
        const createData = (meta.create as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
        instanceToken = String(createData?.token || '');
      }
    } catch {
      /* Continua sem token — getQrCode retornará erro explicativo */
    }
  }

  try {
    const result = await getQrCode(name, instanceToken, evolutionUrl);

    /* HTTP 400 com "no QR code available" = polling em andamento, não é erro fatal */
    const isPolling400 = !result.success &&
      result.httpStatus === 400 &&
      typeof result.error === 'string' &&
      result.error.toLowerCase().includes('no qr code available');

    if (isPolling400) {
      res.status(202).json({
        success:  false,
        polling:  true,
        error:    result.error,
        urlCalled: result.urlCalled,
      });
      return;
    }

    /* HTTP 200 mas QR code vazio = API retornou sucesso mas QR ainda não gerado */
    if (result.success) {
      const d     = result.data as Record<string, unknown> | undefined;
      const inner = (d?.data as Record<string, unknown>) || d || {};
      const qr    = inner?.Qrcode || inner?.qrcode || inner?.base64 || '';
      if (!qr) {
        res.status(202).json({
          success:   false,
          polling:   true,
          error:     'QR Code ainda sendo gerado. Aguarde…',
          urlCalled: result.urlCalled,
        });
        return;
      }
    }

    res.status(result.success ? 200 : (result.httpStatus || 502)).json(result);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/* ── Conectar instância manualmente — POST /instance/connect ── */
app.post('/api/instances/:name/connect', async (req, res) => {
  const { name } = req.params;
  const { instanceToken, evolutionUrl } = req.body as {
    instanceToken?: string;
    evolutionUrl?:  string;
  };

  if (!instanceToken) {
    res.status(400).json({ success: false, error: 'instanceToken é obrigatório para conectar.' });
    return;
  }

  try {
    const result = await connectInstance(name, instanceToken, evolutionUrl?.trim() || undefined);
    res.status(result.success ? 200 : (result.httpStatus || 502)).json(result);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/* ── Desconectar — POST /instance/disconnect ──
   Evolution GO: precisa do token da instância (não GLOBAL_API_KEY).
   instanceToken pode vir no body ou é buscado no banco automaticamente.
*/
app.post('/api/instances/:name/disconnect', async (req, res) => {
  const { name } = req.params;
  const { instanceToken, evolutionUrl } = req.body as {
    instanceToken?: string;
    evolutionUrl?:  string;
  };
  try {
    const result = await disconnectInstanceService(
      name,
      instanceToken?.trim() || undefined,
      evolutionUrl?.trim()  || undefined,
    );
    res.status(result.success ? 200 : 502).json(result);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/* ── Deletar — DELETE /instance/delete ── */
app.delete('/api/instances/:name', async (req, res) => {
  const { name } = req.params;
  const { evolutionUrl, apiKey } = req.body as { evolutionUrl?: string; apiKey?: string };
  try {
    const result = await deleteInstanceService(
      name,
      evolutionUrl?.trim() || undefined,
      apiKey?.trim()       || undefined,
    );
    res.status(result.success ? 200 : 502).json(result);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/* ── Testar conexão (admin) ── */
app.post('/api/admin/test-connection', async (req, res) => {
  const { evolutionUrl, apiKey } = req.body as { evolutionUrl?: string; apiKey?: string };

  const baseUrl = (evolutionUrl?.trim()) || process.env.EVOLUTION_API_URL || '';
  const key     = (apiKey?.trim())      || process.env.GLOBAL_API_KEY    || '';

  if (!baseUrl) { res.status(400).json({ success: false, error: 'URL da API não informada.' }); return; }
  if (!key)     { res.status(400).json({ success: false, error: 'Chave da API não informada.' }); return; }

  const url = `${baseUrl}/instance/all`;
  console.log('[TestConn] GET', url);

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 10_000);

  try {
    const r = await fetch(url, {
      method:  'GET',
      headers: { 'Content-Type': 'application/json', apikey: key },
      signal:  controller.signal,
    });
    clearTimeout(timeout);
    const text = await r.text();
    console.log('[TestConn] status', r.status, 'body', text.slice(0, 200));

    if (r.ok) {
      res.json({ success: true, status: r.status, message: 'Conexão estabelecida com sucesso.' });
    } else {
      res.json({ success: false, status: r.status, error: `API retornou HTTP ${r.status}.`, detail: text.slice(0, 300) });
    }
  } catch (err: unknown) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    const isTimeout = (err as Error).name === 'AbortError';
    res.status(502).json({ success: false, error: isTimeout ? 'Tempo limite esgotado (10s).' : `Falha de rede: ${msg}` });
  }
});

async function start() {
  try {
    await runMigrations();
  } catch (err) {
    console.error('⚠️  Migrations falharam, servidor iniciará mesmo assim:', err);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📦 Supabase: ${process.env.SUPABASE_DB_URL ? '✅ configurado' : '⚠️  não configurado'}`);
  });
}

start();
