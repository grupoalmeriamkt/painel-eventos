import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Cliente administrativo (service role). BYPASSA RLS — use SOMENTE em:
 * jobs/cron, processamento de webhook, backfill e sincronização.
 * NUNCA importar em código de cliente. Escopo no schema `eventos`.
 */
export function createAdminClient() {
  const env = serverEnv();
  return createSupabaseClient<Database, "eventos">(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: "eventos" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
