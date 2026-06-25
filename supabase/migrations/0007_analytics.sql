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
