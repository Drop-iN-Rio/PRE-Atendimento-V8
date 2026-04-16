-- Migration 001: Criar tabela de instâncias
-- Enum de status possíveis da instância
CREATE TYPE IF NOT EXISTS public.instance_status AS ENUM (
  'creating',
  'active',
  'inactive',
  'error'
);

-- Tabela principal de instâncias Evolution GO
CREATE TABLE IF NOT EXISTS public.instances (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name TEXT NOT NULL UNIQUE,
  status       public.instance_status NOT NULL DEFAULT 'creating',
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para busca rápida por nome
CREATE INDEX IF NOT EXISTS idx_instances_instance_name
  ON public.instances (instance_name);

-- Índice para filtro por status
CREATE INDEX IF NOT EXISTS idx_instances_status
  ON public.instances (status);

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger de updated_at na tabela instances
DROP TRIGGER IF EXISTS trg_instances_updated_at ON public.instances;
CREATE TRIGGER trg_instances_updated_at
  BEFORE UPDATE ON public.instances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS (Row Level Security)
ALTER TABLE public.instances ENABLE ROW LEVEL SECURITY;

-- Política: service role tem acesso total
CREATE POLICY "service_role_all" ON public.instances
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Política: anon pode apenas ler
CREATE POLICY "anon_select" ON public.instances
  FOR SELECT
  TO anon
  USING (true);
