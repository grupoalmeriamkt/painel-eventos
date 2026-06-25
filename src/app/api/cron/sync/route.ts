import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { runSync, processPendingWebhooks } from "@/lib/kommo/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Sincronização de segurança (horária) + reprocessamento de webhooks pendentes. */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const webhooks = await processPendingWebhooks(200);
    const sync = await runSync({ type: "incremental" });
    return NextResponse.json({ ok: true, webhooks, sync });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
