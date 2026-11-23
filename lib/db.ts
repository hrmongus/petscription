import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/*
 * Supabase pre server (vzor reference/fanpagekit/lib/db.ts). Používa service role kľúč, ktorý obchádza RLS → nikdy
 * neimportovať z klientskeho kódu. Tabuľky nemajú pre anon/authenticated žiadne policies ani granty
 * (supabase/migrations), takže všetky dotazy idú cez tento klient.
 */
let client: SupabaseClient<Database> | null = null;

export function db(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('[db] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nie sú nastavené');
  client ??= createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
