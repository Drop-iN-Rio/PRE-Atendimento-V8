# Evolution GO — Endpoints Descobertos por Testes

> **Atenção:** Estes endpoints são exclusivos da **Evolution GO** (versão em Go).
> NÃO misturar com Evolution API v2/v1 (Node.js/Baileys) — são APIs completamente diferentes.
> As informações abaixo foram verificadas por testes diretos em `https://evogo.pre-atendimento.com`.

Base URL: `https://evogo.pre-atendimento.com` (env: `EVOLUTION_API_URL`)

---

## AUTENTICAÇÃO

| Endpoint                  | Auth Header               | Notas                                        |
|---------------------------|---------------------------|----------------------------------------------|
| `/instance/create`        | `apikey: GLOBAL_API_KEY`  | Única rota que usa a chave global            |
| `/instance/all`           | `apikey: GLOBAL_API_KEY`  | Única rota que usa a chave global            |
| `/instance/connect`       | `apikey: <token_instância>`| Usa o token devolvido pelo `/create`         |
| `/instance/qr`            | `apikey: <token_instância>`| Usa o token da instância, NÃO o global      |
| `/instance/status`        | `apikey: <token_instância>`| Usa o token da instância                    |
| `/instance/disconnect`    | `apikey: GLOBAL_API_KEY`  |                                              |
| `/instance/delete`        | `apikey: GLOBAL_API_KEY`  |                                              |
| `/instance/logout`        | `apikey: <token_instância>`|                                              |

---

## INSTÂNCIAS

### POST /instance/create
**Auth:** `apikey: GLOBAL_API_KEY`

**Body crítico (campo `name`, NÃO `instanceName`):**
```json
{
  "name": "minha-instancia",
  "qrcode": true,
  "token": "token-personalizado-opcional"
}
```

> ⚠️ **IMPORTANTE:** O campo é `name` (não `instanceName`).
> Usar `instanceName` retorna `{"error":"name is required"}`.

**Resposta:**
```json
{
  "data": {
    "id": "uuid",
    "name": "minha-instancia",
    "token": "token-personalizado-opcional",
    "connected": false,
    "qrcode": "",
    "createdAt": "2026-04-16T..."
  },
  "message": "success"
}
```

---

### POST /instance/connect
**Auth:** `apikey: <token_instância>`

**Body:**
```json
{ "instanceName": "minha-instancia" }
```

**Resposta (configura eventos, inicia cliente WhatsApp assincronamente):**
```json
{
  "data": {
    "eventString": "MESSAGE",
    "jid": "",
    "webhookUrl": ""
  },
  "message": "success"
}
```

> ℹ️ Esta chamada inicia o processo WhatsApp em background.
> Após ~5-15s o cliente passa de "no active session found" para "client disconnected".
> O QR Code fica disponível no endpoint `/instance/qr` após a inicialização.

---

### GET /instance/qr
**Auth:** `apikey: <token_instância>` (NÃO usar GLOBAL_API_KEY — retorna 401)

**Query:** `?instanceName=minha-instancia`

**Resposta enquanto o QR ainda não está pronto (HTTP 400):**
```json
{ "error": "no QR code available. Please wait a moment and try again" }
```

**Resposta quando o QR está disponível (HTTP 200):**
```json
{
  "data": {
    "base64": "data:image/png;base64,...",
    "code": "..."
  }
}
```

> ⚠️ **ENDPOINT CORRETO:** `/instance/qr` (NÃO `/instance/get-qr-code` — retorna 404 sempre).
> Fazer polling com intervalo de 3s. Máximo ~75s de espera.

---

### GET /instance/status
**Auth:** `apikey: <token_instância>`

**Query:** `?instanceName=minha-instancia`

**Possíveis respostas:**
- `{"error":"no active session found"}` HTTP 400 — cliente ainda não iniciou
- `{"error":"client disconnected"}` HTTP 400 — cliente iniciou mas não conectou ao WhatsApp
- HTTP 200 com dados — instância conectada

---

### GET /instance/all
**Auth:** `apikey: GLOBAL_API_KEY`

**Resposta:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "minha-instancia",
      "token": "...",
      "connected": false,
      "qrcode": "",
      "jid": "",
      "events": "MESSAGE"
    }
  ]
}
```

> ℹ️ O campo `qrcode` na lista `/instance/all` fica vazio mesmo quando o QR está sendo exibido.
> O QR Code real deve ser obtido via `GET /instance/qr`.

---

## ENDPOINTS QUE NÃO EXISTEM NESTA VERSÃO

| Endpoint                    | Status  | Notas                           |
|-----------------------------|---------|----------------------------------|
| `GET /instance/get-qr-code` | 404     | Use `/instance/qr` em vez disso |
| `GET /instance`             | 404     | Use `/instance/all`             |
| `GET /instance/{name}`      | 404     | Não existe nesta versão         |

---

## FLUXO CORRETO PARA CRIAR E CONECTAR

```
1. POST /instance/create
   Header: apikey: GLOBAL_API_KEY
   Body:   { "name": "inst-name", "qrcode": true, "token": "opt-token" }
   → Salvar token da resposta: data.token

2. POST /instance/connect
   Header: apikey: <token da instância>
   Body:   { "instanceName": "inst-name" }
   → Inicia o cliente WhatsApp (processo assíncrono)

3. Polling: GET /instance/qr?instanceName=inst-name
   Header: apikey: <token da instância>
   → Repetir a cada 3s por até 75s
   → HTTP 400 = ainda gerando, continue
   → HTTP 200 = QR code disponível em data.base64
```
