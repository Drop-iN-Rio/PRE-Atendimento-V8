import { supabaseAdmin } from './supabase.js';
import { createInstance as callEvolutionApi } from './evolutionGo.js';

export async function createInstanceAndPersist(
  instanceName: string,
  evolutionUrl: string,
  apiKey: string,
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

  const apiResult = await callEvolutionApi(instanceName, evolutionUrl, apiKey);

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
      : { error: apiResult.error },
  });

  return {
    success: apiResult.success,
    data: { ...record, status: newStatus, api_response: apiResult.data },
    error: apiResult.error,
  };
}

export async function listInstances() {
  const { data, error } = await supabaseAdmin
    .from('instances')
    .select('id, instance_name, status, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}
