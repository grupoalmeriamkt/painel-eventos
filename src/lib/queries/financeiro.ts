import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DateTime } from "luxon";

export interface FinanceTotals {
  proposto: number;
  contratado: number;
  faturado: number;
  recebido: number;
  saldoAReceber: number;
}

export interface FinanceUnitRow extends FinanceTotals {
  unitId: string | null;
  unitName: string;
  unitColor: string | null;
}

export interface FinanceMonthRow {
  monthKey: string; // yyyy-MM ou "sem-data"
  faturado: number;
  recebido: number;
  saldo: number;
}

export interface FinanceOverview {
  generatedAt: string;
  totals: FinanceTotals;
  byUnit: FinanceUnitRow[];
  byMonth: FinanceMonthRow[];
  /** Cobertura: quantos leads têm ao menos um registro financeiro. */
  leadsWithRecords: number;
  totalLeads: number;
  recordCount: number;
}

const ZERO = (): FinanceTotals => ({
  proposto: 0,
  contratado: 0,
  faturado: 0,
  recebido: 0,
  saldoAReceber: 0,
});

/**
 * Agrega lead_financial_records (registros financeiros reais do Kommo).
 * ATENÇÃO: esses registros são esparsos — a maioria dos leads só tem o valor
 * de orçamento em leads.current_value. Faturado/Recebido ≠ pipeline.
 */
export async function getFinanceOverview(): Promise<FinanceOverview> {
  const db = createAdminClient();
  const nowISO = new Date().toISOString();

  const [recordsRes, leadsRes, unitsRes, leadCountRes] = await Promise.all([
    // Registros financeiros com o lead correspondente (unidade + data do evento).
    db
      .from("lead_financial_records")
      .select("lead_id, record_type, amount, leads!inner(unit_id, event_date)"),
    // (mantido p/ futuras junções, não usado diretamente)
    db.from("leads").select("id", { count: "exact", head: true }).is("deleted_at_kommo", null),
    db.from("units").select("id, name, color").eq("is_active", true).order("name"),
    db.from("leads").select("id", { count: "exact", head: true }).is("deleted_at_kommo", null),
  ]);

  void leadsRes;

  type RecRow = {
    lead_id: string;
    record_type: string;
    amount: number | string | null;
    leads: { unit_id: string | null; event_date: string | null } | null;
  };
  const records = (recordsRes.data ?? []) as unknown as RecRow[];
  const units = (unitsRes.data ?? []) as { id: string; name: string; color: string | null }[];
  const totalLeads = leadCountRes.count ?? 0;

  const totals = ZERO();
  const unitMap = new Map<string | null, FinanceTotals>();
  const monthMap = new Map<string, FinanceMonthRow>();
  const leadsWithRecords = new Set<string>();

  const ensureUnit = (k: string | null) => {
    let t = unitMap.get(k);
    if (!t) {
      t = ZERO();
      unitMap.set(k, t);
    }
    return t;
  };
  const ensureMonth = (k: string) => {
    let m = monthMap.get(k);
    if (!m) {
      m = { monthKey: k, faturado: 0, recebido: 0, saldo: 0 };
      monthMap.set(k, m);
    }
    return m;
  };

  for (const r of records) {
    const amt = Number(r.amount ?? 0);
    if (Number.isNaN(amt)) continue;
    leadsWithRecords.add(r.lead_id);

    const unitKey = r.leads?.unit_id ?? null;
    const ut = ensureUnit(unitKey);

    const eventDate = r.leads?.event_date ?? null;
    const monthKey = eventDate
      ? (DateTime.fromISO(eventDate).isValid
          ? DateTime.fromISO(eventDate).toFormat("yyyy-MM")
          : "sem-data")
      : "sem-data";

    switch (r.record_type) {
      case "proposal":
        totals.proposto += amt;
        ut.proposto += amt;
        break;
      case "contract":
        totals.contratado += amt;
        ut.contratado += amt;
        break;
      case "invoice":
        totals.faturado += amt;
        ut.faturado += amt;
        ensureMonth(monthKey).faturado += amt;
        break;
      case "payment":
        totals.recebido += amt;
        ut.recebido += amt;
        ensureMonth(monthKey).recebido += amt;
        break;
      case "refund":
        totals.recebido -= amt;
        ut.recebido -= amt;
        ensureMonth(monthKey).recebido -= amt;
        break;
      default:
        // adjustment e outros não entram nos totais principais
        break;
    }
  }

  totals.saldoAReceber = totals.faturado - totals.recebido;

  const unitName = new Map(units.map((u) => [u.id, u.name] as const));
  const unitColor = new Map(units.map((u) => [u.id, u.color] as const));

  const byUnit: FinanceUnitRow[] = [...unitMap.entries()]
    .map(([unitId, t]) => ({
      unitId,
      unitName: unitId ? (unitName.get(unitId) ?? "Unidade desconhecida") : "Sem unidade",
      unitColor: unitId ? (unitColor.get(unitId) ?? null) : null,
      ...t,
      saldoAReceber: t.faturado - t.recebido,
    }))
    .sort((a, b) => b.faturado - a.faturado || b.contratado - a.contratado);

  const byMonth: FinanceMonthRow[] = [...monthMap.values()]
    .map((m) => ({ ...m, saldo: m.faturado - m.recebido }))
    .sort((a, b) => {
      // "sem-data" sempre por último
      if (a.monthKey === "sem-data") return 1;
      if (b.monthKey === "sem-data") return -1;
      return a.monthKey.localeCompare(b.monthKey);
    });

  return {
    generatedAt: nowISO,
    totals,
    byUnit,
    byMonth,
    leadsWithRecords: leadsWithRecords.size,
    totalLeads,
    recordCount: records.length,
  };
}
