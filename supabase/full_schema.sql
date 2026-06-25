-- ============================================================================
-- PAINEL DE EVENTOS — schema completo (schema: eventos)
-- Rodar no SQL Editor do projeto smmofdjbsicjezjvpjai.
-- Gerado de supabase/migrations/0001..0009 (idempotente).
-- ============================================================================

-- ===== 0001_schema_and_enums.sql =====
-- ============================================================================
-- 0001 — Schema dedicado, extensões, enums e helpers
-- Painel de Inteligência Comercial de Eventos
--
-- Todo o projeto vive no schema `eventos` para não colidir com os outros
-- apps que compartilham este banco (public.houses, public.transactions, etc).
-- Valores monetários: numeric(14,2). Timestamps: timestamptz (UTC).
-- ============================================================================

create schema if not exists eventos;

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";    -- busca textual leve (sem fuzzy agressivo)

-- ── Enums ───────────────────────────────────────────────────────────────────

-- Categorias internas de etapa (estáveis no código; nomes de etapa do Kommo
-- mudam, categorias não).
do $$ begin
  create type eventos.stage_category as enum (
    'lead',
    'qualificacao',
    'atendimento',
    'proposta',
    'negociacao',
    'contrato',
    'fechado',
    'concluido',
    'reserva_maior',
    'perdido',
    'desqualificado'
  );
exception when duplicate_object then null; end $$;

-- Como a unidade de um lead foi resolvida (prioridade descendente).
do $$ begin
  create type eventos.unit_resolution_method as enum (
    'manual_override',
    'custom_field',
    'tag',
    'pipeline',
    'text_rule',
    'unresolved',
    'conflict'
  );
exception when duplicate_object then null; end $$;

-- Fonte de uma regra de unidade.
do $$ begin
  create type eventos.unit_source_type as enum (
    'manual_override',
    'custom_field',
    'tag',
    'pipeline',
    'text_rule'
  );
exception when duplicate_object then null; end $$;

-- Tipos de registro financeiro.
do $$ begin
  create type eventos.financial_record_type as enum (
    'proposal',
    'contract',
    'invoice',
    'payment',
    'refund',
    'adjustment'
  );
exception when duplicate_object then null; end $$;

-- Papéis de acesso.
do $$ begin
  create type eventos.app_role as enum ('admin', 'manager', 'sales', 'viewer');
exception when duplicate_object then null; end $$;

-- Status de execução de sync.
do $$ begin
  create type eventos.run_status as enum ('running', 'success', 'partial', 'failed');
exception when duplicate_object then null; end $$;

-- Status de processamento de webhook.
do $$ begin
  create type eventos.webhook_status as enum ('received', 'processing', 'processed', 'failed', 'skipped');
exception when duplicate_object then null; end $$;

-- Severidade/estado de problemas de qualidade de dados.
do $$ begin
  create type eventos.issue_severity as enum ('info', 'warning', 'critical');
exception when duplicate_object then null; end $$;

do $$ begin
  create type eventos.issue_status as enum ('open', 'acknowledged', 'resolved', 'ignored');
exception when duplicate_object then null; end $$;

-- ── Helper: trigger de updated_at ────────────────────────────────────────────
create or replace function eventos.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on schema eventos is 'Painel de Inteligência Comercial de Eventos (Almeria, Izzi Wine Garden, Matri).';

-- ===== 0002_config_tables.sql =====
-- ============================================================================
-- 0002 — Tabelas de configuração e catálogo
-- units, conexão CRM, pipelines/stages do Kommo, mapeamentos, regras de unidade,
-- campos personalizados, configuração da app e perfis de usuário (RBAC).
-- ============================================================================

-- ── 1. units ────────────────────────────────────────────────────────────────
create table if not exists eventos.units (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  color       text not null default '#64748b',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_units_updated before update on eventos.units
  for each row execute function eventos.set_updated_at();

-- ── 2. crm_connections ──────────────────────────────────────────────────────
-- NUNCA armazenar token aqui. Apenas metadados da conexão.
create table if not exists eventos.crm_connections (
  id                       uuid primary key default gen_random_uuid(),
  provider                 text not null default 'kommo',
  account_name             text,
  subdomain                text,
  is_active                boolean not null default true,
  last_successful_sync_at  timestamptz,
  last_full_sync_at        timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create trigger trg_crm_connections_updated before update on eventos.crm_connections
  for each row execute function eventos.set_updated_at();

-- ── 3. kommo_pipelines ──────────────────────────────────────────────────────
create table if not exists eventos.kommo_pipelines (
  id                uuid primary key default gen_random_uuid(),
  connection_id     uuid not null references eventos.crm_connections(id) on delete cascade,
  kommo_pipeline_id bigint not null,
  name              text not null,
  is_active         boolean not null default true,
  raw_payload       jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (connection_id, kommo_pipeline_id)
);
create trigger trg_kommo_pipelines_updated before update on eventos.kommo_pipelines
  for each row execute function eventos.set_updated_at();

-- ── 4. kommo_stages ─────────────────────────────────────────────────────────
create table if not exists eventos.kommo_stages (
  id              uuid primary key default gen_random_uuid(),
  pipeline_id     uuid not null references eventos.kommo_pipelines(id) on delete cascade,
  kommo_stage_id  bigint not null,
  name            text not null,
  sort_order      int not null default 0,
  is_system_stage boolean not null default false,
  raw_payload     jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (pipeline_id, kommo_stage_id)
);
create trigger trg_kommo_stages_updated before update on eventos.kommo_stages
  for each row execute function eventos.set_updated_at();

-- ── 5. stage_category_mappings ──────────────────────────────────────────────
-- Cada stage do Kommo tem no máximo UMA categoria interna ativa.
create table if not exists eventos.stage_category_mappings (
  id                        uuid primary key default gen_random_uuid(),
  stage_id                  uuid not null references eventos.kommo_stages(id) on delete cascade,
  internal_category         eventos.stage_category not null,
  is_active                 boolean not null default true,
  include_in_total_pipeline boolean not null default false,
  include_in_active_pipeline boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
-- unicidade: um stage só pode ter 1 mapeamento ativo
create unique index if not exists uq_stage_active_mapping
  on eventos.stage_category_mappings(stage_id) where is_active;
create trigger trg_stage_cat_map_updated before update on eventos.stage_category_mappings
  for each row execute function eventos.set_updated_at();

-- ── 6. unit_mapping_rules ───────────────────────────────────────────────────
-- Prioridade ascendente: 1 vence sobre 2, etc. Sem fuzzy agressivo.
create table if not exists eventos.unit_mapping_rules (
  id                uuid primary key default gen_random_uuid(),
  priority          int not null default 100,
  source_type       eventos.unit_source_type not null,
  source_field_id   bigint,            -- id do campo personalizado / pipeline no Kommo
  source_field_name text,
  match_operator    text not null default 'equals', -- equals | contains | starts_with | regex
  match_value       text not null,
  unit_id           uuid not null references eventos.units(id) on delete cascade,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_unit_rules_priority on eventos.unit_mapping_rules(priority) where is_active;
create trigger trg_unit_rules_updated before update on eventos.unit_mapping_rules
  for each row execute function eventos.set_updated_at();

-- ── 7. custom_field_mappings ────────────────────────────────────────────────
-- Mapeia chaves semânticas → campo do Kommo (referência principal = id).
create table if not exists eventos.custom_field_mappings (
  id                    uuid primary key default gen_random_uuid(),
  entity_type           text not null default 'lead', -- lead | company | contact
  semantic_key          text not null,                 -- unit, event_date, proposal_value, ...
  kommo_field_id        bigint,
  kommo_field_name      text,
  value_type            text not null default 'text',  -- text | number | date | datetime | select | money
  is_required_for_metric boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (entity_type, semantic_key)
);
create trigger trg_custom_field_map_updated before update on eventos.custom_field_mappings
  for each row execute function eventos.set_updated_at();

-- ── 8. app_config ───────────────────────────────────────────────────────────
-- Configurações chave-valor: fórmula do total pipeline, critérios financeiros,
-- limites de alertas, metodologia de valor histórico, etc.
create table if not exists eventos.app_config (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_app_config_updated before update on eventos.app_config
  for each row execute function eventos.set_updated_at();

-- ── 9. user_profiles (RBAC) ─────────────────────────────────────────────────
-- Liga auth.users → papel + unidades autorizadas (para sales/viewer).
create table if not exists eventos.user_profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  role          eventos.app_role not null default 'viewer',
  allowed_units uuid[] not null default '{}',  -- vazio = todas (para admin/manager)
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_user_profiles_updated before update on eventos.user_profiles
  for each row execute function eventos.set_updated_at();

-- ===== 0003_leads_and_history.sql =====
-- ============================================================================
-- 0003 — Leads, histórico de etapas e registros financeiros
-- Núcleo analítico. lead_stage_history é a fonte de verdade para movimentação;
-- daily_pipeline_snapshots para estoque. Os dois NUNCA se misturam.
-- ============================================================================

-- ── 8. leads ────────────────────────────────────────────────────────────────
create table if not exists eventos.leads (
  id                        uuid primary key default gen_random_uuid(),
  connection_id             uuid references eventos.crm_connections(id) on delete set null,
  kommo_lead_id             bigint not null,
  name                      text,
  pipeline_id               uuid references eventos.kommo_pipelines(id) on delete set null,
  stage_id                  uuid references eventos.kommo_stages(id) on delete set null,
  stage_category            eventos.stage_category,
  unit_id                   uuid references eventos.units(id) on delete set null,
  unit_resolution_method    eventos.unit_resolution_method not null default 'unresolved',
  unit_resolution_confidence numeric(4,3),  -- 0..1
  responsible_user_id       bigint,
  responsible_user_name     text,
  current_value             numeric(14,2) not null default 0,
  currency                  text not null default 'BRL',
  created_at_kommo          timestamptz,
  updated_at_kommo          timestamptz,
  closed_at_kommo           timestamptz,
  deleted_at_kommo          timestamptz,   -- exclusão/arquivamento explícito, nunca hard delete silencioso
  last_stage_changed_at     timestamptz,
  event_date                date,
  event_start_time          time,
  event_end_time            time,
  guest_count               int,
  event_type                text,
  event_space               text,
  lead_source               text,
  loss_reason               text,
  custom_fields_raw         jsonb,
  raw_payload               jsonb,
  synced_at                 timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (connection_id, kommo_lead_id)
);
create index if not exists idx_leads_kommo_id      on eventos.leads(kommo_lead_id);
create index if not exists idx_leads_unit          on eventos.leads(unit_id);
create index if not exists idx_leads_category      on eventos.leads(stage_category);
create index if not exists idx_leads_event_date    on eventos.leads(event_date);
create index if not exists idx_leads_created_kommo on eventos.leads(created_at_kommo);
create index if not exists idx_leads_updated_kommo on eventos.leads(updated_at_kommo);
create index if not exists idx_leads_responsible   on eventos.leads(responsible_user_id);
create index if not exists idx_leads_active        on eventos.leads(unit_id, stage_category) where deleted_at_kommo is null;
create trigger trg_leads_updated before update on eventos.leads
  for each row execute function eventos.set_updated_at();

-- ── 9. lead_stage_history ───────────────────────────────────────────────────
-- Uma linha por transição REAL (mudança de pipeline, etapa ou categoria).
-- Registra valor/data-evento/unidade NO INSTANTE da transição.
create table if not exists eventos.lead_stage_history (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             uuid not null references eventos.leads(id) on delete cascade,
  kommo_lead_id       bigint not null,
  from_pipeline_id    uuid references eventos.kommo_pipelines(id) on delete set null,
  from_stage_id       uuid references eventos.kommo_stages(id) on delete set null,
  from_category       eventos.stage_category,
  to_pipeline_id      uuid references eventos.kommo_pipelines(id) on delete set null,
  to_stage_id         uuid references eventos.kommo_stages(id) on delete set null,
  to_category         eventos.stage_category,
  changed_at          timestamptz not null,
  lead_value_at_change numeric(14,2),
  event_date_at_change date,
  unit_id_at_change   uuid references eventos.units(id) on delete set null,
  source              text not null default 'sync', -- sync | webhook | backfill | manual
  webhook_event_id    uuid,
  raw_payload         jsonb,
  created_at          timestamptz not null default now()
);
create index if not exists idx_lsh_lead     on eventos.lead_stage_history(lead_id);
create index if not exists idx_lsh_movement on eventos.lead_stage_history(changed_at, to_category, unit_id_at_change);
create index if not exists idx_lsh_to_cat   on eventos.lead_stage_history(to_category, changed_at);
-- idempotência de inserção de histórico vinda de webhook
create unique index if not exists uq_lsh_webhook
  on eventos.lead_stage_history(webhook_event_id, lead_id, to_stage_id)
  where webhook_event_id is not null;

-- ── 10. lead_financial_records ──────────────────────────────────────────────
-- Suporta múltiplas faturas e pagamentos por lead.
create table if not exists eventos.lead_financial_records (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null references eventos.leads(id) on delete cascade,
  record_type      eventos.financial_record_type not null,
  amount           numeric(14,2) not null default 0,
  currency         text not null default 'BRL',
  record_date      date,
  reference_number text,
  status           text,    -- ex.: pending | issued | paid | cancelled
  source           text not null default 'kommo', -- kommo | manual | import
  notes            text,
  raw_payload      jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_fin_lead on eventos.lead_financial_records(lead_id);
create index if not exists idx_fin_type_date on eventos.lead_financial_records(record_type, record_date);
create trigger trg_fin_records_updated before update on eventos.lead_financial_records
  for each row execute function eventos.set_updated_at();

-- ===== 0004_snapshots_and_summaries.sql =====
-- ============================================================================
-- 0004 — Snapshots diários e consolidações mensais
-- daily_pipeline_snapshots = ESTOQUE (foto do funil ao fim do dia).
-- monthly_pipeline_summaries = FLUXO (movimentação no mês) + estoque no fechamento.
-- A movimentação mensal NUNCA é a soma dos snapshots diários.
-- ============================================================================

-- ── 11. daily_pipeline_snapshots ────────────────────────────────────────────
create table if not exists eventos.daily_pipeline_snapshots (
  id                            uuid primary key default gen_random_uuid(),
  snapshot_date                 date not null,
  unit_id                       uuid not null references eventos.units(id) on delete cascade,
  as_of_timestamp               timestamptz not null,  -- 23:59:59.999 do dia no fuso de negócio (UTC)
  new_leads_count               int not null default 0,
  new_leads_value               numeric(14,2) not null default 0,
  leads_in_service_count        int not null default 0,
  priced_leads_in_service_count int not null default 0,
  priced_leads_in_service_value numeric(14,2) not null default 0,
  proposals_sent_count          int not null default 0,
  proposals_sent_value          numeric(14,2) not null default 0,
  proposals_2026_value          numeric(14,2) not null default 0,  -- legado; ver event_year_breakdown
  proposals_2027_value          numeric(14,2) not null default 0,
  negotiation_value             numeric(14,2) not null default 0,
  contract_value                numeric(14,2) not null default 0,
  closed_value                  numeric(14,2) not null default 0,
  completed_value               numeric(14,2) not null default 0,
  reserve_value                 numeric(14,2) not null default 0,
  lost_count                    int not null default 0,
  lost_value                    numeric(14,2) not null default 0,
  total_pipeline_value          numeric(14,2) not null default 0,
  active_pipeline_value         numeric(14,2) not null default 0,
  event_year_breakdown          jsonb not null default '{}',  -- { "2026": 1234.00, "2027": ... } sem hardcode de ano
  generated_summary             text,
  manual_notes                  text,
  calculation_version           int not null default 1,
  is_active                     boolean not null default true,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);
-- 1 snapshot ativo por (data, unidade)
create unique index if not exists uq_daily_snapshot_active
  on eventos.daily_pipeline_snapshots(snapshot_date, unit_id) where is_active;
create index if not exists idx_daily_snapshot_unit_date
  on eventos.daily_pipeline_snapshots(unit_id, snapshot_date);
create trigger trg_daily_snapshot_updated before update on eventos.daily_pipeline_snapshots
  for each row execute function eventos.set_updated_at();

-- ── 12. daily_lead_sources ──────────────────────────────────────────────────
create table if not exists eventos.daily_lead_sources (
  id            uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  unit_id       uuid not null references eventos.units(id) on delete cascade,
  source_name   text not null,
  lead_count    int not null default 0,
  lead_value    numeric(14,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (snapshot_date, unit_id, source_name)
);
create trigger trg_daily_sources_updated before update on eventos.daily_lead_sources
  for each row execute function eventos.set_updated_at();

-- ── 13. monthly_pipeline_summaries ──────────────────────────────────────────
create table if not exists eventos.monthly_pipeline_summaries (
  id                              uuid primary key default gen_random_uuid(),
  month_reference                 date not null,  -- primeiro dia do mês (chave)
  unit_id                         uuid not null references eventos.units(id) on delete cascade,
  -- Fluxo do mês (movimentação)
  new_leads_count                 int not null default 0,
  new_leads_value                 numeric(14,2) not null default 0,
  proposals_sent_count            int not null default 0,
  proposals_sent_value            numeric(14,2) not null default 0,
  proposals_sent_by_event_year    jsonb not null default '{}',  -- { "2026": ..., "2027": ... }
  entered_negotiation_count       int not null default 0,
  entered_negotiation_value       numeric(14,2) not null default 0,
  entered_contract_count          int not null default 0,
  entered_contract_value          numeric(14,2) not null default 0,
  entered_closed_count            int not null default 0,
  entered_closed_value            numeric(14,2) not null default 0,
  entered_completed_count         int not null default 0,
  entered_completed_value         numeric(14,2) not null default 0,
  lost_count                      int not null default 0,
  lost_value                      numeric(14,2) not null default 0,
  -- Estoque no último dia do mês (posição)
  end_of_month_negotiation_value     numeric(14,2) not null default 0,
  end_of_month_contract_value        numeric(14,2) not null default 0,
  end_of_month_closed_value          numeric(14,2) not null default 0,
  end_of_month_completed_value       numeric(14,2) not null default 0,
  end_of_month_reserve_value         numeric(14,2) not null default 0,
  end_of_month_active_pipeline_value numeric(14,2) not null default 0,
  end_of_month_total_pipeline_value  numeric(14,2) not null default 0,
  calculation_version             int not null default 1,
  is_active                       boolean not null default true,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);
create unique index if not exists uq_monthly_summary_active
  on eventos.monthly_pipeline_summaries(month_reference, unit_id) where is_active;
create index if not exists idx_monthly_summary_unit
  on eventos.monthly_pipeline_summaries(unit_id, month_reference);
create trigger trg_monthly_summary_updated before update on eventos.monthly_pipeline_summaries
  for each row execute function eventos.set_updated_at();

-- ===== 0005_ops_and_legacy.sql =====
-- ============================================================================
-- 0005 — Operação (webhooks, sync, reconciliação, qualidade, overrides,
-- auditoria) e importação de planilha histórica.
-- ============================================================================

-- ── 14. crm_webhook_events ──────────────────────────────────────────────────
create table if not exists eventos.crm_webhook_events (
  id                  uuid primary key default gen_random_uuid(),
  connection_id       uuid references eventos.crm_connections(id) on delete set null,
  event_key           text,
  entity_type         text,
  entity_external_id  bigint,
  payload             jsonb not null,
  payload_hash        text not null,
  received_at         timestamptz not null default now(),
  status              eventos.webhook_status not null default 'received',
  attempt_count       int not null default 0,
  processing_started_at timestamptz,
  processed_at        timestamptz,
  last_error          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- idempotência por hash do payload
create unique index if not exists uq_webhook_payload_hash on eventos.crm_webhook_events(payload_hash);
create index if not exists idx_webhook_status on eventos.crm_webhook_events(status, received_at);
create index if not exists idx_webhook_entity on eventos.crm_webhook_events(entity_type, entity_external_id);
create trigger trg_webhook_updated before update on eventos.crm_webhook_events
  for each row execute function eventos.set_updated_at();

-- ── 15. sync_runs ───────────────────────────────────────────────────────────
create table if not exists eventos.sync_runs (
  id              uuid primary key default gen_random_uuid(),
  connection_id   uuid references eventos.crm_connections(id) on delete set null,
  sync_type       text not null,  -- backfill | incremental | snapshot | monthly | reconciliation
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          eventos.run_status not null default 'running',
  cursor_before   text,
  cursor_after    text,
  records_read    int not null default 0,
  records_created int not null default 0,
  records_updated int not null default 0,
  records_failed  int not null default 0,
  error_summary   text,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_sync_runs_type on eventos.sync_runs(sync_type, started_at desc);

-- ── 16. reconciliation_runs ─────────────────────────────────────────────────
create table if not exists eventos.reconciliation_runs (
  id               uuid primary key default gen_random_uuid(),
  run_date         timestamptz not null default now(),
  scope            text not null,
  status           eventos.run_status not null default 'running',
  expected_count   int,
  actual_count     int,
  difference_count int,
  notes            text,
  created_at       timestamptz not null default now()
);

-- ── 17. data_quality_issues ─────────────────────────────────────────────────
create table if not exists eventos.data_quality_issues (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid references eventos.leads(id) on delete cascade,
  issue_type  text not null,  -- missing_unit, unit_conflict, missing_event_date, ...
  severity    eventos.issue_severity not null default 'warning',
  status      eventos.issue_status not null default 'open',
  message     text,
  metadata    jsonb,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_dq_status on eventos.data_quality_issues(status, issue_type);
create index if not exists idx_dq_lead on eventos.data_quality_issues(lead_id);
-- evita duplicar o mesmo problema aberto para o mesmo lead
create unique index if not exists uq_dq_open
  on eventos.data_quality_issues(lead_id, issue_type) where status = 'open';
create trigger trg_dq_updated before update on eventos.data_quality_issues
  for each row execute function eventos.set_updated_at();

-- ── 18. manual_overrides ────────────────────────────────────────────────────
create table if not exists eventos.manual_overrides (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null,  -- lead | unit_mapping | ...
  entity_id   uuid not null,
  field_name  text not null,
  old_value   jsonb,
  new_value   jsonb,
  reason      text,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists idx_overrides_entity on eventos.manual_overrides(entity_type, entity_id);

-- ── 19. audit_logs ──────────────────────────────────────────────────────────
create table if not exists eventos.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  action        text not null,
  entity_type   text,
  entity_id     uuid,
  before_data   jsonb,
  after_data    jsonb,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_audit_entity on eventos.audit_logs(entity_type, entity_id);
create index if not exists idx_audit_actor on eventos.audit_logs(actor_user_id, created_at desc);

-- ── 20. legacy_import_runs ──────────────────────────────────────────────────
create table if not exists eventos.legacy_import_runs (
  id           uuid primary key default gen_random_uuid(),
  file_name    text,
  uploaded_by  uuid,
  status       eventos.run_status not null default 'running',
  summary      jsonb,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

-- ── 21. imported_legacy_snapshots ───────────────────────────────────────────
-- Histórico da planilha manual. NUNCA sobrescreve dados calculados do Kommo.
create table if not exists eventos.imported_legacy_snapshots (
  id                   uuid primary key default gen_random_uuid(),
  import_run_id        uuid references eventos.legacy_import_runs(id) on delete cascade,
  unit_id              uuid references eventos.units(id) on delete set null,
  snapshot_date        date,
  source_sheet         text,
  raw_row              jsonb,
  new_leads_count      int,
  proposal_2026_value  numeric(14,2),
  proposal_2027_value  numeric(14,2),
  negotiation_value    numeric(14,2),
  contract_value       numeric(14,2),
  closed_value         numeric(14,2),
  completed_value      numeric(14,2),
  total_pipeline_value numeric(14,2),
  observations         text,
  created_at           timestamptz not null default now()
);
create index if not exists idx_legacy_snap_unit_date
  on eventos.imported_legacy_snapshots(unit_id, snapshot_date);

-- ===== 0006_rbac_and_defaults.sql =====
-- ============================================================================
-- 0006 — Helpers de RBAC + dados de configuração padrão (não fictícios).
-- Unidades reais, fórmula do total pipeline, critérios financeiros, limites
-- de alertas e chaves semânticas de campos (a mapear no onboarding).
-- ============================================================================

-- ── Helpers de RBAC (SECURITY DEFINER p/ evitar recursão de RLS) ─────────────
create or replace function eventos.current_role()
returns eventos.app_role
language sql
stable
security definer
set search_path = eventos, public
as $$
  select role from eventos.user_profiles
  where user_id = auth.uid() and is_active = true
$$;

create or replace function eventos.is_staff()
returns boolean
language sql
stable
security definer
set search_path = eventos, public
as $$
  select coalesce(
    (select role in ('admin','manager') from eventos.user_profiles
     where user_id = auth.uid() and is_active = true),
    false)
$$;

create or replace function eventos.is_admin()
returns boolean
language sql
stable
security definer
set search_path = eventos, public
as $$
  select coalesce(
    (select role = 'admin' from eventos.user_profiles
     where user_id = auth.uid() and is_active = true),
    false)
$$;

-- admin/manager veem todas as unidades; sales/viewer só as autorizadas.
create or replace function eventos.has_unit_access(p_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = eventos, public
as $$
  select coalesce((
    select case
      when up.role in ('admin','manager') then true
      when p_unit is null then false
      else p_unit = any(up.allowed_units)
    end
    from eventos.user_profiles up
    where up.user_id = auth.uid() and up.is_active = true
  ), false)
$$;

-- ── Unidades reais ───────────────────────────────────────────────────────────
insert into eventos.units (name, slug, color) values
  ('Almeria',          'almeria',     '#2563eb'),  -- azul
  ('Izzi Wine Garden', 'izzi',        '#6b21a8'),  -- vinho/roxo profundo
  ('Matri',            'matri',       '#14532d')   -- verde escuro
on conflict (slug) do nothing;

-- ── Conexão CRM padrão (metadados; sem token) ───────────────────────────────
insert into eventos.crm_connections (provider, account_name, is_active)
select 'kommo', 'Eventos', true
where not exists (select 1 from eventos.crm_connections where provider = 'kommo');

-- ── Configuração da aplicação (decisões explícitas, não assumidas em silêncio)─
insert into eventos.app_config (key, value, description) values
  ('total_pipeline_categories',
   '["proposta","negociacao","contrato","fechado"]'::jsonb,
   'Categorias somadas no Total Pipeline. Total Pipeline = Proposta + Negociação + Contrato + Fechado.'),
  ('active_pipeline_categories',
   '["lead","qualificacao","atendimento","proposta","negociacao","contrato","fechado"]'::jsonb,
   'Categorias consideradas pipeline ativo (exclui concluído, perdido, desqualificado, reserva_maior).'),
  ('historical_value_methodology',
   '"at_stage_entry"'::jsonb,
   'Metodologia de valor histórico: at_stage_entry (valor no instante da entrada na etapa) | current (valor atual do lead).'),
  ('fechado_means_won',
   'true'::jsonb,
   'Se a categoria "fechado" representa venda ganha.'),
  ('billing_criteria',
   '{"method":"invoiced_value_gt_zero","invoice_status_values":["issued","paid"],"payment_status_values":["paid"]}'::jsonb,
   'Como reconhecer "Concluído faturado" e "pago". method: invoiced_value_gt_zero | financial_record | payment_status.'),
  ('alert_thresholds',
   '{"stale_high_value_amount":20000,"stale_high_value_days":5,"event_no_contract_days":15,"proposal_no_return_days":3,"negotiation_stale_days":10}'::jsonb,
   'Limites configuráveis dos alertas (valores em BRL, prazos em dias).'),
  ('conflict_source_of_truth',
   '"manual_override"'::jsonb,
   'Fonte de verdade em conflito entre Kommo e override manual local: manual_override | kommo.'),
  ('default_currency',
   '"BRL"'::jsonb,
   'Moeda padrão. Mantida configurável por campo currency para evolução futura.')
on conflict (key) do nothing;

-- ── Chaves semânticas de campos (kommo_field_id a preencher no onboarding) ───
insert into eventos.custom_field_mappings (entity_type, semantic_key, value_type, is_required_for_metric) values
  ('lead','unit','select',true),
  ('lead','event_date','date',true),
  ('lead','event_start_time','datetime',false),
  ('lead','event_end_time','datetime',false),
  ('lead','guest_count','number',false),
  ('lead','event_type','select',false),
  ('lead','event_space','select',false),
  ('lead','lead_source','select',true),
  ('lead','proposal_value','money',false),
  ('lead','contract_value','money',false),
  ('lead','invoiced_value','money',false),
  ('lead','received_value','money',false),
  ('lead','contract_signed_at','date',false),
  ('lead','proposal_sent_at','date',false),
  ('lead','invoice_issued_at','date',false),
  ('lead','payment_received_at','date',false),
  ('lead','payment_status','select',false),
  ('lead','invoice_number','text',false),
  ('lead','loss_reason','select',false)
on conflict (entity_type, semantic_key) do nothing;

-- ===== 0007_analytics.sql =====
-- ============================================================================
-- 0007 — Funções e views analíticas
-- - fn_lead_state_as_of: estado do funil em um instante (base do snapshot/estoque)
-- - fn_movement_entries: entradas em categoria por período (base do fluxo)
-- - views de drill-down: financeiro por lead, eventos futuros
-- Movimentação NUNCA é soma de snapshots. As duas funções são independentes.
-- ============================================================================

-- ── Estado de cada lead em um instante (ESTOQUE / snapshot) ──────────────────
-- Para cada lead existente no instante p_as_of, retorna sua categoria, unidade,
-- valor e data de evento conforme a última transição <= p_as_of. Leads sem
-- histórico caem para o estado atual (baseline/initial_import).
create or replace function eventos.fn_lead_state_as_of(p_as_of timestamptz)
returns table (
  lead_id        uuid,
  kommo_lead_id  bigint,
  category       eventos.stage_category,
  unit_id        uuid,
  value          numeric(14,2),
  event_date     date,
  lead_source    text,
  responsible_user_id bigint
)
language sql
stable
as $$
  with hist as (
    select distinct on (h.lead_id)
      h.lead_id,
      h.to_category    as category,
      h.unit_id_at_change as unit_id,
      h.lead_value_at_change as value,
      h.event_date_at_change as event_date
    from eventos.lead_stage_history h
    where h.changed_at <= p_as_of
    order by h.lead_id, h.changed_at desc, h.id desc
  )
  select
    l.id,
    l.kommo_lead_id,
    coalesce(h.category, l.stage_category)            as category,
    coalesce(h.unit_id, l.unit_id)                    as unit_id,
    coalesce(h.value, l.current_value)                as value,
    coalesce(h.event_date, l.event_date)              as event_date,
    l.lead_source,
    l.responsible_user_id
  from eventos.leads l
  left join hist h on h.lead_id = l.id
  where l.created_at_kommo <= p_as_of
    and (l.deleted_at_kommo is null or l.deleted_at_kommo > p_as_of);
$$;

-- ── Entradas em categoria por período (FLUXO / movimentação) ─────────────────
-- Uma linha por ENTRADA real em uma categoria dentro de [p_start, p_end).
-- Entrada = transição cujo to_category difere do from_category (ou from nulo).
-- Reentradas contam de novo (explícito). Movimentos dentro da mesma categoria
-- NÃO contam. Usa lead_value_at_change (valor no instante da entrada).
create or replace function eventos.fn_movement_entries(
  p_start timestamptz,
  p_end   timestamptz
)
returns table (
  history_id     uuid,
  lead_id        uuid,
  kommo_lead_id  bigint,
  to_category    eventos.stage_category,
  from_category  eventos.stage_category,
  changed_at     timestamptz,
  value          numeric(14,2),
  unit_id        uuid,
  event_date     date
)
language sql
stable
as $$
  select
    h.id, h.lead_id, h.kommo_lead_id,
    h.to_category, h.from_category, h.changed_at,
    h.lead_value_at_change, h.unit_id_at_change, h.event_date_at_change
  from eventos.lead_stage_history h
  where h.changed_at >= p_start
    and h.changed_at <  p_end
    and h.to_category is distinct from h.from_category;
$$;

-- ── Resumo financeiro por lead (drill-down financeiro) ───────────────────────
create or replace view eventos.v_lead_financial_summary as
select
  l.id as lead_id,
  l.kommo_lead_id,
  l.name,
  l.unit_id,
  l.event_date,
  coalesce(sum(f.amount) filter (where f.record_type = 'proposal'), 0) as proposed_value,
  coalesce(sum(f.amount) filter (where f.record_type = 'contract'), 0) as contracted_value,
  coalesce(sum(f.amount) filter (where f.record_type = 'invoice'),  0) as invoiced_value,
  coalesce(sum(f.amount) filter (where f.record_type = 'payment'),  0)
    - coalesce(sum(f.amount) filter (where f.record_type = 'refund'), 0) as received_value,
  coalesce(sum(f.amount) filter (where f.record_type = 'invoice'),  0)
    - (coalesce(sum(f.amount) filter (where f.record_type = 'payment'), 0)
       - coalesce(sum(f.amount) filter (where f.record_type = 'refund'), 0)) as balance_due
from eventos.leads l
left join eventos.lead_financial_records f on f.lead_id = l.id
group by l.id;

-- ── Eventos futuros + risco financeiro (drill-down de eventos) ───────────────
create or replace view eventos.v_future_events as
select
  l.id as lead_id,
  l.kommo_lead_id,
  l.name,
  l.unit_id,
  u.name as unit_name,
  l.event_date,
  (l.event_date - current_date) as days_until_event,
  l.guest_count,
  l.event_type,
  l.event_space,
  l.responsible_user_name,
  l.stage_category,
  l.current_value,
  fin.contracted_value,
  fin.invoiced_value,
  fin.received_value,
  fin.balance_due
from eventos.leads l
join eventos.units u on u.id = l.unit_id
left join eventos.v_lead_financial_summary fin on fin.lead_id = l.id
where l.event_date is not null
  and l.event_date >= current_date
  and l.deleted_at_kommo is null;

comment on function eventos.fn_lead_state_as_of is 'Estoque: estado do funil de cada lead em um instante (base do snapshot diário).';
comment on function eventos.fn_movement_entries is 'Fluxo: entradas reais em categoria por período (base da movimentação). Nunca somar snapshots.';

-- ===== 0008_rls.sql =====
-- ============================================================================
-- 0008 — Row Level Security + grants
-- Papéis: admin, manager, sales, viewer.
--  admin   : tudo (config, mapeamentos, usuários, imports, recálculo, dados)
--  manager : todas as unidades (leitura) + observações manuais; sem segredos
--  sales   : apenas os próprios leads (por kommo_user_id) nas unidades liberadas
--  viewer  : somente leitura nas unidades autorizadas
-- Jobs/cron usam service_role (bypassa RLS).
-- ============================================================================

-- liga o usuário ao seu id de responsável no Kommo (para o papel sales)
alter table eventos.user_profiles
  add column if not exists kommo_user_id bigint;

-- pode ver um lead específico? (considera unidade + dono para sales)
create or replace function eventos.can_see_lead(p_unit uuid, p_responsible bigint)
returns boolean
language sql
stable
security definer
set search_path = eventos, public
as $$
  select coalesce((
    select case
      when up.role in ('admin','manager') then eventos.has_unit_access(p_unit)
      when up.role = 'sales' then eventos.has_unit_access(p_unit)
                                   and p_responsible is not distinct from up.kommo_user_id
      when up.role = 'viewer' then eventos.has_unit_access(p_unit)
      else false
    end
    from eventos.user_profiles up
    where up.user_id = auth.uid() and up.is_active = true
  ), false)
$$;

-- ── Grants base (RLS faz o gating fino) ─────────────────────────────────────
grant usage on schema eventos to anon, authenticated;
grant select, insert, update, delete on all tables in schema eventos to authenticated;
grant execute on all functions in schema eventos to authenticated, anon;
alter default privileges in schema eventos
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema eventos
  grant execute on functions to authenticated, anon;

-- service_role (backend/jobs/webhooks) — acesso total, bypassa RLS.
-- Schemas novos NÃO concedem isso automaticamente; precisa ser explícito.
grant usage on schema eventos to service_role;
grant all privileges on all tables in schema eventos to service_role;
grant all privileges on all sequences in schema eventos to service_role;
grant execute on all functions in schema eventos to service_role;
alter default privileges in schema eventos grant all on tables to service_role;
alter default privileges in schema eventos grant all on sequences to service_role;
alter default privileges in schema eventos grant execute on functions to service_role;

-- ── Habilita RLS em todas as tabelas ────────────────────────────────────────
do $$
declare t text;
begin
  for t in
    select table_name from information_schema.tables
    where table_schema = 'eventos' and table_type = 'BASE TABLE'
  loop
    execute format('alter table eventos.%I enable row level security;', t);
    execute format('alter table eventos.%I force row level security;', t);
  end loop;
end $$;

-- ── Tabelas escopadas por unidade (leitura) ─────────────────────────────────
create policy leads_read on eventos.leads
  for select to authenticated
  using (eventos.can_see_lead(unit_id, responsible_user_id));

create policy lead_history_read on eventos.lead_stage_history
  for select to authenticated
  using (exists (
    select 1 from eventos.leads l
    where l.id = lead_id and eventos.can_see_lead(l.unit_id, l.responsible_user_id)));

create policy lead_fin_read on eventos.lead_financial_records
  for select to authenticated
  using (exists (
    select 1 from eventos.leads l
    where l.id = lead_id and eventos.can_see_lead(l.unit_id, l.responsible_user_id)));

create policy daily_snap_read on eventos.daily_pipeline_snapshots
  for select to authenticated using (eventos.has_unit_access(unit_id));

create policy daily_src_read on eventos.daily_lead_sources
  for select to authenticated using (eventos.has_unit_access(unit_id));

create policy monthly_read on eventos.monthly_pipeline_summaries
  for select to authenticated using (eventos.has_unit_access(unit_id));

create policy legacy_snap_read on eventos.imported_legacy_snapshots
  for select to authenticated using (unit_id is null or eventos.has_unit_access(unit_id));

create policy dq_read on eventos.data_quality_issues
  for select to authenticated
  using (lead_id is null or exists (
    select 1 from eventos.leads l
    where l.id = lead_id and eventos.has_unit_access(l.unit_id)));

-- managers podem editar observações manuais do snapshot diário
create policy daily_snap_notes_update on eventos.daily_pipeline_snapshots
  for update to authenticated
  using (eventos.is_staff()) with check (eventos.is_staff());

-- ── Tabelas de catálogo/config: leitura p/ staff, escrita p/ admin ──────────
do $$
declare t text;
begin
  foreach t in array array[
    'units','crm_connections','kommo_pipelines','kommo_stages',
    'stage_category_mappings','unit_mapping_rules','custom_field_mappings','app_config'
  ]
  loop
    execute format($f$
      create policy %1$s_read on eventos.%1$I
        for select to authenticated using (eventos.current_role() is not null);
    $f$, t);
    execute format($f$
      create policy %1$s_admin_all on eventos.%1$I
        for all to authenticated using (eventos.is_admin()) with check (eventos.is_admin());
    $f$, t);
  end loop;
end $$;

-- ── Operação/auditoria: leitura staff, escrita admin (jobs usam service_role)─
do $$
declare t text;
begin
  foreach t in array array[
    'crm_webhook_events','sync_runs','reconciliation_runs',
    'manual_overrides','audit_logs','legacy_import_runs'
  ]
  loop
    execute format($f$
      create policy %1$s_read on eventos.%1$I
        for select to authenticated using (eventos.is_staff());
    $f$, t);
    execute format($f$
      create policy %1$s_admin_all on eventos.%1$I
        for all to authenticated using (eventos.is_admin()) with check (eventos.is_admin());
    $f$, t);
  end loop;
end $$;

-- data_quality_issues: staff pode atualizar status; admin tudo
create policy dq_staff_update on eventos.data_quality_issues
  for update to authenticated using (eventos.is_staff()) with check (eventos.is_staff());

-- ── user_profiles: cada um lê o próprio; admin gerencia todos ────────────────
create policy profiles_self_read on eventos.user_profiles
  for select to authenticated using (user_id = auth.uid() or eventos.is_admin());
create policy profiles_admin_all on eventos.user_profiles
  for all to authenticated using (eventos.is_admin()) with check (eventos.is_admin());

-- ===== 0009_harden_function_search_path.sql =====
-- ============================================================================
-- 0009 — Hardening: search_path fixo nas funções (advisor do Supabase)
-- ============================================================================
alter function eventos.set_updated_at() set search_path = eventos, public;
alter function eventos.fn_lead_state_as_of(timestamptz) set search_path = eventos, public;
alter function eventos.fn_movement_entries(timestamptz, timestamptz) set search_path = eventos, public;

