import type { StageCategory } from "@/lib/supabase/database.types";
import { STAGE_CATEGORIES } from "./categories";
import { eventYear } from "@/lib/time";
import { sumMoney } from "./money";
import type { MovementByCategory, MovementResult, StageTransition } from "./types";

function emptyMovement(): Record<StageCategory, MovementByCategory> {
  const r = {} as Record<StageCategory, MovementByCategory>;
  for (const c of STAGE_CATEGORIES) r[c] = { count: 0, value: 0 };
  return r;
}

/**
 * FLUXO — movimentação por período [startISO, endISO).
 *
 * Conta cada ENTRADA real numa categoria (toCategory != fromCategory) dentro da
 * janela, usando o valor no instante da transição. Reentradas contam de novo.
 * Movimentos dentro da mesma categoria NÃO contam. NUNCA derivar de snapshots.
 *
 * `transitions` já deve vir filtrado pela unidade desejada (ou todas).
 */
export function computeMovement(
  transitions: StageTransition[],
  startISO: string,
  endISO: string,
): MovementResult {
  const start = Date.parse(startISO);
  const end = Date.parse(endISO);

  const valuesByCat: Record<StageCategory, number[]> = {} as Record<
    StageCategory,
    number[]
  >;
  for (const c of STAGE_CATEGORIES) valuesByCat[c] = [];
  const entered = emptyMovement();

  // propostas emitidas no período, agrupadas por ano do evento
  const proposalYearValues: Record<string, number[]> = {};
  const proposalYearCounts: Record<string, number> = {};

  for (const t of transitions) {
    const at = Date.parse(t.changedAt);
    if (at < start || at >= end) continue;
    if (t.toCategory === t.fromCategory) continue; // mesma categoria não conta

    entered[t.toCategory].count += 1;
    valuesByCat[t.toCategory].push(t.value);

    if (t.toCategory === "proposta" && t.eventDate) {
      const y = eventYear(t.eventDate);
      if (y) {
        const key = String(y);
        (proposalYearValues[key] ??= []).push(t.value);
        proposalYearCounts[key] = (proposalYearCounts[key] ?? 0) + 1;
      }
    }
  }

  for (const c of STAGE_CATEGORIES) {
    entered[c].value = sumMoney(valuesByCat[c]);
  }

  const proposalsByEventYear: Record<string, MovementByCategory> = {};
  for (const [k, vals] of Object.entries(proposalYearValues)) {
    proposalsByEventYear[k] = {
      count: proposalYearCounts[k] ?? 0,
      value: sumMoney(vals),
    };
  }

  return { entered, proposalsByEventYear };
}
