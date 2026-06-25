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
