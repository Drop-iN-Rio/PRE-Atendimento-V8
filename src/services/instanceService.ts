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

/* ── Buscar UUID e token da instância no banco ──
   Suporta dois formatos de metadata:
     Novo:   metadata.create.data.{ id, token }
     Antigo: metadata.data.{ id, token }
*/
async function getInstanceMeta(instanceName: string): Promise<{ uuid: string; token: string }> {
  const { data: inst } = await supabaseAdmin
    .from('instances')
    .select('metadata')
    .eq('instance_name', instanceName)
    .maybeSingle();

  if (!inst?.metadata) return { uuid: '', token: '' };
  const meta = inst.metadata as Record<string, unknown>;

  /* Formato novo: metadata.create.data */
  const newData = (meta.create as Record<string, unknown> | undefined)
    ?.data as Record<string, unknown> | undefined;
  if (newData?.id) {
    return { uuid: String(newData.id), token: String(newData.token || '') };
  }

  /* Formato antigo: metadata.data */
  const oldData = meta.data as Record<string, unknown> | undefined;
  if (oldData?.id) {
    return { uuid: String(oldData.id), token: String(oldData.token || '') };
  }

  return { uuid: '', token: '' };
}

/* ── Criar e persistir instância ──────────────────────────────────────
   Fluxo API-first: a API é chamada ANTES de qualquer insert no banco.
   Se a API falhar (ex: "instance already exists"), nenhum registro é criado.
*/
export async function createInstanceAndPersist(
  instanceName: string,
  token?:       string,
  overrideUrl?: string,
  overrideKey?: string,
) {
  /* 1. Verificar duplicata no banco local */
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

  /* 2. Chamar API PRIMEIRO — sem tocar no banco ainda */
  console.log('[instanceService] ▶ Passo 1/2: criar instância na API');
  const createResult = await callCreate(instanceName, token, overrideUrl, overrideKey);

  /* Se a API falhou (ex: "instance already exists", erro de rede etc.)
     → retornar imediatamente sem criar nenhum registro no banco */
  if (!createResult.success) {
    console.error(`[instanceService] ✖ API recusou criar "${instanceName}": ${createResult.error}`);
    return {
      success:    false,
      error:      createResult.error || 'A API rejeitou a criação da instância.',
      httpStatus: createResult.httpStatus,
    };
  }

  /* 3. POST /instance/connect — sem body, instância identificada pelo token */
  let connectResult = null;
  const instanceToken = extractInstanceToken(createResult.data);

  if (instanceToken) {
    console.log('[instanceService] ▶ Passo 2/2: conectar instância (token da instância)');
    connectResult = await callConnect(instanceToken, overrideUrl);
  } else {
    console.warn('[instanceService] ⚠️  Token da instância não encontrado na resposta do /create — pulando connect');
  }

  /* 4. API confirmou sucesso → inserir no banco */
  const { data: record, error: insertError } = await supabaseAdmin
    .from('instances')
    .insert({
      instance_name: instanceName,
      status:        'active',
      metadata: {
        create:  createResult.data  ?? null,
        connect: connectResult?.data ?? null,
      },
    })
    .select()
    .single();

  if (insertError || !record) {
    console.error('[instanceService] ✖ Erro ao persistir no banco após sucesso da API:', insertError?.message);
    /* Instância foi criada na API mas falhou ao salvar localmente — retornar sucesso parcial */
    return {
      success: true,
      data: {
        instance_name:    instanceName,
        status:           'active',
        instance_token:   instanceToken || null,
        create_response:  createResult.data,
        connect_response: connectResult?.data ?? null,
      },
      warning: 'Instância criada na API mas não foi possível salvar no banco local: ' + (insertError?.message || ''),
    };
  }

  /* 5. Log de evento */
  await supabaseAdmin.from('instance_logs').insert({
    instance_id: record.id,
    event:   'created',
    payload: {
      create:  createResult.data,
      connect: connectResult ? { success: connectResult.success, data: connectResult.data, error: connectResult.error } : null,
    },
  });

  return {
    success: true,
    data: {
      ...record,
      status:           'active',
      instance_token:   instanceToken || null,
      create_response:  createResult.data,
      connect_response: connectResult?.data ?? null,
    },
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
   Swagger: path param instanceId = UUID da instância.
   UUID vem de metadata (formato novo ou antigo).
   Regras:
     - HTTP 404 da API → instância já foi deletada; tratar como sucesso.
     - Qualquer outro erro da API → retornar falha SEM tocar no banco.
     - DB só é limpo DEPOIS de confirmação de sucesso da API.
*/
export async function deleteInstanceService(
  instanceName: string,
  overrideUrl?: string,
  overrideKey?: string,
) {
  const meta = await getInstanceMeta(instanceName);
  const uuid = meta.uuid;

  /* ── Sem UUID: registro órfão (criação falhou ou metadata corrompida)
     → deletar direto do banco sem chamar a API (sem risco de inconsistência) */
  if (!uuid) {
    console.warn(`[deleteInstanceService] UUID não encontrado para "${instanceName}" — removendo registro órfão do banco.`);

    const { data: inst } = await supabaseAdmin
      .from('instances').select('id').eq('instance_name', instanceName).maybeSingle();

    if (inst?.id) {
      await supabaseAdmin.from('instance_logs').delete().eq('instance_id', inst.id);
    }
    await supabaseAdmin.from('instances').delete().eq('instance_name', instanceName);

    return {
      success: true,
      data:    { message: 'Registro órfão removido do banco local.' },
      orphan:  true,
    };
  }

  /* ── Com UUID: chamar API do Evolution GO */
  const result = await callDelete(uuid, overrideUrl, overrideKey);

  /* HTTP 404 = instância já não existe na API → tratar como sucesso */
  const apiOk = result.success || result.httpStatus === 404;

  if (!apiOk) {
    /* API retornou erro real — não remover do banco */
    console.error(`[deleteInstanceService] API recusou deleção de "${instanceName}": HTTP ${result.httpStatus} — ${result.error}`);
    return {
      success:    false,
      error:      result.error || `A API retornou HTTP ${result.httpStatus} ao tentar deletar a instância.`,
      httpStatus: result.httpStatus,
    };
  }

  /* Sucesso confirmado — limpar banco local */
  const { data: inst } = await supabaseAdmin
    .from('instances').select('id').eq('instance_name', instanceName).maybeSingle();

  if (inst?.id) {
    await supabaseAdmin.from('instance_logs').delete().eq('instance_id', inst.id);
  }

  await supabaseAdmin.from('instances').delete().eq('instance_name', instanceName);

  return { success: true, data: result.data };
}

/* ── Purgar registro órfão do banco sem chamar a API ─────────────────
   Usar quando o registro local não tem UUID válido (criação falhou)
   ou quando o admin quer forçar limpeza de registro inconsistente.
*/
export async function purgeOrphanedInstance(instanceName: string) {
  const { data: inst, error } = await supabaseAdmin
    .from('instances')
    .select('id, instance_name, status, metadata')
    .eq('instance_name', instanceName)
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!inst) return { success: false, error: `Instância "${instanceName}" não encontrada no banco.` };

  /* Remover logs primeiro (FK) */
  if (inst.id) {
    await supabaseAdmin.from('instance_logs').delete().eq('instance_id', inst.id);
  }

  const { error: delErr } = await supabaseAdmin
    .from('instances')
    .delete()
    .eq('instance_name', instanceName);

  if (delErr) return { success: false, error: delErr.message };

  console.log(`[purgeOrphanedInstance] ✅ "${instanceName}" removido do banco local.`);
  return { success: true, data: { message: `Instância "${instanceName}" removida do banco local.` } };
}
