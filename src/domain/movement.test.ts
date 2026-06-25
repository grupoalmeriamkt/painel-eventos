import { describe, it, expect } from "vitest";
import { computeMovement } from "./movement";
import { resolveStateAsOf, computeDailySnapshot } from "./snapshot";
import { DEFAULT_ACTIVE_PIPELINE, DEFAULT_TOTAL_PIPELINE } from "./categories";
import type { CalcConfig, LeadMeta, StageTransition } from "./types";

const config: CalcConfig = {
  totalPipelineCategories: DEFAULT_TOTAL_PIPELINE,
  activePipelineCategories: DEFAULT_ACTIVE_PIPELINE,
  historicalValueMethodology: "at_stage_entry",
};

const U = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";

function tr(
  leadId: string,
  from: StageTransition["fromCategory"],
  to: StageTransition["toCategory"],
  changedAt: string,
  value: number,
  over: Partial<StageTransition> = {},
): StageTransition {
  return { leadId, fromCategory: from, toCategory: to, changedAt, value, unitId: U, eventDate: null, ...over };
}

function lead(id: string, over: Partial<LeadMeta> = {}): LeadMeta {
  return {
    leadId: id, currentCategory: null, currentUnitId: U, currentValue: 0,
    currentEventDate: null, leadSource: null, responsibleUserId: null,
    createdAtKommo: "2026-06-01T00:00:00.000Z", deletedAtKommo: null, ...over,
  };
}

const JUN_START = "2026-06-01T03:00:00.000Z"; // 01/06 00:00 BRT
const JUL_START = "2026-07-01T03:00:00.000Z";

describe("computeMovement (fluxo)", () => {
  it("conta entradas em cada categoria no período", () => {
    const trans = [
      tr("a", "atendimento", "proposta", "2026-06-05T12:00:00.000Z", 1000),
      tr("b", "proposta", "negociacao", "2026-06-10T12:00:00.000Z", 2000),
      tr("c", "negociacao", "contrato", "2026-06-12T12:00:00.000Z", 3000),
      tr("d", "contrato", "fechado", "2026-06-15T12:00:00.000Z", 4000),
      tr("e", "fechado", "concluido", "2026-06-20T12:00:00.000Z", 5000),
    ];
    const m = computeMovement(trans, JUN_START, JUL_START);
    expect(m.entered.proposta).toEqual({ count: 1, value: 1000 });
    expect(m.entered.negociacao).toEqual({ count: 1, value: 2000 });
    expect(m.entered.contrato).toEqual({ count: 1, value: 3000 });
    expect(m.entered.fechado).toEqual({ count: 1, value: 4000 });
    expect(m.entered.concluido).toEqual({ count: 1, value: 5000 });
  });

  it("NÃO conta movimento entre etapas da mesma categoria", () => {
    // duas etapas reais do Kommo mapeiam para 'atendimento' (ex.: Camila -> Carina)
    const trans = [
      tr("a", "atendimento", "atendimento", "2026-06-05T12:00:00.000Z", 1000),
    ];
    const m = computeMovement(trans, JUN_START, JUL_START);
    expect(m.entered.atendimento.count).toBe(0);
  });

  it("conta reentrada na mesma categoria como nova entrada", () => {
    const trans = [
      tr("a", "atendimento", "proposta", "2026-06-05T12:00:00.000Z", 1000),
      tr("a", "proposta", "negociacao", "2026-06-08T12:00:00.000Z", 1000),
      // voltou para proposta (reentrada)
      tr("a", "negociacao", "proposta", "2026-06-12T12:00:00.000Z", 1100),
    ];
    const m = computeMovement(trans, JUN_START, JUL_START);
    expect(m.entered.proposta.count).toBe(2);
    expect(m.entered.proposta.value).toBe(2100);
  });

  it("usa o valor no instante da entrada, não o valor final", () => {
    const trans = [
      tr("a", "atendimento", "negociacao", "2026-06-05T12:00:00.000Z", 5000),
      // mais tarde entra em contrato com valor revisado
      tr("a", "negociacao", "contrato", "2026-06-20T12:00:00.000Z", 8000),
    ];
    const m = computeMovement(trans, JUN_START, JUL_START);
    expect(m.entered.negociacao.value).toBe(5000);
    expect(m.entered.contrato.value).toBe(8000);
  });

  it("agrupa propostas emitidas por ano do evento", () => {
    const trans = [
      tr("a", "atendimento", "proposta", "2026-06-05T12:00:00.000Z", 1000, { eventDate: "2026-10-10" }),
      tr("b", "atendimento", "proposta", "2026-06-06T12:00:00.000Z", 2000, { eventDate: "2027-02-02" }),
      tr("c", "atendimento", "proposta", "2026-06-07T12:00:00.000Z", 3000, { eventDate: "2027-05-05" }),
    ];
    const m = computeMovement(trans, JUN_START, JUL_START);
    expect(m.proposalsByEventYear["2026"]).toEqual({ count: 1, value: 1000 });
    expect(m.proposalsByEventYear["2027"]).toEqual({ count: 2, value: 5000 });
  });

  it("respeita os limites do período [start, end)", () => {
    const trans = [
      tr("a", "atendimento", "proposta", "2026-05-31T23:59:00.000Z", 1000), // antes (maio em UTC, mas < JUN_START)
      tr("b", "atendimento", "proposta", "2026-07-01T03:00:00.000Z", 2000), // exatamente no end (excluído)
      tr("c", "atendimento", "proposta", "2026-06-15T12:00:00.000Z", 3000), // dentro
    ];
    const m = computeMovement(trans, JUN_START, JUL_START);
    expect(m.entered.proposta.count).toBe(1);
    expect(m.entered.proposta.value).toBe(3000);
  });
});

describe("estoque vs fluxo: não duplicar leads recorrentes", () => {
  it("movimentação mensal != soma de snapshots diários", () => {
    // Um lead entra em negociação em 05/06 com 10.000 e permanece o mês todo.
    const trans: StageTransition[] = [
      tr("a", "proposta", "negociacao", "2026-06-05T12:00:00.000Z", 10000),
    ];
    const leads = [lead("a", { currentCategory: "negociacao", currentValue: 10000 })];

    // FLUXO do mês: entrou 1x em negociação = 10.000
    const m = computeMovement(trans, JUN_START, JUL_START);
    expect(m.entered.negociacao.value).toBe(10000);

    // ESTOQUE: somar 26 dias de snapshot daria 260.000 (ERRADO).
    let somaErrada = 0;
    for (let d = 5; d <= 30; d++) {
      const asOf = `2026-06-${String(d).padStart(2, "0")}T23:59:59.000Z`;
      const states = resolveStateAsOf(trans, leads, asOf, config);
      const snap = computeDailySnapshot({ states, newLeadIds: new Set(), config });
      somaErrada += snap.negotiationValue;
    }
    expect(somaErrada).toBeGreaterThan(200000);
    // A movimentação correta NÃO é essa soma.
    expect(m.entered.negociacao.value).not.toBe(somaErrada);

    // E o estoque de QUALQUER dia individual é 10.000 (não acumula).
    const oneDay = computeDailySnapshot({
      states: resolveStateAsOf(trans, leads, "2026-06-20T23:59:59.000Z", config),
      newLeadIds: new Set(),
      config,
    });
    expect(oneDay.negotiationValue).toBe(10000);
  });
});

describe("drill-down bate com o card", () => {
  it("a soma das linhas detalhadas é igual ao valor do card", () => {
    const trans = [
      tr("a", "negociacao", "contrato", "2026-06-05T12:00:00.000Z", 1234.56, { unitId: U }),
      tr("b", "negociacao", "contrato", "2026-06-10T12:00:00.000Z", 2222.22, { unitId: U }),
      tr("c", "negociacao", "contrato", "2026-06-11T12:00:00.000Z", 9999.99, { unitId: U2 }),
    ];
    const m = computeMovement(trans, JUN_START, JUL_START);
    // card "valor que entrou em contrato" considerando todas as unidades
    const card = m.entered.contrato.value;
    const linhas = trans.map((t) => t.value);
    const somaLinhas = Math.round(linhas.reduce((a, b) => a + b, 0) * 100) / 100;
    expect(card).toBe(somaLinhas);
    expect(card).toBe(13456.77);
  });
});
