import "server-only";
import { DateTime } from "luxon";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUSINESS_TZ } from "@/lib/time";
import type { StageCategory } from "@/lib/supabase/database.types";

export interface AgendaEvent {
  id: string;
  kommo_lead_id: number;
  name: string | null;
  event_date: string;
  event_start_time: string | null;
  guest_count: number | null;
  event_type: string | null;
  event_space: string | null;
  unit_id: string | null;
  unit_name: string | null;
  unit_color: string | null;
  stage_category: StageCategory | null;
  current_value: number;
}

export interface AgendaDay {
  /** "yyyy-MM-dd" */
  date: string;
  /** dia do mês (1..31) */
  dayNum: number;
  /** se pertence ao mês de referência (false = preenchimento da grade) */
  inMonth: boolean;
  /** se é o dia de hoje no fuso de negócio */
  isToday: boolean;
  events: AgendaEvent[];
  count: number;
  valueSum: number;
}

export interface AgendaResult {
  /** "yyyy-MM" */
  mes: string;
  /** rótulo por extenso, ex.: "julho/2026" */
  mesLabel: string;
  /** "yyyy-MM" do mês anterior */
  mesAnterior: string;
  /** "yyyy-MM" do mês seguinte */
  mesProximo: string;
  /** semanas (segunda→domingo) cobrindo o mês inteiro */
  weeks: AgendaDay[][];
  /** eventos do mês ordenados por data + horário (para a "agenda list") */
  events: AgendaEvent[];
  /** dias com pelo menos um evento, ordenados (para a lista agrupada) */
  days: AgendaDay[];
  totalCount: number;
  totalValue: number;
  semUnidade: number;
}

/** Resolve o mês de referência ("yyyy-MM") a partir do input ou do mês corrente. */
function resolveMonth(mes?: string): DateTime {
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const dt = DateTime.fromISO(`${mes}-01`, { zone: BUSINESS_TZ });
    if (dt.isValid) return dt.startOf("month");
  }
  return DateTime.now().setZone(BUSINESS_TZ).startOf("month");
}

export async function getAgenda({ mes }: { mes?: string }): Promise<AgendaResult> {
  const db = createAdminClient();
  const monthStart = resolveMonth(mes);
  const monthKey = monthStart.toFormat("yyyy-MM");
  const firstDay = monthStart.toFormat("yyyy-MM-dd");
  const lastDay = monthStart.endOf("month").toFormat("yyyy-MM-dd");
  const todayKey = DateTime.now().setZone(BUSINESS_TZ).toFormat("yyyy-MM-dd");

  // Unidades para resolver nome + cor.
  const { data: units } = await db.from("units").select("id,name,color");
  const idToUnit = new Map((units ?? []).map((u) => [u.id, u]));

  const { data } = await db
    .from("leads")
    .select(
      "id,kommo_lead_id,name,event_date,event_start_time,guest_count,event_type,event_space,unit_id,stage_category,current_value",
    )
    .is("deleted_at_kommo", null)
    .not("event_date", "is", null)
    .gte("event_date", firstDay)
    .lte("event_date", lastDay)
    .order("event_date", { ascending: true });

  const events: AgendaEvent[] = (data ?? []).map((l) => {
    const u = l.unit_id ? idToUnit.get(l.unit_id) : undefined;
    return {
      id: l.id,
      kommo_lead_id: l.kommo_lead_id,
      name: l.name,
      event_date: l.event_date!,
      event_start_time: l.event_start_time,
      guest_count: l.guest_count,
      event_type: l.event_type,
      event_space: l.event_space,
      unit_id: l.unit_id,
      unit_name: u?.name ?? null,
      unit_color: u?.color ?? null,
      stage_category: l.stage_category,
      current_value: Number(l.current_value),
    };
  });

  // Ordena por data e depois por horário (null por último).
  events.sort((a, b) => {
    if (a.event_date !== b.event_date) return a.event_date < b.event_date ? -1 : 1;
    const ta = a.event_start_time ?? "~";
    const tb = b.event_start_time ?? "~";
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  // Agrupa por dia.
  const byDate = new Map<string, AgendaEvent[]>();
  for (const e of events) {
    const list = byDate.get(e.event_date);
    if (list) list.push(e);
    else byDate.set(e.event_date, [e]);
  }

  const makeDay = (dt: DateTime, inMonth: boolean): AgendaDay => {
    const key = dt.toFormat("yyyy-MM-dd");
    const evs = byDate.get(key) ?? [];
    return {
      date: key,
      dayNum: dt.day,
      inMonth,
      isToday: key === todayKey,
      events: evs,
      count: evs.length,
      valueSum: evs.reduce((s, e) => s + e.current_value, 0),
    };
  };

  // Grade: segunda (1) .. domingo (7). Inclui dias de preenchimento.
  const gridStart = monthStart.startOf("week"); // luxon: semana começa na segunda (ISO)
  const monthEnd = monthStart.endOf("month");
  const gridEnd = monthEnd.endOf("week");
  const weeks: AgendaDay[][] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    const week: AgendaDay[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(makeDay(cursor, cursor.month === monthStart.month));
      cursor = cursor.plus({ days: 1 });
    }
    weeks.push(week);
  }

  // Dias do mês com eventos, ordenados.
  const days: AgendaDay[] = [...byDate.keys()]
    .sort()
    .map((key) => makeDay(DateTime.fromISO(key, { zone: BUSINESS_TZ }), true));

  const totalCount = events.length;
  const totalValue = events.reduce((s, e) => s + e.current_value, 0);
  const semUnidade = events.filter((e) => !e.unit_id).length;

  return {
    mes: monthKey,
    mesLabel: monthStart.setLocale("pt-BR").toFormat("LLLL/yyyy"),
    mesAnterior: monthStart.minus({ months: 1 }).toFormat("yyyy-MM"),
    mesProximo: monthStart.plus({ months: 1 }).toFormat("yyyy-MM"),
    weeks,
    events,
    days,
    totalCount,
    totalValue,
    semUnidade,
  };
}
