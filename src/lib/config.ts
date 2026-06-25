import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_ACTIVE_PIPELINE,
  DEFAULT_TOTAL_PIPELINE,
} from "@/domain/categories";
import type { CalcConfig } from "@/domain/types";
import type { StageCategory } from "@/lib/supabase/database.types";
import type { FieldMap, SemanticKey } from "@/lib/kommo/mappers";

type Admin = ReturnType<typeof createAdminClient>;

/** Lê uma chave de app_config como JSON tipado, com fallback. */
async function getConfigValue<T>(db: Admin, key: string, fallback: T): Promise<T> {
  const { data } = await db.from("app_config").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

/** Configuração de cálculo (fórmulas) a partir de app_config. */
export async function loadCalcConfig(db: Admin = createAdminClient()): Promise<CalcConfig> {
  const [total, active, methodology] = await Promise.all([
    getConfigValue<StageCategory[]>(
      db,
      "total_pipeline_categories",
      [...DEFAULT_TOTAL_PIPELINE],
    ),
    getConfigValue<StageCategory[]>(
      db,
      "active_pipeline_categories",
      [...DEFAULT_ACTIVE_PIPELINE],
    ),
    getConfigValue<"at_stage_entry" | "current">(
      db,
      "historical_value_methodology",
      "at_stage_entry",
    ),
  ]);
  return {
    totalPipelineCategories: total,
    activePipelineCategories: active,
    historicalValueMethodology: methodology,
  };
}

export interface BillingCriteria {
  method: "invoiced_value_gt_zero" | "financial_record" | "payment_status";
  invoice_status_values: string[];
  payment_status_values: string[];
}

export async function loadBillingCriteria(db: Admin = createAdminClient()): Promise<BillingCriteria> {
  return getConfigValue<BillingCriteria>(db, "billing_criteria", {
    method: "invoiced_value_gt_zero",
    invoice_status_values: ["issued", "paid"],
    payment_status_values: ["paid"],
  });
}

export interface AlertThresholds {
  stale_high_value_amount: number;
  stale_high_value_days: number;
  event_no_contract_days: number;
  proposal_no_return_days: number;
  negotiation_stale_days: number;
}

export async function loadAlertThresholds(db: Admin = createAdminClient()): Promise<AlertThresholds> {
  return getConfigValue<AlertThresholds>(db, "alert_thresholds", {
    stale_high_value_amount: 20000,
    stale_high_value_days: 5,
    event_no_contract_days: 15,
    proposal_no_return_days: 3,
    negotiation_stale_days: 10,
  });
}

/** kommo_stage_id -> internal_category (apenas mapeamentos ativos). */
export async function loadStageCategoryMap(
  db: Admin = createAdminClient(),
): Promise<Map<number, StageCategory>> {
  const [{ data: mappings }, { data: stages }] = await Promise.all([
    db.from("stage_category_mappings").select("stage_id, internal_category").eq("is_active", true),
    db.from("kommo_stages").select("id, kommo_stage_id"),
  ]);

  const stageIdToKommo = new Map<string, number>();
  for (const s of stages ?? []) stageIdToKommo.set(s.id, s.kommo_stage_id);

  const map = new Map<number, StageCategory>();
  for (const m of mappings ?? []) {
    const kommoStageId = stageIdToKommo.get(m.stage_id);
    if (kommoStageId !== undefined) map.set(kommoStageId, m.internal_category);
  }
  return map;
}

/** semantic_key -> kommo_field_id (apenas os configurados). */
export async function loadFieldMap(db: Admin = createAdminClient()): Promise<FieldMap> {
  const { data } = await db
    .from("custom_field_mappings")
    .select("semantic_key, kommo_field_id")
    .eq("entity_type", "lead")
    .not("kommo_field_id", "is", null);

  const map: FieldMap = new Map();
  for (const row of data ?? []) {
    if (row.kommo_field_id != null) {
      map.set(row.semantic_key as SemanticKey, row.kommo_field_id);
    }
  }
  return map;
}
