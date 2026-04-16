# Evolution GO — Endpoints Oficiais

Base URL: `https://evogo.pre-atendimento.com` (env: `EVOLUTION_API_URL`)

Headers obrigatórios em todas as requisições:
```
Content-Type: application/json
apikey: <GLOBAL_API_KEY>
```

---

## INSTÂNCIAS

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET    | `/instance/all` | Retorna todas as instâncias cadastradas |
| POST   | `/instance/create` | Cria uma nova instância |
| POST   | `/instance/connect` | Conecta uma instância (retorna QR Code) |
| POST   | `/instance/disconnect` | Desconecta uma instância |
| DELETE | `/instance/delete` | Deleta uma instância |
| DELETE | `/instance/logout` | Faz logout da instância |
| POST   | `/instance/request-pairing-code` | Solicita código de pareamento |
| DELETE | `/instance/delete-proxy` | Remove proxy da instância |
| GET    | `/instance/get-qr-code` | Retorna o QR Code da instância |
| GET    | `/instance/status` | Retorna o status da instância |

### POST /instance/create — Detalhes

**Body:**
```json
{
  "instanceName": "minha-instancia",
  "qrcode": true,
  "integration": "WHATSAPP-BAILEYS",
  "token": "",
  "number": "",
  "webhook": {
    "enabled": true,
    "url": "https://seusite.com/webhook",
    "events": ["message", "status", "connection", "call"]
  }
}
```

**Resposta de Sucesso (200/201):**
```json
{
  "instance": {
    "instanceName": "minha-instancia",
    "instanceId": "uuid-exemplo",
    "integration": "WHATSAPP-BAILEYS",
    "status": "connecting"
  },
  "qrcode": {
    "code": "...",
    "base64": "data:image/png;base64,..."
  },
  "settings": {
    "alwaysOnline": false,
    "rejectCall": false,
    "readMessages": false
  }
}
```

### GET /instance/get-qr-code — Detalhes

O instanceName é passado como **query parameter**:

```
GET /instance/get-qr-code?instanceName=minha-instancia
```

Variante alternativa mencionada na documentação:
```
GET /instance/{instanceName}/qrcode
```

---

## MENSAGENS

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/message/send-text` | Envia mensagem de texto |
| POST | `/message/send-media` | Envia mensagem com mídia (foto, vídeo, áudio, documento) |
| POST | `/message/send-link` | Envia mensagem com link |
| POST | `/message/send-location` | Envia mensagem de localização |
| POST | `/message/send-contact` | Envia mensagem de contato |
| POST | `/message/send-sticker` | Envia sticker |
| POST | `/message/send-poll` | Envia enquete (poll) |
| POST | `/message/react` | Reage a uma mensagem |
| POST | `/message/edit` | Edita uma mensagem enviada |
| POST | `/message/delete-for-everyone` | Apaga mensagem para todos |
| POST | `/message/mark-as-read` | Marca mensagem como lida |
| POST | `/message/set-presence` | Define presença (online, digitando, etc.) |
| POST | `/message/download-image` | Baixa uma imagem |
| POST | `/message/get-status` | Consulta status da mensagem |

---

## GRUPOS

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/group/create` | Cria um novo grupo |
| GET  | `/group/list` | Lista todos os grupos |
| GET  | `/group/my-groups` | Lista os grupos que você participa |
| POST | `/group/get-info` | Obtém informações do grupo |
| POST | `/group/get-invite-link` | Gera link de convite do grupo |
| POST | `/group/join-link` | Entra em um grupo pelo link |
| POST | `/group/set-name` | Altera nome do grupo |
| POST | `/group/set-photo` | Define foto do grupo |
| POST | `/group/update-participant` | Adiciona/remove/promove participante |

---

## USUÁRIO

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/user/get` | Obtém informações de um usuário |
| GET  | `/user/get-contacts` | Lista todos os contatos |
| POST | `/user/check` | Verifica se um número existe no WhatsApp |
| POST | `/user/get-avatar` | Obtém foto de perfil de um usuário |
| POST | `/user/block-contact` | Bloqueia um contato |
| POST | `/user/unblock-contact` | Desbloqueia um contato |
| GET  | `/user/get-block-list` | Lista contatos bloqueados |
| GET  | `/user/get-privacy-settings` | Obtém configurações de privacidade |
| POST | `/user/set-profile-picture` | Define sua foto de perfil |

---

## NEWSLETTER

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/newsletter/create` | Cria um newsletter (canal) |
| GET  | `/newsletter/list` | Lista todos os newsletters |
| POST | `/newsletter/get` | Obtém detalhes de um newsletter |
| POST | `/newsletter/get-messages` | Obtém mensagens de um newsletter |
| POST | `/newsletter/subscribe` | Inscreve-se em um newsletter |
| POST | `/newsletter/get-invite` | Gera convite para newsletter |

---

## LABEL

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/label/edit` | Cria ou edita uma label |
| POST | `/label/add-to-chat` | Adiciona label a um chat |
| POST | `/label/add-to-message` | Adiciona label a uma mensagem |
| POST | `/label/remove-from-chat` | Remove label de um chat |
| POST | `/label/remove-from-message` | Remove label de uma mensagem |

---

## Notas de implementação

- O `instanceName` é usado em todos os endpoints de instância.
- Para QR Code: testar primeiro `GET /instance/get-qr-code?instanceName={name}`.
- A autenticação é sempre via header `apikey`.
- Erros seguem o padrão `{ "error": "mensagem" }` ou `{ "message": "mensagem" }`.
- Endpoints de instância usam os verbos DELETE para operações destrutivas.
