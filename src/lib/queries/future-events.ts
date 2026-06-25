import "server-only";
import { DateTime } from "luxon";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUSINESS_TZ } from "@/lib/time";
import type { StageCategory } from "@/lib/supabase/database.types";

export interface FutureEvent {
  id: string;
  kommo_lead_id: number;
  name: string | null;
  unit_name: string | null;
  event_date: string;
  daysUntil: number;
  guest_count: number | null;
  event_type: string | null;
  event_space: string | null;
  responsible: string | null;
  stage_category: StageCategory | null;
  current_value: number;
}

export type FutureWindow = "7" | "15" | "30" | "mes" | "2027" | "all";

export async function getFutureEvents(filter: {
  janela?: string;
  unidade?: string;
  semContrato?: boolean;
}): Promise<{ rows: FutureEvent[]; total: number; units: { slug: string; name: string }[] }> {
  const db = createAdminClient();
  const now = DateTime.now().setZone(BUSINESS_TZ);
  const today = now.toFormat("yyyy-MM-dd");

  const { data: units } = await db
    .from("units")
    .select("id,name,slug")
    .eq("is_active", true)
    .order("name");
  const unitList = units ?? [];
  const slugToId = new Map(unitList.map((u) => [u.slug, u.id]));
  const idToName = new Map(unitList.map((u) => [u.id, u.name]));

  let query = db
    .from("leads")
    .select(
      "id,kommo_lead_id,name,unit_id,event_date,guest_count,event_type,event_space,responsible_user_name,stage_category,current_value",
      { count: "exact" },
    )
    .is("deleted_at_kommo", null)
    .not("event_date", "is", null)
    .gte("event_date", today);

  const janela = filter.janela ?? "all";
  if (janela === "7" || janela === "15" || janela === "30") {
    query = query.lte("event_date", now.plus({ days: Number(janela) }).toFormat("yyyy-MM-dd"));
  } else if (janela === "mes") {
    query = query.lte("event_date", now.endOf("month").toFormat("yyyy-MM-dd"));
  } else if (janela === "2027") {
    query = query.gte("event_date", "2027-01-01").lte("event_date", "2027-12-31");
  }

  if (filter.unidade && filter.unidade !== "all") {
    if (filter.unidade === "none") query = query.is("unit_id", null);
    else {
      const uid = slugToId.get(filter.unidade);
      if (uid) query = query.eq("unit_id", uid);
    }
  }
  if (filter.semContrato) {
    query = query.not("stage_category", "in", "(contrato,fechado,concluido)");
  }

  const { data, count } = await query.order("event_date", { ascending: true }).limit(300);

  const rows: FutureEvent[] = (data ?? []).map((l) => ({
    id: l.id,
    kommo_lead_id: l.kommo_lead_id,
    name: l.name,
    unit_name: l.unit_id ? (idToName.get(l.unit_id) ?? null) : null,
    event_date: l.event_date!,
    daysUntil: Math.round(
      DateTime.fromISO(l.event_date!, { zone: BUSINESS_TZ }).diff(now.startOf("day"), "days").days,
    ),
    guest_count: l.guest_count,
    event_type: l.event_type,
    event_space: l.event_space,
    responsible: l.responsible_user_name,
    stage_category: l.stage_category,
    current_value: Number(l.current_value),
  }));

  return { rows, total: count ?? 0, units: unitList };
}
