import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.js';

const supabaseUrl = process.env.SUPABASE_DB_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl) {
  console.warn('⚠️  SUPABASE_DB_URL não configurada');
}

export const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export const supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

export { supabaseUrl };
