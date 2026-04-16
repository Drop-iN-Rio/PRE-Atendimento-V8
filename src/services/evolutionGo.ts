interface CreateInstancePayload {
  instanceName: string;
  token?: string;
}

interface EvolutionResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

export async function createInstance(
  instanceName: string,
  evolutionUrl: string,
  apiKey: string,
  token?: string,
): Promise<EvolutionResponse> {
  const payload: CreateInstancePayload = { instanceName };
  if (token) payload.token = token;

  const baseUrl = evolutionUrl.replace(/\/$/, '');

  const response = await fetch(`${baseUrl}/instance/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': apiKey,
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
