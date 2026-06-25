-- ============================================================================
-- 0009 — Hardening: search_path fixo nas funções (advisor do Supabase)
-- ============================================================================
alter function eventos.set_updated_at() set search_path = eventos, public;
alter function eventos.fn_lead_state_as_of(timestamptz) set search_path = eventos, public;
alter function eventos.fn_movement_entries(timestamptz, timestamptz) set search_path = eventos, public;
