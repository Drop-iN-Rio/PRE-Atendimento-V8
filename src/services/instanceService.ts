import { supabaseAdmin } from './supabase.js';
import {
  createInstance    as callCreate,
  connectInstance   as callConnect,
  disconnectInstance as callDisconnect,
  logoutInstance    as callLogout,
  deleteInstance    as callDelete,
} from './evolutionGo.js';

/* Extrai o token da instância da resposta do /instance/create.
   Formato verificado: { data: { token, id, name, ... } }
*/
function extractInstanceToken(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as Record<string, unknown>;

  const inner = d.data as Record<string, unknown> | undefined;
  if (inner?.token)  return String(inner.token);
  if (inner?.apikey) return String(inner.apikey);

  const hash = d.hash as Record<string, unknown> | undefined;
  if (hash?.token)  return String(hash.token);
  if (hash?.apikey) return String(hash.apikey);

  if (d.token)  return String(d.token);
  if (d.apikey) return String(d.apikey);

  return '';
}

/* ── Buscar UUID e token da instância no banco ── */
async function getInstanceMeta(instanceName: string): Promise<{ uuid: string; token: string }> {
  const { data: inst } = await supabaseAdmin
    .from('instances')
    .select('metadata')
    .eq('instance_name', instanceName)
    .maybeSingle();

  if (!inst?.metadata) return { uuid: '', token: '' };
  const meta       = inst.metadata as Record<string, unknown>;
  const createData = (meta.create as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
  return {
    uuid:  String(createData?.id    || ''),
    token: String(createData?.token || ''),
  };
}

/* ── Criar e persistir instância ──────────────────────────────────────
   Swagger:
     1. POST /instance/create  → body { name, token? }        (GLOBAL_API_KEY)
     2. POST /instance/connect → body {} ConnectStruct vazio   (token instância)
*/
export async function createInstanceAndPersist(
  instanceName: string,
  token?:       string,
  overrideUrl?: string,
  overrideKey?: string,
) {
  /* 1. Verificar duplicata */
  const { data: existing } = await supabaseAdmin
    .from('instances')
    .select('id, instance_name, status')
    .eq('instance_name', instanceName)
    .maybeSingle();

  if (existing) {
    return {
      success: false,
      error: `Instância "${instanceName}" já existe com status "${existing.status}".`,
    };
  }

  /* 2. Inserir no banco com status "creating" */
  const { data: record, error: insertError } = await supabaseAdmin
    .from('instances')
    .insert({ instance_name: instanceName, status: 'creating' })
    .select()
    .single();

  if (insertError || !record) {
    return { success: false, error: insertError?.message || 'Erro ao salvar instância.' };
  }

  /* 3. POST /instance/create */
  console.log('[instanceService] ▶ Passo 1/2: criar instância na API');
  const createResult = await callCreate(instanceName, token, overrideUrl, overrideKey);

  /* 4. POST /instance/connect — sem body, instância identificada pelo token */
  let connectResult = null;
  const instanceToken = extractInstanceToken(createResult.data);

  if (createResult.success && instanceToken) {
    console.log('[instanceService] ▶ Passo 2/2: conectar instância (token da instância)');
    connectResult = await callConnect(instanceToken, overrideUrl);
  } else if (createResult.success && !instanceToken) {
    console.warn('[instanceService] ⚠️  Token da instância não encontrado na resposta do /create — pulando connect');
  }

  /* 5. Atualizar status no banco */
  const newStatus = createResult.success ? 'active' : 'error';

  await supabaseAdmin
    .from('instances')
    .update({
      status:   newStatus,
      metadata: {
        create:  createResult.data  ?? null,
        connect: connectResult?.data ?? null,
      } as object,
    })
    .eq('id', record.id);

  /* 6. Log de evento */
  await supabaseAdmin.from('instance_logs').insert({
    instance_id: record.id,
    event:   createResult.success ? 'created' : 'creation_failed',
    payload: {
      create:  createResult.success  ? createResult.data  : { error: createResult.error,  data: createResult.data },
      connect: connectResult         ? { success: connectResult.success, data: connectResult.data, error: connectResult.error } : null,
    },
  });

  return {
    success:     createResult.success,
    data: {
      ...record,
      status:         newStatus,
      instance_token: instanceToken || null,
      create_response:  createResult.data,
      connect_response: connectResult?.data ?? null,
    },
    error:      createResult.error,
    httpStatus: createResult.httpStatus,
  };
}

/* ── Listar instâncias (banco local) ── */
export async function listInstances() {
  const { data, error } = await supabaseAdmin
    .from('instances')
    .select('id, instance_name, status, created_at, updated_at, metadata')
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

/* ── Desconectar (POST /instance/disconnect) ─────────────────────────
   Swagger: sem body; instância identificada pelo token da instância no header.
*/
export async function disconnectInstanceService(
  instanceName:   string,
  instanceToken?: string,
  overrideUrl?:   string,
) {
  let token = instanceToken || '';
  if (!token) {
    const meta = await getInstanceMeta(instanceName);
    token = meta.token;
  }

  const result = await callDisconnect(token, overrideUrl);

  if (result.success) {
    await supabaseAdmin
      .from('instances')
      .update({ status: 'inactive' })
      .eq('instance_name', instanceName);

    const { data: inst } = await supabaseAdmin
      .from('instances').select('id').eq('instance_name', instanceName).maybeSingle();

    if (inst?.id) {
      await supabaseAdmin.from('instance_logs').insert({
        instance_id: inst.id,
        event:   'disconnected',
        payload: result.data as object ?? {},
      });
    }
  }

  return { success: result.success, data: result.data, error: result.error };
}

/* ── Logout (DELETE /instance/logout) ───────────────────────────────
   Swagger: sem body; instância identificada pelo token.
   Remove a sessão WhatsApp (diferente de disconnect que apenas pausa).
*/
export async function logoutInstanceService(
  instanceName:   string,
  instanceToken?: string,
  overrideUrl?:   string,
) {
  let token = instanceToken || '';
  if (!token) {
    const meta = await getInstanceMeta(instanceName);
    token = meta.token;
  }

  const result = await callLogout(token, overrideUrl);

  if (result.success) {
    await supabaseAdmin
      .from('instances')
      .update({ status: 'inactive' })
      .eq('instance_name', instanceName);

    const { data: inst } = await supabaseAdmin
      .from('instances').select('id').eq('instance_name', instanceName).maybeSingle();

    if (inst?.id) {
      await supabaseAdmin.from('instance_logs').insert({
        instance_id: inst.id,
        event:   'logout',
        payload: result.data as object ?? {},
      });
    }
  }

  return { success: result.success, data: result.data, error: result.error };
}

/* ── Deletar (DELETE /instance/delete/{instanceId}) ─────────────────
   Swagger: path param instanceId = UUID.
   UUID vem de metadata.create.data.id no banco.
   HTTP 404 da API → tratado como sucesso (já deletado).
*/
export async function deleteInstanceService(
  instanceName: string,
  overrideUrl?: string,
  overrideKey?: string,
) {
  const meta = await getInstanceMeta(instanceName);
  const uuid = meta.uuid;

  let result;
  if (uuid) {
    result = await callDelete(uuid, overrideUrl, overrideKey);
    if (!result.success && result.httpStatus === 404) {
      console.warn(`[deleteInstanceService] Instância "${instanceName}" não encontrada na API (já deletada) — removendo do DB.`);
      result = { success: true, data: result.data, error: undefined, httpStatus: 404 };
    }
  } else {
    console.warn(`[deleteInstanceService] UUID não encontrado para "${instanceName}" — removendo apenas do DB.`);
    result = { success: true, data: null, error: undefined };
  }

  /* Limpar banco local independente do resultado da API */
  const { data: inst } = await supabaseAdmin
    .from('instances').select('id').eq('instance_name', instanceName).maybeSingle();

  if (inst?.id) {
    await supabaseAdmin.from('instance_logs').delete().eq('instance_id', inst.id);
  }

  await supabaseAdmin.from('instances').delete().eq('instance_name', instanceName);

  return { success: result.success, data: result.data, error: result.error };
}
