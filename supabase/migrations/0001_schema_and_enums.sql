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
