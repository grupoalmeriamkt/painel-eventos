import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCalcConfig } from "@/lib/config";
import { loadDomainInputs } from "./domain-inputs";
import { resolveStateAsOf, computeDailySnapshot } from "@/domain/snapshot";
import { computeMovement } from "@/domain/movement";
import { generateDailySummary } from "@/domain/summary";
import {
  businessDayBoundsUtc,
  endOfBusinessDayUtc,
  previousBusinessDateKey,
} from "@/lib/time";

/**
 * Gera (ou recalcula) o snapshot diário de TODAS as unidades para uma data de
 * negócio. Estoque ao fim do dia (as_of = 23:59:59.999 BRT em UTC).
 * Idempotente: marca versões anteriores como inativas e insere a nova ativa.
 */
export async function generateDailySnapshots(opts: {
  /** "yyyy-MM-dd" no fuso de negócio; default = ontem */
  dateKey?: string;
  recalcReason?: string;
  actorUserId?: string;
} = {}): Promise<{ dateKey: string; units: number }> {
  const db = createAdminClient();
  const dateKey = opts.dateKey ?? previousBusinessDateKey(new Date().toISOString());
  const asOf = endOfBusinessDayUtc(dateKey);
  const { startUtc, endUtc } = businessDayBoundsUtc(dateKey);

  const [config, inputs] = await Promise.all([loadCalcConfig(db), loadDomainInputs(db)]);
  const { leads, transitions } = inputs;

  const states = resolveStateAsOf(transitions, leads, asOf, config);

  // novos leads do dia por id
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
    const unitStates = states.filter((s) => s.unitId === unit.id);
    const unitNewLeadIds = new Set(
      [...newLeadIds].filter((id) => unitStates.some((s) => s.leadId === id)),
    );
    const snap = computeDailySnapshot({
      states: unitStates,
      newLeadIds: unitNewLeadIds,
      config,
    });

    // movimento do dia filtrado pela unidade (para o resumo)
    const unitMovement = computeMovement(
      transitions.filter((t) => t.unitId === unit.id),
      startUtc,
      endUtc,
    );
    const summary = generateDailySummary(snap, unitMovement);

    // desativa versões anteriores e insere a nova
    await db
      .from("daily_pipeline_snapshots")
      .update({ is_active: false })
      .eq("snapshot_date", dateKey)
      .eq("unit_id", unit.id)
      .eq("is_active", true);

    await db.from("daily_pipeline_snapshots").insert({
      snapshot_date: dateKey,
      unit_id: unit.id,
      as_of_timestamp: asOf,
      new_leads_count: snap.newLeadsCount,
      new_leads_value: snap.newLeadsValue,
      leads_in_service_count: snap.leadsInServiceCount,
      priced_leads_in_service_count: snap.pricedLeadsInServiceCount,
      priced_leads_in_service_value: snap.pricedLeadsInServiceValue,
      proposals_sent_count: snap.byCategory.proposta.count,
      proposals_sent_value: snap.proposalsValue,
      proposals_2026_value: snap.eventYearBreakdown["2026"] ?? 0,
      proposals_2027_value: snap.eventYearBreakdown["2027"] ?? 0,
      negotiation_value: snap.negotiationValue,
      contract_value: snap.contractValue,
      closed_value: snap.closedValue,
      completed_value: snap.completedValue,
      reserve_value: snap.reserveValue,
      lost_count: snap.lostCount,
      lost_value: snap.lostValue,
      total_pipeline_value: snap.totalPipelineValue,
      active_pipeline_value: snap.activePipelineValue,
      event_year_breakdown: snap.eventYearBreakdown,
      generated_summary: summary,
      is_active: true,
    });

    // origens dos leads do dia
    const sources = new Map<string, { count: number; value: number }>();
    for (const s of unitStates) {
      if (!unitNewLeadIds.has(s.leadId)) continue;
      const key = s.leadSource ?? "Não identificado";
      const cur = sources.get(key) ?? { count: 0, value: 0 };
      cur.count += 1;
      cur.value += s.value;
      sources.set(key, cur);
    }
    for (const [source_name, agg] of sources) {
      await db.from("daily_lead_sources").upsert(
        {
          snapshot_date: dateKey,
          unit_id: unit.id,
          source_name,
          lead_count: agg.count,
          lead_value: agg.value,
        },
        { onConflict: "snapshot_date,unit_id,source_name" },
      );
    }

    count += 1;
  }

  if (opts.recalcReason) {
    await db.from("audit_logs").insert({
      actor_user_id: opts.actorUserId ?? null,
      action: "recalc_daily_snapshot",
      entity_type: "daily_pipeline_snapshots",
      metadata: { dateKey, reason: opts.recalcReason },
    });
  }

  return { dateKey, units: count };
}
