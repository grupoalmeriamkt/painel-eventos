import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCalcConfig } from "@/lib/config";
import { loadDomainInputs } from "@/lib/jobs/domain-inputs";
import { resolveStateAsOf } from "@/domain/snapshot";
import { FUNNEL_ORDER } from "@/domain/categories";
import type { StageCategory } from "@/lib/supabase/database.types";

/** Métricas de uma etapa do funil comercial (estoque atual + conversão). */
export interface PipelineStage {
  category: StageCategory;
  /** leads no estoque atual nesta categoria */
  count: number;
  /** valor total (BRL) no estoque atual nesta categoria */
  value: number;
  /** ticket médio (value / count) — null se count = 0 */
  ticketMedio: number | null;
  /**
   * conversão a partir da etapa anterior do funil, em %.
   * count_da_etapa / count_da_etapa_anterior. null para a primeira etapa
   * ou quando a etapa anterior tem count 0 (não inventa zero).
   */
  conversion: number | null;
  /**
   * tempo médio em etapa, em dias — média de (saída - entrada) para
   * transições que SAÍRAM desta categoria no histórico. null se não houver
   * dados suficientes (não inventa zero).
   */
  avgDaysInStage: number | null;
}

export interface PipelineAnalysis {
  generatedAt: string;
  stages: PipelineStage[];
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Análise do pipeline comercial: para cada etapa do funil (lead → concluído),
 * estoque atual (count/value/ticket), conversão a partir da etapa anterior, e
 * tempo médio gasto na etapa derivado do histórico de transições.
 */
export async function getPipelineAnalysis(): Promise<PipelineAnalysis> {
  const db = createAdminClient();
  const nowISO = new Date().toISOString();

  const [config, inputs] = await Promise.all([
    loadCalcConfig(db),
    loadDomainInputs(db),
  ]);

  const { leads, transitions } = inputs;
  const states = resolveStateAsOf(transitions, leads, nowISO, config);

  // Estoque atual por categoria
  const countByCat = {} as Record<StageCategory, number>;
  const valueByCat = {} as Record<StageCategory, number>;
  for (const cat of FUNNEL_ORDER) {
    countByCat[cat] = 0;
    valueByCat[cat] = 0;
  }
  for (const s of states) {
    if (!s.category || !(s.category in countByCat)) continue;
    countByCat[s.category] += 1;
    valueByCat[s.category] += s.value;
  }

  // Tempo médio em etapa: para cada lead, ordena transições por changed_at e
  // mede o intervalo entre entrar numa categoria e a transição seguinte (que a
  // abandona). Só consideramos etapas efetivamente abandonadas (com transição
  // posterior), de modo que estoque parado não distorce a média.
  const byLead = new Map<string, { at: number; to: StageCategory }[]>();
  for (const t of transitions) {
    const at = Date.parse(t.changedAt);
    if (Number.isNaN(at)) continue;
    const arr = byLead.get(t.leadId);
    if (arr) arr.push({ at, to: t.toCategory });
    else byLead.set(t.leadId, [{ at, to: t.toCategory }]);
  }

  const durations = {} as Record<StageCategory, number[]>;
  for (const cat of FUNNEL_ORDER) durations[cat] = [];

  for (const arr of byLead.values()) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => a.at - b.at);
    for (let i = 0; i < arr.length - 1; i++) {
      const entry = arr[i]!;
      const next = arr[i + 1]!;
      const bucket = durations[entry.to];
      if (!bucket) continue;
      const days = (next.at - entry.at) / MS_PER_DAY;
      if (days >= 0) bucket.push(days);
    }
  }

  const stages: PipelineStage[] = FUNNEL_ORDER.map((cat, i) => {
    const count = countByCat[cat];
    const value = valueByCat[cat];
    const prevCat = i > 0 ? FUNNEL_ORDER[i - 1] : null;
    const prevCount = prevCat ? countByCat[prevCat] : null;
    const samples = durations[cat];
    return {
      category: cat,
      count,
      value,
      ticketMedio: count > 0 ? value / count : null,
      conversion:
        prevCount !== null && prevCount > 0 ? (count / prevCount) * 100 : null,
      avgDaysInStage:
        samples.length > 0
          ? samples.reduce((a, b) => a + b, 0) / samples.length
          : null,
    };
  });

  return { generatedAt: nowISO, stages };
}
