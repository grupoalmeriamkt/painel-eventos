import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StageCategory } from "@/lib/supabase/database.types";

export interface LeadRow {
  id: string;
  kommo_lead_id: number;
  name: string | null;
  stage_category: StageCategory | null;
  current_value: number;
  event_date: string | null;
  unit_id: string | null;
  unit_name: string | null;
  lead_source: string | null;
  updated_at_kommo: string | null;
}

export interface LeadsFilter {
  unidade?: string; // 'all' | 'none' | <slug>
  categoria?: string; // StageCategory | 'all'
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface LeadsResult {
  rows: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  units: { id: string; name: string; slug: string }[];
}

export async function getLeads(filter: LeadsFilter): Promise<LeadsResult> {
  const db = createAdminClient();
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(200, filter.pageSize ?? 50);
  const from = (page - 1) * pageSize;

  const { data: units } = await db
    .from("units")
    .select("id,name,slug")
    .eq("is_active", true)
    .order("name");
  const unitList = units ?? [];
  const slugToId = new Map(unitList.map((u) => [u.slug, u.id]));

  let query = db
    .from("leads")
    .select(
      "id,kommo_lead_id,name,stage_category,current_value,event_date,unit_id,lead_source,updated_at_kommo",
      { count: "exact" },
    )
    .is("deleted_at_kommo", null);

  if (filter.unidade === "none") query = query.is("unit_id", null);
  else if (filter.unidade && filter.unidade !== "all") {
    const uid = slugToId.get(filter.unidade);
    if (uid) query = query.eq("unit_id", uid);
  }

  if (filter.categoria && filter.categoria !== "all") {
    query = query.eq("stage_category", filter.categoria as StageCategory);
  }
  if (filter.q && filter.q.trim()) {
    query = query.ilike("name", `%${filter.q.trim()}%`);
  }

  const { data, count } = await query
    .order("updated_at_kommo", { ascending: false, nullsFirst: false })
    .range(from, from + pageSize - 1);

  const unitName = new Map(unitList.map((u) => [u.id, u.name]));
  const rows: LeadRow[] = (data ?? []).map((l) => ({
    id: l.id,
    kommo_lead_id: l.kommo_lead_id,
    name: l.name,
    stage_category: l.stage_category,
    current_value: Number(l.current_value),
    event_date: l.event_date,
    unit_id: l.unit_id,
    unit_name: l.unit_id ? (unitName.get(l.unit_id) ?? null) : null,
    lead_source: l.lead_source,
    updated_at_kommo: l.updated_at_kommo,
  }));

  return { rows, total: count ?? 0, page, pageSize, units: unitList };
}
