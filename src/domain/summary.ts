import type { DailySnapshotResult, MovementResult } from "./types";

/**
 * Resumo automático determinístico e auditável do dia (sem IA).
 * Ex.: "13 leads recebidos. 4 leads em atendimento. 7 propostas emitidas.
 *       2 leads avançaram para negociação. 1 contrato entrou no funil.
 *       3 perdas registradas."
 */
export function generateDailySummary(
  snapshot: DailySnapshotResult,
  movementOfDay: MovementResult,
): string {
  const parts: string[] = [];
  const n = snapshot.newLeadsCount;
  parts.push(`${n} ${n === 1 ? "lead recebido" : "leads recebidos"}.`);

  if (snapshot.leadsInServiceCount > 0) {
    parts.push(
      `${snapshot.leadsInServiceCount} ${
        snapshot.leadsInServiceCount === 1 ? "lead em atendimento" : "leads em atendimento"
      }.`,
    );
  }

  const proposals = movementOfDay.entered.proposta.count;
  if (proposals > 0) {
    parts.push(`${proposals} ${proposals === 1 ? "proposta emitida" : "propostas emitidas"}.`);
  }

  const negos = movementOfDay.entered.negociacao.count;
  if (negos > 0) {
    parts.push(
      `${negos} ${negos === 1 ? "lead avançou" : "leads avançaram"} para negociação.`,
    );
  }

  const contracts = movementOfDay.entered.contrato.count;
  if (contracts > 0) {
    parts.push(
      `${contracts} ${contracts === 1 ? "contrato entrou" : "contratos entraram"} no funil.`,
    );
  }

  const closed = movementOfDay.entered.fechado.count;
  if (closed > 0) {
    parts.push(`${closed} ${closed === 1 ? "fechamento registrado" : "fechamentos registrados"}.`);
  }

  const losses = movementOfDay.entered.perdido.count;
  if (losses > 0) {
    parts.push(`${losses} ${losses === 1 ? "perda registrada" : "perdas registradas"}.`);
  }

  return parts.join(" ");
}
