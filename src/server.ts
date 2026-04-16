import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createInstanceAndPersist, listInstances } from './services/instanceService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/health', (_req, res) => {
  res.json({
    message: '✅ PRE-Atendimento-V8 iniciado com sucesso!',
    version: '1.0.0',
    status: 'running',
  });
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

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📦 Supabase: ${process.env.SUPABASE_DB_URL ? '✅ configurado' : '⚠️  não configurado'}`);
});
