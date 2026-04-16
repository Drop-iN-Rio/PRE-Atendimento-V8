import { supabaseAdmin } from '../services/supabase.js';

const migrations: { name: string; sql: string }[] = [
  {
    name: '001_create_enum_instance_status',
    sql: `
      DO $$ BEGIN
        CREATE TYPE public.instance_status AS ENUM ('creating', 'active', 'inactive', 'error');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `,
  },
  {
    name: '002_create_instances_table',
    sql: `
      CREATE TABLE IF NOT EXISTS public.instances (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        instance_name TEXT NOT NULL UNIQUE,
        status        TEXT NOT NULL DEFAULT 'creating',
        metadata      JSONB,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  },
  {
    name: '003_create_instance_logs_table',
    sql: `
      CREATE TABLE IF NOT EXISTS public.instance_logs (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        instance_id UUID NOT NULL REFERENCES public.instances (id) ON DELETE CASCADE,
        event       TEXT NOT NULL,
        payload     JSONB,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  },
  {
    name: '004_create_migrations_table',
    sql: `
      CREATE TABLE IF NOT EXISTS public._migrations (
        id         SERIAL PRIMARY KEY,
        name       TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  },
  {
    name: '005_create_updated_at_trigger',
    sql: `
      CREATE OR REPLACE FUNCTION public.set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_instances_updated_at ON public.instances;
      CREATE TRIGGER trg_instances_updated_at
        BEFORE UPDATE ON public.instances
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    `,
  },
  {
    name: '006_enable_rls',
    sql: `
      ALTER TABLE public.instances ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.instance_logs ENABLE ROW LEVEL SECURITY;

      DO $$ BEGIN
        CREATE POLICY "service_role_all_instances" ON public.instances
          FOR ALL TO service_role USING (true) WITH CHECK (true);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE POLICY "anon_select_instances" ON public.instances
          FOR SELECT TO anon USING (true);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE POLICY "service_role_all_logs" ON public.instance_logs
          FOR ALL TO service_role USING (true) WITH CHECK (true);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE POLICY "anon_select_logs" ON public.instance_logs
          FOR SELECT TO anon USING (true);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `,
  },
];

export async function runMigrations(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_DB_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    console.warn('⚠️  Credenciais Supabase não configuradas — pulando migrations.');
    return;
  }

  console.log('🔄 Aplicando migrations via Supabase RPC...');

  for (const migration of migrations) {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ sql: migration.sql }),
      });

      if (!response.ok) {
        const err = await response.text();
        if (!err.includes('already exists') && !err.includes('duplicate')) {
          console.warn(`⚠️  Migration "${migration.name}" retornou aviso:`, err.substring(0, 200));
        } else {
          console.log(`⏭️  Migration "${migration.name}" já aplicada.`);
          continue;
        }
      }

      console.log(`✅ Migration aplicada: ${migration.name}`);
    } catch (err) {
      console.warn(`⚠️  Falha na migration "${migration.name}":`, err);
    }
  }

  console.log('🎉 Processo de migrations concluído.');
}
