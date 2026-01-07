/**
 * Supabase Client Configuration
 * Replaces the raw PostgreSQL pool with Supabase's JS client.
 *
 * Two clients are exported:
 *  - supabase      → uses the anon/service key for normal API calls
 *  - supabaseAdmin → uses the service_role key (bypasses RLS, for server-only ops)
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌  Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

/** Standard client — respects Row Level Security */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

/**
 * Admin/service client — bypasses RLS.
 * Only use server-side. Never expose the service_role key to the browser.
 */
export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

/**
 * Convenience: run a raw SQL query via the Supabase REST RPC
 * (only works for functions you expose; prefer the fluent API below)
 */
export const query = async (sql, params = []) => {
  const { data, error } = await supabaseAdmin.rpc('exec_sql', { sql, params });
  if (error) throw new Error(error.message);
  return { rows: data };
};

export default supabaseAdmin;
