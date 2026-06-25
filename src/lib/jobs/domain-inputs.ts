import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LeadMeta, StageTransition } from "@/domain/types";

type Admin = ReturnType<typeof createAdminClient>;

/** Carrega leads (meta) e transições para alimentar a camada de domínio. */
export async function loadDomainInputs(
  db: Admin = createAdminClient(),
): Promise<{ leads: LeadMeta[]; transitions: StageTransition[] }> {
  const { data: leadRows } = await db
    .from("leads")
    .select(
      "id, stage_category, unit_id, current_value, event_date, lead_source, responsible_user_id, created_at_kommo, deleted_at_kommo",
    );
  const leads: LeadMeta[] = (leadRows ?? []).map((l) => ({
    leadId: l.id,
    currentCategory: l.stage_category,
    currentUnitId: l.unit_id,
    currentValue: Number(l.current_value),
    currentEventDate: l.event_date,
    leadSource: l.lead_source,
    responsibleUserId: l.responsible_user_id,
    createdAtKommo: l.created_at_kommo,
    deletedAtKommo: l.deleted_at_kommo,
  }));

  const { data: histRows } = await db
    .from("lead_stage_history")
    .select(
      "lead_id, from_category, to_category, changed_at, lead_value_at_change, unit_id_at_change, event_date_at_change",
    );
  const transitions: StageTransition[] = (histRows ?? [])
    .filter((h) => h.to_category !== null)
    .map((h) => ({
      leadId: h.lead_id,
      fromCategory: h.from_category,
      toCategory: h.to_category!,
      changedAt: h.changed_at,
      value: Number(h.lead_value_at_change ?? 0),
      unitId: h.unit_id_at_change,
      eventDate: h.event_date_at_change,
    }));

  return { leads, transitions };
}
