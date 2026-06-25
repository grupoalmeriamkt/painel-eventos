import "server-only";
import { DateTime } from "luxon";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCalcConfig } from "@/lib/config";
import { loadDomainInputs } from "./domain-inputs";
import { resolveStateAsOf, computeDailySnapshot } from "@/domain/snapshot";
import { computeMovement } from "@/domain/movement";
import { businessMonthBoundsUtc, BUSINESS_TZ } from "@/lib/time";

/**
 * Consolidação mensal por unidade. Separa explicitamente:
 *  - FLUXO: movimentação ocorrida no mês (entradas em cada categoria).
 *  - ESTOQUE: posição do pipeline no último dia do mês.
 * O fluxo NUNCA é derivado de snapshots diários.
 */
export async function generateMonthlySummaries(opts: {
  /** "yyyy-MM" no fuso de negócio; default = mês corrente */
  monthKey?: string;
} = {}): Promise<{ monthKey: string; units: number }> {
  const db = createAdminClient();
  const monthKey =
    opts.monthKey ?? DateTime.now().setZone(BUSINESS_TZ).toFormat("yyyy-MM");
  const monthRef = `${monthKey}-01`;
  const { startUtc, endUtc } = businessMonthBoundsUtc(monthKey);
  // estoque no fim do último dia do mês (instante imediatamente antes do próximo mês)
  const asOf = DateTime.fromISO(endUtc, { zone: "utc" }).minus({ milliseconds: 1 }).toISO()!;

  const [config, inputs] = await Promise.all([loadCalcConfig(db), loadDomainInputs(db)]);
  const { leads, transitions } = inputs;

  const states = resolveStateAsOf(transitions, leads, asOf, config);
  const newLeadIds = new Set(
    leads
      .filter(
        (l) =>
          l.createdAtKommo &&
          Date.parse(l.createdAtKommo) >= Date.parse(startUtc) &&
          Date.parse(l.createdAtKommo) < Date.parse(endUtc),
      )
      .map((l) => l.leadId),
  );

  const { data: units } = await db.from("units").select("id").eq("is_active", true);
  let count = 0;

  for (const unit of units ?? []) {
    const unitTransitions = transitions.filter((t) => t.unitId === unit.id);
    const movement = computeMovement(unitTransitions, startUtc, endUtc); // FLUXO

    const unitStates = states.filter((s) => s.unitId === unit.id);
    const unitNewLeadIds = new Set(
      [...newLeadIds].filter((id) => unitStates.some((s) => s.leadId === id)),
    );
    const eom = computeDailySnapshot({ states: unitStates, newLeadIds: unitNewLeadIds, config }); // ESTOQUE

    const proposalsByYear: Record<string, number> = {};
    for (const [year, agg] of Object.entries(movement.proposalsByEventYear)) {
      proposalsByYear[year] = agg.value;
    }

    await db
      .from("monthly_pipeline_summaries")
      .update({ is_active: false })
      .eq("month_reference", monthRef)
      .eq("unit_id", unit.id)
      .eq("is_active", true);

    await db.from("monthly_pipeline_summaries").insert({
      month_reference: monthRef,
      unit_id: unit.id,
      // FLUXO
      new_leads_count: unitNewLeadIds.size,
      new_leads_value: eom.newLeadsValue,
      proposals_sent_count: movement.entered.proposta.count,
      proposals_sent_value: movement.entered.proposta.value,
      proposals_sent_by_event_year: proposalsByYear,
      entered_negotiation_count: movement.entered.negociacao.count,
      entered_negotiation_value: movement.entered.negociacao.value,
      entered_contract_count: movement.entered.contrato.count,
      entered_contract_value: movement.entered.contrato.value,
      entered_closed_count: movement.entered.fechado.count,
      entered_closed_value: movement.entered.fechado.value,
      entered_completed_count: movement.entered.concluido.count,
      entered_completed_value: movement.entered.concluido.value,
      lost_count: movement.entered.perdido.count,
      lost_value: movement.entered.perdido.value,
      // ESTOQUE (fim do mês)
      end_of_month_negotiation_value: eom.negotiationValue,
      end_of_month_contract_value: eom.contractValue,
      end_of_month_closed_value: eom.closedValue,
      end_of_month_completed_value: eom.completedValue,
      end_of_month_reserve_value: eom.reserveValue,
      end_of_month_active_pipeline_value: eom.activePipelineValue,
      end_of_month_total_pipeline_value: eom.totalPipelineValue,
      is_active: true,
    });
    count += 1;
  }

  return { monthKey, units: count };
}
