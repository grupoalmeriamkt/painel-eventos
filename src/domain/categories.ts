import type { StageCategory } from "@/lib/supabase/database.types";

/**
 * Categorias internas de etapa e seus agrupamentos de negócio.
 * Nomes de etapa do Kommo são configuráveis; estas categorias são estáveis.
 */
export const STAGE_CATEGORIES: readonly StageCategory[] = [
  "lead",
  "qualificacao",
  "atendimento",
  "proposta",
  "negociacao",
  "contrato",
  "fechado",
  "concluido",
  "reserva_maior",
  "perdido",
  "desqualificado",
] as const;

/** Categorias "abertas" no funil (não finalizadas). */
export const OPEN_CATEGORIES: readonly StageCategory[] = [
  "lead",
  "qualificacao",
  "atendimento",
  "proposta",
  "negociacao",
  "contrato",
  "fechado",
];

/** Categorias terminais negativas. */
export const NEGATIVE_CATEGORIES: readonly StageCategory[] = [
  "perdido",
  "desqualificado",
];

/** Padrão para "pipeline ativo" (sobrescrito por app_config). */
export const DEFAULT_ACTIVE_PIPELINE: readonly StageCategory[] = OPEN_CATEGORIES;

/** Padrão da fórmula de Total Pipeline (sobrescrito por app_config). */
export const DEFAULT_TOTAL_PIPELINE: readonly StageCategory[] = [
  "proposta",
  "negociacao",
  "contrato",
  "fechado",
];

/** Ordem do funil para cálculo de conversão e progressão. */
export const FUNNEL_ORDER: readonly StageCategory[] = [
  "lead",
  "qualificacao",
  "atendimento",
  "proposta",
  "negociacao",
  "contrato",
  "fechado",
  "concluido",
];

export function funnelIndex(cat: StageCategory): number {
  return FUNNEL_ORDER.indexOf(cat);
}

/** Texto amigável (pt-BR) por categoria. */
export const CATEGORY_LABELS: Record<StageCategory, string> = {
  lead: "Lead",
  qualificacao: "Qualificação",
  atendimento: "Atendimento",
  proposta: "Proposta",
  negociacao: "Negociação",
  contrato: "Contrato",
  fechado: "Fechado",
  concluido: "Concluído",
  reserva_maior: "Reserva maior",
  perdido: "Perdido",
  desqualificado: "Desqualificado",
};
