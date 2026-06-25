/**
 * Tipos do schema `eventos`.
 *
 * Mantido à mão porque o gerador do Supabase só emite o schema exposto à API
 * (public). Atualize este arquivo junto com as migrations em supabase/migrations.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ── Enums ────────────────────────────────────────────────────────────────────
export type StageCategory =
  | "lead"
  | "qualificacao"
  | "atendimento"
  | "proposta"
  | "negociacao"
  | "contrato"
  | "fechado"
  | "concluido"
  | "reserva_maior"
  | "perdido"
  | "desqualificado";

export type UnitResolutionMethod =
  | "manual_override"
  | "custom_field"
  | "tag"
  | "pipeline"
  | "text_rule"
  | "unresolved"
  | "conflict";

export type UnitSourceType =
  | "manual_override"
  | "custom_field"
  | "tag"
  | "pipeline"
  | "text_rule";

export type FinancialRecordType =
  | "proposal"
  | "contract"
  | "invoice"
  | "payment"
  | "refund"
  | "adjustment";

export type AppRole = "admin" | "manager" | "sales" | "viewer";
export type RunStatus = "running" | "success" | "partial" | "failed";
export type WebhookStatus =
  | "received"
  | "processing"
  | "processed"
  | "failed"
  | "skipped";
export type IssueSeverity = "info" | "warning" | "critical";
export type IssueStatus = "open" | "acknowledged" | "resolved" | "ignored";

// ── Row interfaces ───────────────────────────────────────────────────────────
export type Unit = {
  id: string;
  name: string;
  slug: string;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CrmConnection = {
  id: string;
  provider: string;
  account_name: string | null;
  subdomain: string | null;
  is_active: boolean;
  last_successful_sync_at: string | null;
  last_full_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export type KommoPipeline = {
  id: string;
  connection_id: string;
  kommo_pipeline_id: number;
  name: string;
  is_active: boolean;
  raw_payload: Json | null;
  created_at: string;
  updated_at: string;
}

export type KommoStage = {
  id: string;
  pipeline_id: string;
  kommo_stage_id: number;
  name: string;
  sort_order: number;
  is_system_stage: boolean;
  raw_payload: Json | null;
  created_at: string;
  updated_at: string;
}

export type StageCategoryMapping = {
  id: string;
  stage_id: string;
  internal_category: StageCategory;
  is_active: boolean;
  include_in_total_pipeline: boolean;
  include_in_active_pipeline: boolean;
  created_at: string;
  updated_at: string;
}

export type UnitMappingRule = {
  id: string;
  priority: number;
  source_type: UnitSourceType;
  source_field_id: number | null;
  source_field_name: string | null;
  match_operator: string;
  match_value: string;
  unit_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CustomFieldMapping = {
  id: string;
  entity_type: string;
  semantic_key: string;
  kommo_field_id: number | null;
  kommo_field_name: string | null;
  value_type: string;
  is_required_for_metric: boolean;
  created_at: string;
  updated_at: string;
}

export type AppConfigRow = {
  key: string;
  value: Json;
  description: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type UserProfile = {
  user_id: string;
  full_name: string | null;
  role: AppRole;
  allowed_units: string[];
  kommo_user_id: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type Lead = {
  id: string;
  connection_id: string | null;
  kommo_lead_id: number;
  name: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  stage_category: StageCategory | null;
  unit_id: string | null;
  unit_resolution_method: UnitResolutionMethod;
  unit_resolution_confidence: number | null;
  responsible_user_id: number | null;
  responsible_user_name: string | null;
  current_value: number;
  currency: string;
  created_at_kommo: string | null;
  updated_at_kommo: string | null;
  closed_at_kommo: string | null;
  deleted_at_kommo: string | null;
  last_stage_changed_at: string | null;
  event_date: string | null;
  event_start_time: string | null;
  event_end_time: string | null;
  guest_count: number | null;
  event_type: string | null;
  event_space: string | null;
  lead_source: string | null;
  loss_reason: string | null;
  custom_fields_raw: Json | null;
  raw_payload: Json | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export type LeadStageHistory = {
  id: string;
  lead_id: string;
  kommo_lead_id: number;
  from_pipeline_id: string | null;
  from_stage_id: string | null;
  from_category: StageCategory | null;
  to_pipeline_id: string | null;
  to_stage_id: string | null;
  to_category: StageCategory | null;
  changed_at: string;
  lead_value_at_change: number | null;
  event_date_at_change: string | null;
  unit_id_at_change: string | null;
  source: string;
  webhook_event_id: string | null;
  raw_payload: Json | null;
  created_at: string;
}

export type LeadFinancialRecord = {
  id: string;
  lead_id: string;
  record_type: FinancialRecordType;
  amount: number;
  currency: string;
  record_date: string | null;
  reference_number: string | null;
  status: string | null;
  source: string;
  notes: string | null;
  raw_payload: Json | null;
  created_at: string;
  updated_at: string;
}

export type DailyPipelineSnapshot = {
  id: string;
  snapshot_date: string;
  unit_id: string;
  as_of_timestamp: string;
  new_leads_count: number;
  new_leads_value: number;
  leads_in_service_count: number;
  priced_leads_in_service_count: number;
  priced_leads_in_service_value: number;
  proposals_sent_count: number;
  proposals_sent_value: number;
  proposals_2026_value: number;
  proposals_2027_value: number;
  negotiation_value: number;
  contract_value: number;
  closed_value: number;
  completed_value: number;
  reserve_value: number;
  lost_count: number;
  lost_value: number;
  total_pipeline_value: number;
  active_pipeline_value: number;
  event_year_breakdown: Json;
  generated_summary: string | null;
  manual_notes: string | null;
  calculation_version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type DailyLeadSource = {
  id: string;
  snapshot_date: string;
  unit_id: string;
  source_name: string;
  lead_count: number;
  lead_value: number;
  created_at: string;
  updated_at: string;
}

export type MonthlyPipelineSummary = {
  id: string;
  month_reference: string;
  unit_id: string;
  new_leads_count: number;
  new_leads_value: number;
  proposals_sent_count: number;
  proposals_sent_value: number;
  proposals_sent_by_event_year: Json;
  entered_negotiation_count: number;
  entered_negotiation_value: number;
  entered_contract_count: number;
  entered_contract_value: number;
  entered_closed_count: number;
  entered_closed_value: number;
  entered_completed_count: number;
  entered_completed_value: number;
  lost_count: number;
  lost_value: number;
  end_of_month_negotiation_value: number;
  end_of_month_contract_value: number;
  end_of_month_closed_value: number;
  end_of_month_completed_value: number;
  end_of_month_reserve_value: number;
  end_of_month_active_pipeline_value: number;
  end_of_month_total_pipeline_value: number;
  calculation_version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CrmWebhookEvent = {
  id: string;
  connection_id: string | null;
  event_key: string | null;
  entity_type: string | null;
  entity_external_id: number | null;
  payload: Json;
  payload_hash: string;
  received_at: string;
  status: WebhookStatus;
  attempt_count: number;
  processing_started_at: string | null;
  processed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type SyncRun = {
  id: string;
  connection_id: string | null;
  sync_type: string;
  started_at: string;
  finished_at: string | null;
  status: RunStatus;
  cursor_before: string | null;
  cursor_after: string | null;
  records_read: number;
  records_created: number;
  records_updated: number;
  records_failed: number;
  error_summary: string | null;
  metadata: Json | null;
  created_at: string;
}

export type DataQualityIssue = {
  id: string;
  lead_id: string | null;
  issue_type: string;
  severity: IssueSeverity;
  status: IssueStatus;
  message: string | null;
  metadata: Json | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AuditLog = {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before_data: Json | null;
  after_data: Json | null;
  metadata: Json | null;
  created_at: string;
};

export type ManualOverride = {
  id: string;
  entity_type: string;
  entity_id: string;
  field_name: string;
  old_value: Json | null;
  new_value: Json | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
};

export type ReconciliationRun = {
  id: string;
  run_date: string;
  scope: string;
  status: RunStatus;
  expected_count: number | null;
  actual_count: number | null;
  difference_count: number | null;
  notes: string | null;
  created_at: string;
};

export type LegacyImportRun = {
  id: string;
  file_name: string | null;
  uploaded_by: string | null;
  status: RunStatus;
  summary: Json | null;
  created_at: string;
  completed_at: string | null;
};

export type ImportedLegacySnapshot = {
  id: string;
  import_run_id: string | null;
  unit_id: string | null;
  snapshot_date: string | null;
  source_sheet: string | null;
  raw_row: Json | null;
  new_leads_count: number | null;
  proposal_2026_value: number | null;
  proposal_2027_value: number | null;
  negotiation_value: number | null;
  contract_value: number | null;
  closed_value: number | null;
  completed_value: number | null;
  total_pipeline_value: number | null;
  observations: string | null;
  created_at: string;
};

type Tbl<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  eventos: {
    Tables: {
      units: Tbl<Unit>;
      crm_connections: Tbl<CrmConnection>;
      kommo_pipelines: Tbl<KommoPipeline>;
      kommo_stages: Tbl<KommoStage>;
      stage_category_mappings: Tbl<StageCategoryMapping>;
      unit_mapping_rules: Tbl<UnitMappingRule>;
      custom_field_mappings: Tbl<CustomFieldMapping>;
      app_config: Tbl<AppConfigRow>;
      user_profiles: Tbl<UserProfile>;
      leads: Tbl<Lead>;
      lead_stage_history: Tbl<LeadStageHistory>;
      lead_financial_records: Tbl<LeadFinancialRecord>;
      daily_pipeline_snapshots: Tbl<DailyPipelineSnapshot>;
      daily_lead_sources: Tbl<DailyLeadSource>;
      monthly_pipeline_summaries: Tbl<MonthlyPipelineSummary>;
      crm_webhook_events: Tbl<CrmWebhookEvent>;
      sync_runs: Tbl<SyncRun>;
      data_quality_issues: Tbl<DataQualityIssue>;
      audit_logs: Tbl<AuditLog>;
      manual_overrides: Tbl<ManualOverride>;
      reconciliation_runs: Tbl<ReconciliationRun>;
      legacy_import_runs: Tbl<LegacyImportRun>;
      imported_legacy_snapshots: Tbl<ImportedLegacySnapshot>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      stage_category: StageCategory;
      app_role: AppRole;
    };
    CompositeTypes: Record<string, never>;
  };
};
