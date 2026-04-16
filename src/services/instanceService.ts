import { supabaseAdmin } from './supabase.js';
import {
  createInstance  as callCreate,
  connectInstance as callConnect,
  disconnectInstance as callDisconnect,
  deleteInstance  as callDelete,
} from './evolutionGo.js';

/* Extrai o token da instância da resposta do /instance/create.
   A Evolution GO pode retornar em diferentes formas:
   { data: { token } } | { hash: { apikey } } | { token } | { apikey }
*/
function extractInstanceToken(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as Record<string, unknown>;

  /* Formato: { data: { token, name, ... } } */
  const inner = d.data as Record<string, unknown> | undefined;
  if (inner?.token)  return String(inner.token);
  if (inner?.apikey) return String(inner.apikey);

  /* Formato: { hash: { token, apikey } } */
  const hash = d.hash as Record<string, unknown> | undefined;
  if (hash?.token)  return String(hash.token);
  if (hash?.apikey) return String(hash.apikey);

  /* Formato direto */
  if (d.token)  return String(d.token);
  if (d.apikey) return String(d.apikey);

  return '';
}

/* ── Criar e persistir instância ──
   Fluxo: criar → conectar → salvar no banco → retornar
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

  /* 3. POST /instance/create — com instanceName e qrcode:true */
  console.log('[instanceService] ▶ Passo 1/2: criar instância na API');
  const createResult = await callCreate(instanceName, token, overrideUrl, overrideKey);

  /* 4. POST /instance/connect — com token da própria instância */
  let connectResult = null;
  const instanceToken = extractInstanceToken(createResult.data);

  if (createResult.success && instanceToken) {
    console.log('[instanceService] ▶ Passo 2/2: conectar instância (token da instância)');
    connectResult = await callConnect(instanceName, instanceToken, overrideUrl);
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

/* ── Listar instâncias ── */
export async function listInstances() {
  const { data, error } = await supabaseAdmin
    .from('instances')
    .select('id, instance_name, status, created_at, updated_at, metadata')
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

/* ── Desconectar (POST /instance/disconnect) ── */
export async function disconnectInstanceService(
  instanceName: string,
  overrideUrl?: string,
  overrideKey?: string,
) {
  const result = await callDisconnect(instanceName, overrideUrl, overrideKey);

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

/* ── Deletar (DELETE /instance/delete) ── */
export async function deleteInstanceService(
  instanceName: string,
  overrideUrl?: string,
  overrideKey?: string,
) {
  const result = await callDelete(instanceName, overrideUrl, overrideKey);

  if (result.success) {
    const { data: inst } = await supabaseAdmin
      .from('instances').select('id').eq('instance_name', instanceName).maybeSingle();

    if (inst?.id) {
      await supabaseAdmin.from('instance_logs').delete().eq('instance_id', inst.id);
    }

    await supabaseAdmin.from('instances').delete().eq('instance_name', instanceName);
  }

  return { success: result.success, data: result.data, error: result.error };
}
