-- Migration 002: Criar tabela de logs de instâncias
CREATE TABLE IF NOT EXISTS public.instance_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.instances (id) ON DELETE CASCADE,
  event       TEXT NOT NULL,
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para busca de logs por instância
CREATE INDEX IF NOT EXISTS idx_instance_logs_instance_id
  ON public.instance_logs (instance_id);

-- Índice para busca de logs por evento
CREATE INDEX IF NOT EXISTS idx_instance_logs_event
  ON public.instance_logs (event);

-- Índice para ordenação cronológica
CREATE INDEX IF NOT EXISTS idx_instance_logs_created_at
  ON public.instance_logs (created_at DESC);

-- RLS
ALTER TABLE public.instance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.instance_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_select" ON public.instance_logs
  FOR SELECT
  TO anon
  USING (true);
