import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { generateMonthlySummaries } from "@/lib/jobs/monthly-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Consolidação mensal (rodar após o snapshot do último dia do mês). */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const result = await generateMonthlySummaries();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
