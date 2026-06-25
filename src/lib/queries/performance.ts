import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { OPEN_CATEGORIES } from "@/domain/categories";
import type { StageCategory } from "@/lib/supabase/database.types";

const SEM_RESPONSAVEL = "Sem responsável";
const OPEN_SET = new Set<StageCategory>(OPEN_CATEGORIES);

export interface ResponsiblePerformance {
  responsible: string;
  leadsRecebidos: number;
  propostas: number;
  contratos: number;
  fechamentos: number;
  valorEmPipeline: number;
  ticketMedio: number;
  conversao: number;
}

/**
 * Performance comercial agrupada por responsável (leads.responsible_user_name).
 *
 * - leadsRecebidos: nº de leads atribuídos ao responsável.
 * - propostas/contratos/fechamentos: ENTRADAS reais nas categorias
 *   'proposta'/'contrato'/'fechado' (to_category != from_category), atribuídas
 *   ao responsável atual do lead (history.lead_id → lead.responsible_user_name).
 * - valorEmPipeline: soma de current_value dos leads em categorias abertas.
 * - ticketMedio: valorEmPipeline / nº de leads com valor > 0.
 * - conversao: fechamentos / leadsRecebidos (%).
 *
 * Ordenado por valorEmPipeline desc.
 */
export async function getPerformanceByResponsible(): Promise<ResponsiblePerformance[]> {
  const db = createAdminClient();

  const [leadsRes, histRes] = await Promise.all([
    db
      .from("leads")
      .select("id, responsible_user_name, stage_category, current_value, created_at_kommo, unit_id")
      .is("deleted_at_kommo", null),
    db.from("lead_stage_history").select("lead_id, from_category, to_category"),
  ]);

  const leads = leadsRes.data ?? [];
  const history = histRes.data ?? [];

  // lead_id → responsável atual (para atribuir as transições)
  const respByLead = new Map<string, string>();
  for (const l of leads) {
    respByLead.set(l.id, l.responsible_user_name ?? SEM_RESPONSAVEL);
  }

  interface Acc {
    responsible: string;
    leadsRecebidos: number;
    propostas: number;
    contratos: number;
    fechamentos: number;
    valorEmPipeline: number;
    leadsComValor: number;
  }
  const acc = new Map<string, Acc>();
  const ensure = (responsible: string): Acc => {
    let a = acc.get(responsible);
    if (!a) {
      a = {
        responsible,
        leadsRecebidos: 0,
        propostas: 0,
        contratos: 0,
        fechamentos: 0,
        valorEmPipeline: 0,
        leadsComValor: 0,
      };
      acc.set(responsible, a);
    }
    return a;
  };

  // Estoque: leads recebidos, pipeline e leads com valor.
  for (const l of leads) {
    const a = ensure(l.responsible_user_name ?? SEM_RESPONSAVEL);
    a.leadsRecebidos += 1;
    const value = Number(l.current_value);
    if (l.stage_category && OPEN_SET.has(l.stage_category)) {
      a.valorEmPipeline += Number.isFinite(value) ? value : 0;
      if (value > 0) a.leadsComValor += 1;
    }
  }

  // Fluxo: entradas reais em proposta/contrato/fechado.
  for (const h of history) {
    if (h.to_category === null || h.to_category === h.from_category) continue;
    const responsible = respByLead.get(h.lead_id);
    if (!responsible) continue; // history de lead deletado/ausente
    const a = ensure(responsible);
    if (h.to_category === "proposta") a.propostas += 1;
    else if (h.to_category === "contrato") a.contratos += 1;
    else if (h.to_category === "fechado") a.fechamentos += 1;
  }

  const rows: ResponsiblePerformance[] = [...acc.values()].map((a) => ({
    responsible: a.responsible,
    leadsRecebidos: a.leadsRecebidos,
    propostas: a.propostas,
    contratos: a.contratos,
    fechamentos: a.fechamentos,
    valorEmPipeline: a.valorEmPipeline,
    ticketMedio: a.leadsComValor > 0 ? a.valorEmPipeline / a.leadsComValor : 0,
    conversao: a.leadsRecebidos > 0 ? (a.fechamentos / a.leadsRecebidos) * 100 : 0,
  }));

  rows.sort((x, y) => y.valorEmPipeline - x.valorEmPipeline);
  return rows;
}
