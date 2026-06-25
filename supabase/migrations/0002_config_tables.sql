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
