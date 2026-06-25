import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadCalcConfig,
  loadBillingCriteria,
  loadAlertThresholds,
  type BillingCriteria,
  type AlertThresholds,
} from "@/lib/config";
import type { CalcConfig } from "@/domain/types";

export interface AppConfigEntry {
  key: string;
  value: unknown;
  description: string | null;
}

export interface FieldMappingEntry {
  semantic_key: string;
  kommo_field_id: number | null;
  kommo_field_name: string | null;
  value_type: string;
}

export interface StageMappingEntry {
  stage_name: string;
  kommo_stage_id: number | null;
  internal_category: string;
  is_active: boolean;
}

export interface UnitRuleEntry {
  priority: number;
  source_type: string;
  match_operator: string;
  match_value: string;
  unit_name: string;
  is_active: boolean;
}

export interface ConfigView {
  calcConfig: CalcConfig;
  billingCriteria: BillingCriteria;
  alertThresholds: AlertThresholds;
  appConfig: AppConfigEntry[];
  fieldMappings: FieldMappingEntry[];
  stageMappings: StageMappingEntry[];
  unitRules: UnitRuleEntry[];
}

export async function getConfigView(): Promise<ConfigView> {
  const db = createAdminClient();

  const [
    calcConfig,
    billingCriteria,
    alertThresholds,
    appConfigRes,
    fieldRes,
    stageMapRes,
    stagesRes,
    unitRuleRes,
    unitsRes,
  ] = await Promise.all([
    loadCalcConfig(db),
    loadBillingCriteria(db),
    loadAlertThresholds(db),
    db.from("app_config").select("key,value,description").order("key"),
    db
      .from("custom_field_mappings")
      .select("semantic_key,kommo_field_id,kommo_field_name,value_type")
      .order("semantic_key"),
    db
      .from("stage_category_mappings")
      .select("stage_id,internal_category,is_active"),
    db.from("kommo_stages").select("id,kommo_stage_id,name,sort_order"),
    db
      .from("unit_mapping_rules")
      .select("priority,source_type,match_operator,match_value,unit_id,is_active")
      .order("priority"),
    db.from("units").select("id,name"),
  ]);

  // Cruzamento stage -> nome em JS (sem select aninhado do PostgREST).
  const stageById = new Map(
    (stagesRes.data ?? []).map((s) => [s.id, s] as const),
  );
  const stageMappings: StageMappingEntry[] = (stageMapRes.data ?? [])
    .map((m) => {
      const stage = stageById.get(m.stage_id);
      return {
        stage_name: stage?.name ?? "(etapa desconhecida)",
        kommo_stage_id: stage?.kommo_stage_id ?? null,
        internal_category: m.internal_category,
        is_active: m.is_active,
        sort_order: stage?.sort_order ?? 9999,
      };
    })
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(({ sort_order, ...rest }) => {
      void sort_order;
      return rest;
    });

  const unitById = new Map((unitsRes.data ?? []).map((u) => [u.id, u.name] as const));
  const unitRules: UnitRuleEntry[] = (unitRuleRes.data ?? []).map((r) => ({
    priority: r.priority,
    source_type: r.source_type,
    match_operator: r.match_operator,
    match_value: r.match_value,
    unit_name: unitById.get(r.unit_id) ?? "—",
    is_active: r.is_active,
  }));

  return {
    calcConfig,
    billingCriteria,
    alertThresholds,
    appConfig: appConfigRes.data ?? [],
    fieldMappings: fieldRes.data ?? [],
    stageMappings,
    unitRules,
  };
}
