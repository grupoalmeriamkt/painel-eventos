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
