import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from './db/migrate.js';
import { createInstanceAndPersist, listInstances } from './services/instanceService.js';
import { loginUser, registerUser } from './services/authService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
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

app.get('/api/config', (_req, res) => {
  const supabaseUrl     = process.env.SUPABASE_DB_URL    || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY  || '';
  const jwtConfigured   = !!process.env.SUPABASE_JWT_SECRET;
  const dbConfigured    = !!process.env.SUPABASE_POSTGRES_URL;

  const missing: string[] = [];
  if (!supabaseUrl)     missing.push('SUPABASE_DB_URL');
  if (!supabaseAnonKey) missing.push('SUPABASE_ANON_KEY');
  if (!jwtConfigured)   missing.push('SUPABASE_JWT_SECRET');
  if (!dbConfigured)    missing.push('SUPABASE_POSTGRES_URL');

  res.json({
    supabaseUrl,
    supabaseAnonKey,
    jwtConfigured,
    dbConfigured,
    ready: missing.length === 0,
    missing,
  });
});

app.get('/health', (_req, res) => {
  res.json({
    message: '✅ PRE-Atendimento-V8 iniciado com sucesso!',
    version: '1.0.0',
    status: 'running',
  });
});

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
    const message = err instanceof Error ? err.message : 'Erro interno';
    res.status(500).json({ success: false, error: message });
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
    const message = err instanceof Error ? err.message : 'Erro interno';
    res.status(500).json({ success: false, error: message });
  }
});

app.post('/api/instances', async (req, res) => {
  const { instanceName } = req.body as { instanceName?: string };

  if (!instanceName || typeof instanceName !== 'string' || instanceName.trim() === '') {
    res.status(400).json({ success: false, error: 'instanceName é obrigatório.' });
    return;
  }

  try {
    const result = await createInstanceAndPersist(instanceName.trim());
    if (result.success) {
      res.status(201).json(result);
    } else {
      const status = result.error?.includes('já existe') ? 409 : 502;
      res.status(status).json(result);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    res.status(500).json({ success: false, error: message });
  }
});

app.get('/api/instances', async (_req, res) => {
  try {
    const result = await listInstances();
    res.status(result.success ? 200 : 500).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    res.status(500).json({ success: false, error: message });
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
