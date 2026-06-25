import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCalcConfig } from "@/lib/config";
import { loadDomainInputs } from "@/lib/jobs/domain-inputs";
import { resolveStateAsOf, computeDailySnapshot } from "@/domain/snapshot";
import { computeMovement } from "@/domain/movement";
import type { DailySnapshotResult, MovementResult } from "@/domain/types";
import {
  businessDayBoundsUtc,
  businessMonthBoundsUtc,
  businessDateKey,
  businessMonthKey,
  BUSINESS_TZ,
} from "@/lib/time";
import { DateTime } from "luxon";

export interface UnitInfo {
  id: string;
  name: string;
  slug: string;
  color: string;
}

export interface UnitOverview {
  unit: UnitInfo;
  snapshot: DailySnapshotResult;
  movement: MovementResult;
  leadsToday: number;
  leadsWeek: number;
  leadsMonth: number;
}

export interface DashboardOverview {
  generatedAt: string;
  monthKey: string;
  periodLabel: string;
  units: UnitInfo[];
  consolidated: {
    snapshot: DailySnapshotResult;
    movement: MovementResult;
    leadsToday: number;
    leadsWeek: number;
    leadsMonth: number;
  };
  byUnit: UnitOverview[];
  unresolvedUnitCount: number;
  dataQualityOpen: number;
  totalLeads: number;
}

/** Visão geral consolidada e por unidade, calculada ao vivo (estoque + fluxo). */
export async function getDashboardOverview(
  period?: { startUtc: string; endUtc: string; label: string },
): Promise<DashboardOverview> {
  const db = createAdminClient();
  const nowISO = new Date().toISOString();
  const todayKey = businessDateKey(nowISO);
  const monthKey = businessMonthKey(nowISO);
  const { startUtc: dayStart } = businessDayBoundsUtc(todayKey);
  const { startUtc: monthStart, endUtc: monthEnd } = period
    ? { startUtc: period.startUtc, endUtc: period.endUtc }
    : businessMonthBoundsUtc(monthKey);
  const weekStart = DateTime.now().setZone(BUSINESS_TZ).startOf("week").toUTC().toISO()!;

  const [config, inputs, unitsRes, dqRes] = await Promise.all([
    loadCalcConfig(db),
    loadDomainInputs(db),
    db.from("units").select("id,name,slug,color").eq("is_active", true).order("name"),
    db
      .from("data_quality_issues")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
  ]);

  const units = (unitsRes.data ?? []) as UnitInfo[];
  const { leads, transitions } = inputs;

  const states = resolveStateAsOf(transitions, leads, nowISO, config);

  const inWindow = (iso: string | null, start: string, end?: string) =>
    iso != null &&
    Date.parse(iso) >= Date.parse(start) &&
    (end === undefined || Date.parse(iso) < Date.parse(end));

  const countLeads = (filterUnit: string | null, start: string, end?: string) =>
    leads.filter(
      (l) =>
        (filterUnit === null || l.currentUnitId === filterUnit) &&
        !l.deletedAtKommo &&
        inWindow(l.createdAtKommo, start, end),
    ).length;

  // consolidado (todas as unidades)
  const consolidated = {
    snapshot: computeDailySnapshot({
      states,
      newLeadIds: new Set(
        leads
          .filter((l) => !l.deletedAtKommo && inWindow(l.createdAtKommo, dayStart))
          .map((l) => l.leadId),
      ),
      config,
    }),
    movement: computeMovement(transitions, monthStart, monthEnd),
    leadsToday: countLeads(null, dayStart),
    leadsWeek: countLeads(null, weekStart),
    leadsMonth: countLeads(null, monthStart, monthEnd),
  };

  const byUnit: UnitOverview[] = units.map((unit) => {
    const unitStates = states.filter((s) => s.unitId === unit.id);
    const unitNewToday = new Set(
      leads
        .filter(
          (l) =>
            l.currentUnitId === unit.id &&
            !l.deletedAtKommo &&
            inWindow(l.createdAtKommo, dayStart),
        )
        .map((l) => l.leadId),
    );
    return {
      unit,
      snapshot: computeDailySnapshot({ states: unitStates, newLeadIds: unitNewToday, config }),
      movement: computeMovement(
        transitions.filter((t) => t.unitId === unit.id),
        monthStart,
        monthEnd,
      ),
      leadsToday: countLeads(unit.id, dayStart),
      leadsWeek: countLeads(unit.id, weekStart),
      leadsMonth: countLeads(unit.id, monthStart, monthEnd),
    };
  });

  const unresolvedUnitCount = states.filter((s) => s.unitId === null).length;

  return {
    generatedAt: nowISO,
    monthKey,
    periodLabel: period?.label ?? `${monthKey}`,
    units,
    consolidated,
    byUnit,
    unresolvedUnitCount,
    dataQualityOpen: dqRes.count ?? 0,
    totalLeads: leads.filter((l) => !l.deletedAtKommo).length,
  };
}
