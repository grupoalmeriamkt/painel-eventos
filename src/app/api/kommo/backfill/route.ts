import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";
import { KommoClient } from "@/lib/kommo/client";
import { runSync, syncStructure } from "@/lib/kommo/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Backfill inicial: sincroniza estrutura (pipelines/stages) e todos os leads.
 * Protegido por CRON_SECRET (Authorization: Bearer ...). Idempotente via upsert.
 * Após mapear etapas→categorias e campos semânticos no onboarding, rode de novo
 * para preencher categorias/valores corretamente.
 */
export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const db = createAdminClient();
    const client = new KommoClient();

    const { data: conn } = await db
      .from("crm_connections")
      .select("id")
      .eq("provider", "kommo")
      .limit(1)
      .single();

    await syncStructure(db, client, conn!.id);
    const stats = await runSync({ type: "backfill" });
    await db
      .from("crm_connections")
      .update({ last_full_sync_at: new Date().toISOString() })
      .eq("provider", "kommo");

    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
