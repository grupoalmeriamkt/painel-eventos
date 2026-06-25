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
