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
