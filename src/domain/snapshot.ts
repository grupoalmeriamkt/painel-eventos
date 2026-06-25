import type { StageCategory } from "@/lib/supabase/database.types";
import { STAGE_CATEGORIES } from "./categories";
import { eventYear } from "@/lib/time";
import { sumMoney } from "./money";
import type {
  CalcConfig,
  CategoryAggregate,
  DailySnapshotResult,
  LeadMeta,
  LeadStateAsOf,
  StageTransition,
} from "./types";

/**
 * ESTOQUE — resolve o estado de cada lead num instante `asOf` (ISO UTC).
 *
 * Espelha eventos.fn_lead_state_as_of: para cada lead, a última transição com
 * changedAt <= asOf define categoria/valor/unidade/data-evento. Leads sem
 * histórico caem para o estado atual. Leads criados depois de asOf, ou
 * excluídos antes de asOf, são ignorados.
 */
export function resolveStateAsOf(
  transitions: StageTransition[],
  leads: LeadMeta[],
  asOfISO: string,
  config: CalcConfig,
): LeadStateAsOf[] {
  const asOf = Date.parse(asOfISO);

  // última transição <= asOf por lead
  const latestByLead = new Map<string, StageTransition>();
  for (const t of transitions) {
    if (Date.parse(t.changedAt) > asOf) continue;
    const cur = latestByLead.get(t.leadId);
    if (!cur || Date.parse(t.changedAt) >= Date.parse(cur.changedAt)) {
      latestByLead.set(t.leadId, t);
    }
  }

  const out: LeadStateAsOf[] = [];
  for (const lead of leads) {
    if (lead.createdAtKommo && Date.parse(lead.createdAtKommo) > asOf) continue;
    if (lead.deletedAtKommo && Date.parse(lead.deletedAtKommo) <= asOf) continue;

    const t = latestByLead.get(lead.leadId);
    const useCurrent = config.historicalValueMethodology === "current";
    out.push({
      leadId: lead.leadId,
      category: t?.toCategory ?? lead.currentCategory,
      unitId: t?.unitId ?? lead.currentUnitId,
      value: useCurrent ? lead.currentValue : (t?.value ?? lead.currentValue),
      eventDate: t?.eventDate ?? lead.currentEventDate,
      leadSource: lead.leadSource,
      responsibleUserId: lead.responsibleUserId,
    });
  }
  return out;
}

function emptyByCategory(): Record<StageCategory, CategoryAggregate> {
  const r = {} as Record<StageCategory, CategoryAggregate>;
  for (const c of STAGE_CATEGORIES) r[c] = { count: 0, value: 0 };
  return r;
}

export interface DailySnapshotInput {
  /** estados resolvidos em asOf, já filtrados para a unidade */
  states: LeadStateAsOf[];
  /** ids de leads criados DENTRO do dia (para new_leads) */
  newLeadIds: Set<string>;
  config: CalcConfig;
}

/**
 * ESTOQUE — calcula o snapshot diário de uma unidade a partir dos estados
 * resolvidos em asOf. Nunca derivado de somar movimentações.
 */
export function computeDailySnapshot(input: DailySnapshotInput): DailySnapshotResult {
  const { states, newLeadIds, config } = input;
  const byCategory = emptyByCategory();
  const valuesByCat: Record<StageCategory, number[]> = {} as Record<
    StageCategory,
    number[]
  >;
  for (const c of STAGE_CATEGORIES) valuesByCat[c] = [];

  const eventYearValues: Record<string, number[]> = {};
  const newLeadValues: number[] = [];
  let newLeadsCount = 0;
  let leadsInServiceCount = 0;
  const pricedServiceValues: number[] = [];
  let pricedServiceCount = 0;

  for (const s of states) {
    if (!s.category) continue;
    byCategory[s.category].count += 1;
    valuesByCat[s.category].push(s.value);

    if (newLeadIds.has(s.leadId)) {
      newLeadsCount += 1;
      newLeadValues.push(s.value);
    }

    if (s.category === "atendimento") {
      leadsInServiceCount += 1;
      if (s.value > 0) {
        pricedServiceCount += 1;
        pricedServiceValues.push(s.value);
      }
    }

    // pipeline por ano do evento (apenas categorias do total pipeline)
    if (config.totalPipelineCategories.includes(s.category) && s.eventDate) {
      const y = eventYear(s.eventDate);
      if (y) {
        const key = String(y);
        (eventYearValues[key] ??= []).push(s.value);
      }
    }
  }

  for (const c of STAGE_CATEGORIES) {
    byCategory[c].value = sumMoney(valuesByCat[c]);
  }

  const totalPipelineValue = sumMoney(
    config.totalPipelineCategories.map((c) => byCategory[c].value),
  );
  const activePipelineValue = sumMoney(
    config.activePipelineCategories.map((c) => byCategory[c].value),
  );

  const eventYearBreakdown: Record<string, number> = {};
  for (const [k, vals] of Object.entries(eventYearValues)) {
    eventYearBreakdown[k] = sumMoney(vals);
  }

  return {
    byCategory,
    newLeadsCount,
    newLeadsValue: sumMoney(newLeadValues),
    leadsInServiceCount,
    pricedLeadsInServiceCount: pricedServiceCount,
    pricedLeadsInServiceValue: sumMoney(pricedServiceValues),
    proposalsValue: byCategory.proposta.value,
    negotiationValue: byCategory.negociacao.value,
    contractValue: byCategory.contrato.value,
    closedValue: byCategory.fechado.value,
    completedValue: byCategory.concluido.value,
    reserveValue: byCategory.reserva_maior.value,
    lostCount: byCategory.perdido.count,
    lostValue: byCategory.perdido.value,
    totalPipelineValue,
    activePipelineValue,
    eventYearBreakdown,
  };
}
