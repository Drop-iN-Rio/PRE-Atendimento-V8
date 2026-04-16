-- Migration 002: Criar tabela de logs de instâncias
-- Execute este script no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS public.instance_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.instances (id) ON DELETE CASCADE,
  event       TEXT NOT NULL,
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instance_logs_instance_id ON public.instance_logs (instance_id);
CREATE INDEX IF NOT EXISTS idx_instance_logs_event ON public.instance_logs (event);
CREATE INDEX IF NOT EXISTS idx_instance_logs_created_at ON public.instance_logs (created_at DESC);

-- RLS
ALTER TABLE public.instance_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_all_logs" ON public.instance_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon_select_logs" ON public.instance_logs
    FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
