import { supabaseAdmin } from './supabase.js';
import {
  createInstance as callEvolutionApi,
  disconnectInstance as callDisconnect,
  deleteInstance    as callDelete,
} from './evolutionGo.js';

export async function createInstanceAndPersist(
  instanceName: string,
  token?: string,
  overrideUrl?: string,
  overrideKey?: string,
) {
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

  const { data: record, error: insertError } = await supabaseAdmin
    .from('instances')
    .insert({ instance_name: instanceName, status: 'creating' })
    .select()
    .single();

  if (insertError || !record) {
    return { success: false, error: insertError?.message || 'Erro ao salvar instância.' };
  }

  const apiResult = await callEvolutionApi(instanceName, token, overrideUrl, overrideKey);

  const newStatus = apiResult.success ? 'active' : 'error';

  await supabaseAdmin
    .from('instances')
    .update({ status: newStatus, metadata: apiResult.data as object ?? null })
    .eq('id', record.id);

  await supabaseAdmin.from('instance_logs').insert({
    instance_id: record.id,
    event: apiResult.success ? 'created' : 'creation_failed',
    payload: apiResult.success
      ? (apiResult.data as object)
      : { error: apiResult.error, apiData: apiResult.data },
  });

  return {
    success: apiResult.success,
    data: {
      ...record,
      status: newStatus,
      api_response: apiResult.data,
    },
    error: apiResult.error,
    httpStatus: apiResult.httpStatus,
  };
}

export async function listInstances() {
  const { data, error } = await supabaseAdmin
    .from('instances')
    .select('id, instance_name, status, created_at, updated_at, metadata')
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

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

    await supabaseAdmin.from('instance_logs').insert({
      instance_id: (await supabaseAdmin
        .from('instances').select('id').eq('instance_name', instanceName).maybeSingle()
      ).data?.id,
      event: 'disconnected',
      payload: result.data as object ?? {},
    });
  }

  return { success: result.success, error: result.error };
}

export async function deleteInstanceService(
  instanceName: string,
  overrideUrl?: string,
  overrideKey?: string,
) {
  const result = await callDelete(instanceName, overrideUrl, overrideKey);

  if (result.success) {
    await supabaseAdmin
      .from('instance_logs')
      .delete()
      .eq('instance_id', (await supabaseAdmin
        .from('instances').select('id').eq('instance_name', instanceName).maybeSingle()
      ).data?.id);

    await supabaseAdmin
      .from('instances')
      .delete()
      .eq('instance_name', instanceName);
  }

  return { success: result.success, error: result.error };
}
