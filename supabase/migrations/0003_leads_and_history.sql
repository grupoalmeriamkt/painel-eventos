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
