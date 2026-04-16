import dotenv from 'dotenv';
dotenv.config();

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://api.evogo.com.br';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

interface CreateInstancePayload {
  instanceName: string;
}

interface EvolutionResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

export async function createInstance(instanceName: string): Promise<EvolutionResponse> {
  const payload: CreateInstancePayload = { instanceName };

  const response = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': EVOLUTION_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      success: false,
      error: (data as { message?: string }).message || `Erro HTTP ${response.status}`,
    };
  }

  return {
    success: true,
    data,
  };
}
