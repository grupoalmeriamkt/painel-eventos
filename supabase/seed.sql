-- ============================================================================
-- SEED DE DESENVOLVIMENTO — NÃO RODAR EM PRODUÇÃO
-- ============================================================================
-- Este arquivo cria dados FICTÍCIOS para desenvolvimento local. Todos os
-- registros são marcados com source/origem 'dev_seed' para isolamento.
--
-- ⚠️ O banco Supabase deste projeto é COMPARTILHADO com outros apps. NÃO aplique
--    este seed no projeto remoto. Use apenas em um banco local/dev.
--
-- Para limpar: delete from eventos.leads where raw_payload->>'origin' = 'dev_seed';
-- ============================================================================

do $$
declare
  v_conn   uuid;
  v_almeria uuid;
  v_izzi    uuid;
  v_pipe    uuid;
  v_st_lead uuid;
  v_st_prop uuid;
  v_st_nego uuid;
  v_st_ctr  uuid;
  v_lead1   uuid;
  v_lead2   uuid;
begin
  select id into v_conn from eventos.crm_connections where provider='kommo' limit 1;
  select id into v_almeria from eventos.units where slug='almeria';
  select id into v_izzi from eventos.units where slug='izzi';

  -- pipeline + stages fictícios
  insert into eventos.kommo_pipelines (connection_id, kommo_pipeline_id, name)
  values (v_conn, 9000001, 'Eventos (dev)')
  on conflict (connection_id, kommo_pipeline_id) do update set name=excluded.name
  returning id into v_pipe;

  insert into eventos.kommo_stages (pipeline_id, kommo_stage_id, name, sort_order) values
    (v_pipe, 9100001, 'Leads LP', 1),
    (v_pipe, 9100002, 'Proposta Enviada', 2),
    (v_pipe, 9100003, 'Em Negociação', 3),
    (v_pipe, 9100004, 'Contrato', 4)
  on conflict (pipeline_id, kommo_stage_id) do nothing;

  select id into v_st_lead from eventos.kommo_stages where pipeline_id=v_pipe and kommo_stage_id=9100001;
  select id into v_st_prop from eventos.kommo_stages where pipeline_id=v_pipe and kommo_stage_id=9100002;
  select id into v_st_nego from eventos.kommo_stages where pipeline_id=v_pipe and kommo_stage_id=9100003;
  select id into v_st_ctr  from eventos.kommo_stages where pipeline_id=v_pipe and kommo_stage_id=9100004;

  insert into eventos.stage_category_mappings (stage_id, internal_category, include_in_total_pipeline, include_in_active_pipeline) values
    (v_st_lead, 'lead', false, true),
    (v_st_prop, 'proposta', true, true),
    (v_st_nego, 'negociacao', true, true),
    (v_st_ctr,  'contrato', true, true)
  on conflict do nothing;

  -- lead 1: Almeria, em negociação, evento 2026
  insert into eventos.leads (connection_id, kommo_lead_id, name, pipeline_id, stage_id, stage_category,
    unit_id, unit_resolution_method, current_value, created_at_kommo, updated_at_kommo,
    event_date, lead_source, raw_payload)
  values (v_conn, 9200001, 'Casamento Maria (dev)', v_pipe, v_st_nego, 'negociacao',
    v_almeria, 'custom_field', 45000, now()-interval '20 days', now()-interval '2 days',
    '2026-11-15', 'Instagram', '{"origin":"dev_seed"}'::jsonb)
  on conflict (connection_id, kommo_lead_id) do update set raw_payload=excluded.raw_payload
  returning id into v_lead1;

  -- histórico do lead 1: lead -> proposta -> negociacao (valores no instante)
  insert into eventos.lead_stage_history (lead_id, kommo_lead_id, from_category, to_category, to_stage_id,
    changed_at, lead_value_at_change, event_date_at_change, unit_id_at_change, source) values
    (v_lead1, 9200001, null, 'lead', v_st_lead, now()-interval '20 days', 0, '2026-11-15', v_almeria, 'dev_seed'),
    (v_lead1, 9200001, 'lead', 'proposta', v_st_prop, now()-interval '10 days', 40000, '2026-11-15', v_almeria, 'dev_seed'),
    (v_lead1, 9200001, 'proposta', 'negociacao', v_st_nego, now()-interval '2 days', 45000, '2026-11-15', v_almeria, 'dev_seed')
  on conflict do nothing;

  -- lead 2: Izzi, contrato, evento 2027
  insert into eventos.leads (connection_id, kommo_lead_id, name, pipeline_id, stage_id, stage_category,
    unit_id, unit_resolution_method, current_value, created_at_kommo, updated_at_kommo,
    event_date, lead_source, raw_payload)
  values (v_conn, 9200002, 'Aniversário 50 (dev)', v_pipe, v_st_ctr, 'contrato',
    v_izzi, 'custom_field', 30000, now()-interval '15 days', now()-interval '1 days',
    '2027-02-20', 'Indicação', '{"origin":"dev_seed"}'::jsonb)
  on conflict (connection_id, kommo_lead_id) do update set raw_payload=excluded.raw_payload
  returning id into v_lead2;

  insert into eventos.lead_stage_history (lead_id, kommo_lead_id, from_category, to_category, to_stage_id,
    changed_at, lead_value_at_change, event_date_at_change, unit_id_at_change, source) values
    (v_lead2, 9200002, null, 'proposta', v_st_prop, now()-interval '12 days', 28000, '2027-02-20', v_izzi, 'dev_seed'),
    (v_lead2, 9200002, 'proposta', 'contrato', v_st_ctr, now()-interval '1 days', 30000, '2027-02-20', v_izzi, 'dev_seed')
  on conflict do nothing;

  insert into eventos.lead_financial_records (lead_id, record_type, amount, record_date, source) values
    (v_lead2, 'contract', 30000, (now()-interval '1 days')::date, 'dev_seed'),
    (v_lead2, 'invoice', 15000, (now()-interval '1 days')::date, 'dev_seed'),
    (v_lead2, 'payment', 15000, now()::date, 'dev_seed')
  on conflict do nothing;
end $$;
