import type { StageCategory } from "@/lib/supabase/database.types";

/**
 * Tipos de domínio independentes do banco — facilitam testes unitários.
 * Timestamps são ISO em UTC. Valores monetários são number (BRL) — a precisão
 * decimal é garantida no banco (numeric); no cálculo arredondamos ao final.
 */

/** Uma transição real de etapa (linha de lead_stage_history). */
export interface StageTransition {
  leadId: string;
  fromCategory: StageCategory | null;
  toCategory: StageCategory;
  /** ISO UTC */
  changedAt: string;
  /** valor do lead NO INSTANTE da transição */
  value: number;
  unitId: string | null;
  /** date-only "yyyy-MM-dd" do evento no instante da transição */
  eventDate: string | null;
}

/** Metadados estáticos do lead usados na resolução de estado. */
export interface LeadMeta {
  leadId: string;
  /** estado atual (fallback p/ leads sem histórico) */
  currentCategory: StageCategory | null;
  currentUnitId: string | null;
  currentValue: number;
  currentEventDate: string | null;
  leadSource: string | null;
  responsibleUserId: number | null;
  /** ISO UTC */
  createdAtKommo: string | null;
  /** ISO UTC ou null se ativo */
  deletedAtKommo: string | null;
}

/** Estado de um lead num instante (resultado de resolveStateAsOf). */
export interface LeadStateAsOf {
  leadId: string;
  category: StageCategory | null;
  unitId: string | null;
  value: number;
  eventDate: string | null;
  leadSource: string | null;
  responsibleUserId: number | null;
}

/** Configuração de cálculo (vem de app_config). */
export interface CalcConfig {
  totalPipelineCategories: readonly StageCategory[];
  activePipelineCategories: readonly StageCategory[];
  /** "at_stage_entry" usa valor no instante; "current" usa valor atual. */
  historicalValueMethodology: "at_stage_entry" | "current";
}

/** Agregado por categoria. */
export interface CategoryAggregate {
  count: number;
  value: number;
}

/** Resultado do snapshot diário (estoque) de uma unidade. */
export interface DailySnapshotResult {
  byCategory: Record<StageCategory, CategoryAggregate>;
  newLeadsCount: number;
  newLeadsValue: number;
  leadsInServiceCount: number;
  pricedLeadsInServiceCount: number;
  pricedLeadsInServiceValue: number;
  proposalsValue: number;
  negotiationValue: number;
  contractValue: number;
  closedValue: number;
  completedValue: number;
  reserveValue: number;
  lostCount: number;
  lostValue: number;
  totalPipelineValue: number;
  activePipelineValue: number;
  /** valor de pipeline por ano do evento, sem hardcode de ano */
  eventYearBreakdown: Record<string, number>;
}

/** Entrada de movimentação numa categoria. */
export interface MovementByCategory {
  count: number;
  value: number;
}

/** Resultado de movimentação (fluxo) num período. */
export interface MovementResult {
  entered: Record<StageCategory, MovementByCategory>;
  /** propostas emitidas no período, por ano do evento */
  proposalsByEventYear: Record<string, MovementByCategory>;
}
