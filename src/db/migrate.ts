import pg from 'pg';

const SQL_MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: '001_create_migrations_table',
    sql: `
      CREATE TABLE IF NOT EXISTS public._migrations (
        id         SERIAL PRIMARY KEY,
        name       TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
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

      CREATE INDEX IF NOT EXISTS idx_instances_instance_name ON public.instances (instance_name);
      CREATE INDEX IF NOT EXISTS idx_instances_status ON public.instances (status);
    `,
  },
  {
    name: '003_create_updated_at_trigger',
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
    name: '004_create_instance_logs_table',
    sql: `
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
    `,
  },
  {
    name: '005b_create_users_table',
    sql: `
      CREATE TABLE IF NOT EXISTS public.users (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name          TEXT NOT NULL,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'user',
        active        BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);
    `,
  },
  {
    name: '005_enable_rls',
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
  const connectionString = process.env.SUPABASE_POSTGRES_URL;

  if (!connectionString) {
    console.warn('⚠️  SUPABASE_POSTGRES_URL não definida — pulando migrations.');
    return;
  }

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('✅ Conectado ao Supabase via pooler');

    await client.query(SQL_MIGRATIONS[0].sql);

    const { rows } = await client.query<{ name: string }>(
      'SELECT name FROM public._migrations'
    );
    const applied = new Set(rows.map((r) => r.name));

    for (const migration of SQL_MIGRATIONS) {
      if (applied.has(migration.name)) {
        console.log(`⏭️  Já aplicada: ${migration.name}`);
        continue;
      }
      console.log(`🔄 Aplicando: ${migration.name}`);
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO public._migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
        [migration.name]
      );
      console.log(`✅ Concluída: ${migration.name}`);
    }

    console.log('🎉 Todas as migrations aplicadas com sucesso.');
  } catch (err) {
    console.error('❌ Erro nas migrations:', err);
    throw err;
  } finally {
    await client.end();
  }
}
