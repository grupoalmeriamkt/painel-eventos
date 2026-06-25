import "server-only";
import { DateTime } from "luxon";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAlertThresholds, type AlertThresholds } from "@/lib/config";
import { BUSINESS_TZ } from "@/lib/time";
import type { StageCategory } from "@/lib/supabase/database.types";

/** Categorias "abertas" para fins de alerta. */
const OPEN_ALERT_CATEGORIES: readonly StageCategory[] = [
  "lead",
  "qualificacao",
  "atendimento",
  "proposta",
  "negociacao",
  "contrato",
  "fechado",
];

export type AlertSeverity = "critical" | "warning" | "info";

export interface AlertLead {
  id: string;
  kommo_lead_id: number;
  name: string | null;
  stage_category: StageCategory | null;
  current_value: number;
  event_date: string | null;
  /** Dias desde a última mudança de etapa (null se desconhecido). */
  daysStale: number | null;
}

export interface AlertGroup {
  key: string;
  titulo: string;
  severidade: AlertSeverity;
  descricao: string;
  leads: AlertLead[];
}

export interface AlertasResult {
  groups: AlertGroup[];
  thresholds: AlertThresholds;
}

interface LeadRow {
  id: string;
  kommo_lead_id: number;
  name: string | null;
  stage_category: StageCategory | null;
  current_value: number | string | null;
  event_date: string | null;
  last_stage_changed_at: string | null;
  updated_at_kommo: string | null;
  unit_id: string | null;
  lead_source: string | null;
}

/** Dias inteiros (arredondados para baixo) entre last_stage_changed_at e agora. */
function daysSince(iso: string | null, now: DateTime): number | null {
  if (!iso) return null;
  const dt = DateTime.fromISO(iso, { zone: "utc" });
  if (!dt.isValid) return null;
  return Math.floor(now.diff(dt, "days").days);
}

function toAlertLead(l: LeadRow, now: DateTime): AlertLead {
  return {
    id: l.id,
    kommo_lead_id: l.kommo_lead_id,
    name: l.name,
    stage_category: l.stage_category,
    current_value: Number(l.current_value ?? 0),
    event_date: l.event_date,
    daysStale: daysSince(l.last_stage_changed_at, now),
  };
}

export async function getAlertas(): Promise<AlertasResult> {
  const db = createAdminClient();
  const thresholds = await loadAlertThresholds(db);
  const now = DateTime.now().setZone(BUSINESS_TZ);
  const today = now.toFormat("yyyy-MM-dd");
  const eventLimit = now.plus({ days: thresholds.event_no_contract_days }).toFormat("yyyy-MM-dd");

  const { data } = await db
    .from("leads")
    .select(
      "id,kommo_lead_id,name,stage_category,current_value,event_date,last_stage_changed_at,updated_at_kommo,unit_id,lead_source",
    )
    .is("deleted_at_kommo", null)
    .limit(5000);

  const leads = (data ?? []) as LeadRow[];
  const openSet = new Set<StageCategory>(OPEN_ALERT_CATEGORIES);
  const isOpen = (c: StageCategory | null): boolean => c !== null && openSet.has(c);

  const contractClosed = new Set<StageCategory>(["contrato", "fechado", "concluido"]);

  const valorAltoParado: AlertLead[] = [];
  const eventoProximoSemContrato: AlertLead[] = [];
  const negociacaoParada: AlertLead[] = [];
  const propostaSemRetorno: AlertLead[] = [];
  const semUnidade: AlertLead[] = [];
  const semDataEvento: AlertLead[] = [];
  const semValor: AlertLead[] = [];

  for (const l of leads) {
    const value = Number(l.current_value ?? 0);
    const stale = daysSince(l.last_stage_changed_at, now);
    const open = isOpen(l.stage_category);

    // 1. valor_alto_parado
    if (
      open &&
      value > thresholds.stale_high_value_amount &&
      stale !== null &&
      stale > thresholds.stale_high_value_days
    ) {
      valorAltoParado.push(toAlertLead(l, now));
    }

    // 2. evento_proximo_sem_contrato
    if (
      l.event_date &&
      l.event_date >= today &&
      l.event_date <= eventLimit &&
      (l.stage_category === null || !contractClosed.has(l.stage_category))
    ) {
      eventoProximoSemContrato.push(toAlertLead(l, now));
    }

    // 3. negociacao_parada
    if (
      l.stage_category === "negociacao" &&
      stale !== null &&
      stale > thresholds.negotiation_stale_days
    ) {
      negociacaoParada.push(toAlertLead(l, now));
    }

    // 4. proposta_sem_retorno
    if (
      l.stage_category === "proposta" &&
      stale !== null &&
      stale > thresholds.proposal_no_return_days
    ) {
      propostaSemRetorno.push(toAlertLead(l, now));
    }

    // 5. sem_unidade
    if (open && l.unit_id === null) {
      semUnidade.push(toAlertLead(l, now));
    }

    // 6. sem_data_evento
    if (open && l.event_date === null) {
      semDataEvento.push(toAlertLead(l, now));
    }

    // 7. sem_valor
    if (open && value === 0) {
      semValor.push(toAlertLead(l, now));
    }
  }

  // Ordenações úteis (mais críticos primeiro).
  const byStaleDesc = (a: AlertLead, b: AlertLead) => (b.daysStale ?? 0) - (a.daysStale ?? 0);
  const byValueDesc = (a: AlertLead, b: AlertLead) => b.current_value - a.current_value;
  const byEventAsc = (a: AlertLead, b: AlertLead) =>
    (a.event_date ?? "9999").localeCompare(b.event_date ?? "9999");

  valorAltoParado.sort(byValueDesc);
  eventoProximoSemContrato.sort(byEventAsc);
  negociacaoParada.sort(byStaleDesc);
  propostaSemRetorno.sort(byStaleDesc);
  semUnidade.sort(byValueDesc);
  semDataEvento.sort(byValueDesc);
  semValor.sort(byStaleDesc);

  const groups: AlertGroup[] = [
    {
      key: "valor_alto_parado",
      titulo: "Valor alto parado",
      severidade: "critical",
      descricao: `Leads abertos acima de R$ ${thresholds.stale_high_value_amount.toLocaleString("pt-BR")} sem movimento de etapa há mais de ${thresholds.stale_high_value_days} dias.`,
      leads: valorAltoParado,
    },
    {
      key: "evento_proximo_sem_contrato",
      titulo: "Evento próximo sem contrato",
      severidade: "critical",
      descricao: `Eventos nos próximos ${thresholds.event_no_contract_days} dias ainda sem contrato/fechamento.`,
      leads: eventoProximoSemContrato,
    },
    {
      key: "negociacao_parada",
      titulo: "Negociação parada",
      severidade: "warning",
      descricao: `Em negociação sem movimento há mais de ${thresholds.negotiation_stale_days} dias.`,
      leads: negociacaoParada,
    },
    {
      key: "proposta_sem_retorno",
      titulo: "Proposta sem retorno",
      severidade: "warning",
      descricao: `Proposta enviada sem movimento há mais de ${thresholds.proposal_no_return_days} dias.`,
      leads: propostaSemRetorno,
    },
    {
      key: "sem_unidade",
      titulo: "Sem unidade",
      severidade: "info",
      descricao: "Leads abertos sem unidade atribuída.",
      leads: semUnidade,
    },
    {
      key: "sem_data_evento",
      titulo: "Sem data de evento",
      severidade: "info",
      descricao: "Leads abertos sem data de evento informada.",
      leads: semDataEvento,
    },
    {
      key: "sem_valor",
      titulo: "Sem valor",
      severidade: "info",
      descricao: "Leads abertos com valor zerado.",
      leads: semValor,
    },
  ];

  return { groups, thresholds };
}
