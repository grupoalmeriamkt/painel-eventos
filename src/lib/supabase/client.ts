import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

const SCHEMA = "eventos";

/**
 * Cliente Supabase para o browser. Usa a anon key e respeita RLS.
 * Escopo no schema dedicado `eventos`.
 */
export function createClient() {
  const env = getPublicEnv();
  return createBrowserClient<Database, "eventos">(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { db: { schema: SCHEMA } },
  );
}
