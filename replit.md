# PRE-Atendimento V8

Plataforma de gerenciamento de instâncias WhatsApp via Evolution GO API.

## Arquitetura

- **Backend:** Node.js + Express + TypeScript (`src/server.ts`)
- **Frontend:** SPA estático servido pelo Express (`public/dashboard.html`, `public/index.html`)
- **DB:** Supabase PostgreSQL (via pooler)
- **API WhatsApp:** Evolution GO em `https://evogo.pre-atendimento.com`

## Isolamento de Dados (Segurança)

Isolamento obrigatório em **dupla camada** para usuários comuns:
- **`tenant_id`** — isola por organização
- **`created_by` (user_id)** — isola por dono da instância

Regra: usuário comum vê/modifica **apenas** instâncias criadas pelo próprio `userId`.
Admin não recebe filtro restritivo (vê tudo).

Filtro aplicado em **todas** as queries de instâncias: listagem, status, QRCode, connect, disconnect, logout, pair, delete, purge.

RLS Supabase (migration 009): removida política `anon_select_instances` (era irrestrita); políticas `owner_*` garantem isolamento também no nível do banco para acessos diretos.

## Estrutura de Arquivos

```
src/
  server.ts              — Express server + todas as rotas da API
  services/
    evolutionGo.ts       — Integração com Evolution GO API (corrigida)
    instanceService.ts   — CRUD de instâncias com persistência no DB
    authService.ts       — Login/registro via bcrypt + Supabase
    supabase.ts          — Cliente Supabase admin
  db/
    migrate.ts           — Runner de migrations
    migrations/          — Arquivos SQL das migrations
public/
  index.html             — Página de login/registro
  dashboard.html         — SPA principal (tema dark/light, gestão de instâncias)
docs/
  evolution-go-endpoints.md — Documentação dos endpoints da API (verificados por teste)
```

## Configuração de Ambiente

Variáveis de ambiente necessárias (todas configuradas como secrets):
- `GLOBAL_API_KEY` — Chave global da Evolution GO API
- `SUPABASE_ANON_KEY`
- `SUPABASE_DB_URL`
- `SUPABASE_JWT_SECRET`
- `SUPABASE_POSTGRES_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EVOLUTION_API_URL=https://evogo.pre-atendimento.com` (em `.env`)
- `PORT=5000` (em `.env`)

## Credenciais de Admin

- Email: `admin@example.com`
- Senha: `Admin@2024`

## API Routes

| Método | Path | Descrição |
|--------|------|-----------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/register` | Registro |
| GET | `/api/instances` | Listar instâncias |
| POST | `/api/instances` | Criar instância |
| GET | `/api/instances/:name/qrcode` | Obter QR Code (com polling) |
| POST | `/api/instances/:name/connect` | Conectar instância |
| POST | `/api/instances/:name/disconnect` | Desconectar instância |
| DELETE | `/api/instances/:name` | Deletar instância |
| POST | `/api/admin/test-connection` | Testar conexão com API |
| GET | `/api/config` | Config do servidor |
| GET | `/health` | Health check |

## Lógica de Status das Instâncias

### Valores de status no banco (campo `status`)
| Status | Significado | Badge exibido |
|---|---|---|
| `creating` | Criação em andamento | Criando |
| `active` | Criada mas WhatsApp não autenticado | ○ Desconectada |
| `connected` | QR escaneado, WhatsApp autenticado | ● Conectada |
| `inactive` | Desconectada manualmente | ○ Desconectada |
| `error` | Falha na criação | ○ Desconectada |

### Regra de negócio
- **`status === 'connected'`** é o único estado que exibe "Conectada"
- O badge de conexão é determinado EXCLUSIVAMENTE por `inst.status === 'connected'` (nunca pelo metadata)
- O campo `metadata.create.data.connected` é sempre `false` na criação e não deve ser usado para status

### Fluxo de atualização automática
1. `GET /api/instances/:name/status` chama Evolution GO e avalia `data.LoggedIn`:
   - `LoggedIn: true` → DB atualiza para `connected` (WhatsApp autenticado via QR)
   - `LoggedIn: false + DB=connected` → DB volta para `active` (sessão expirou)
   - `Connected: true` (sozinho) = apenas o processo está rodando, não WhatsApp
2. Após exibir o QR code, o frontend faz polling a cada 4s em `/api/instances/:name/status`
3. Quando `connected: true` é detectado → modal fecha automaticamente → lista atualiza

## Evolution GO — Descobertas Críticas (verificadas por teste)

### Autenticação por endpoint
- `/instance/create` e `/instance/all` → `apikey: GLOBAL_API_KEY`
- `/instance/connect`, `/instance/qr`, `/instance/status`, `/instance/disconnect` → `apikey: <token_instância>`

### Campos e endpoints corretos
- **Create:** campo `name` (não `instanceName`) no body
- **QR Code:** endpoint `/instance/qr?instanceName=...` (não `/instance/get-qr-code` — retorna 404)
- **Delete:** `DELETE /instance/delete/{uuid}` usando UUID (não nome)
- **QR format:** campos `Qrcode` e `Code` com maiúscula (não `qrcode`/`code`)
- **Polling:** QR retorna HTTP 400 "no QR code available" por ~3s após criar; HTTP 202 no backend

### Fluxo completo de criação
1. `POST /instance/create` com `{name, qrcode:true, token}` → GLOBAL_API_KEY
2. `POST /instance/connect` com `{instanceName}` → token da instância
3. Poll `GET /instance/qr?instanceName=...` → token da instância (até 75s, tentativas de 3s)

## Tema

- Toggle botão único: 🌙 (escuro) / ☀️ (claro)
- Armazenado em `localStorage` com chave `pa_theme`
- Padrão: dark
- CSS via custom properties (`--bg`, `--surface`, `--border`, `--tx1`–`--tx5`)

## Migrations

Aplicadas automaticamente na inicialização:
1. `001_create_migrations_table`
2. `002_create_instances_table`
3. `003_create_updated_at_trigger`
4. `004_create_instance_logs_table`
5. `005b_create_users_table`
6. `005_enable_rls`
