import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { generateDailySnapshots } from "@/lib/jobs/daily-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Snapshot diário (rodar após 00:05 BRT): fecha o dia anterior por unidade. */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const result = await generateDailySnapshots();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
