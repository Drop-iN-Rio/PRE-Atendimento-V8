# Evolution GO — Referência de Endpoints

> **Fonte oficial:** `https://evogo.pre-atendimento.com/swagger/doc.json`
> Todos os endpoints abaixo foram extraídos diretamente do Swagger da API.
> Não usar suposições ou documentação de outros projetos (Evolution API Node.js/Baileys).

---

## Autenticação

Todos os endpoints utilizam o header `apikey`. O valor varia por operação:

| Operação | Valor do `apikey` |
|---|---|
| `GET /instance/all` | `GLOBAL_API_KEY` |
| `POST /instance/create` | `GLOBAL_API_KEY` |
| `DELETE /instance/delete/{instanceId}` | `GLOBAL_API_KEY` |
| Todos os outros `/instance/*` | Token da instância (`data.token` do `/instance/create`) |

---

## Endpoints de Instance

### `GET /instance/all`
Lista todas as instâncias.
- **Auth:** `GLOBAL_API_KEY`
- **Params:** nenhum
- **Resposta 200:** lista de instâncias

---

### `POST /instance/create`
Cria uma nova instância.
- **Auth:** `GLOBAL_API_KEY`
- **Body (`CreateStruct`):**
  ```json
  {
    "name": "string",
    "token": "string",
    "proxy": {}
  }
  ```
- **Resposta 200:** `{ "data": { "id": "<uuid>", "name": "...", "token": "...", ... } }`
- **Importante:** campo `name` (não `instanceName`). Sem `qrcode` no body (não existe no spec).

---

### `POST /instance/connect`
Inicia o cliente WhatsApp (gera QR code assincronamente).
- **Auth:** token da instância
- **Body (`ConnectStruct`):** todos os campos são opcionais; pode-se enviar `{}`
  ```json
  {
    "immediate": false,
    "phone": "string",
    "subscribe": [],
    "webhookUrl": "string"
  }
  ```
- **Resposta 200:** `{ "data": { "eventString": "...", "jid": "...", "webhookUrl": "..." } }`
- **Importante:** instância identificada pelo token no header, NÃO por `instanceName` no body (não existe no spec).

---

### `GET /instance/qr`
Obtém o QR code da instância.
- **Auth:** token da instância
- **Params:** nenhum (instância identificada pelo token)
- **Resposta 200:** `{ "data": { "Qrcode": "data:image/png;base64,...", "Code": "..." } }`
- **Resposta 400:** `"no QR code available. Please wait a moment and try again"` → fazer polling
- **Importante:** campo `Qrcode` com Q maiúsculo. Sem `?instanceName=` na query string (não existe no spec).

---

### `GET /instance/status`
Obtém o status da instância.
- **Auth:** token da instância
- **Params:** nenhum (instância identificada pelo token)
- **Resposta 200:** `{ "data": { "Connected": bool, "LoggedIn": bool, "Name": string } }`
- **Campos importantes:**
  - `Connected: true` = o **processo** da instância está rodando (sempre true após `/connect`)
  - `LoggedIn: true` = **WhatsApp autenticado** — o QR foi escaneado e sessão estabelecida
- **Status no banco:** apenas quando `LoggedIn: true` o DB é atualizado para `'connected'`

---

### `POST /instance/disconnect`
Desconecta a instância (pausa a sessão WhatsApp).
- **Auth:** token da instância
- **Body:** nenhum (sem parâmetros no spec)
- **Resposta 200:** sucesso

---

### `DELETE /instance/logout`
Remove a sessão WhatsApp da instância (diferente de disconnect).
- **Auth:** token da instância
- **Params:** nenhum
- **Resposta 200:** sucesso

---

### `POST /instance/pair`
Solicita código de pareamento por número de telefone (alternativa ao QR).
- **Auth:** token da instância
- **Body (`PairStruct`):**
  ```json
  {
    "phone": "5511999999999",
    "subscribe": []
  }
  ```
- **Resposta 200:** código de pareamento

---

### `DELETE /instance/delete/{instanceId}`
Deleta uma instância permanentemente.
- **Auth:** `GLOBAL_API_KEY`
- **Path:** `instanceId` = UUID da instância (campo `id` da resposta do `/instance/create`)
- **Resposta 200:** `{ "message": "success" }`
- **Resposta 404:** instância não encontrada → tratar como sucesso (limpar DB local)
- **Importante:** UUID no path, não nome no body.

---

### `DELETE /instance/proxy/{instanceId}`
Remove configuração de proxy de uma instância.
- **Auth:** `GLOBAL_API_KEY`
- **Path:** `instanceId` = UUID da instância

---

## Fluxo Completo de Criação com QR

```
1. POST /instance/create
   Header: apikey: GLOBAL_API_KEY
   Body:   { "name": "minha-instancia", "token": "meu-token" }
   → Salva: data.id (UUID), data.token (token da instância)

2. POST /instance/connect
   Header: apikey: <data.token>
   Body:   {}
   → Inicia cliente WhatsApp assincronamente

3. GET /instance/qr   (polling a cada 3s, máx 75s)
   Header: apikey: <data.token>
   → 400 = QR ainda gerando → tentar novamente
   → 200 = { data: { Qrcode: "data:image/png;base64,...", Code: "..." } }
```

---

## Notas de Implementação

- O backend retorna **HTTP 202** com `{ polling: true }` quando QR ainda não está disponível
- O frontend faz polling automático a cada 3s por até 25 tentativas (75s)
- UUID da instância armazenado em `metadata.create.data.id` no banco local
- Token da instância armazenado em `metadata.create.data.token` no banco local
- Instâncias sem UUID no DB têm apenas o banco limpo na deleção (sem chamada à API)
