import { after, NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { payloadHash, verifyWebhookSecret } from "@/lib/kommo/webhook";
import { processPendingWebhooks } from "@/lib/kommo/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000; // 1MB

/**
 * Webhook do Kommo. Segurança: segredo no caminho da rota + HTTPS (o Kommo não
 * assina). Persiste o evento bruto imediatamente, responde 200 rápido (<2s) e
 * processa de forma assíncrona e idempotente.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ secret: string }> },
) {
  const { secret } = await params;
  const env = serverEnv();

  if (!env.KOMMO_WEBHOOK_SECRET || !verifyWebhookSecret(secret, env.KOMMO_WEBHOOK_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "payload too large" }, { status: 413 });
  }

  const db = createAdminClient();
  const hash = payloadHash(raw);

  // idempotência por hash (uq_webhook_payload_hash)
  const { error } = await db.from("crm_webhook_events").insert({
    event_key: hash.slice(0, 16),
    entity_type: "lead",
    payload: { raw },
    payload_hash: hash,
    status: "received",
  });

  // duplicado → já recebido; responde sucesso sem reprocessar
  const isDuplicate = error?.code === "23505";

  if (!isDuplicate) {
    after(async () => {
      try {
        await processPendingWebhooks(50);
      } catch {
        // erro é registrado em crm_webhook_events.last_error; cron reprocessa
      }
    });
  }

  return NextResponse.json({ ok: true });
}
